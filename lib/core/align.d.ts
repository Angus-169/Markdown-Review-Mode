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
import type { Block } from './blocks.ts';
/** The outcome of aligning one old block against the new document. */
export type BlockMapping = 
/** The old block maps onto this new block. */
{
    readonly kind: 'matched';
    readonly newIndex: number;
}
/** The old block has no counterpart. */
 | {
    readonly kind: 'missing';
};
/** The result of aligning two block lists. */
export interface Alignment {
    /** For each old block index, where it landed in the new list. */
    readonly mapping: readonly BlockMapping[];
    /** The new index each old index mapped to, or -1. */
    readonly byOldIndex: readonly number[];
    /** The old index each new index came from, or -1. */
    readonly byNewIndex: readonly number[];
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
export declare function tokenize(text: string): string[];
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
export declare function similarity(left: string, right: string): number;
/** The score at which two blocks are considered the same block. */
export declare const SIMILARITY_THRESHOLD = 0.6;
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
export declare function alignBlocks(oldBlocks: readonly Block[], newBlocks: readonly Block[]): Alignment;
//# sourceMappingURL=align.d.ts.map