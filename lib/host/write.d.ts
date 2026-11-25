/**
 * What a document write produced, and how to explain a failure.
 *
 * A write can fail for reasons that ask the reader to do different things: the
 * document changed underneath the review, the session's file policy denies the
 * write, or the filesystem itself failed. Reporting all of them as
 * "stale-version" sends everyone — the reader and the Agent — down the wrong
 * path: a denied write looks like a race with another editor, so the Agent
 * retries the same write, and the reviewer is told to reload a document that
 * never moved.
 *
 * @module markdown-review-mode/host/write
 */
/** The outcome of writing a document. */
export type WriteResult = {
    readonly ok: true;
    readonly version: string;
} | {
    readonly ok: false;
    readonly code: string;
    readonly message: string;
};
/**
 * Explain why a document write failed.
 *
 * @param error - the error the filesystem raised.
 * @returns a stable code and a message that names the real cause.
 */
export declare function describeWriteFailure(error: unknown): {
    code: string;
    message: string;
};
//# sourceMappingURL=write.d.ts.map