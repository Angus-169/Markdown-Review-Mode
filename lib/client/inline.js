/**
 * Inline Markdown rendering for the elements the preview draws itself.
 *
 * The document's own text is rendered by the editor's decorations: a marker
 * is hidden and the run around it is styled. But a **table** is drawn as one
 * element, so its cells have to be rendered here — and a cell holding
 * `**bold**` must show bold, not the asterisks.
 *
 * The renderer is pure: Markdown in, a tree of runs out. The DOM half is a
 * separate, tiny function, so the rules are testable without a browser.
 *
 * @module markdown-review-mode/client/inline
 */
import { parser } from '@lezer/markdown';
/**
 * The node type's name.
 * @param element - the element.
 * @returns the type name, or an empty string when it is unknown.
 */
function typeName(element) {
    const type = parser.nodeSet.types[element.type];
    return type === undefined ? '' : type.name;
}
/**
 * The markers that stand for formatting and carry no text of their own.
 */
const MARKERS = new Set([
    'EmphasisMark',
    'CodeMark',
    'LinkMark',
    'HeaderMark',
    'QuoteMark',
    'ListMark',
    'StrikethroughMark',
]);
/**
 * The content of an element, with the gaps between its children filled in.
 *
 * The parser's tree holds the markers; the text between them is not a node
 * of its own, so it has to be recovered from the source.
 *
 * @param element - the element.
 * @param source - the text the tree was parsed from.
 * @returns the runs.
 */
function renderChildren(element, source) {
    const runs = [];
    let cursor = element.from;
    for (const child of element.children) {
        if (child.from > cursor)
            runs.push({ tag: '', text: source.slice(cursor, child.from) });
        const run = renderElement(child, source);
        if (run !== undefined)
            runs.push(run);
        cursor = child.to;
    }
    if (cursor < element.to)
        runs.push({ tag: '', text: source.slice(cursor, element.to) });
    return runs;
}
/**
 * A link's target and its label.
 * @param element - the link element.
 * @param source - the text the tree was parsed from.
 * @returns the target and the label's runs.
 */
function linkParts(element, source) {
    let href = '';
    const label = [];
    let labelStart;
    let cursor = element.from;
    for (const child of element.children) {
        const name = typeName(child);
        if (name === 'URL') {
            href = source.slice(child.from, child.to);
            continue;
        }
        if (name === 'LinkMark') {
            const marker = source.slice(child.from, child.to);
            if (marker === '[') {
                // The label runs from here to the closing bracket.
                labelStart = child.to;
                cursor = child.to;
            }
            else if (marker === ']') {
                if (labelStart !== undefined && child.from > cursor) {
                    label.push({ tag: '', text: source.slice(cursor, child.from) });
                }
                labelStart = undefined;
            }
            continue;
        }
        if (labelStart === undefined)
            continue;
        if (child.from > cursor)
            label.push({ tag: '', text: source.slice(cursor, child.from) });
        const run = renderElement(child, source);
        if (run !== undefined)
            label.push(run);
        cursor = child.to;
    }
    return { href, label };
}
/**
 * Render one element.
 * @param element - the element.
 * @param source - the text the tree was parsed from.
 * @returns the run, or undefined when the element carries no content.
 */
function renderElement(element, source) {
    const name = typeName(element);
    if (MARKERS.has(name))
        return undefined;
    switch (name) {
        case 'StrongEmphasis':
            return { tag: 'strong', children: renderChildren(element, source) };
        case 'Emphasis':
            return { tag: 'em', children: renderChildren(element, source) };
        case 'Strikethrough':
            return { tag: 'del', children: renderChildren(element, source) };
        case 'InlineCode':
            return { tag: 'code', children: renderChildren(element, source) };
        case 'Link': {
            const { href, label } = linkParts(element, source);
            return { tag: 'a', href, children: label };
        }
        case 'Autolink': {
            const target = source.slice(element.from, element.to);
            return { tag: 'a', href: target, text: target };
        }
        case 'Escape':
            // The escaped character, without its backslash.
            return { tag: '', text: source.slice(element.from + 1, element.to) };
        default:
            return { tag: '', text: source.slice(element.from, element.to) };
    }
}
/**
 * Render a line of inline Markdown.
 *
 * The parser returns only the **markup** elements; the plain text between
 * them is not an element of its own and has to be recovered from the source.
 *
 * @param source - the Markdown text.
 * @returns the runs, in order.
 */
export function renderInlineMarkdown(source) {
    if (source.length === 0)
        return [];
    const runs = [];
    const elements = parser.parseInline(source, 0);
    let cursor = 0;
    for (const element of elements) {
        if (element.from > cursor)
            runs.push({ tag: '', text: source.slice(cursor, element.from) });
        const run = renderElement(element, source);
        if (run !== undefined)
            runs.push(run);
        cursor = element.to;
    }
    if (cursor < source.length)
        runs.push({ tag: '', text: source.slice(cursor, source.length) });
    return runs;
}
/**
 * The plain text of a run tree, with the markers dropped.
 * @param runs - the runs.
 * @returns the text.
 */
export function inlineText(runs) {
    return runs.map(run => run.text ?? inlineText(run.children ?? [])).join('');
}
//# sourceMappingURL=inline.js.map