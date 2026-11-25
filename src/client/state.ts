/**
 * The editor's annotation state.
 *
 * The annotation list lives in a CodeMirror `StateField`, so it moves with the
 * document instead of being re-derived from scratch on every transaction. Two
 * things make that work:
 *
 * - Positions are **absolute document positions**, so `mapPos` — the one
 *   operation CodeMirror gives for free — moves them correctly when text
 *   before them changes.
 * - The quote is **re-extracted from the mapped range** after each
 *   transaction, so an annotation the user edited inside follows the edit
 *   instead of going stale. Only text that vanished entirely is stale.
 *
 * A block-relative anchor cannot be remapped this way: the block's own start
 * moves when earlier text changes, and the editor has no way to know that.
 * The block index is therefore derived metadata, refreshed on demand.
 *
 * @module markdown-review-mode/client/state
 */

import { StateEffect, StateField } from '@codemirror/state'
import type { Annotation } from '../core/anchors.ts'
import { refreshAnnotations } from '../core/anchors.ts'

/** Replace the whole annotation list. */
export const setAnnotations = StateEffect.define<readonly Annotation[]>()

/** Add one annotation. */
export const addAnnotation = StateEffect.define<Annotation>()

/** Remove one annotation by id. */
export const removeAnnotation = StateEffect.define<string>()

/** Update one annotation's status. */
export const setAnnotationStatus = StateEffect.define<{ id: string; status: Annotation['status'] }>()

/**
 * The annotation state field.
 *
 * The field maps its value through every transaction's changes, then
 * re-extracts each quote from the new document text.
 */
export const annotationField = StateField.define<readonly Annotation[]>({
  create() {
    return []
  },

  update(value, transaction) {
    let next = value
    let changed = false

    for (const effect of transaction.effects) {
      if (effect.is(setAnnotations)) {
        next = effect.value
        changed = true
        continue
      }
      if (effect.is(addAnnotation)) {
        next = [...next, effect.value]
        changed = true
        continue
      }
      if (effect.is(removeAnnotation)) {
        next = next.filter(annotation => annotation.id !== effect.value)
        changed = true
        continue
      }
      if (effect.is(setAnnotationStatus)) {
        next = next.map(annotation => annotation.id === effect.value.id
          ? { ...annotation, status: effect.value.status }
          : annotation)
        changed = true
        continue
      }
    }

    if (!changed && !transaction.docChanged) return next

    // Move every range through the change, then re-read the covered text.
    const moved = next.map(annotation => ({
      ...annotation,
      from: transaction.docChanged ? transaction.changes.mapPos(annotation.from, -1) : annotation.from,
      to: transaction.docChanged ? transaction.changes.mapPos(annotation.to, 1) : annotation.to,
    }))

    const refreshed = refreshAnnotations(transaction.state.doc.toString(), moved)
    return refreshed
  },
})

/**
 * The annotations currently held by a state.
 * @param state - the editor state.
 * @returns the annotations.
 */
export function annotationsOf(state: { field: (field: unknown) => Annotation[] }): Annotation[] {
  return state.field(annotationField) as Annotation[]
}
