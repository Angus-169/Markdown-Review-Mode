/**
 * The Host half of the client↔Host channel.
 *
 * The channel is one HTTP route on the composition's web server, exactly the
 * shape `@deepseek-ai/dsh-host-open-in-app` uses: a plugin that needs the
 * browser to reach it registers a route on `ctx.webServer` and asks the
 * composition's `connection` service whether the caller may.
 *
 * This is deliberately *not* `ctx.remote`: that namespace is assembled at
 * build time from a fixed list, so a plugin outside the product cannot add
 * to it, and whether a third-party client package can reach `ctx.remote` at
 * all is unverified. A route on `ctx.webServer` needs no build-time
 * cooperation.
 *
 * The trust story has one home, here: every request is checked by the
 * connection's Host/Origin fence and browser authentication *before* any
 * document is read, so a cross-site caller learns nothing about the
 * workspace.
 *
 * One operation does all the writing:
 *
 * 1. the client's submission is checked;
 * 2. the reviewed document is written, guarded by its version;
 * 3. the sidecar the Agent reads is written beside it;
 * 4. the Agent is woken with a message naming the round.
 *
 * The client never writes the document and the Host never asks the client
 * to: one writer, one atomic operation, no interleaving.
 *
 * @module markdown-review-mode/host/rpc
 */
import type { Context } from '@deepseek-ai/cordis';
import { REVIEW_ROUTE_PATH, REVIEW_ROUTE } from '../core/contract.ts';
import type { PendingEdits, ReviewStylesheet } from '../core/contract.ts';
import type { ReviewStore, ReviewSidecar } from './store.ts';
import type { WriteResult } from './write.ts';
/**
 * The services the route needs from the Host.
 */
export interface RpcHost {
    /** The review store holding the rounds. */
    readonly store: ReviewStore;
    /**
     * Read a document's text and version.
     * @param doc - the document's path.
     * @returns the text and version, or the reason the read failed.
     */
    readDocument(doc: string): Promise<{
        readonly ok: true;
        readonly content: string;
        readonly version: string;
    } | {
        readonly ok: false;
        readonly reason: string;
    }>;
    /**
     * Write a document's text, guarded by its current version.
     * @param doc - the document's path.
     * @param content - the new text.
     * @param version - the version the write is guarded against.
     * @returns the new version, or the reason the write failed.
     */
    writeDocument(doc: string, content: string, version: string): Promise<WriteResult>;
    /**
     * Read the reader's unsaved edits to a document.
     * @param doc - the document's path.
     * @returns the unsaved edits, or undefined when there are none.
     */
    readPending(doc: string): Promise<PendingEdits | undefined>;
    /**
     * Save the reader's unsaved edits to a document.
     * @param pending - the edits.
     * @returns whether the edits were saved.
     */
    writePending(pending: PendingEdits): Promise<boolean>;
    /**
     * Drop the reader's unsaved edits to a document.
     * @param doc - the document's path.
     * @returns whether there was anything to drop.
     */
    clearPending(doc: string): Promise<boolean>;
    /**
     * Write the sidecar of a review round.
     * @param doc - the document's path.
     * @param sidecar - the round's record.
     * @returns whether the sidecar was written.
     */
    writeSidecar(doc: string, sidecar: ReviewSidecar): Promise<boolean>;
    /**
     * Read the user's stylesheet for the review panel.
     * @returns the stylesheet's text and where it came from.
     */
    readStylesheet(): Promise<ReviewStylesheet>;
    /**
     * Wake the Agent with a review message.
     * @param doc - the reviewed document's path.
     * @param roundId - the round's identity.
     * @param summary - a human-readable summary of the round.
     */
    notifyAgent(doc: string, roundId: string, summary: string): Promise<void>;
    /**
     * The Session a document belongs to, for waking the right Agent.
     * @param doc - the document's path.
     * @returns the session id, or undefined.
     */
    sessionOf(doc: string): string | undefined;
}
/**
 * Handle one operation.
 * @param host - the Host services.
 * @param operation - the requested operation.
 * @param payload - the operation's payload.
 * @returns the operation's result.
 */
export declare function handleOperation(host: RpcHost, operation: string, payload: unknown): Promise<unknown>;
/**
 * Mount the review route on the composition's web server.
 * @param ctx - the plugin context.
 * @param host - the Host services.
 * @returns a disposer removing the route.
 */
export declare function mountReviewRoute(ctx: Context, host: RpcHost): () => void;
export { REVIEW_ROUTE, REVIEW_ROUTE_PATH };
//# sourceMappingURL=rpc.d.ts.map