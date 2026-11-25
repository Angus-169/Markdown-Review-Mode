/**
 * The review editor: a CodeMirror 6 instance holding the document under
 * review, with the annotations drawn over it.
 *
 * The editor is the only place a selection becomes an annotation, and the
 * only place the user can edit the text. Two rules keep it predictable:
 *
 * - **Enter never submits.** The original pain was that writing several
 *   comments in one field and pressing Enter sent the lot. Here Enter is
 *   always a newline, in the comment box and in the document alike; sending
 *   is a button, and only a button.
 * - **The annotation list is editor state**, not React state, so it moves
 *   with the text instead of being reconciled after every keystroke.
 *
 * @module markdown-review-mode/client/editor
 */
import { EditorView } from '@codemirror/view';
import type { Annotation } from '../core/anchors.ts';
/** The class names the stylesheet hangs its rules on. */
export declare const EDITOR_CLASS = "markdown-review-mode-editor";
/**
 * The decoration class names.
 *
 * They are declared here, once, because the CSS and the decorations have to
 * agree on them exactly: a name that only one side knows about is a rule that
 * silently does nothing. `verify-package.mjs` checks that every name used in
 * the bundle is also defined in the bundled CSS.
 */
export declare const HIGHLIGHT_CLASS = "cm-review-highlight";
/** The class name of a lock's highlight. */
export declare const LOCK_CLASS = "cm-review-lock";
/** The class name of a changed block's marker. */
export declare const CHANGED_CLASS = "cm-review-changed";
/** The class name of a range the preview hides from the reader. */
export declare const HIDDEN_CLASS = "cm-review-hidden";
/**
 * The editor's options.
 */
export interface ReviewEditorOptions {
    /** The document's text. */
    readonly doc: string;
    /** The annotations already collected. */
    readonly annotations: readonly Annotation[];
    /** Called when the selection changes; an empty range means it collapsed. */
    readonly onSelection: (from: number, to: number) => void;
    /** Called when the annotations change. */
    readonly onChange: (annotations: readonly Annotation[]) => void;
    /** Called when the user presses the submit shortcut inside the editor. */
    readonly onSubmit: () => void;
    /** Called when an annotated passage is clicked. */
    readonly onAnnotationClick: (annotation: Annotation, clientX: number, clientY: number) => void;
    /** Whether the editor accepts edits. */
    readonly editable: boolean;
}
/**
 * The editor handle the React side holds.
 */
export interface ReviewEditor {
    /** The CodeMirror view. */
    readonly view: EditorView;
    /** Replace the annotation list. */
    readonly setAnnotations: (annotations: readonly Annotation[]) => void;
    /** The current annotations. */
    readonly annotations: () => readonly Annotation[];
    /** The current document text. */
    readonly text: () => string;
    /** Move the selection. */
    readonly select: (from: number, to: number) => void;
    /** Replace the whole document text, as after the Agent's rework. */
    readonly replaceText: (content: string) => void;
}
/**
 * Create the review editor.
 * @param parent - the element the editor mounts into.
 * @param options - the editor's options.
 * @returns the editor handle.
 */
export declare function createReviewEditor(parent: HTMLElement, options: ReviewEditorOptions): ReviewEditor;
/**
 * Destroy an editor and release its DOM.
 * @param editor - the editor to destroy.
 */
export declare function destroyReviewEditor(editor: ReviewEditor): void;
//# sourceMappingURL=editor.d.ts.map