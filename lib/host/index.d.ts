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
import type { Context } from '@deepseek-ai/cordis';
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { WriteResult } from './write.ts';
/** The plugin's Host configuration. */
export interface ReviewConfig {
    /** The maximum number of review rounds kept in memory. */
    readonly maxRounds: number;
    /**
     * The user's stylesheet for the review panel.
     *
     * Empty means the default location in the Harness home.
     */
    readonly stylesheet: string;
}
/** The configuration used when none is supplied. */
export declare const DEFAULT_CONFIG: ReviewConfig;
/**
 * The Host services the plugin needs.
 */
export interface HostServices {
    /** The filesystem the document lives in. */
    readonly fs: FileSystem;
    /** The connection the client channel rides on. */
    readonly connection: HostConnectionHandle;
    /** The live agent registry, used to wake the Agent on a review. */
    readonly agents: Context['agents'];
    /** The sandbox policy home, when the profile mounts one. */
    readonly sandboxPolicy: SandboxPolicyService | undefined;
}
/** A session, as the agent registry hands it over. */
type Session = Agent['session'];
/** One resolved per-call policy, as the filesystem seam expects it. */
export type SandboxPolicy = NonNullable<Parameters<FileSystem['writeText']>[4]>;
/**
 * The sandbox policy service, typed locally.
 *
 * The plugin does not depend on the policy package: it needs one method, and a
 * profile without the package simply has no policy to resolve.
 */
export interface SandboxPolicyService {
    /**
     * Resolve the policy of one call.
     * @param request - the session the call belongs to.
     * @returns the per-call mode and workspace root.
     */
    resolve(request: {
        session?: Session;
    }): SandboxPolicy;
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
export declare function writeDocument(services: HostServices, doc: string, content: string, version: string): Promise<WriteResult>;
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
export declare function sandboxPolicyFor(services: HostServices, doc: string): SandboxPolicy | undefined;
/**
 * The Host services the plugin mounts.
 * @param ctx - the Host context.
 * @returns the channel's dependencies.
 */
export declare function createHostServices(ctx: Context): HostServices;
/**
 * Mount the review plugin's Host half.
 * @param ctx - the Host context.
 * @param config - the plugin's configuration.
 */
export declare function apply(ctx: Context, config?: ReviewConfig): void;
/**
 * The blocks of a document, for the client's own parsing.
 * @param content - the document's text.
 * @returns the block count.
 */
export declare function blockCount(content: string): number;
export {};
//# sourceMappingURL=index.d.ts.map