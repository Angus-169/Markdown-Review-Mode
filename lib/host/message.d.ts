/**
 * The message that wakes the Agent for a review round.
 *
 * The message carries a **pointer**, not the review itself: the annotations and
 * the document are read through `review_read`, so a long review never becomes a
 * long message that gets compressed or truncated on the way in.
 *
 * Two things in this text are deliberate:
 *
 * - It names the two tools in order, because the round is only useful if the
 *   Agent reads before it writes.
 * - It tells the Agent what to do when a write is refused for a reason the
 *   Agent cannot fix. Without that, a refusal that is really a configuration
 *   problem looks like something to investigate, and the Agent spends its
 *   budget probing the plugin instead of reporting the problem.
 *
 * @module markdown-review-mode/host/message
 */
/**
 * Build the wake-up message for one round.
 *
 * @param doc - the reviewed document's path.
 * @param roundId - the round's identity.
 * @param summary - the round's size, phrased for a person, such as `4 条批注`.
 * @returns the message text.
 */
export declare function reviewMessage(doc: string, roundId: string, summary: string): string;
//# sourceMappingURL=message.d.ts.map