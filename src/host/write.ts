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
export type WriteResult =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly code: string; readonly message: string }

/**
 * Explain why a document write failed.
 *
 * @param error - the error the filesystem raised.
 * @returns a stable code and a message that names the real cause.
 */
export function describeWriteFailure(error: unknown): { code: string; message: string } {
  const code = (error as { code?: unknown } | null)?.code
  const text = error instanceof Error ? error.message : String(error)
  if (code === 'FS_SANDBOX_DENIED') {
    return {
      code: 'sandbox-denied',
      message: 'The document could not be written: the session\'s file policy denies that write '
        + `(${text}). A review needs the document inside the session workspace, under a sandbox mode that permits writing.`,
    }
  }
  if (code === 'FS_STALE_VERSION') {
    return {
      code: 'stale-version',
      message: 'The document changed since the review was submitted. Reload it and review again.',
    }
  }
  return {
    code: typeof code === 'string' ? code : 'write-failed',
    message: `The document could not be written: ${text}`,
  }
}