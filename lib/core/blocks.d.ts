/**
 * Top-level Markdown block model — the single source of truth shared by the
 * Host and Client halves.
 *
 * The block boundaries are a *normative* contract, not an implementation detail:
 * both halves parse the same text with this module, so a block index means the
 * same thing on the wire as it does on screen. The parser is deliberately
 * line-based and CommonMark-flavoured rather than token-based: the model needs
 * exact source offsets, and a token stream (markdown-it, micromark) does not
 * carry them for inline content.
 *
 * Invariants the rest of the plugin relies on:
 *
 * - Blocks are ordered, non-overlapping, and every block's content range lies
 *   inside the source.
 * - `start`/`end` bound the block's own text (no surrounding whitespace).
 * - `spanEnd` closes the partition: it is the next block's `start`, so
 *   `source.slice(block.start, block.spanEnd)` is exactly the block plus the
 *   whitespace that separates it from the next one.
 * - `separator` is that separating whitespace verbatim, so a patch can rebuild
 *   the document by replacing block texts and keeping separators.
 *
 * Offsets are UTF-16 code-unit indices into the original source, matching
 * both JavaScript string indices and CodeMirror 6 document positions.
 *
 * @module markdown-review-mode/core/blocks
 */
/** The block kinds this model distinguishes. */
export type BlockKind = 'heading' | 'paragraph' | 'list' | 'blockquote' | 'code' | 'table' | 'html' | 'hr' | 'image';
/** One top-level block of a Markdown document. */
export interface Block {
    /** 0-based position in the block list. */
    readonly index: number;
    /** What the block is, for the whole-block degradation decision. */
    readonly kind: BlockKind;
    /** Offset of the block's first content character (inclusive). */
    readonly start: number;
    /** Offset just past the block's last content character (exclusive). */
    readonly end: number;
    /** Offset where the next block starts; equals `source.length` for the last block. */
    readonly spanEnd: number;
    /** The block's own text: `source.slice(start, end)`. */
    readonly text: string;
    /** The whitespace between this block and the next one: `source.slice(end, spanEnd)`. */
    readonly separator: string;
    /** Stable content hash of `text`. */
    readonly hash: string;
    /** 1-based source line of `start`. */
    readonly line: number;
}
/**
 * Whether a block supports a character selection inside it.
 * @param kind - the block kind to test.
 * @returns true when an intra-block range is meaningful for that kind.
 */
export declare function supportsIntraBlockSelection(kind: BlockKind): boolean;
/**
 * A 64-bit content hash rendered as 16 lowercase hex characters.
 *
 * The model needs a *synchronous* hash usable in the browser, where
 * `crypto.subtle` is asynchronous and therefore unusable inside a StateField
 * transaction. FNV-1a over UTF-16 code units, run twice with different offset
 * bases, gives a 64-bit value with adequate collision behaviour for
 * same-length block comparison.
 *
 * @param text - the text to hash.
 * @returns 16 hex characters.
 */
export declare function hashText(text: string): string;
/**
 * Parse a Markdown document into top-level blocks.
 *
 * The splitter recognises the constructs the review model needs to address:
 * headings, paragraphs, lists, block quotes, fenced code, tables, HTML blocks,
 * thematic breaks, and image-only paragraphs. Nesting inside a list or a quote
 * is not split further — a list is one addressable block.
 *
 * @param source - the document text.
 * @returns the document's blocks in order; empty for an empty document.
 */
export declare function parseBlocks(source: string): Block[];
/**
 * The 1-based source line of an offset.
 * @param source - the document text.
 * @param offset - the offset to locate.
 * @returns the line number.
 */
export declare function lineOf(source: string, offset: number): number;
/**
 * The block that owns an offset.
 * @param blocks - the document's blocks.
 * @param offset - the offset to locate.
 * @returns the owning block, or undefined when the offset lies outside every block.
 */
export declare function blockAt(blocks: readonly Block[], offset: number): Block | undefined;
/**
 * The block whose content contains an offset.
 *
 * An offset that falls in the whitespace between two blocks belongs to
 * neither; the caller decides whether to snap it left or right.
 *
 * @param blocks - the document's blocks.
 * @param offset - the offset to locate.
 * @returns the containing block, or undefined.
 */
export declare function contentBlockAt(blocks: readonly Block[], offset: number): Block | undefined;
//# sourceMappingURL=blocks.d.ts.map