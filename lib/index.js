/**
 * The plugin's Host entry.
 *
 * The Host half owns every write to the workspace. It mounts a versioned RPC
 * channel the client half calls, and registers the two Agent-facing tools
 * with a conditional visibility guard so they only appear in a session that
 * has a review open.
 *
 * @module markdown-review-mode
 */
import z from '@deepseek-ai/schemastery';
import { apply as mountHost } from "./host/index.js";
import { DEFAULT_CONFIG } from "./host/index.js";
export { ReviewStore } from "./host/store.js";
export { registerReviewTools } from "./host/tools.js";
export { mountReviewRoute, handleOperation } from "./host/rpc.js";
export { applyEdits, rollbackBlock } from "./core/apply.js";
export { alignBlocks, similarity } from "./core/align.js";
export { parseBlocks } from "./core/blocks.js";
/**
 * The Host services the plugin waits for.
 *
 * The plugin reads and writes the document through the filesystem provider,
 * serves the client route on the web server, wakes the Agent through the
 * agent registry, and registers its two tools. The connection is a dependency
 * because every route asks it whether the caller may.
 */
export const inject = ['fs', 'connection', 'webServer', 'agents', 'tools'];
/**
 * The plugin's row configuration.
 *
 * The review rounds and the reader's unsaved edits are kept in the Harness's
 * own storage, outside the workspace: a review plugin that writes its files
 * beside the document it reviews leaves the reader with a directory they
 * never asked for, in a project they may well commit.
 */
export const Config = z.object({
    maxRounds: z.number().step(1).min(1).max(200).default(DEFAULT_CONFIG.maxRounds),
    stylesheet: z.string().default(DEFAULT_CONFIG.stylesheet),
});
/**
 * Mount the plugin's Host half.
 * @param ctx - the Host context.
 * @param config - the row's configuration.
 */
export function apply(ctx, config) {
    mountHost(ctx, config);
}
//# sourceMappingURL=index.js.map