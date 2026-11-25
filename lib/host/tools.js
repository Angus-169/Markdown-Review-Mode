/**
 * The Agent-facing tools: `review_read` and `review_submit_rework`.
 *
 * The tools are registered with a `when` condition so they are only visible
 * to a model that is actually working on a review. A tool that is registered
 * unconditionally appears in *every* session's system prompt, which both
 * wastes tokens and invites the model to call a review tool when no review is
 * pending.
 *
 * The contract is deliberately block-oriented: the model sees block indices,
 * previews, and quotes, never character offsets. Models handle "rewrite
 * block 7" reliably and "replace characters 412–455" not at all.
 *
 * @module markdown-review-mode/host/tools
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { parseBlocks } from "../core/blocks.js";
import { annotationsNeedingReceipt, validateEdits } from "../core/validate.js";
import { applyEdits } from "../core/apply.js";
/**
 * The block summaries the Agent sees.
 *
 * Each summary says where a block is, not what it says: the document's text is
 * already in the same answer, so repeating a preview of it per block costs
 * tokens and adds nothing the Agent cannot read.
 *
 * @param content - the document's text.
 * @returns one summary per block.
 */
export function blockSummaries(content) {
    return parseBlocks(content).map(block => ({
        index: block.index,
        kind: block.kind,
        hash: block.hash,
        startLine: block.line,
        endLine: block.line + (block.text.match(/\n/g)?.length ?? 0),
    }));
}
/**
 * The text of the blocks the Agent asked about.
 *
 * The text comes from the reviewed document rather than from the file on disk:
 * the two differ while the reader's edits are still unsaved.
 *
 * @param content - the reviewed document's text.
 * @param indices - the block indices to return.
 * @returns one entry per index that exists, in the requested order.
 */
export function blockTexts(content, indices) {
    const blocks = parseBlocks(content);
    const texts = [];
    const seen = new Set();
    for (const index of indices) {
        if (seen.has(index))
            continue;
        seen.add(index);
        const block = blocks[index];
        if (block === undefined)
            continue;
        texts.push({ index, text: block.text });
    }
    return texts;
}
/**
 * The `review_read` tool's result for one round.
 *
 * @param round - the round to project.
 * @param options - the blocks to cut out, and whether to carry the document.
 * @returns what the Agent reads.
 */
export function readResult(round, options = {}) {
    const result = {
        doc: round.doc,
        roundId: round.id,
        blocks: blockSummaries(round.reviewedContent),
        annotations: round.annotations,
        locks: round.annotations.filter(annotation => annotation.kind === 'lock'),
        ...options.includeContent === false ? {} : { content: round.reviewedContent },
    };
    const indices = options.blockTexts ?? [];
    if (indices.length === 0)
        return result;
    return { ...result, blockTexts: blockTexts(round.reviewedContent, indices) };
}
/**
 * Register the review tools on a Host context.
 * @param ctx - the Host context.
 * @param host - the services the tools need.
 * @returns a disposer removing both registrations.
 */
export function registerReviewTools(ctx, host) {
    const readTool = defineTool({
        name: 'review_read',
        description: [
            'Read the document under review together with its annotations.',
            'Call this first when a review is requested: the annotations and the block list are here, and the message that started the review only summarises them.',
            'The whole document is returned as `content`, exactly as the reviewer sees it.',
            'Each block in `blocks` carries its `index`, `kind`, `hash`, and the `startLine`/`endLine` it occupies in `content` — that pair is how a block number maps to a passage.',
            'Annotations give a block range (`startBlock`/`startOffset` to `endBlock`/`endOffset`), the exact `quote` they cover, and the instruction in `comment`.',
            'Pass `blockTexts` with block indices when you want those blocks cut out for you verbatim; a plain read omits it because `content` already holds every block.',
            'A round\'s text never changes: pass `includeContent: false` on a later read to get the annotations alone instead of the whole document again.',
            'Locks appear in `locks`: their text must not change.',
        ].join(' '),
        parameters: {
            roundId: { type: 'string', required: true, description: 'The review round identifier from the review message.' },
            blockTexts: {
                type: 'array',
                description: 'Optional block indices whose exact text to return alongside the document; use it instead of re-reading the file.',
            },
            includeContent: {
                type: 'boolean',
                description: 'Set false to leave the document text out of the answer; the annotations and block list still come back.',
            },
        },
        output: {
            schema: { type: 'object', additionalProperties: true },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        async execute(args) {
            const request = args;
            const round = host.store.get(request.roundId);
            if (round === undefined) {
                throw new Error(`No review round "${request.roundId}" is open.`);
            }
            const indices = (request.blockTexts ?? []).filter(index => Number.isInteger(index));
            return readResult(round, {
                blockTexts: indices,
                includeContent: request.includeContent,
            });
        },
    });
    const submitTool = defineTool({
        name: 'review_submit_rework',
        description: [
            'Apply the requested changes to the reviewed document and report one receipt per annotation.',
            'Change only blocks an annotation covers: a comment permits rewriting, deleting, or moving its block, and a locked block must not change at all.',
            'One receipt per annotation that is not a lock, with a note saying what changed or why nothing did.',
            'An edit naming a block that does not exist, or touching a block no annotation covers, is refused and reported; the rest of the batch still applies.',
        ].join(' '),
        parameters: {
            roundId: { type: 'string', required: true, description: 'The review round identifier from the review message.' },
            edits: {
                type: 'array',
                required: true,
                description: 'The changes to apply, in order. Each carries an `op` of replace, delete, insertAfter, or move, the `block` it applies to, and `content` for replace and insertAfter.',
            },
            receipts: {
                type: 'array',
                required: true,
                description: 'One receipt per annotation, carrying the `annotationId`, a `status` of applied, declined, or conflict, and a `note` explaining what happened.',
            },
        },
        output: {
            schema: { type: 'object', additionalProperties: true },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        async execute(args) {
            const { roundId, edits, receipts } = args;
            return applyAnswer(host, roundId, edits, receipts);
        },
    });
    // Only a session with an open review sees these tools.
    const when = async ({ agent }) => {
        const sessionId = agent.session?.id;
        if (sessionId === undefined)
            return false;
        return host.store.hasOpenRoundForSession(sessionId);
    };
    const disposeRead = ctx.tools.register(readTool, { when });
    const disposeSubmit = ctx.tools.register(submitTool, { when });
    return () => {
        disposeRead();
        disposeSubmit();
    };
}
/**
 * Apply the Agent's answer to a round.
 * @param host - the Host services.
 * @param roundId - the round's identity.
 * @param edits - the proposed edits.
 * @param receipts - the Agent's receipts.
 * @returns the apply outcome.
 */
export async function applyAnswer(host, roundId, edits, receipts) {
    const round = host.store.get(roundId);
    if (round === undefined) {
        return {
            ok: false,
            applied: 0,
            rejected: [{ editIndex: 0, code: 'unknown-round', message: `No review round "${roundId}" is open.` }],
            unhandled: [],
            conflicts: [],
            newVersion: '',
            changedBlocks: [],
            addedBlocks: [],
            movedBlocks: [],
        };
    }
    const blocks = parseBlocks(round.reviewedContent);
    const texts = new Map(blocks.map(block => [block.index, block.text]));
    const outcome = validateEdits(edits, round.annotations, texts);
    const applied = applyEdits(blocks, outcome.accepted);
    if (!applied.ok) {
        return {
            ok: false,
            applied: 0,
            rejected: [...outcome.rejected, { editIndex: 0, code: applied.code, message: applied.message }],
            unhandled: [],
            conflicts: outcome.conflicts,
            newVersion: round.currentVersion,
            changedBlocks: [],
            addedBlocks: [],
            movedBlocks: [],
        };
    }
    const written = await host.writeDocument(round.doc, applied.content, round.currentVersion);
    if (!written.ok) {
        // The write failed for a reason the round itself can name. Reporting every
        // failure as "stale" would tell the Agent to retry the same write and the
        // reader to reload a document that never moved.
        return {
            ok: false,
            applied: 0,
            rejected: [...outcome.rejected, { editIndex: 0, code: written.code, message: written.message }],
            unhandled: [],
            conflicts: outcome.conflicts,
            newVersion: round.currentVersion,
            changedBlocks: [],
            addedBlocks: [],
            movedBlocks: [],
        };
    }
    const newVersion = written.version;
    const needed = annotationsNeedingReceipt(round.annotations);
    const answered = new Set(receipts.map(receipt => receipt.annotationId));
    const unhandled = needed.filter(id => !answered.has(id));
    const known = new Set(round.annotations.map(annotation => annotation.id));
    const validReceipts = receipts.filter(receipt => known.has(receipt.annotationId));
    host.store.settle(roundId, validReceipts, applied.content, newVersion, {
        ok: true,
        applied: outcome.accepted.length,
        rejected: outcome.rejected,
        unhandled,
        conflicts: outcome.conflicts,
        newVersion,
        changedBlocks: applied.changedBlocks,
        addedBlocks: applied.addedBlocks,
        movedBlocks: applied.movedBlocks,
    });
    return {
        ok: true,
        applied: outcome.accepted.length,
        rejected: outcome.rejected,
        unhandled,
        conflicts: outcome.conflicts,
        newVersion,
        changedBlocks: applied.changedBlocks,
        addedBlocks: applied.addedBlocks,
        movedBlocks: applied.movedBlocks,
    };
}
//# sourceMappingURL=tools.js.map