/**
 * The anchor model: how a selection becomes a durable reference into a
 * Markdown source, and how that reference survives editing.
 *
 * Two corrections over the original design shape this module:
 *
 * 1. **A position is an absolute offset, not a block-relative one.** The
 *    editor keeps `from`/`to` in absolute document positions and lets
 *    CodeMirror's `mapPos` move them. A block-relative offset cannot be
 *    remapped by the editor at all, because the block's own start moves when
 *    earlier text changes — which is exactly the case `mapPos` handles well.
 *    The block index survives as *derived* metadata for grouping and for the
 *    Agent-facing contract, never as the anchor itself.
 *
 * 2. **A quote is re-extracted, not frozen.** When the user edits inside an
 *    annotated range, the stored quote no longer matches. The editor re-reads
 *    the range after every transaction and stores the *current* text, so an
 *    annotation follows the user's own edit instead of going stale. A quote
 *    that no longer matches means something else happened — an external
 *    writer — and only then is the annotation stale.
 *
 * @module markdown-review-mode/core/anchors
 */
import type { Block } from './blocks.ts';
/**
 * How an annotation constrains the Agent.
 *
 * There are two kinds, and they are the two answers to "what may happen to
 * this passage":
 *
 * - A **comment** asks for work: the Agent may rewrite the passage, delete
 *   it, or move it.
 * - A **lock** forbids work: the passage must not change at all.
 *
 * A third kind — "structural", meaning "you may move it but not reword it" —
 * was removed. It was a real permission, but the label said nothing about it,
 * so the reader could not tell which of the two buttons to press, and a
 * control that cannot be chosen correctly is worse than no control.
 */
export type AnnotationKind = 
/** Free-text instruction about a range. */
'comment'
/** The range is approved; the Agent must not change it. */
 | 'lock';
/** The lifecycle state of one annotation. */
export type AnnotationStatus = 
/** Created, not yet submitted. */
'open'
/** The anchored text no longer exists in the document. */
 | 'stale'
/** The Agent changed the anchored range. */
 | 'applied'
/** The Agent declined to change it and said why. */
 | 'declined'
/** The Agent wanted to change it but the rules forbade it. */
 | 'conflict'
/** Submitted, but the Agent never reported on it. */
 | 'unhandled';
/** One annotation as the editor holds it. */
export interface Annotation {
    /** Unique within a review round. */
    readonly id: string;
    /** What the annotation constrains. */
    readonly kind: AnnotationKind;
    /** The free-text instruction; empty for a lock. */
    readonly comment: string;
    /** Absolute start offset in the document. */
    readonly from: number;
    /** Absolute end offset in the document (exclusive). */
    readonly to: number;
    /** The text currently covered by the range, re-extracted after each edit. */
    readonly quote: string;
    /** The block the range starts in; derived, refreshed on every change. */
    readonly block: number;
    /** Creation order, for stable sorting. */
    readonly seq: number;
    /** Creation time in epoch milliseconds. */
    readonly createdAt: number;
    /** Lifecycle state. */
    readonly status: AnnotationStatus;
}
/** A range expressed the way the Agent-facing contract expresses it. */
export interface BlockRange {
    /** The block the range starts in. */
    readonly startBlock: number;
    /** Offset inside that block, relative to the block's content start. */
    readonly startOffset: number;
    /** The block the range ends in. */
    readonly endBlock: number;
    /** Offset inside that block, relative to the block's content start. */
    readonly endOffset: number;
}
/**
 * Extract the text a range covers.
 * @param source - the document text.
 * @param from - the range's start offset.
 * @param to - the range's end offset (exclusive).
 * @returns the covered text.
 */
export declare function sliceQuote(source: string, from: number, to: number): string;
/**
 * Snap a range to the nearest addressable text.
 *
 * A selection whose ends fall in the whitespace between blocks is not
 * addressable: the whitespace belongs to no block, so an annotation over it
 * could not be shown or verified. A start that lands in the whitespace after
 * a block moves forward to the next block's first character, and an end that
 * lands there moves back to the block's last character — the same rule the
 * design states for the two ends, in the direction that keeps the selection
 * inside the text the user pointed at.
 *
 * @param source - the document text.
 * @param blocks - the document's blocks.
 * @param from - the requested start offset.
 * @param to - the requested end offset.
 * @returns the snapped range.
 */
export declare function snapRange(source: string, blocks: readonly Block[], from: number, to: number): {
    from: number;
    to: number;
};
/**
 * Express an absolute range in the block-relative form the Agent uses.
 * @param blocks - the document's blocks.
 * @param from - the range's start offset.
 * @param to - the range's end offset (exclusive).
 * @returns the block-relative range, or undefined when the range is outside every block.
 */
export declare function toBlockRange(blocks: readonly Block[], from: number, to: number): BlockRange | undefined;
/**
 * Resolve a block-relative range back to absolute offsets.
 * @param blocks - the document's blocks.
 * @param range - the block-relative range.
 * @returns the absolute range, or undefined when a block index is out of range.
 */
export declare function fromBlockRange(blocks: readonly Block[], range: BlockRange): {
    from: number;
    to: number;
} | undefined;
/**
 * Re-extract every annotation's quote from the current document.
 *
 * An annotation whose range still covers text stays valid and adopts the new
 * text. An annotation whose range now covers nothing — the user deleted it —
 * becomes stale, which is a different condition from "the user edited inside
 * it", and the two must not be conflated.
 *
 * @param source - the document text.
 * @param annotations - the annotations to refresh.
 * @returns the annotations with refreshed quotes and statuses.
 */
export declare function refreshAnnotations(source: string, annotations: readonly Annotation[]): Annotation[];
/**
 * The outcome of re-anchoring one annotation against a changed document.
 */
export type ReanchorResult = 
/** The range still covers the same text. */
{
    readonly kind: 'ok';
    readonly from: number;
    readonly to: number;
    readonly quote: string;
}
/** The text moved but was found exactly once. */
 | {
    readonly kind: 'remapped';
    readonly from: number;
    readonly to: number;
    readonly quote: string;
}
/** The text is gone. */
 | {
    readonly kind: 'stale';
};
/**
 * Re-anchor one annotation after the document changed outside the editor.
 *
 * The search is by exact quote. A quote that occurs exactly once in the new
 * document is remapped onto that occurrence; a quote that occurs more than
 * once cannot be placed unambiguously, and a quote that no longer occurs is
 * gone. The search is deliberately *not* fuzzy: a fuzzy match would silently
 * attach an annotation to text the user never wrote.
 *
 * @param source - the new document text.
 * @param annotation - the annotation to re-anchor.
 * @returns where the annotation now lives.
 */
export declare function reanchor(source: string, annotation: Annotation): ReanchorResult;
/**
 * Re-anchor a whole set of annotations against a changed document.
 * @param source - the new document text.
 * @param annotations - the annotations to re-anchor.
 * @returns the annotations with updated positions and statuses.
 */
export declare function reanchorAll(source: string, annotations: readonly Annotation[]): Annotation[];
/**
 * The block an annotation's range starts in.
 * @param source - the document text.
 * @param annotation - the annotation to locate.
 * @returns the block index, or -1 when the range lies outside every block.
 */
export declare function blockIndexOf(source: string, annotation: Annotation): number;
/**
 * Sort annotations by their position in the document.
 * @param annotations - the annotations to sort.
 * @returns the annotations in document order, ties broken by creation order.
 */
export declare function sortByPosition(annotations: readonly Annotation[]): Annotation[];
/**
 * The union of a set of ranges, as disjoint intervals.
 *
 * Overlapping annotations are drawn as one merged band rather than as
 * stacked translucent layers, which would compound into a muddy colour.
 *
 * @param annotations - the annotations whose ranges to union.
 * @returns the merged intervals, ordered by start.
 */
export declare function unionRanges(annotations: readonly Annotation[]): Array<{
    from: number;
    to: number;
}>;
//# sourceMappingURL=anchors.d.ts.map