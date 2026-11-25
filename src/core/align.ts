/**
 * Block alignment: how the block list of an edited document lines up with the
 * block list of the version the annotations were made against.
 *
 * The design's original similarity measure — "common prefix of the first 32
 * characters, divided by the longer block's length" — cannot work: for a
 * 200-character paragraph the maximum reachable score is 32/200 = 0.16, so
 * every edited paragraph falls below any usable threshold and is reported as a
 * different block. Similarity here is computed over the *whole* text as a
 * token-bigram overlap, so an edit that changes one sentence still recognises
 * the block.
 *
 * Alignment is a sequence alignment, not an independent per-block match: two
 * paragraphs that read alike must not swap places just because both are
 * similar to the other. The monotonic mapping this produces is what lets the
 * Agent-facing contract keep referring to "block 7".
 *
 * @module markdown-review-mode/core/align
 */

import type { Block } from './blocks.ts'

/** The outcome of aligning one old block against the new document. */
export type BlockMapping =
  /** The old block maps onto this new block. */
  | { readonly kind: 'matched'; readonly newIndex: number }
  /** The old block has no counterpart. */
  | { readonly kind: 'missing' }

/** The result of aligning two block lists. */
export interface Alignment {
  /** For each old block index, where it landed in the new list. */
  readonly mapping: readonly BlockMapping[]
  /** The new index each old index mapped to, or -1. */
  readonly byOldIndex: readonly number[]
  /** The old index each new index came from, or -1. */
  readonly byNewIndex: readonly number[]
}

/**
 * Split text into comparison tokens.
 *
 * Latin words, digits, and CJK characters are separate tokens, so a Chinese
 * paragraph compares character-by-character rather than as one giant token.
 * Punctuation is dropped: it carries no identity when deciding whether two
 * blocks are the same block.
 *
 * @param text - the text to tokenize.
 * @returns the token list.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = []
  let buffer = ''
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const isCjk = (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)
    if (isCjk) {
      if (buffer.length > 0) {
        tokens.push(buffer)
        buffer = ''
      }
      tokens.push(char)
      continue
    }
    if (/[\p{L}\p{N}]/u.test(char)) {
      buffer += char
      continue
    }
    if (buffer.length > 0) {
      tokens.push(buffer)
      buffer = ''
    }
  }
  if (buffer.length > 0) tokens.push(buffer)
  return tokens
}

/**
 * Similarity of two texts as a token-bigram overlap.
 *
 * The score is the Sørensen–Dice coefficient over token bigrams: two texts
 * score 1 only when their bigram multisets match, and an edit that removes
 * one sentence lowers the score proportionally rather than collapsing it.
 * Bigrams are used rather than single tokens because a single common word
 * ("the") says almost nothing about two paragraphs being the same paragraph.
 *
 * @param left - the first text.
 * @param right - the second text.
 * @returns a score in [0, 1].
 */
export function similarity(left: string, right: string): number {
  if (left === right) return 1
  if (left.length === 0 || right.length === 0) return 0

  const leftGrams = bigrams(tokenize(left))
  const rightGrams = bigrams(tokenize(right))
  if (leftGrams.size === 0 || rightGrams.size === 0) {
    // Text with no bigrams (a single character, say) falls back to equality.
    return left === right ? 1 : 0
  }

  let intersection = 0
  for (const [gram, count] of leftGrams) {
    const other = rightGrams.get(gram)
    if (other !== undefined) intersection += Math.min(count, other)
  }

  const leftTotal = [...leftGrams.values()].reduce((sum, count) => sum + count, 0)
  const rightTotal = [...rightGrams.values()].reduce((sum, count) => sum + count, 0)
  return (2 * intersection) / (leftTotal + rightTotal)
}

/**
 * The bigram multiset of a token list.
 * @param tokens - the tokens to pair.
 * @returns the bigram counts.
 */
function bigrams(tokens: readonly string[]): Map<string, number> {
  const grams = new Map<string, number>()
  if (tokens.length === 0) return grams
  if (tokens.length === 1) {
    grams.set(tokens[0], 1)
    return grams
  }
  for (let index = 0; index + 1 < tokens.length; index += 1) {
    const gram = `${tokens[index]} ${tokens[index + 1]}`
    grams.set(gram, (grams.get(gram) ?? 0) + 1)
  }
  return grams
}

/** The score at which two blocks are considered the same block. */
export const SIMILARITY_THRESHOLD = 0.6

/** The cost of leaving a block unmatched. */
const GAP_COST = -0.5

/**
 * Align two block lists.
 *
 * The alignment is a Needleman–Wunsch style sequence alignment over block
 * similarity: a matched pair earns its similarity, a gap costs a fixed
 * amount, and only pairs at or above {@link SIMILARITY_THRESHOLD} may be
 * matched. Because the whole alignment is computed at once, two blocks that
 * read alike cannot swap places, and a block that was inserted does not pull
 * its neighbours out of position.
 *
 * @param oldBlocks - the blocks the annotations were made against.
 * @param newBlocks - the blocks of the current document.
 * @returns the mapping between them.
 */
export function alignBlocks(oldBlocks: readonly Block[], newBlocks: readonly Block[]): Alignment {
  const mapping: BlockMapping[] = oldBlocks.map(() => ({ kind: 'missing' }))
  const byOldIndex = oldBlocks.map(() => -1)
  const byNewIndex = newBlocks.map(() => -1)

  if (oldBlocks.length === 0 || newBlocks.length === 0) {
    return { mapping, byOldIndex, byNewIndex }
  }

  const rows = oldBlocks.length + 1
  const columns = newBlocks.length + 1

  // The score table: the best total ending in each pair of prefixes.
  const scores: number[][] = Array.from({ length: rows }, () => new Array<number>(columns).fill(0))

  // The traceback table: which move produced each entry.
  const trace: string[][] = Array.from({ length: rows }, () => new Array<string>(columns).fill('left'))

  for (let oldIndex = 1; oldIndex < rows; oldIndex += 1) {
    scores[oldIndex][0] = GAP_COST * oldIndex
    trace[oldIndex][0] = 'up'
  }
  for (let newIndex = 1; newIndex < columns; newIndex += 1) {
    scores[0][newIndex] = GAP_COST * newIndex
    trace[0][newIndex] = 'left'
  }

  for (let oldIndex = 1; oldIndex < rows; oldIndex += 1) {
    for (let newIndex = 1; newIndex < columns; newIndex += 1) {
      const score = similarity(oldBlocks[oldIndex - 1].text, newBlocks[newIndex - 1].text)

      // A pair below the threshold may not be matched at all: the block was
      // rewritten beyond recognition, and pretending otherwise would attach
      // an annotation to text the user never wrote.
      const diagonal = score >= SIMILARITY_THRESHOLD ? scores[oldIndex - 1][newIndex - 1] + score : Number.NEGATIVE_INFINITY
      const up = scores[oldIndex - 1][newIndex] + GAP_COST
      const left = scores[oldIndex][newIndex - 1] + GAP_COST

      if (diagonal >= up && diagonal >= left) {
        scores[oldIndex][newIndex] = diagonal
        trace[oldIndex][newIndex] = 'diagonal'
        continue
      }
      if (up >= left) {
        scores[oldIndex][newIndex] = up
        trace[oldIndex][newIndex] = 'up'
        continue
      }
      scores[oldIndex][newIndex] = left
      trace[oldIndex][newIndex] = 'left'
    }
  }

  // Walk the table back to the matched pairs.
  let oldIndex = oldBlocks.length
  let newIndex = newBlocks.length
  while (oldIndex > 0 && newIndex > 0) {
    const move = trace[oldIndex][newIndex]
    if (move === 'diagonal') {
      const old = oldIndex - 1
      const current = newIndex - 1
      if (byOldIndex[old] === -1 && byNewIndex[current] === -1) {
        byOldIndex[old] = current
        byNewIndex[current] = old
        mapping[old] = { kind: 'matched', newIndex: current }
      }
      oldIndex -= 1
      newIndex -= 1
      continue
    }
    if (move === 'up') {
      oldIndex -= 1
      continue
    }
    newIndex -= 1
  }

  return { mapping, byOldIndex, byNewIndex }
}
