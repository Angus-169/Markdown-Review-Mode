/**
 * The CodeMirror half of the live preview.
 *
 * Four pieces:
 *
 * - a **state field** holding the block the reader has expanded, so the
 *   expansion survives edits and undo, and so only one passage is open at a
 *   time;
 * - a **view plugin** that turns the preview plan into decorations;
 * - **widgets** that draw what a replaced range stands for —a bullet, a
 *   table;
 * - **click handling** that expands the clicked block, and collapses it when
 *   clicked again.
 *
 * The reader sees prose; clicking a passage opens its source. Selecting a
 * passage (a drag) does not open it —a comment is written on the rendered
 * text, and only a deliberate click swaps it for source.
 *
 * @module markdown-review-mode/client/preview-view
 */
import { StateField } from '@codemirror/state';
import type { Annotation } from '../core/anchors.ts';
/** Toggle one block's expanded state. */
export declare const toggleExpandedBlock: import("@codemirror/state").StateEffectType<number>;
/**
 * The block the reader has expanded.
 *
 * Only one at a time: reading is a moving window, so opening a passage closes
 * the one before it.
 */
export declare const expandedBlocksField: StateField<number | undefined>;
/**
 * The last failure the preview ran into.
 * @returns the message, or undefined when the preview is healthy.
 */
export declare function previewFailure(): string | undefined;
/**
 * The preview's decorations.
 *
 * They come from a **facet**, not from a view plugin: CodeMirror refuses a
 * replacement that spans a line break when it comes from a plugin, and a
 * table is exactly such a replacement. A facet may replace across lines.
 *
 * The facet depends on the **document**, not only on the annotation state:
 * without that, the preview would not follow the text as it is edited.
 */
export declare const previewDecorations: import("@codemirror/state").Extension;
/**
 * The annotation a document position falls in.
 *
 * The narrowest range wins, so a lock inside a wider comment is still
 * reachable on its own.
 *
 * @param annotations - the document's annotations.
 * @param position - the document position.
 * @returns the annotation, or undefined when the position is in none.
 */
export declare function annotationAt(annotations: readonly Annotation[], position: number): Annotation | undefined;
/**
 * Click handling: a click on a block expands it, a second click collapses it.
 *
 * A drag is not a click: the selection is not empty afterwards, so a comment
 * can be written on the rendered text without the passage opening underneath
 * the user's cursor.
 *
 * A click on a passage that carries an annotation opens that annotation
 * instead: the annotation is the more specific thing under the cursor, and
 * opening the passage's source would hide the very marker that was clicked.
 *
 * @param onAnnotationClick - called when an annotated passage is clicked.
 * @returns the extension that installs the handlers.
 */
export declare function previewClickHandlers(onAnnotationClick: (annotation: Annotation, clientX: number, clientY: number) => void): import("@codemirror/state").Extension[];
//# sourceMappingURL=preview-view.d.ts.map