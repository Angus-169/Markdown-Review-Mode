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
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { annotationField, setAnnotations } from "./state.js";
import { expandedBlocksField, previewClickHandlers, previewDecorations } from "./preview-view.js";
/** The class names the stylesheet hangs its rules on. */
export const EDITOR_CLASS = 'markdown-review-mode-editor';
/**
 * The decoration class names.
 *
 * They are declared here, once, because the CSS and the decorations have to
 * agree on them exactly: a name that only one side knows about is a rule that
 * silently does nothing. `verify-package.mjs` checks that every name used in
 * the bundle is also defined in the bundled CSS.
 */
export const HIGHLIGHT_CLASS = 'cm-review-highlight';
/** The class name of a lock's highlight. */
export const LOCK_CLASS = 'cm-review-lock';
/** The class name of a changed block's marker. */
export const CHANGED_CLASS = 'cm-review-changed';
/** The class name of a range the preview hides from the reader. */
export const HIDDEN_CLASS = 'cm-review-hidden';
/**
 * Create the review editor.
 * @param parent - the element the editor mounts into.
 * @param options - the editor's options.
 * @returns the editor handle.
 */
export function createReviewEditor(parent, options) {
    const state = EditorState.create({
        doc: options.doc,
        extensions: [
            history(),
            // CodeMirror does not wrap lines by default: a paragraph would run off
            // the panel on one line. A review reads like a document.
            EditorView.lineWrapping,
            // The Markdown language is what gives the preview its syntax tree.
            // Without it `syntaxTree` is empty and the document stays plain source —
            // a failure that looks like "the preview does not work".
            markdown(),
            keymap.of([
                { key: 'Mod-Enter', run: () => { options.onSubmit(); return true; } },
                ...defaultKeymap,
                ...historyKeymap,
            ]),
            annotationField.init(() => options.annotations),
            expandedBlocksField,
            previewDecorations,
            previewClickHandlers(options.onAnnotationClick),
            EditorView.editable.of(options.editable),
            EditorView.updateListener.of(update => {
                if (update.docChanged || update.transactions.some(transaction => transaction.effects.length > 0)) {
                    options.onChange(update.state.field(annotationField));
                }
                if (update.selectionSet && !update.docChanged) {
                    const range = update.state.selection.main;
                    options.onSelection(range.from, range.to);
                }
            }),
            EditorView.theme({
                '&': { height: '100%', fontSize: 'inherit' },
                // CodeMirror defaults to a monospace 14px editor. The review panel is
                // a document view, so it takes the host's own reading font and size —
                // the same ones the product's Markdown renderer uses.
                '.cm-scroller': {
                    overflow: 'auto',
                    fontFamily: 'var(--dsw-font, inherit)',
                },
                '.cm-content': { font: 'var(--dsw-font-markdown, inherit)' },
            }),
        ],
    });
    const view = new EditorView({ state, parent });
    return {
        view,
        setAnnotations: (annotations) => {
            view.dispatch({ effects: setAnnotations.of(annotations) });
        },
        annotations: () => view.state.field(annotationField),
        text: () => view.state.doc.toString(),
        select: (from, to) => {
            view.dispatch({ selection: { anchor: from, head: to } });
            view.focus();
        },
        replaceText: (content) => {
            const current = view.state.doc.toString();
            if (current === content)
                return;
            view.dispatch({
                changes: { from: 0, to: current.length, insert: content },
            });
        },
    };
}
/**
 * Destroy an editor and release its DOM.
 * @param editor - the editor to destroy.
 */
export function destroyReviewEditor(editor) {
    editor.view.destroy();
}
//# sourceMappingURL=editor.js.map