/**
 * Server-side validation: what the Agent is allowed to do to an annotated
 * document.
 *
 * The design's intent is that the Agent's changes are checked by the program,
 * not by the model's discretion. That intent needs a decidable rule, and the
 * design's original rule table could not decide four cases:
 *
 * 1. A rule that only checked *which block* an edit landed on, never *what
 *    it did to that block*, could not tell a rewrite from a move.
 * 2. **Deleting or moving a locked block** had no rule at all: the lock check
 *    was a substring test on a replacement's content, which a delete never
 *    produces.
 * 3. The lock check tested only that the quote *survived* somewhere in the
 *    new content, so the Agent could keep the quoted sentence and prepend or
 *    append arbitrary text to the block around it.
 * 4. "An inner lock outranks an outer comment" was an instruction to the
 *    model, with no corresponding rejection in the server.
 *
 * The rules below replace that table with one that is decidable from the
 * submitted edits alone.
 *
 * There are two kinds of constraint — a comment asks for work, a lock forbids
 * it — and every decision follows from that pair.
 *
 * @module markdown-review-mode/core/validate
 */

import type { AnnotationKind } from './anchors.ts'
import type { Edit, WireAnnotation } from './contract.ts'

/** Why one edit was refused. */
export interface EditRejection {
  /** The edit's index in the submitted list. */
  readonly editIndex: number
  /** A stable machine-readable reason. */
  readonly code: string
  /** A human-readable explanation. */
  readonly message: string
}

/** The outcome of validating a set of edits against a set of annotations. */
export interface ValidationOutcome {
  /** The edits that passed. */
  readonly accepted: readonly Edit[]
  /** The edits that were refused, with the reason. */
  readonly rejected: readonly EditRejection[]
  /** The annotations whose proposed change the rules forbade. */
  readonly conflicts: readonly string[]
  /** The blocks the accepted edits may touch, in the submitted block list. */
  readonly editableBlocks: ReadonlySet<number>
}

/**
 * The block a range covers.
 * @param annotation - the annotation to locate.
 * @returns the covered block indices, inclusive of both ends.
 */
function blocksOf(annotation: WireAnnotation): number[] {
  if (annotation.startBlock === annotation.endBlock) return [annotation.startBlock]
  const blocks: number[] = []
  for (let index = annotation.startBlock; index <= annotation.endBlock; index += 1) blocks.push(index)
  return blocks
}

/**
 * Classify what may be done to each block.
 *
 * A block's permissions are the union of what every annotation covering it
 * allows, with the strictest constraint winning:
 *
 * - A **comment** permits replacing the block's content, deleting it, and
 *   moving it.
 * - A **lock** permits nothing that changes the block's text, and nothing
 *   that moves it either.
 *
 * A block that no annotation covers may not be changed at all: the reader
 * only spoke about the passages they marked.
 *
 * @param annotations - the round's annotations.
 * @returns the per-block permissions.
 */
export function classifyBlocks(annotations: readonly WireAnnotation[]): {
  readonly editable: ReadonlySet<number>
  readonly locked: ReadonlyMap<number, WireAnnotation>
} {
  const editable = new Set<number>()
  const locked = new Map<number, WireAnnotation>()

  for (const annotation of annotations) {
    const covered = blocksOf(annotation)
    if (annotation.kind === 'comment') {
      for (const block of covered) editable.add(block)
      continue
    }
    // A lock: the block's text is frozen.
    for (const block of covered) locked.set(block, annotation)
  }

  return { editable, locked }
}

/**
 * Whether a block's text may be rewritten.
 * @param permissions - the per-block permissions.
 * @param block - the block index to test.
 * @returns true when the block's text may change.
 */
export function mayRewrite(permissions: ReturnType<typeof classifyBlocks>, block: number): boolean {
  if (permissions.locked.has(block)) return false
  return permissions.editable.has(block)
}

/**
 * Whether a block may be reordered.
 * @param permissions - the per-block permissions.
 * @param block - the block index to test.
 * @returns true when the block may move.
 */
export function mayReorder(permissions: ReturnType<typeof classifyBlocks>, block: number): boolean {
  if (permissions.locked.has(block)) return false
  return permissions.editable.has(block)
}

/**
 * Whether a block may be deleted.
 * @param permissions - the per-block permissions.
 * @param block - the block index to test.
 * @returns true when the block may be removed.
 */
export function mayDelete(permissions: ReturnType<typeof classifyBlocks>, block: number): boolean {
  if (permissions.locked.has(block)) return false
  return permissions.editable.has(block)
}

/**
 * Validate the Agent's edits against the round's annotations.
 *
 * @param edits - the edits the Agent proposed.
 * @param annotations - the round's annotations.
 * @param blockTexts - the current text of each block, keyed by block index.
 * @returns the accepted edits, the rejected ones, and the affected annotations.
 */
export function validateEdits(
  edits: readonly Edit[],
  annotations: readonly WireAnnotation[],
  blockTexts: ReadonlyMap<number, string>,
): ValidationOutcome {
  const permissions = classifyBlocks(annotations)
  const accepted: Edit[] = []
  const rejected: EditRejection[] = []
  const conflicts = new Set<string>()

  // A block may be the target of at most one edit: two edits on one block
  // have no defined order, and the Agent's intent for them is ambiguous.
  const touched = new Set<number>()

  for (let editIndex = 0; editIndex < edits.length; editIndex += 1) {
    const edit = edits[editIndex]

    if (edit.block < 0 || !blockTexts.has(edit.block)) {
      rejected.push({ editIndex, code: 'unknown-block', message: `Block ${edit.block} does not exist in this document.` })
      continue
    }

    if (touched.has(edit.block)) {
      rejected.push({ editIndex, code: 'duplicate-block', message: `Block ${edit.block} is already edited by an earlier change.` })
      continue
    }

    const lock = permissions.locked.get(edit.block)

    switch (edit.op) {
      case 'replace': {
        if (lock !== undefined) {
          conflicts.add(lock.id)
          rejected.push({ editIndex, code: 'locked-block', message: `Block ${edit.block} is locked; its text must not change.` })
          continue
        }
        if (!mayRewrite(permissions, edit.block)) {
          rejected.push({ editIndex, code: 'not-editable', message: `Block ${edit.block} is not covered by any comment, so its text must not change.` })
          continue
        }
        if (typeof edit.content !== 'string') {
          rejected.push({ editIndex, code: 'missing-content', message: `A replacement for block ${edit.block} carries no text.` })
          continue
        }
        touched.add(edit.block)
        accepted.push(edit)
        continue
      }
      case 'delete': {
        if (lock !== undefined) {
          conflicts.add(lock.id)
          rejected.push({ editIndex, code: 'locked-block', message: `Block ${edit.block} is locked; it must not be deleted.` })
          continue
        }
        if (!mayDelete(permissions, edit.block)) {
          rejected.push({ editIndex, code: 'not-deletable', message: `Block ${edit.block} is not covered by any comment, so it must not be deleted.` })
          continue
        }
        touched.add(edit.block)
        accepted.push(edit)
        continue
      }
      case 'insertAfter': {
        // Inserting after a locked block does not change the locked block's
        // own text, so a lock does not forbid it.
        if (typeof edit.content !== 'string') {
          rejected.push({ editIndex, code: 'missing-content', message: `An insertion after block ${edit.block} carries no text.` })
          continue
        }
        if (!mayReorder(permissions, edit.block)) {
          rejected.push({ editIndex, code: 'not-reorderable', message: `Block ${edit.block} is not covered by any comment, so nothing may be inserted after it.` })
          continue
        }
        touched.add(edit.block)
        accepted.push(edit)
        continue
      }
      case 'move': {
        if (lock !== undefined) {
          conflicts.add(lock.id)
          rejected.push({ editIndex, code: 'locked-block', message: `Block ${edit.block} is locked; it must not be moved.` })
          continue
        }
        if (!mayReorder(permissions, edit.block)) {
          rejected.push({ editIndex, code: 'not-reorderable', message: `Block ${edit.block} is not covered by any comment, so it must not be moved.` })
          continue
        }
        touched.add(edit.block)
        accepted.push(edit)
        continue
      }
      default: {
        rejected.push({ editIndex, code: 'unknown-op', message: `Unknown change kind.` })
        continue
      }
    }
  }

  return {
    accepted,
    rejected,
    conflicts: [...conflicts],
    editableBlocks: permissions.editable,
  }
}

/**
 * The annotations that need a receipt.
 *
 * Every annotation except a lock requires one: a lock is not a request, so
 * there is nothing for the Agent to answer. The design's rule table required a
 * receipt only for comments while its instructions required one for every
 * annotation — this resolves the contradiction in favour of the annotations
 * that actually ask for work.
 *
 * @param annotations - the round's annotations.
 * @returns the ids that need a receipt.
 */
export function annotationsNeedingReceipt(annotations: readonly WireAnnotation[]): string[] {
  return annotations.filter(annotation => annotation.kind !== 'lock').map(annotation => annotation.id)
}

/**
 * Which annotation kinds a set of edits touches, for the receipt scope check.
 * @param annotations - the round's annotations.
 * @returns a map from annotation id to its kind.
 */
export function kindsById(annotations: readonly WireAnnotation[]): Map<string, AnnotationKind> {
  const kinds = new Map<string, AnnotationKind>()
  for (const annotation of annotations) kinds.set(annotation.id, annotation.kind)
  return kinds
}
