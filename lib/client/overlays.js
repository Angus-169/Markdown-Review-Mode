import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The two floating surfaces of the review panel.
 *
 * - The **selection toolbar** appears over the passage the reader has
 *   selected and offers the kinds of annotation. Picking one opens the
 *   comment field in place; a lock needs no prose and is created at once.
 * - The **annotation popup** opens over a passage that carries an
 *   annotation, and shows what the annotation says.
 *
 * Both are positioned in the editor's own coordinate space, so they follow
 * the text without the reader losing their place.
 *
 * @module markdown-review-mode/client/overlays
 */
import { useEffect, useRef } from 'react';
import { keepEditorFocus } from "./dom.js";
import css from './review.module.css';
/**
 * The label of an annotation kind.
 * @param kind - the annotation's kind.
 * @returns the label.
 */
export function kindLabel(kind) {
    return kind === 'lock' ? '锁定' : '批注';
}
/**
 * The toolbar that appears over the reader's selection.
 *
 * The buttons keep the editor's focus: without that, the selection would
 * collapse the moment the reader reached for the toolbar, and the toolbar
 * would close before it was clicked.
 *
 * @param props - the toolbar's props.
 * @returns the rendered toolbar.
 */
export function SelectionToolbar(props) {
    const { x, y, mode, kind, draft, onDraftChange, onPick, onConfirm, onCancel } = props;
    const inputRef = useRef(null);
    useEffect(() => {
        if (mode !== 'write')
            return;
        inputRef.current?.focus();
    }, [mode]);
    return (_jsx("div", { className: `${css.floating} markdown-review-mode-floating`, style: { left: `${String(x)}px`, top: `${String(y)}px` }, "data-review-toolbar": true, onMouseDown: keepEditorFocus, children: mode === 'pick' ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: css.tool, onClick: () => onPick('comment'), children: "\u6279\u6CE8" }), _jsx("button", { type: "button", className: css.tool, onClick: () => onPick('lock'), children: "\u9501\u5B9A" })] })) : (_jsxs(_Fragment, { children: [_jsx("textarea", { ref: inputRef, className: css.popupInput, value: draft, placeholder: kind === 'lock' ? '可选：说明为什么要锁定' : '写下你的意见（Enter 换行，不会发送）', onChange: event => onDraftChange(event.target.value), onKeyDown: event => {
                        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                            event.preventDefault();
                            onConfirm();
                        }
                        if (event.key === 'Escape')
                            onCancel();
                    } }), _jsxs("div", { className: css.popupActions, children: [_jsx("button", { type: "button", className: css.save, onClick: onConfirm, children: "\u786E\u5B9A" }), _jsx("button", { type: "button", className: css.cancel, onClick: onCancel, children: "\u53D6\u6D88" })] })] })) }));
}
/**
 * The popup that shows an annotation over its passage.
 *
 * @param props - the popup's props.
 * @returns the rendered popup.
 */
export function AnnotationPopup(props) {
    const { x, y, annotation, editing, draft, onDraftChange, onEdit, onSave, onDelete, onClose } = props;
    const popupRef = useRef(null);
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === 'Escape')
                onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => { document.removeEventListener('keydown', onKeyDown); };
    }, [onClose]);
    return (_jsxs("div", { ref: popupRef, className: `${css.popup} markdown-review-mode-popup`, style: { left: `${String(x)}px`, top: `${String(y)}px` }, "data-review-popup": true, onMouseDown: keepEditorFocus, children: [_jsxs("div", { className: css.popupHead, children: [_jsx("span", { className: css.popupKind, children: kindLabel(annotation.kind) }), !editing && (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: css.popupAction, onClick: onEdit, children: "\u7F16\u8F91" }), _jsx("button", { type: "button", className: css.popupAction, onClick: onDelete, children: "\u5220\u9664" })] }))] }), _jsx("blockquote", { className: css.popupQuote, children: annotation.quote }), editing ? (_jsxs(_Fragment, { children: [_jsx("textarea", { className: css.popupInput, value: draft, placeholder: "\u5199\u4E0B\u4F60\u7684\u610F\u89C1", onChange: event => onDraftChange(event.target.value), onKeyDown: event => {
                            if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                                event.preventDefault();
                                onSave();
                            }
                        } }), _jsxs("div", { className: css.popupActions, children: [_jsx("button", { type: "button", className: css.save, onClick: onSave, children: "\u4FDD\u5B58" }), _jsx("button", { type: "button", className: css.cancel, onClick: onDelete, children: "\u53D6\u6D88" })] })] })) : (annotation.comment.length > 0 && _jsx("p", { className: css.popupComment, children: annotation.comment }))] }));
}
//# sourceMappingURL=overlays.js.map