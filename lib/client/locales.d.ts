/**
 * The client half's own copy.
 *
 * The renderer label is the only string the browser shows before the panel
 * opens, so it is the one piece of copy the client needs. The Host half
 * keeps its own copy for the message it hands the Agent.
 */
/** This namespace's copy keys. */
export declare const NS = "dshReview";
/** The keys this namespace carries. */
export type ReviewClientKey = 'viewer.label';
/** The copy, in the languages the plugin ships. */
export declare const dictionaries: Record<'en' | 'zh', Record<ReviewClientKey, string>>;
/** The Chinese dictionary. */
export declare const zh: Record<"viewer.label", string>;
/** The English dictionary. */
export declare const en: Record<"viewer.label", string>;
//# sourceMappingURL=locales.d.ts.map