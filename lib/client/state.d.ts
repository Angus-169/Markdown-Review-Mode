/**
 * The editor's annotation state.
 *
 * The annotation list lives in a CodeMirror `StateField`, so it moves with the
 * document instead of being re-derived from scratch on every transaction. Two
 * things make that work:
 *
 * - Positions are **absolute document positions**, so `mapPos` — the one
 *   operation CodeMirror gives for free — moves them correctly when text
 *   before them changes.
 * - The quote is **re-extracted from the mapped range** after each
 *   transaction, so an annotation the user edited inside follows the edit
 *   instead of going stale. Only text that vanished entirely is stale.
 *
 * A block-relative anchor cannot be remapped this way: the block's own start
 * moves when earlier text changes, and the editor has no way to know that.
 * The block index is therefore derived metadata, refreshed on demand.
 *
 * @module markdown-review-mode/client/state
 */
import { StateField } from '@codemirror/state';
import type { Annotation } from '../core/anchors.ts';
/** Replace the whole annotation list. */
export declare const setAnnotations: import("@codemirror/state").StateEffectType<readonly Annotation[]>;
/** Add one annotation. */
export declare const addAnnotation: import("@codemirror/state").StateEffectType<Annotation>;
/** Remove one annotation by id. */
export declare const removeAnnotation: import("@codemirror/state").StateEffectType<string>;
/** Update one annotation's status. */
export declare const setAnnotationStatus: import("@codemirror/state").StateEffectType<{
    id: string;
    status: Annotation["status"];
}>;
/**
 * The annotation state field.
 *
 * The field maps its value through every transaction's changes, then
 * re-extracts each quote from the new document text.
 */
export declare const annotationField: StateField<readonly Annotation[]>;
/**
 * The annotations currently held by a state.
 * @param state - the editor state.
 * @returns the annotations.
 */
export declare function annotationsOf(state: {
    field: (field: unknown) => Annotation[];
}): Annotation[];
//# sourceMappingURL=state.d.ts.map