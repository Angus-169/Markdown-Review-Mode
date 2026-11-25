/**
 * Host-side review store: the rounds of review the plugin is holding.
 *
 * A round is created when the client submits a review, lives until the Agent
 * has answered and the user has seen the result, and carries everything
 * needed to answer a later request:
 *
 * - the document as the user reviewed it, so a rollback has a target;
 * - the annotations, in the block coordinates the Agent was given;
 * - the Agent's receipts;
 * - the document after the Agent's changes, so the client can show the diff.
 *
 * The store is in memory and per-process. A round does not survive a restart:
 * the sidecar the Agent reads is written to disk by the same code that holds
 * the round, so a restart loses the round but not the sidecar, and the next
 * `review_read` reports that the round is gone rather than serving a stale
 * answer.
 *
 * @module markdown-review-mode/host/store
 */
import { REVIEW_SCHEMA } from "../core/contract.js";
/** The maximum number of rounds kept in memory when no limit is given. */
const DEFAULT_MAX_ROUNDS = 20;
/**
 * The in-memory store of review rounds.
 */
export class ReviewStore {
    rounds = new Map();
    counter = 0;
    maxRounds;
    /**
     * Create the store.
     * @param maxRounds - how many rounds to keep; the oldest are dropped first.
     */
    constructor(maxRounds = DEFAULT_MAX_ROUNDS) {
        this.maxRounds = Math.max(1, maxRounds);
    }
    /**
     * Record a new round.
     * @param submission - the client's submission.
     * @param sessionId - the session the round belongs to.
     * @returns the created round.
     */
    create(submission, sessionId) {
        this.counter += 1;
        const id = `review-${Date.now().toString(36)}-${this.counter}`;
        const round = {
            id,
            sessionId,
            doc: submission.doc,
            reviewedContent: submission.content,
            currentContent: submission.content,
            baseVersion: submission.baseVersion,
            currentVersion: submission.baseVersion,
            annotations: submission.annotations,
            receipts: [],
            settled: false,
            changedBlocks: [],
            addedBlocks: [],
            movedBlocks: [],
            createdAt: submission.createdAt,
        };
        this.rounds.set(id, round);
        this.prune();
        return round;
    }
    /**
     * The round with the given identity.
     * @param id - the round's identity.
     * @returns the round, or undefined when it is gone.
     */
    get(id) {
        return this.rounds.get(id);
    }
    /**
     * The most recent round for a document.
     * @param doc - the document's path.
     * @returns the round, or undefined.
     */
    latestFor(doc) {
        let found;
        for (const round of this.rounds.values()) {
            if (round.doc !== doc)
                continue;
            if (found === undefined || round.createdAt >= found.createdAt)
                found = round;
        }
        return found;
    }
    /**
     * Whether a session has a round the Agent has not answered yet.
     *
     * The review tools are registered with this as their visibility condition:
     * a session with no open review must not show the model two tools it has
     * nothing to do with.
     *
     * @param sessionId - the session's identity.
     * @returns true when an unanswered round exists.
     */
    hasOpenRoundForSession(sessionId) {
        for (const round of this.rounds.values()) {
            if (round.sessionId !== sessionId)
                continue;
            if (!round.settled)
                return true;
        }
        return false;
    }
    /**
     * Record the Agent's answer and the document it produced.
     * @param id - the round's identity.
     * @param receipts - the Agent's answers.
     * @param content - the document after the Agent's changes.
     * @param version - the document's new version.
     * @param applied - the apply outcome.
     * @returns the updated round, or undefined when it is gone.
     */
    settle(id, receipts, content, version, applied) {
        const round = this.rounds.get(id);
        if (round === undefined)
            return undefined;
        const updated = {
            ...round,
            receipts,
            currentContent: content,
            currentVersion: version,
            settled: true,
            changedBlocks: applied.changedBlocks,
            addedBlocks: applied.addedBlocks,
            movedBlocks: applied.movedBlocks,
        };
        this.rounds.set(id, updated);
        return updated;
    }
    /**
     * Restore one block to the reviewed version.
     * @param id - the round's identity.
     * @param content - the document's restored text.
     * @param version - the document's new version.
     * @returns the updated round, or undefined.
     */
    rollback(id, content, version) {
        const round = this.rounds.get(id);
        if (round === undefined)
            return undefined;
        const updated = { ...round, currentContent: content, currentVersion: version };
        this.rounds.set(id, updated);
        return updated;
    }
    /**
     * The round as the client reads it.
     * @param round - the round to project.
     * @returns the client-facing result.
     */
    static toResult(round) {
        const statuses = {};
        for (const annotation of round.annotations) {
            const receipt = round.receipts.find(item => item.annotationId === annotation.id);
            if (receipt === undefined) {
                statuses[annotation.id] = round.settled ? 'unhandled' : 'open';
                continue;
            }
            statuses[annotation.id] = receipt.status;
        }
        return {
            roundId: round.id,
            settled: round.settled,
            content: round.currentContent,
            version: round.currentVersion,
            receipts: round.receipts,
            unhandled: round.annotations
                .filter(annotation => annotation.kind !== 'lock' && !round.receipts.some(receipt => receipt.annotationId === annotation.id))
                .map(annotation => annotation.id),
            changedBlocks: round.changedBlocks,
            addedBlocks: round.addedBlocks,
            movedBlocks: round.movedBlocks,
            statuses,
        };
    }
    /**
     * The sidecar the Agent reads.
     * @param round - the round to project.
     * @returns the sidecar.
     */
    static toSidecar(round) {
        return {
            schema: REVIEW_SCHEMA,
            roundId: round.id,
            doc: round.doc,
            base: round.baseVersion,
            createdAt: round.createdAt,
            annotations: round.annotations,
            content: round.reviewedContent,
        };
    }
    /**
     * Drop the oldest rounds beyond the retention limit.
     */
    prune() {
        while (this.rounds.size > this.maxRounds) {
            const oldest = [...this.rounds.values()].sort((left, right) => left.createdAt - right.createdAt)[0];
            if (oldest === undefined)
                return;
            this.rounds.delete(oldest.id);
        }
    }
}
/**
 * The edits a receipt set covers, for the client's per-annotation view.
 * @param receipts - the Agent's answers.
 * @returns the receipt for each annotation id.
 */
export function receiptsById(receipts) {
    const map = new Map();
    for (const receipt of receipts)
        map.set(receipt.annotationId, receipt);
    return map;
}
/**
 * The edits the Agent submitted, kept for the apply step.
 * @param edits - the submitted edits.
 * @returns the edits, unchanged; present so the type flows through the store.
 */
export function editsOf(edits) {
    return edits;
}
//# sourceMappingURL=store.js.map