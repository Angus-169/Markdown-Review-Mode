/**
 * The review plugin's durable state.
 *
 * Two things outlive the panel:
 *
 * - the **sidecar** of the last review round — the record of what the reader
 *   marked and what the Agent did about it;
 * - the reader's **unsaved edits** to the document under review, so that
 *   reloading the panel does not throw away work that was never submitted.
 *
 * Both live in the Harness's own storage, outside the reader's workspace. A
 * review plugin that keeps its working files beside the document it reviews
 * leaves the reader with a directory they never asked for — in a project they
 * may well commit. The Harness's storage is the sanctioned place for
 * plugin-owned state, and it sits under the Harness home, where a repository
 * cannot reach it.
 *
 * One record per document, overwritten in place. There is no pile of
 * versions: the last round and the current unsaved edits are all that is
 * kept, and a second round replaces the first.
 *
 * @module markdown-review-mode/host/storage
 */
import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
/**
 * One stored review round.
 *
 * The shape is the sidecar the design describes: the round's identity, the
 * document's version it was made against, the annotations, and the document
 * as the reader reviewed it.
 */
export declare const roundRecord: z.ZodObject<{
    schema: z.ZodString;
    roundId: z.ZodString;
    doc: z.ZodString;
    base: z.ZodString;
    createdAt: z.ZodNumber;
    annotations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<{
            comment: "comment";
            lock: "lock";
        }>;
        comment: z.ZodString;
        startBlock: z.ZodNumber;
        startOffset: z.ZodNumber;
        endBlock: z.ZodNumber;
        endOffset: z.ZodNumber;
        quote: z.ZodString;
        seq: z.ZodNumber;
    }, z.core.$strip>>;
    content: z.ZodString;
}, z.core.$strip>;
/** One stored review round, inferred from {@link roundRecord}. */
export type RoundRecord = z.infer<typeof roundRecord>;
/**
 * One stored set of unsaved edits.
 *
 * `base` is the document's version the edits were made against: when the file
 * changes underneath the panel, the edits no longer apply to it and are
 * dropped rather than applied to the wrong text.
 *
 * `annotations` is optional so a record written before the field existed still
 * opens: the reader simply gets their edits back without their comments.
 */
export declare const pendingRecord: z.ZodObject<{
    doc: z.ZodString;
    base: z.ZodString;
    content: z.ZodString;
    annotations: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<{
            comment: "comment";
            lock: "lock";
        }>;
        comment: z.ZodString;
        from: z.ZodNumber;
        to: z.ZodNumber;
        quote: z.ZodString;
        block: z.ZodNumber;
        seq: z.ZodNumber;
        createdAt: z.ZodNumber;
        status: z.ZodEnum<{
            open: "open";
            stale: "stale";
            applied: "applied";
            declined: "declined";
            conflict: "conflict";
            unhandled: "unhandled";
        }>;
    }, z.core.$strip>>>;
    savedAt: z.ZodNumber;
}, z.core.$strip>;
/** One stored set of unsaved edits, inferred from {@link pendingRecord}. */
export type PendingRecord = z.infer<typeof pendingRecord>;
/**
 * The review plugin's storage domain.
 *
 * `per-record` layout: each document's round and pending edits are their own
 * document under the domain's tree, and writing one replaces it. That is what
 * keeps the state bounded — one round and one pending edit set per document,
 * whatever the number of rounds that ran.
 */
export declare const reviewDomainSpec: {
    readonly name: "dsh_review";
    readonly version: 1;
    readonly layout: "per-record";
    readonly tables: {
        readonly rounds: {
            readonly valueSchema: z.ZodObject<{
                schema: z.ZodString;
                roundId: z.ZodString;
                doc: z.ZodString;
                base: z.ZodString;
                createdAt: z.ZodNumber;
                annotations: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    kind: z.ZodEnum<{
                        comment: "comment";
                        lock: "lock";
                    }>;
                    comment: z.ZodString;
                    startBlock: z.ZodNumber;
                    startOffset: z.ZodNumber;
                    endBlock: z.ZodNumber;
                    endOffset: z.ZodNumber;
                    quote: z.ZodString;
                    seq: z.ZodNumber;
                }, z.core.$strip>>;
                content: z.ZodString;
            }, z.core.$strip>;
        };
        readonly pending: {
            readonly valueSchema: z.ZodObject<{
                doc: z.ZodString;
                base: z.ZodString;
                content: z.ZodString;
                annotations: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    kind: z.ZodEnum<{
                        comment: "comment";
                        lock: "lock";
                    }>;
                    comment: z.ZodString;
                    from: z.ZodNumber;
                    to: z.ZodNumber;
                    quote: z.ZodString;
                    block: z.ZodNumber;
                    seq: z.ZodNumber;
                    createdAt: z.ZodNumber;
                    status: z.ZodEnum<{
                        open: "open";
                        stale: "stale";
                        applied: "applied";
                        declined: "declined";
                        conflict: "conflict";
                        unhandled: "unhandled";
                    }>;
                }, z.core.$strip>>>;
                savedAt: z.ZodNumber;
            }, z.core.$strip>;
        };
    };
};
/**
 * A stable, filesystem-safe key for a document.
 *
 * The key is a hash of the document's path, so the storage tree never holds
 * the reader's file names.
 *
 * @param doc - the document's path.
 * @returns the key.
 */
export declare function docKey(doc: string): string;
/** The plugin's open storage, once it is open. */
export interface ReviewStorage {
    /** The last review round of each document. */
    readonly rounds: KvTable<string, RoundRecord>;
    /** The unsaved edits of each document. */
    readonly pending: KvTable<string, PendingRecord>;
    /** Release the domain. */
    close(): Promise<void>;
}
/**
 * Open the review plugin's storage.
 *
 * The storage stack is optional: a profile without it keeps the review
 * panel working, and only the two durable extras — the sidecar and the
 * surviving unsaved edits — are unavailable.
 *
 * @param ctx - the Host context.
 * @returns the open storage, or undefined when the storage stack is absent
 * or the domain could not be opened.
 */
export declare function openReviewStorage(ctx: Context): Promise<ReviewStorage | undefined>;
//# sourceMappingURL=storage.d.ts.map