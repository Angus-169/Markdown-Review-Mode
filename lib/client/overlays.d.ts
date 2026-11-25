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
import type { ReactNode } from 'react';
import type { Annotation, AnnotationKind } from '../core/anchors.ts';
/**
 * The label of an annotation kind.
 * @param kind - the annotation's kind.
 * @returns the label.
 */
export declare function kindLabel(kind: AnnotationKind): string;
/** The selection toolbar's props. */
export interface SelectionToolbarProps {
    /** The toolbar's left edge, in the editor's coordinates. */
    readonly x: number;
    /** The toolbar's top edge, in the editor's coordinates. */
    readonly y: number;
    /** Whether the toolbar is offering kinds or taking the comment. */
    readonly mode: 'pick' | 'write';
    /** The kind being written. */
    readonly kind: AnnotationKind;
    /** The comment being written. */
    readonly draft: string;
    /** Called when the comment changes. */
    readonly onDraftChange: (value: string) => void;
    /** Called when a kind is chosen. */
    readonly onPick: (kind: AnnotationKind) => void;
    /** Called when the comment is confirmed. */
    readonly onConfirm: () => void;
    /** Called when the reader backs out. */
    readonly onCancel: () => void;
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
export declare function SelectionToolbar(props: SelectionToolbarProps): ReactNode;
/** The annotation popup's props. */
export interface AnnotationPopupProps {
    /** The popup's left edge, in the editor's coordinates. */
    readonly x: number;
    /** The popup's top edge, in the editor's coordinates. */
    readonly y: number;
    /** The annotation the popup is about. */
    readonly annotation: Annotation;
    /** Whether the comment is being edited. */
    readonly editing: boolean;
    /** The comment being written. */
    readonly draft: string;
    /** Called when the comment changes. */
    readonly onDraftChange: (value: string) => void;
    /** Called when the reader starts editing. */
    readonly onEdit: () => void;
    /** Called when the edited comment is confirmed. */
    readonly onSave: () => void;
    /** Called when the annotation is removed. */
    readonly onDelete: () => void;
    /** Called when the popup is dismissed. */
    readonly onClose: () => void;
}
/**
 * The popup that shows an annotation over its passage.
 *
 * @param props - the popup's props.
 * @returns the rendered popup.
 */
export declare function AnnotationPopup(props: AnnotationPopupProps): ReactNode;
//# sourceMappingURL=overlays.d.ts.map