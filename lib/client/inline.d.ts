/**
 * Inline Markdown rendering for the elements the preview draws itself.
 *
 * The document's own text is rendered by the editor's decorations: a marker
 * is hidden and the run around it is styled. But a **table** is drawn as one
 * element, so its cells have to be rendered here — and a cell holding
 * `**bold**` must show bold, not the asterisks.
 *
 * The renderer is pure: Markdown in, a tree of runs out. The DOM half is a
 * separate, tiny function, so the rules are testable without a browser.
 *
 * @module markdown-review-mode/client/inline
 */
/** One piece of rendered inline content. */
export interface InlineRun {
    /** The element's tag; empty for plain text. */
    readonly tag: string;
    /** The link target, for a link. */
    readonly href?: string;
    /** The text, for a leaf. */
    readonly text?: string;
    /** The nested content. */
    readonly children?: readonly InlineRun[];
}
/**
 * Render a line of inline Markdown.
 *
 * The parser returns only the **markup** elements; the plain text between
 * them is not an element of its own and has to be recovered from the source.
 *
 * @param source - the Markdown text.
 * @returns the runs, in order.
 */
export declare function renderInlineMarkdown(source: string): InlineRun[];
/**
 * The plain text of a run tree, with the markers dropped.
 * @param runs - the runs.
 * @returns the text.
 */
export declare function inlineText(runs: readonly InlineRun[]): string;
//# sourceMappingURL=inline.d.ts.map