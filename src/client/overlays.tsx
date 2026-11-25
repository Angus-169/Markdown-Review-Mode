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

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Annotation, AnnotationKind } from '../core/anchors.ts'
import { keepEditorFocus } from './dom.ts'
import css from './review.module.css'

/**
 * The label of an annotation kind.
 * @param kind - the annotation's kind.
 * @returns the label.
 */
export function kindLabel(kind: AnnotationKind): string {
  return kind === 'lock' ? '锁定' : '批注'
}

/** The selection toolbar's props. */
export interface SelectionToolbarProps {
  /** The toolbar's left edge, in the editor's coordinates. */
  readonly x: number
  /** The toolbar's top edge, in the editor's coordinates. */
  readonly y: number
  /** Whether the toolbar is offering kinds or taking the comment. */
  readonly mode: 'pick' | 'write'
  /** The kind being written. */
  readonly kind: AnnotationKind
  /** The comment being written. */
  readonly draft: string
  /** Called when the comment changes. */
  readonly onDraftChange: (value: string) => void
  /** Called when a kind is chosen. */
  readonly onPick: (kind: AnnotationKind) => void
  /** Called when the comment is confirmed. */
  readonly onConfirm: () => void
  /** Called when the reader backs out. */
  readonly onCancel: () => void
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
export function SelectionToolbar(props: SelectionToolbarProps): ReactNode {
  const { x, y, mode, kind, draft, onDraftChange, onPick, onConfirm, onCancel } = props
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (mode !== 'write') return
    inputRef.current?.focus()
  }, [mode])

  return (
    <div
      className={`${css.floating} markdown-review-mode-floating`}
      style={{ left: `${String(x)}px`, top: `${String(y)}px` }}
      data-review-toolbar
      onMouseDown={keepEditorFocus}
    >
      {mode === 'pick' ? (
        <>
          <button
            type="button"
            className={css.tool}
            onClick={() => onPick('comment')}
          >
            批注
          </button>
          <button
            type="button"
            className={css.tool}
            onClick={() => onPick('lock')}
          >
            锁定
          </button>
        </>
      ) : (
        <>
          <textarea
            ref={inputRef}
            className={css.popupInput}
            value={draft}
            placeholder={kind === 'lock' ? '可选：说明为什么要锁定' : '写下你的意见（Enter 换行，不会发送）'}
            onChange={event => onDraftChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                event.preventDefault()
                onConfirm()
              }
              if (event.key === 'Escape') onCancel()
            }}
          />
          <div className={css.popupActions}>
            <button type="button" className={css.save} onClick={onConfirm}>确定</button>
            <button type="button" className={css.cancel} onClick={onCancel}>取消</button>
          </div>
        </>
      )}
    </div>
  )
}

/** The annotation popup's props. */
export interface AnnotationPopupProps {
  /** The popup's left edge, in the editor's coordinates. */
  readonly x: number
  /** The popup's top edge, in the editor's coordinates. */
  readonly y: number
  /** The annotation the popup is about. */
  readonly annotation: Annotation
  /** Whether the comment is being edited. */
  readonly editing: boolean
  /** The comment being written. */
  readonly draft: string
  /** Called when the comment changes. */
  readonly onDraftChange: (value: string) => void
  /** Called when the reader starts editing. */
  readonly onEdit: () => void
  /** Called when the edited comment is confirmed. */
  readonly onSave: () => void
  /** Called when the annotation is removed. */
  readonly onDelete: () => void
  /** Called when the popup is dismissed. */
  readonly onClose: () => void
}

/**
 * The popup that shows an annotation over its passage.
 *
 * @param props - the popup's props.
 * @returns the rendered popup.
 */
export function AnnotationPopup(props: AnnotationPopupProps): ReactNode {
  const { x, y, annotation, editing, draft, onDraftChange, onEdit, onSave, onDelete, onClose } = props
  const popupRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  return (
    <div
      ref={popupRef}
      className={`${css.popup} markdown-review-mode-popup`}
      style={{ left: `${String(x)}px`, top: `${String(y)}px` }}
      data-review-popup
      onMouseDown={keepEditorFocus}
    >
      <div className={css.popupHead}>
        <span className={css.popupKind}>{kindLabel(annotation.kind)}</span>
        {!editing && (
          <>
            <button type="button" className={css.popupAction} onClick={onEdit}>编辑</button>
            <button type="button" className={css.popupAction} onClick={onDelete}>删除</button>
          </>
        )}
      </div>
      <blockquote className={css.popupQuote}>{annotation.quote}</blockquote>
      {editing ? (
        <>
          <textarea
            className={css.popupInput}
            value={draft}
            placeholder="写下你的意见"
            onChange={event => onDraftChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                event.preventDefault()
                onSave()
              }
            }}
          />
          <div className={css.popupActions}>
            <button type="button" className={css.save} onClick={onSave}>保存</button>
            <button type="button" className={css.cancel} onClick={onDelete}>取消</button>
          </div>
        </>
      ) : (
        annotation.comment.length > 0 && <p className={css.popupComment}>{annotation.comment}</p>
      )}
    </div>
  )
}
