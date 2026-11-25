/**
 * The live-preview plan: how a Markdown source renders when the reader is
 * not editing that part of it.
 *
 * The plan is computed from the Markdown syntax tree and the block model, and
 * it is a plain data structure — a list of ranges to hide, a list of ranges to
 * style, and a list of ranges to replace with a drawn element. Keeping it
 * separate from CodeMirror means the whole thing is testable without a
 * browser, and the editor half stays a thin adapter.
 *
 * Three rules drive everything:
 *
 * - **A block the reader has not expanded renders as prose.** The inline
 *   markers (`**`, `_`, backticks) disappear, emphasis becomes emphasis, a
 *   heading becomes a heading, a list becomes a list, and a table becomes a
 *   table.
 * - **A block the reader expanded shows its source verbatim.** The design's
 *   review workflow needs the raw text in front of the user when they are
 *   working on a specific passage, so expanding is a first-class, per-block
 *   state rather than a global mode.
 * - **Only one block is expanded at a time.** Reading is a moving window:
 *   opening a passage closes the one before it.
 *
 * The ranges are **disjoint by construction**: a styled run covers only the
 * *content* of a run, never its markers, and a replaced range — a list bullet,
 * a table — contains nothing else. CodeMirror refuses overlapping decoration
 * ranges, and a style that swallowed the markers it hid would be both wrong
 * and unusable.
 *
 * @module markdown-review-mode/core/preview
 */
import type { Tree } from '@lezer/common';
import type { Block } from './blocks.ts';
/** A range to render with a class. */
export interface PreviewMark {
    /** The range's start offset. */
    readonly from: number;
    /** The range's end offset. */
    readonly to: number;
    /** The class the range is marked with. */
    readonly class: string;
}
/** A range to remove from the rendered output. */
export interface PreviewHide {
    /** The range's start offset. */
    readonly from: number;
    /** The range's end offset. */
    readonly to: number;
}
/** A table's cells and their alignment. */
export interface PreviewTable {
    /** The header row's cells. */
    readonly head: readonly string[];
    /** The body rows' cells. */
    readonly rows: readonly (readonly string[])[];
    /** Each column's alignment. */
    readonly align: readonly ('left' | 'center' | 'right')[];
}
/** What a replaced range is drawn as. */
export type PreviewReplaceKind = 'bullet' | 'table' | 'footnote' | 'footnote-ref';
/** A range replaced by a drawn element. */
export interface PreviewReplace {
    /** The range's start offset. */
    readonly from: number;
    /** The range's end offset. */
    readonly to: number;
    /** What the range is drawn as. */
    readonly kind: PreviewReplaceKind;
    /** The text a bullet draws. */
    readonly text?: string;
    /** The table the range holds. */
    readonly table?: PreviewTable;
    /**
     * The footnote's number, for a footnote and its reference.
     *
     * Footnotes are numbered by the order of their **first reference**, which is
     * what every Markdown implementation does; the definition's own position
     * does not decide the number.
     */
    readonly number?: number;
    /**
     * The block the replaced range belongs to.
     *
     * A drawn element has no text of its own, so a click on it cannot be mapped
     * back to a document position — the element carries its block instead, and
     * the editor reads it from the DOM.
     */
    readonly block?: number;
}
/** Everything the editor needs to draw one document. */
export interface PreviewPlan {
    /** The styled ranges. */
    readonly marks: readonly PreviewMark[];
    /** The ranges to hide. */
    readonly hides: readonly PreviewHide[];
    /** The ranges replaced by a drawn element. */
    readonly replaces: readonly PreviewReplace[];
}
/** An empty plan, for a document with nothing to render. */
export declare const EMPTY_PREVIEW_PLAN: PreviewPlan;
/**
 * Parse a Markdown document into its syntax tree.
 * @param source - the document text.
 * @returns the parsed tree.
 */
export declare function parseMarkdown(source: string): Tree;
/**
 * Parse a GFM table's source.
 *
 * The second row is the delimiter row: it names the columns and their
 * alignment, and it is not part of the table's content.
 *
 * @param source - the table's source text.
 * @returns the table's cells and alignment, or undefined when the source is
 * not a table.
 */
export declare function parseTable(source: string): PreviewTable | undefined;
/**
 * Plan the live preview of one document.
 *
 * A node inside an expanded block is skipped whole: the user asked for that
 * passage's source, so nothing there is hidden or restyled.
 *
 * @param source - the document text the tree was parsed from.
 * @param tree - the document's Markdown syntax tree.
 * @param blocks - the document's blocks.
 * @param expanded - the index of the block the user expanded, if any.
 * @returns the marks, hides, and replacements the editor should draw.
 */
export declare function planPreviewDecorations(source: string, tree: Tree, blocks: readonly Block[], expanded: number | undefined): PreviewPlan;
//# sourceMappingURL=preview.d.ts.map