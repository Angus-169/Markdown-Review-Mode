/**
 * The client half's own copy.
 *
 * The renderer label is the only string the browser shows before the panel
 * opens, so it is the one piece of copy the client needs. The Host half
 * keeps its own copy for the message it hands the Agent.
 */
/** This namespace's copy keys. */
export const NS = 'dshReview';
/** The copy, in the languages the plugin ships. */
export const dictionaries = {
    en: {
        'viewer.label': 'Review',
    },
    zh: {
        'viewer.label': '审阅',
    },
};
/** The Chinese dictionary. */
export const zh = dictionaries.zh;
/** The English dictionary. */
export const en = dictionaries.en;
//# sourceMappingURL=locales.js.map