/**
 * Small DOM rules the panel's floating surfaces share.
 *
 * The surfaces sit **over** the editor, which makes every click on them
 * ambiguous: a click on a button must not take the editor's focus, because
 * losing focus collapses the selection and closes the surface before the
 * click lands. A click inside a text field is the opposite case — there the
 * reader is placing a cursor or dragging a selection, and the browser's own
 * behaviour is exactly what is wanted.
 *
 * @module markdown-review-mode/client/dom
 */
/**
 * Whether the element under the pointer belongs to a text field.
 *
 * @param target - the event's target.
 * @returns true when the target is, or is inside, a field the reader types in.
 */
export function isTextField(target) {
    if (!(target instanceof HTMLElement))
        return false;
    return target.closest('textarea, input, select, [contenteditable="true"]') !== null;
}
/**
 * The `mousedown` rule for a floating surface: keep the editor's focus, but
 * never at the cost of the reader's own work inside a field.
 *
 * @param event - the mousedown event.
 */
export function keepEditorFocus(event) {
    if (isTextField(event.target))
        return;
    event.preventDefault();
}
//# sourceMappingURL=dom.js.map