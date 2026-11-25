/**
 * The Host half of the review plugin.
 *
 * The Host owns every write to the workspace. It mounts a versioned RPC
 * channel the client half calls, and registers the two Agent-facing tools
 * with a conditional visibility guard so they only appear in a session that
 * has a review open.
 *
 * @module markdown-review-mode/host/index
 */
import { MessageId } from '@deepseek-ai/dsh-llm';
import { parseBlocks } from "../core/blocks.js";
import { ReviewStore } from "./store.js";
import { docKey, openReviewStorage } from "./storage.js";
import { readStylesheet } from "./stylesheet.js";
import { describeWriteFailure } from "./write.js";
import { reviewMessage } from "./message.js";
import { mountReviewRoute } from "./rpc.js";
import { registerReviewTools } from "./tools.js";
/** The configuration used when none is supplied. */
export const DEFAULT_CONFIG = {
    maxRounds: 20,
    stylesheet: '',
};
/**
 * Resolve a workspace-relative document path into a filesystem target.
 * @param services - the Host services.
 * @param doc - the document's path.
 * @returns the resolved target.
 */
async function resolveTarget(services, doc) {
    return services.fs.resolve(doc);
}
/**
 * Read a document's text and version.
 *
 * The reason a read failed travels back to the client: a silent "could not be
 * read" hides whether the path was wrong, the file missing, or the sandbox
 * refusing — three very different bugs.
 *
 * @param services - the Host services.
 * @param doc - the document's path.
 * @returns the text and version, or the reason the read failed.
 */
async function readDocument(services, doc) {
    try {
        const target = await resolveTarget(services, doc);
        const info = await services.fs.stat(target);
        if (info === undefined)
            return { ok: false, reason: 'no such file' };
        if (info.type !== 'file')
            return { ok: false, reason: 'not a regular file' };
        const content = await services.fs.readText(target);
        return { ok: true, content, version: info.version };
    }
    catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Write a document's text, guarded by its current version.
 *
 * The write carries the **session's sandbox policy**. The filesystem backend
 * confines per call, and nothing about a bare `ctx.fs.writeText` says which
 * session is asking: omitting the policy leaves the backend its deployment
 * default, whose workspace root is the process directory rather than the
 * session's, and every review write outside that directory is then denied.
 *
 * @param services - the Host services.
 * @param doc - the document's path.
 * @param content - the new text.
 * @param version - the version the write is guarded against.
 * @returns the new version, or the reason the write failed.
 */
export async function writeDocument(services, doc, content, version) {
    try {
        const target = await resolveTarget(services, doc);
        const outcome = await services.fs.writeText(target, content, { kind: 'replaceIfVersion', version: version }, undefined, sandboxPolicyFor(services, doc));
        return { ok: true, version: outcome.version };
    }
    catch (error) {
        return { ok: false, ...describeWriteFailure(error) };
    }
}
/**
 * The sandbox policy a write to this document runs under.
 *
 * The policy is resolved from the session whose workspace holds the document,
 * because that session's immutable working directory is the writable boundary.
 * A profile without the policy service leaves the backend its own default.
 *
 * @param services - the Host services.
 * @param doc - the document's path.
 * @returns the per-call policy, or undefined when none can be resolved.
 */
export function sandboxPolicyFor(services, doc) {
    const policy = services.sandboxPolicy;
    if (policy === undefined)
        return undefined;
    const session = findAgent(services, doc)?.session;
    if (session === undefined)
        return undefined;
    return policy.resolve({ session });
}
/**
 * The Host services the plugin mounts.
 * @param ctx - the Host context.
 * @returns the channel's dependencies.
 */
export function createHostServices(ctx) {
    return {
        fs: ctx.get('fs'),
        connection: ctx.get('connection'),
        agents: ctx.get('agents'),
        sandboxPolicy: ctx.get('sandboxPolicy'),
    };
}
/**
 * Mount the review plugin's Host half.
 * @param ctx - the Host context.
 * @param config - the plugin's configuration.
 */
export function apply(ctx, config = DEFAULT_CONFIG) {
    const services = createHostServices(ctx);
    const store = new ReviewStore(config.maxRounds);
    // The plugin's durable state lives in the Harness's storage, outside the
    // reader's workspace: a review plugin that writes its files beside the
    // document it reviews pollutes the reader's project.
    const storagePromise = openReviewStorage(ctx);
    ctx.effect(() => () => {
        void storagePromise.then(storage => storage?.close());
    }, 'markdown-review-mode: storage close');
    const rpcHost = {
        store,
        readDocument: doc => readDocument(services, doc),
        writeDocument: (doc, content, version) => writeDocument(services, doc, content, version),
        async readPending(doc) {
            const open = await storagePromise;
            return open?.pending.get(docKey(doc));
        },
        async writePending(pending) {
            const open = await storagePromise;
            if (open === undefined)
                return false;
            try {
                // The stored record's arrays are mutable; the caller's are not.
                const annotations = pending.annotations?.map(annotation => ({
                    id: annotation.id,
                    kind: annotation.kind,
                    comment: annotation.comment,
                    from: annotation.from,
                    to: annotation.to,
                    quote: annotation.quote,
                    block: annotation.block,
                    seq: annotation.seq,
                    createdAt: annotation.createdAt,
                    status: annotation.status,
                }));
                await open.pending.put(docKey(pending.doc), {
                    doc: pending.doc,
                    base: pending.base,
                    content: pending.content,
                    savedAt: pending.savedAt,
                    ...annotations === undefined ? {} : { annotations },
                });
                return true;
            }
            catch {
                return false;
            }
        },
        async clearPending(doc) {
            const open = await storagePromise;
            if (open === undefined)
                return false;
            try {
                return await open.pending.delete(docKey(doc));
            }
            catch {
                return false;
            }
        },
        async writeSidecar(doc, sidecar) {
            const open = await storagePromise;
            if (open === undefined)
                return false;
            try {
                // The stored record's arrays are mutable; the sidecar's are not.
                await open.rounds.put(docKey(doc), { ...sidecar, annotations: [...sidecar.annotations] });
                return true;
            }
            catch {
                return false;
            }
        },
        readStylesheet: () => readStylesheet(services.fs, config.stylesheet),
        async notifyAgent(doc, roundId, summary) {
            const agent = findAgent(services, doc);
            if (agent === undefined)
                return;
            agent.followup({
                id: MessageId(`review-${roundId}`),
                role: 'user',
                content: [{
                        type: 'text',
                        text: reviewMessage(doc, roundId, summary),
                    }],
                source: { kind: 'user' },
            });
        },
        sessionOf: doc => findAgent(services, doc)?.session.id,
    };
    ctx.effect(() => mountReviewRoute(ctx, rpcHost), 'markdown-review-mode: client route');
    const toolHost = {
        store,
        writeDocument: (doc, content, version) => writeDocument(services, doc, content, version),
        documentVersion: async (doc) => {
            const read = await readDocument(services, doc);
            return read.ok ? read.version : '';
        },
    };
    ctx.effect(() => registerReviewTools(ctx, toolHost), 'markdown-review-mode: agent tools');
}
/**
 * The live agent that owns a document, if any.
 *
 * A document belongs to the session whose working directory contains it, so
 * the Agent that must answer a review is the one whose own workspace holds
 * the file.
 *
 * @param services - the Host services.
 * @param doc - the document's path.
 * @returns the agent, or undefined.
 */
function findAgent(services, doc) {
    const agents = services.agents;
    if (agents === undefined)
        return undefined;
    for (const agent of agents.list()) {
        const cwd = agent.session.header.cwd;
        if (typeof cwd !== 'string')
            continue;
        if (doc.startsWith(cwd))
            return agent;
    }
    return undefined;
}
/**
 * The blocks of a document, for the client's own parsing.
 * @param content - the document's text.
 * @returns the block count.
 */
export function blockCount(content) {
    return parseBlocks(content).length;
}
//# sourceMappingURL=index.js.map