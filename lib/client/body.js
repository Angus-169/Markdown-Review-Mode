import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * The review body: the document, the floating surfaces, and the submit
 * button.
 *
 * The body is mounted inside the document preview's keyed slot, so it sits
 * beside the product's own Markdown renderer and is chosen from the same
 * dropdown. It owns three pieces of state:
 *
 * - the **document**, read over the plugin's route and then edited in place
 *   by the user;
 * - the **annotations**, which live in the editor's state so they follow the
 *   text;
 * - the **round**, which is opened on submit and polled while the Agent
 *   works.
 *
 * The annotations are shown **in the text**, not in a list beside it: a
 * comment underlines its passage, a lock underlines it differently, and
 * clicking either opens the annotation in place. The reader sees the
 * document, and the marks are on the words they are about — which is the
 * only place a reader can act on them.
 *
 * The body reaches the Host over the plugin's own same-origin route, so it
 * needs nothing from the client context beyond what the slot provides.
 *
 * @module markdown-review-mode/client/body
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { snapRange, toBlockRange } from "../core/anchors.js";
import { parseBlocks } from "../core/blocks.js";
import { createReviewEditor, destroyReviewEditor } from "./editor.js";
import { readPendingEdits, readReviewDocument, readReviewResult, readReviewStylesheet, savePendingEdits, saveReviewDocument, submitReview } from "./index.js";
import { previewFailure } from "./preview-view.js";
import { AnnotationPopup, SelectionToolbar } from "./overlays.js";
import css from './review.module.css';
/** How often the client asks the Host whether the Agent has finished. */
const POLL_INTERVAL_MS = 1500;
/**
 * How long the editor waits after the last keystroke before saving the
 * reader's unsaved edits.
 *
 * Saving on every keystroke would write the whole document each time; a
 * second of delay is short enough that a reload rarely loses anything and
 * long enough that typing stays smooth.
 */
const SAVE_DEBOUNCE_MS = 1000;
/**
 * The review body component.
 * @param props - the slot's props.
 * @returns the rendered panel.
 */
export function ReviewBody(props) {
    const { resourceAddress, content, useResource } = props;
    // The Host's own absolute path, not a re-parsed address: the address grammar
    // carries a scope segment (`session` or `absolute`) and a workspace-relative
    // path, and only the Host knows the workspace root it resolves against.
    const absolutePath = useResource(resourceAddress).value?.absolutePath;
    const [text, setText] = useState('');
    const [version, setVersion] = useState('');
    const [annotations, setAnnotations] = useState([]);
    const [roundId, setRoundId] = useState(undefined);
    const [result, setResult] = useState(undefined);
    const [message, setMessage] = useState(undefined);
    const [busy, setBusy] = useState(true);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState('');
    const [toolbar, setToolbar] = useState(undefined);
    const [popup, setPopup] = useState(undefined);
    const wrapRef = useRef(null);
    const editorHost = useRef(null);
    const editorRef = useRef(undefined);
    const seqRef = useRef(0);
    const saveTimer = useRef(undefined);
    const restoredAnnotations = useRef([]);
    /**
     * The text as it stands in the file.
     *
     * The reader's editing is unsaved work; this is the baseline it is compared
     * against, so the panel can tell "nothing to save" from "you changed text".
     */
    const savedText = useRef('');
    // Load the user's stylesheet. It is the user's own file, so it is applied
    // as written: their rules reach the whole page, and the panel's own stable
    // class names are what they target.
    useEffect(() => {
        let element;
        let cancelled = false;
        void readReviewStylesheet()
            .then(stylesheet => {
            if (cancelled || stylesheet.css.trim().length === 0)
                return;
            element = document.createElement('style');
            element.setAttribute('data-review-stylesheet', stylesheet.path);
            element.textContent = stylesheet.css;
            document.head.appendChild(element);
        })
            .catch(() => { });
        return () => {
            cancelled = true;
            element?.remove();
        };
    }, []);
    // Read the document over the plugin's route, then report it to the owner so
    // the preview's toolbar knows the file is displayed. The read waits for the
    // Host's absolute path, which arrives with the file's metadata.
    //
    // The reader's unsaved work is read in the same step and the text is set
    // **once**: the editor is created from that value, so restoring a moment
    // later would leave it showing the file on disk instead.
    useEffect(() => {
        if (absolutePath === undefined)
            return;
        let cancelled = false;
        setBusy(true);
        void (async () => {
            try {
                const read = await readReviewDocument(absolutePath);
                if (cancelled)
                    return;
                let startingText = read.content;
                let restored = [];
                try {
                    const pending = await readPendingEdits(absolutePath);
                    // Only when the file has not changed underneath the saved work:
                    // edits made against another version no longer apply to this text.
                    if (pending !== undefined && pending.base === read.version) {
                        startingText = pending.content;
                        restored = pending.annotations ?? [];
                        if (startingText !== read.content || restored.length > 0)
                            setMessage('已恢复上次未提交的修改。');
                    }
                }
                catch { /* no saved work, or the storage is unavailable */ }
                if (cancelled)
                    return;
                restoredAnnotations.current = restored;
                // The file itself is the baseline; restored edits are unsaved work
                // until the reader saves them.
                savedText.current = read.content;
                setDirty(startingText !== read.content);
                setAnnotations(restored);
                setText(startingText);
                setVersion(read.version);
                setBusy(false);
                content.loaded?.(read.version);
            }
            catch (error) {
                if (cancelled)
                    return;
                setBusy(false);
                setMessage(error instanceof Error ? error.message : String(error));
                content.failed?.();
            }
        })();
        return () => { cancelled = true; };
    }, [absolutePath, content]);
    // Mount the editor once the document is available.
    useEffect(() => {
        const host = editorHost.current;
        if (host === null || text.length === 0)
            return;
        if (editorRef.current !== undefined)
            return;
        const editor = createReviewEditor(host, {
            doc: text,
            // Comments restored from the last unsubmitted session belong in the
            // editor from the start: they are editor state, and a panel that
            // unmounts takes them with it otherwise.
            annotations: restoredAnnotations.current,
            editable: true,
            onSelection: (from, to) => {
                if (from === to) {
                    // The selection collapsed: the reader clicked somewhere else, so the
                    // surfaces over the old passage go away.
                    setToolbar(current => (current?.mode === 'write' ? current : undefined));
                    setPopup(undefined);
                    return;
                }
                setPopup(undefined);
                setToolbar(current => {
                    const position = floatingAt(editorRef.current, from, 'bottom');
                    if (position === undefined)
                        return current;
                    return {
                        from,
                        to,
                        x: position.x,
                        y: position.y,
                        mode: 'pick',
                        kind: current?.kind ?? 'comment',
                    };
                });
            },
            onChange: next => {
                setAnnotations(next);
                // A preview that cannot be drawn says so in the panel rather than
                // leaving the reader to wonder why the text looks like source.
                const failure = previewFailure();
                if (failure !== undefined)
                    setMessage(`预览无法渲染：${failure}`);
                setDirty(editorRef.current?.text() !== savedText.current);
                // Save the reader's own edits, so reloading the panel does not throw
                // away work that was never submitted.
                if (saveTimer.current !== undefined)
                    clearTimeout(saveTimer.current);
                saveTimer.current = setTimeout(() => {
                    saveTimer.current = undefined;
                    const editor = editorRef.current;
                    if (editor === undefined || absolutePath === undefined)
                        return;
                    void savePendingEdits({
                        doc: absolutePath,
                        base: version,
                        content: editor.text(),
                        annotations: [...editor.annotations()],
                        savedAt: Date.now(),
                    }).catch(() => { });
                }, SAVE_DEBOUNCE_MS);
            },
            onSubmit: () => { void submit(); },
            onAnnotationClick: (annotation, clientX, clientY) => {
                const position = floatingAt(editorRef.current, annotation.from, 'top', clientX, clientY);
                if (position === undefined)
                    return;
                setToolbar(undefined);
                setPopup({ id: annotation.id, x: position.x, y: position.y, editing: false });
            },
        });
        editorRef.current = editor;
        return () => {
            if (saveTimer.current !== undefined)
                clearTimeout(saveTimer.current);
            destroyReviewEditor(editor);
            editorRef.current = undefined;
        };
        // The editor is created once; later text changes arrive through it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text.length > 0]);
    // Poll the round while the Agent works.
    useEffect(() => {
        if (roundId === undefined || result?.settled === true)
            return;
        let cancelled = false;
        const timer = setInterval(() => {
            void readReviewResult(roundId)
                .then(next => {
                if (cancelled)
                    return;
                setResult(next);
                if (next.settled) {
                    // The annotations live in the **editor's** state, not in React's:
                    // clearing React alone leaves them to be remapped through the
                    // whole-document replacement below, which stretches every mark
                    // over whatever text happens to land at the same offsets.
                    const editor = editorRef.current;
                    editor?.setAnnotations([]);
                    setAnnotations([]);
                    // The Agent's rework is the document now; show it.
                    editor?.replaceText(next.content);
                    savedText.current = next.content;
                    setDirty(false);
                    setVersion(next.version);
                    setMessage(`返工完成：${String(next.receipts.length)} 处修改，${String(next.unhandled.length)} 条批注未处理。`);
                }
            })
                .catch(() => { });
        }, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [roundId, result?.settled]);
    const blocks = useMemo(() => parseBlocks(text), [text]);
    /**
     * Create an annotation over a range.
     */
    const createAnnotation = useCallback((kind, comment, from, to) => {
        const editor = editorRef.current;
        if (editor === undefined)
            return;
        const editorText = editor.text();
        if (editorText.slice(from, to).trim().length === 0)
            return;
        const snapped = snapRange(editorText, blocks, from, to);
        seqRef.current += 1;
        const range = toBlockRange(blocks, snapped.from, snapped.to);
        const annotation = {
            id: `a${seqRef.current}`,
            kind,
            comment: comment.trim(),
            from: snapped.from,
            to: snapped.to,
            quote: editorText.slice(snapped.from, snapped.to),
            block: range?.startBlock ?? 0,
            seq: seqRef.current,
            createdAt: Date.now(),
            status: 'open',
        };
        editor.setAnnotations([...editor.annotations(), annotation]);
    }, [blocks]);
    /** The annotation the popup is about. */
    const popupAnnotation = popup === undefined
        ? undefined
        : annotations.find(annotation => annotation.id === popup.id);
    /** Pick a kind from the selection toolbar. */
    const pickKind = useCallback((kind) => {
        setToolbar(current => {
            if (current === undefined)
                return current;
            if (kind === 'lock') {
                // A lock needs no prose: it is created at once.
                createAnnotation(kind, '', current.from, current.to);
                return undefined;
            }
            return { ...current, kind, mode: 'write' };
        });
    }, [createAnnotation]);
    /** Confirm the comment being written over a selection. */
    const confirmDraft = useCallback(() => {
        setToolbar(current => {
            if (current === undefined)
                return current;
            createAnnotation(current.kind, draft, current.from, current.to);
            setDraft('');
            return undefined;
        });
    }, [createAnnotation, draft]);
    /** Save an edited annotation's comment. */
    const savePopup = useCallback(() => {
        const editor = editorRef.current;
        const annotation = popupAnnotation;
        if (editor === undefined || annotation === undefined)
            return;
        editor.setAnnotations(editor.annotations().map(item => item.id === annotation.id
            ? { ...item, comment: draft.trim() }
            : item));
        setDraft('');
        setPopup(current => (current === undefined ? current : { ...current, editing: false }));
    }, [popupAnnotation, draft]);
    /** Remove an annotation. */
    const deletePopup = useCallback(() => {
        const editor = editorRef.current;
        const annotation = popupAnnotation;
        if (editor === undefined || annotation === undefined)
            return;
        editor.setAnnotations(editor.annotations().filter(item => item.id !== annotation.id));
        setPopup(undefined);
    }, [popupAnnotation]);
    /**
     * Save the reader's own edits to the file.
     *
     * Editing in the review panel is editing a document, so it needs a way out
     * that does not involve the Agent. The write is guarded by the version the
     * text was read at: if the file moved underneath, the save is refused rather
     * than overwriting whatever else changed it.
     */
    const save = useCallback(async () => {
        const editor = editorRef.current;
        if (editor === undefined || absolutePath === undefined)
            return;
        setSaving(true);
        setMessage(undefined);
        try {
            const answer = await saveReviewDocument(absolutePath, editor.text(), version);
            if (!answer.ok) {
                setMessage(answer.message ?? '保存失败。');
                return;
            }
            savedText.current = editor.text();
            setDirty(false);
            setVersion(answer.version);
            setMessage('已保存到文件。');
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : String(error));
        }
        finally {
            setSaving(false);
        }
    }, [absolutePath, version]);
    const submit = useCallback(async () => {
        const editor = editorRef.current;
        if (editor === undefined)
            return;
        const content = editor.text();
        const wire = editor.annotations().map(annotation => {
            const range = toBlockRange(blocks, annotation.from, annotation.to);
            return {
                id: annotation.id,
                kind: annotation.kind,
                comment: annotation.comment,
                startBlock: range?.startBlock ?? 0,
                startOffset: range?.startOffset ?? 0,
                endBlock: range?.endBlock ?? 0,
                endOffset: range?.endOffset ?? 0,
                quote: annotation.quote,
                seq: annotation.seq,
            };
        });
        setBusy(true);
        setMessage(undefined);
        try {
            const answer = await submitReview({
                doc: absolutePath ?? '',
                content,
                baseVersion: version,
                annotations: wire,
                createdAt: Date.now(),
            });
            if (!answer.ok) {
                setBusy(false);
                setMessage(answer.message);
                return;
            }
            const accepted = answer;
            setBusy(false);
            setRoundId(accepted.roundId);
            setMessage(`已提交 ${accepted.summary.comment} 条批注，等待返工。`);
        }
        catch (error) {
            setBusy(false);
            setMessage(error instanceof Error ? error.message : String(error));
        }
    }, [blocks, absolutePath, version]);
    return (_jsxs("div", { className: `${css.root} markdown-review-mode-root`, "data-review-root": true, children: [_jsxs("div", { className: `${css.toolbar} markdown-review-mode-toolbar`, children: [_jsxs("span", { className: css.count, children: [annotations.length, " \u6761\u6279\u6CE8"] }), _jsx("span", { className: css.path, children: absolutePath ?? '' }), _jsx("button", { type: "button", className: css.saveAction, disabled: !dirty || saving || busy || roundId !== undefined, title: dirty ? '把你的改动写入文件' : '没有未保存的改动', onClick: () => { void save(); }, children: saving ? '保存中…' : dirty ? '保存' : '已保存' }), _jsx("button", { type: "button", className: css.submit, disabled: busy || roundId !== undefined, onClick: () => { void submit(); }, children: "\u63D0\u4EA4\u6279\u6CE8" })] }), message !== undefined && (_jsx("div", { className: css.message, role: "status", children: message })), _jsxs("div", { className: css.editorWrap, ref: wrapRef, children: [_jsx("div", { className: `${css.editor} markdown-review-mode-editor`, ref: editorHost, "data-review-editor": true }), toolbar !== undefined && (_jsx(SelectionToolbar, { x: toolbar.x, y: toolbar.y, mode: toolbar.mode, kind: toolbar.kind, draft: draft, onDraftChange: setDraft, onPick: pickKind, onConfirm: confirmDraft, onCancel: () => { setDraft(''); setToolbar(undefined); } })), popup !== undefined && popupAnnotation !== undefined && (_jsx(AnnotationPopup, { x: popup.x, y: popup.y, annotation: popupAnnotation, editing: popup.editing, draft: draft, onDraftChange: setDraft, onEdit: () => { setDraft(popupAnnotation.comment); setPopup(current => (current === undefined ? current : { ...current, editing: true })); }, onSave: savePopup, onDelete: deletePopup, onClose: () => { setPopup(undefined); setDraft(''); } }))] })] }));
}
/**
 * Where a floating surface should sit, in the editor wrapper's coordinates.
 *
 * @param editor - the editor, if it is mounted.
 * @param position - the document position to anchor to.
 * @param side - whether the surface sits below or above the passage.
 * @param clientX - the click's horizontal coordinate, when there was a click.
 * @param clientY - the click's vertical coordinate, when there was a click.
 * @returns the coordinates, or undefined when the editor is not mounted.
 */
function floatingAt(editor, position, side, clientX, clientY) {
    if (editor === undefined)
        return undefined;
    const wrap = editor.view.dom.closest('[data-review-root]');
    if (wrap === null)
        return undefined;
    const wrapRect = wrap.getBoundingClientRect();
    if (clientX !== undefined && clientY !== undefined) {
        return { x: clientX - wrapRect.left, y: clientY - wrapRect.top + 12 };
    }
    const coords = editor.view.coordsAtPos(position);
    if (coords === null)
        return undefined;
    const x = coords.left - wrapRect.left;
    const y = side === 'bottom' ? coords.bottom - wrapRect.top + 8 : coords.top - wrapRect.top - 8;
    return { x, y };
}
//# sourceMappingURL=body.js.map