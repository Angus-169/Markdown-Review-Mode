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
import { REVIEW_ROUTE_PATH, REVIEW_ROUTE, REVIEW_RPC_ENDPOINTS, } from "../core/contract.js";
import { parseBlocks } from "../core/blocks.js";
import { rollbackBlock } from "../core/apply.js";
import { ReviewStore as Store } from "./store.js";
/** The operations the route accepts. */
const OPERATIONS = new Set(Object.values(REVIEW_RPC_ENDPOINTS));
/**
 * The largest request body the route reads.
 *
 * A submission carries the whole reviewed document plus every annotation, so
 * the ceiling has to be well above a large document; it is still a ceiling,
 * because an unbounded body is a denial-of-service.
 */
const MAX_BODY_BYTES = 16 * 1024 * 1024;
/**
 * The composition's connection service, typed locally.
 * @param ctx - the plugin context.
 * @returns the trust fence.
 */
function connectionOf(ctx) {
    return Reflect.get(ctx, 'connection');
}
/**
 * A JSON answer.
 * @param res - the response to write.
 * @param status - the status code.
 * @param payload - the body.
 */
function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(payload));
}
/**
 * Collect a bounded request body as UTF-8 text.
 * @param req - the incoming request.
 * @returns the body, or undefined past the ceiling.
 */
async function readBoundedBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_BODY_BYTES) {
            req.destroy();
            return undefined;
        }
        chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
}
/**
 * Handle one operation.
 * @param host - the Host services.
 * @param operation - the requested operation.
 * @param payload - the operation's payload.
 * @returns the operation's result.
 */
export async function handleOperation(host, operation, payload) {
    switch (operation) {
        case REVIEW_RPC_ENDPOINTS.document: {
            const request = payload;
            if (typeof request.doc !== 'string' || request.doc.length === 0) {
                return { ok: false, code: 'bad-request', message: 'A document path is required.' };
            }
            const read = await host.readDocument(request.doc);
            if (!read.ok) {
                return { ok: false, code: 'not-found', message: `The document could not be read: ${read.reason}` };
            }
            return { ok: true, value: { content: read.content, version: read.version } };
        }
        case REVIEW_RPC_ENDPOINTS.stylesheet: {
            return { ok: true, value: await host.readStylesheet() };
        }
        case REVIEW_RPC_ENDPOINTS.save: {
            const request = payload;
            if (typeof request.doc !== 'string' || typeof request.content !== 'string' || typeof request.baseVersion !== 'string') {
                return { ok: false, code: 'bad-request', message: 'A document path, its text, and the version it was read at are required.' };
            }
            const written = await host.writeDocument(request.doc, request.content, request.baseVersion);
            if (!written.ok) {
                const refused = {
                    ok: false,
                    version: request.baseVersion,
                    message: written.message,
                };
                return { ok: true, value: refused };
            }
            // The edits are the file now: keeping them as "unsaved" would make the
            // next open claim it restored something it did not.
            await host.clearPending(request.doc);
            const saved = { ok: true, version: written.version };
            return { ok: true, value: saved };
        }
        case REVIEW_RPC_ENDPOINTS.pending: {
            const request = payload;
            if (typeof request.doc !== 'string' || request.doc.length === 0) {
                return { ok: false, code: 'bad-request', message: 'A document path is required.' };
            }
            const pending = await host.readPending(request.doc);
            return { ok: true, value: { pending } };
        }
        case REVIEW_RPC_ENDPOINTS.pendingSave: {
            const request = payload;
            if (typeof request.doc !== 'string' || typeof request.content !== 'string' || typeof request.base !== 'string') {
                return { ok: false, code: 'bad-request', message: 'A document path, a base version, and the edited text are required.' };
            }
            const saved = await host.writePending({
                doc: request.doc,
                base: request.base,
                content: request.content,
                savedAt: typeof request.savedAt === 'number' ? request.savedAt : Date.now(),
            });
            return { ok: true, value: { saved } };
        }
        case REVIEW_RPC_ENDPOINTS.submit: {
            const submission = payload;
            if (typeof submission?.doc !== 'string' || typeof submission.content !== 'string') {
                return { ok: false, code: 'bad-request', message: 'A document path and content are required.' };
            }
            const current = await host.readDocument(submission.doc);
            if (!current.ok) {
                return { ok: false, code: 'not-found', message: `The document could not be read: ${current.reason}` };
            }
            if (current.version !== submission.baseVersion) {
                return {
                    ok: false,
                    code: 'stale-version',
                    message: 'The document changed since it was opened for review. Reload it and review again.',
                };
            }
            const round = host.store.create(submission, host.sessionOf(submission.doc) ?? '');
            const sidecar = Store.toSidecar(round);
            await host.writeSidecar(submission.doc, sidecar);
            const summary = `${round.annotations.length} 条批注`;
            await host.notifyAgent(submission.doc, round.id, summary);
            // The reader's edits are now part of the round; they must not come back
            // as "unsaved" after the panel reloads.
            await host.clearPending(submission.doc);
            const counts = { comment: 0, lock: 0 };
            for (const annotation of round.annotations)
                counts[annotation.kind] += 1;
            const accepted = {
                ok: true,
                roundId: round.id,
                summary: counts,
            };
            return { ok: true, value: accepted };
        }
        case REVIEW_RPC_ENDPOINTS.result: {
            const request = payload;
            if (typeof request.roundId !== 'string') {
                return { ok: false, code: 'bad-request', message: 'A round identifier is required.' };
            }
            const round = host.store.get(request.roundId);
            if (round === undefined) {
                return { ok: false, code: 'not-found', message: 'That review round is no longer available.' };
            }
            const result = Store.toResult(round);
            return { ok: true, value: result };
        }
        case REVIEW_RPC_ENDPOINTS.rollback: {
            const request = payload;
            if (typeof request.roundId !== 'string' || typeof request.block !== 'number') {
                return { ok: false, code: 'bad-request', message: 'A round identifier and a block index are required.' };
            }
            const round = host.store.get(request.roundId);
            if (round === undefined) {
                return { ok: false, code: 'not-found', message: 'That review round is no longer available.' };
            }
            const blocks = parseBlocks(round.reviewedContent);
            const restored = rollbackBlock(blocks, round.currentContent, request.block, blocks[request.block]?.text ?? '');
            if (!restored.ok) {
                const refusal = {
                    ok: false,
                    content: round.currentContent,
                    version: round.currentVersion,
                    message: restored.message,
                };
                return { ok: false, code: restored.code, message: restored.message };
            }
            const written = await host.writeDocument(round.doc, restored.content, round.currentVersion);
            if (!written.ok) {
                return {
                    ok: false,
                    code: written.code,
                    message: written.message,
                };
            }
            host.store.rollback(round.id, restored.content, written.version);
            const answer = { ok: true, content: restored.content, version: written.version };
            return { ok: true, value: answer };
        }
        default:
            return { ok: false, code: 'unknown-operation', message: `Unknown review operation "${operation}".` };
    }
}
/**
 * Mount the review route on the composition's web server.
 * @param ctx - the plugin context.
 * @param host - the Host services.
 * @returns a disposer removing the route.
 */
export function mountReviewRoute(ctx, host) {
    const connection = connectionOf(ctx);
    return ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: REVIEW_ROUTE_PATH,
        handler: async (req, res) => {
            // The trust fence first: an untrusted or unauthenticated caller learns
            // nothing, not even whether the document exists.
            const rejection = connection.requestRejection(req);
            if (rejection !== undefined) {
                res.statusCode = rejection;
                res.end();
                return;
            }
            if (req.method !== 'POST') {
                res.statusCode = 405;
                res.setHeader('allow', 'POST');
                res.end();
                return;
            }
            const essence = String(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase();
            if (essence !== 'application/json') {
                sendJson(res, 415, { ok: false, code: 'unsupported-media-type', message: 'content-type must be application/json' });
                return;
            }
            let text;
            try {
                text = await readBoundedBody(req);
            }
            catch {
                sendJson(res, 400, { ok: false, code: 'bad-request', message: 'request body unreadable' });
                return;
            }
            if (text === undefined) {
                sendJson(res, 413, { ok: false, code: 'payload-too-large', message: 'request body is too large' });
                return;
            }
            let parsed;
            try {
                parsed = JSON.parse(text);
            }
            catch {
                sendJson(res, 400, { ok: false, code: 'bad-request', message: 'request body must be JSON' });
                return;
            }
            const operation = parsed.op ?? '';
            if (!OPERATIONS.has(operation)) {
                sendJson(res, 400, { ok: false, code: 'unknown-operation', message: `Unknown review operation "${operation}".` });
                return;
            }
            const answer = await handleOperation(host, operation, parsed.payload);
            sendJson(res, 200, answer);
        },
    }), `markdown-review-mode: POST ${REVIEW_ROUTE_PATH}`);
}
export { REVIEW_ROUTE, REVIEW_ROUTE_PATH };
//# sourceMappingURL=rpc.js.map