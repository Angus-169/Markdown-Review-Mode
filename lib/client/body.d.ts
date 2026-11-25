/**
 * The review body: the document, the floating surfaces, and the submit
 * button.
 *
 * The body is mounted inside the document preview's keyed slot, so it sits
 * beside the product's own Markdown renderer and is chosen from the same
 * dropdown. It owns three pieces of state:
 *
 * - the **document**, read over the plugin's route and then edited in place
 *   by the user;
 * - the **annotations**, which live in the editor's state so they follow the
 *   text;
 * - the **round**, which is opened on submit and polled while the Agent
 *   works.
 *
 * The annotations are shown **in the text**, not in a list beside it: a
 * comment underlines its passage, a lock underlines it differently, and
 * clicking either opens the annotation in place. The reader sees the
 * document, and the marks are on the words they are about — which is the
 * only place a reader can act on them.
 *
 * The body reaches the Host over the plugin's own same-origin route, so it
 * needs nothing from the client context beyond what the slot provides.
 *
 * @module markdown-review-mode/client/body
 */
import type { ReactNode } from 'react';
/** The content owner the document slot provides. */
interface ContentOwner {
    readonly kind: string;
    readonly revision?: number;
    readonly loaded?: (version: string) => void;
    readonly failed?: () => void;
    readonly reload?: () => void;
}
/**
 * The resource hook the document slot provides.
 */
interface ResourceHook {
    <Kind extends string>(address: string): {
        readonly status: string;
        readonly value?: {
            readonly absolutePath?: string;
            readonly version?: string;
        };
    };
}
/** The props the document slot hands the body. */
export interface ReviewBodyProps {
    /** The tab's resource address, naming the session and path. */
    readonly resourceAddress: string;
    /** The content owner; in renderer mode the body owns loading. */
    readonly content: ContentOwner;
    /** The resource metadata hook, carrying the Host's own absolute path. */
    readonly useResource: ResourceHook;
}
/**
 * The review body component.
 * @param props - the slot's props.
 * @returns the rendered panel.
 */
export declare function ReviewBody(props: ReviewBodyProps): ReactNode;
export {};
//# sourceMappingURL=body.d.ts.map