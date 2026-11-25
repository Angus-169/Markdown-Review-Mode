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
import { blockAt, parseBlocks } from "./blocks.js";
/**
 * Extract the text a range covers.
 * @param source - the document text.
 * @param from - the range's start offset.
 * @param to - the range's end offset (exclusive).
 * @returns the covered text.
 */
export function sliceQuote(source, from, to) {
    if (to <= from)
        return '';
    return source.slice(from, to);
}
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
export function snapRange(source, blocks, from, to) {
    const start = Math.max(0, Math.min(from, source.length));
    const end = Math.max(start, Math.min(to, source.length));
    const startOwner = blockAt(blocks, start);
    const endOwner = blockAt(blocks, Math.max(start, end - 1));
    if (startOwner === undefined || endOwner === undefined) {
        return { from: start, to: end };
    }
    if (end <= start) {
        // An empty selection still needs an addressable target: use the whole
        // block the caret sits in.
        return { from: startOwner.start, to: startOwner.end };
    }
    // A start inside the whitespace after its block moves to the next block.
    let snappedFrom = start;
    if (start >= startOwner.end) {
        const next = blocks[startOwner.index + 1];
        snappedFrom = next === undefined ? startOwner.end : next.start;
    }
    // An end inside the whitespace after its block moves back to that block.
    let snappedTo = end;
    if (end > endOwner.end) {
        snappedTo = endOwner.end;
    }
    return { from: snappedFrom, to: Math.max(snappedFrom, snappedTo) };
}
/**
 * Express an absolute range in the block-relative form the Agent uses.
 * @param blocks - the document's blocks.
 * @param from - the range's start offset.
 * @param to - the range's end offset (exclusive).
 * @returns the block-relative range, or undefined when the range is outside every block.
 */
export function toBlockRange(blocks, from, to) {
    const startBlock = blockAt(blocks, from);
    const endBlock = blockAt(blocks, Math.max(from, to - 1));
    if (startBlock === undefined || endBlock === undefined)
        return undefined;
    return {
        startBlock: startBlock.index,
        startOffset: Math.max(0, from - startBlock.start),
        endBlock: endBlock.index,
        endOffset: Math.max(0, Math.min(to, endBlock.end) - endBlock.start),
    };
}
/**
 * Resolve a block-relative range back to absolute offsets.
 * @param blocks - the document's blocks.
 * @param range - the block-relative range.
 * @returns the absolute range, or undefined when a block index is out of range.
 */
export function fromBlockRange(blocks, range) {
    const startBlock = blocks[range.startBlock];
    const endBlock = blocks[range.endBlock];
    if (startBlock === undefined || endBlock === undefined)
        return undefined;
    const from = startBlock.start + range.startOffset;
    const to = endBlock.start + range.endOffset;
    return { from: Math.min(from, to), to: Math.max(from, to) };
}
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
export function refreshAnnotations(source, annotations) {
    return annotations.map(annotation => {
        const quote = sliceQuote(source, annotation.from, annotation.to);
        if (quote.length === 0 && annotation.quote.length > 0) {
            return { ...annotation, quote, status: 'stale' };
        }
        return { ...annotation, quote, status: annotation.status === 'stale' ? 'open' : annotation.status };
    });
}
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
export function reanchor(source, annotation) {
    const current = sliceQuote(source, annotation.from, annotation.to);
    if (current === annotation.quote) {
        return { kind: 'ok', from: annotation.from, to: annotation.to, quote: current };
    }
    if (annotation.quote.length === 0) {
        return { kind: 'stale' };
    }
    const first = source.indexOf(annotation.quote);
    if (first === -1)
        return { kind: 'stale' };
    if (source.indexOf(annotation.quote, first + 1) !== -1)
        return { kind: 'stale' };
    return {
        kind: 'remapped',
        from: first,
        to: first + annotation.quote.length,
        quote: annotation.quote,
    };
}
/**
 * Re-anchor a whole set of annotations against a changed document.
 * @param source - the new document text.
 * @param annotations - the annotations to re-anchor.
 * @returns the annotations with updated positions and statuses.
 */
export function reanchorAll(source, annotations) {
    return annotations.map(annotation => {
        const result = reanchor(source, annotation);
        if (result.kind === 'stale') {
            return { ...annotation, status: 'stale' };
        }
        return {
            ...annotation,
            from: result.from,
            to: result.to,
            quote: result.quote,
            status: result.kind === 'remapped' && annotation.status === 'open' ? 'open' : annotation.status,
        };
    });
}
/**
 * The block an annotation's range starts in.
 * @param source - the document text.
 * @param annotation - the annotation to locate.
 * @returns the block index, or -1 when the range lies outside every block.
 */
export function blockIndexOf(source, annotation) {
    const blocks = parseBlocks(source);
    return blockAt(blocks, annotation.from)?.index ?? -1;
}
/**
 * Sort annotations by their position in the document.
 * @param annotations - the annotations to sort.
 * @returns the annotations in document order, ties broken by creation order.
 */
export function sortByPosition(annotations) {
    return [...annotations].sort((left, right) => {
        if (left.from !== right.from)
            return left.from - right.from;
        return left.seq - right.seq;
    });
}
/**
 * The union of a set of ranges, as disjoint intervals.
 *
 * Overlapping annotations are drawn as one merged band rather than as
 * stacked translucent layers, which would compound into a muddy colour.
 *
 * @param annotations - the annotations whose ranges to union.
 * @returns the merged intervals, ordered by start.
 */
export function unionRanges(annotations) {
    const ranges = annotations
        .filter(annotation => annotation.to > annotation.from)
        .map(annotation => ({ from: annotation.from, to: annotation.to }))
        .sort((left, right) => left.from - right.from);
    const merged = [];
    for (const range of ranges) {
        const last = merged[merged.length - 1];
        if (last !== undefined && range.from <= last.to) {
            last.to = Math.max(last.to, range.to);
            continue;
        }
        merged.push({ ...range });
    }
    return merged;
}
//# sourceMappingURL=anchors.js.map