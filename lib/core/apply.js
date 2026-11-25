/**
 * Applying a set of edits to a document.
 *
 * The design listed four edit kinds but never said how several of them
 * compose. This module fixes the semantics so the Agent's answer has exactly
 * one meaning:
 *
 * - **Edits address the block list as it was when `review_read` returned it.**
 *   An edit never refers to a block another edit created. The Agent therefore
 *   cannot express "insert after the paragraph I just added" — which is
 *   deliberate: it keeps every edit independently meaningful.
 * - **Edits apply in the order they were submitted.** The order is part of
 *   the contract, and the Agent's output is replayed exactly.
 * - **A `move` relocates a block; it never changes one.** A moved block keeps
 *   its text, so a lock on it stays satisfied.
 * - **The result is computed in full before anything is written.** The caller
 *   receives either the new text or a refusal; a partially applied document is
 *   never produced.
 *
 * ## How whitespace is modelled
 *
 * A document is a sequence of block texts separated by whitespace:
 * `text₀ sep₀ text₁ sep₁ … textₙ₋₁ sepₙ₋₁`, where the separator is the
 * whitespace that *follows* a block.
 *
 * The separator belongs to the **position**, not to the block. Reordering
 * blocks reorders the texts and leaves the separators where they were, so
 * moving the first paragraph to the end does not drag the paragraph break
 * with it. Deleting a block removes both its text and the separator that
 * followed it, so the gap closes. Inserting a block gives it a copy of the
 * separator of the block it was inserted after, so the new text sits in the
 * same whitespace shape as its neighbour.
 *
 * @module markdown-review-mode/core/apply
 */
/**
 * Apply edits to a document.
 *
 * @param blocks - the document's blocks, in the order `review_read` returned.
 * @param edits - the edits to apply, in submission order.
 * @returns the new document text and the affected block positions, or a refusal.
 */
export function applyEdits(blocks, edits) {
    if (blocks.length === 0) {
        if (edits.length === 0) {
            return { ok: true, content: '', changedBlocks: [], addedBlocks: [], movedBlocks: [] };
        }
        return { ok: false, code: 'empty-document', message: 'The document has no blocks to edit.' };
    }
    // The two parallel arrays: a block's text, and the whitespace that follows
    // the position it occupies. The separator belongs to the position, so a
    // move permutes the texts and leaves the separators alone.
    const texts = blocks.map(block => block.text);
    const separators = blocks.map(block => block.separator);
    // The original index of each text, so a moved or edited block can be
    // reported against the list the Agent was given.
    const origins = blocks.map(block => block.index);
    const changedOrigins = new Set();
    const addedPositions = [];
    const movedOrigins = new Set();
    for (const edit of edits) {
        if (edit.op === 'move') {
            const destination = edit.to === undefined ? texts.length - 1 : edit.to;
            if (destination < 0 || destination >= texts.length) {
                return {
                    ok: false,
                    code: 'unknown-block',
                    message: `Cannot move block ${edit.block} to block ${edit.to}.`,
                };
            }
            if (edit.block === destination)
                continue;
            const [text] = texts.splice(edit.block, 1);
            const [origin] = origins.splice(edit.block, 1);
            texts.splice(destination, 0, text);
            origins.splice(destination, 0, origin);
            movedOrigins.add(origin);
            continue;
        }
        if (edit.block < 0 || edit.block >= texts.length) {
            return {
                ok: false,
                code: 'unknown-block',
                message: `Block ${edit.block} does not exist in this document.`,
            };
        }
        if (edit.op === 'replace') {
            texts[edit.block] = edit.content ?? '';
            changedOrigins.add(origins[edit.block]);
            continue;
        }
        if (edit.op === 'delete') {
            const [origin] = origins.splice(edit.block, 1);
            texts.splice(edit.block, 1);
            separators.splice(edit.block, 1);
            changedOrigins.add(origin);
            continue;
        }
        if (edit.op === 'insertAfter') {
            const separator = separators[edit.block];
            texts.splice(edit.block + 1, 0, edit.content ?? '');
            separators.splice(edit.block + 1, 0, separator);
            origins.splice(edit.block + 1, 0, -1);
            addedPositions.push(edit.block + 1);
        }
    }
    const content = texts.map((text, index) => `${text}${separators[index]}`).join('');
    // Report positions in the *new* document, which is where the client will
    // draw the highlights.
    const positionOfOrigin = new Map();
    origins.forEach((origin, position) => {
        if (origin >= 0 && !positionOfOrigin.has(origin))
            positionOfOrigin.set(origin, position);
    });
    const changedBlocks = [...changedOrigins]
        .map(origin => positionOfOrigin.get(origin))
        .filter((position) => position !== undefined)
        .sort((left, right) => left - right);
    const movedBlocks = [...movedOrigins]
        .map(origin => positionOfOrigin.get(origin))
        .filter((position) => position !== undefined)
        .sort((left, right) => left - right);
    return {
        ok: true,
        content,
        changedBlocks,
        addedBlocks: [...new Set(addedPositions)].sort((left, right) => left - right),
        movedBlocks,
    };
}
/**
 * Restore one block to a known earlier text.
 *
 * A block rollback rewrites that block's text and leaves every other block
 * alone, which is what a user expects from "undo this one change".
 *
 * @param blocks - the document's current blocks.
 * @param content - the document's current text.
 * @param blockIndex - the block to restore.
 * @param previousText - the text the block should have.
 * @returns the document's new text, or a refusal.
 */
export function rollbackBlock(blocks, content, blockIndex, previousText) {
    const block = blocks[blockIndex];
    if (block === undefined) {
        return {
            ok: false,
            code: 'unknown-block',
            message: `Block ${blockIndex} does not exist in this document.`,
        };
    }
    const next = content.slice(0, block.start) + previousText + content.slice(block.end);
    return {
        ok: true,
        content: next,
        changedBlocks: [blockIndex],
        addedBlocks: [],
        movedBlocks: [],
    };
}
//# sourceMappingURL=apply.js.map