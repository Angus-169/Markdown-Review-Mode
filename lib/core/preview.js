/**
 * The live-preview plan: how a Markdown source renders when the reader is
 * not editing that part of it.
 *
 * The plan is computed from the Markdown syntax tree and the block model, and
 * it is a plain data structure — a list of ranges to hide, a list of ranges to
 * style, and a list of ranges to replace with a drawn element. Keeping it
 * separate from CodeMirror means the whole thing is testable without a
 * browser, and the editor half stays a thin adapter.
 *
 * Three rules drive everything:
 *
 * - **A block the reader has not expanded renders as prose.** The inline
 *   markers (`**`, `_`, backticks) disappear, emphasis becomes emphasis, a
 *   heading becomes a heading, a list becomes a list, and a table becomes a
 *   table.
 * - **A block the reader expanded shows its source verbatim.** The design's
 *   review workflow needs the raw text in front of the user when they are
 *   working on a specific passage, so expanding is a first-class, per-block
 *   state rather than a global mode.
 * - **Only one block is expanded at a time.** Reading is a moving window:
 *   opening a passage closes the one before it.
 *
 * The ranges are **disjoint by construction**: a styled run covers only the
 * *content* of a run, never its markers, and a replaced range — a list bullet,
 * a table — contains nothing else. CodeMirror refuses overlapping decoration
 * ranges, and a style that swallowed the markers it hid would be both wrong
 * and unusable.
 *
 * @module markdown-review-mode/core/preview
 */
import { parser } from '@lezer/markdown';
/** An empty plan, for a document with nothing to render. */
export const EMPTY_PREVIEW_PLAN = { marks: [], hides: [], replaces: [] };
/**
 * Parse a Markdown document into its syntax tree.
 * @param source - the document text.
 * @returns the parsed tree.
 */
export function parseMarkdown(source) {
    return parser.parse(source);
}
/**
 * The heading level of a heading node name.
 * @param name - the node's type name.
 * @returns the level, or 0 when the node is not a heading.
 */
function headingLevel(name) {
    if (name === 'ATXHeading1')
        return 1;
    if (name === 'ATXHeading2')
        return 2;
    if (name === 'ATXHeading3')
        return 3;
    if (name === 'ATXHeading4')
        return 4;
    if (name === 'ATXHeading5')
        return 5;
    if (name === 'ATXHeading6')
        return 6;
    if (name === 'SetextHeading1')
        return 1;
    if (name === 'SetextHeading2')
        return 2;
    return 0;
}
/** The marker nodes that delimit an inline run. */
const RUN_MARKERS = new Set(['EmphasisMark', 'CodeMark', 'StrikethroughMark']);
/**
 * The content of an inline run: the part between its markers.
 * @param node - the run's node.
 * @returns the content range, or undefined when the run has no markers.
 */
function runContent(node) {
    let first = null;
    let last = null;
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        if (!RUN_MARKERS.has(child.type.name))
            continue;
        if (first === null)
            first = child;
        last = child;
    }
    if (first === null || last === null)
        return undefined;
    if (first.to >= last.from)
        return undefined;
    return { from: first.to, to: last.from };
}
/**
 * Split a table's source into its cells.
 * @param line - one row of the table.
 * @returns the row's cells, trimmed.
 */
function cellsOf(line) {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    if (trimmed.length === 0)
        return [];
    return trimmed.split('|').map(cell => cell.trim());
}
/**
 * Parse a GFM table's source.
 *
 * The second row is the delimiter row: it names the columns and their
 * alignment, and it is not part of the table's content.
 *
 * @param source - the table's source text.
 * @returns the table's cells and alignment, or undefined when the source is
 * not a table.
 */
export function parseTable(source) {
    const lines = source.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2)
        return undefined;
    const delimiter = cellsOf(lines[1]);
    if (delimiter.length === 0)
        return undefined;
    const align = [];
    for (const cell of delimiter) {
        if (!/^:?-{1,}:?$/.test(cell))
            return undefined;
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        align.push(left && right ? 'center' : right ? 'right' : 'left');
    }
    const head = cellsOf(lines[0]);
    const rows = lines.slice(2).map(cellsOf);
    if (head.length !== delimiter.length)
        return undefined;
    return { head, rows, align };
}
/**
 * A footnote reference, like `[^1]`.
 */
const FOOTNOTE_REFERENCE = /\[\^([^\]\s]+)\]/g;
/**
 * A footnote definition's first line, like `[^1]: the note`.
 */
const FOOTNOTE_DEFINITION = /^\[\^([^\]\s]+)\]:/;
/**
 * The text of a footnote definition: what follows the marker, plus the
 * definition's continuation lines with their indentation removed.
 *
 * @param text - the definition block's text.
 * @param markerLength - the length of the `[^id]:` marker.
 * @returns the note's text.
 */
function definitionText(text, markerLength) {
    const lines = text.split('\n');
    const first = lines[0]?.slice(markerLength) ?? '';
    const rest = lines.slice(1).map(line => line.replace(/^ {0,4}/, ''));
    return [first, ...rest].join('\n').trim();
}
/**
 * Plan the live preview of one document.
 *
 * A node inside an expanded block is skipped whole: the user asked for that
 * passage's source, so nothing there is hidden or restyled.
 *
 * @param source - the document text the tree was parsed from.
 * @param tree - the document's Markdown syntax tree.
 * @param blocks - the document's blocks.
 * @param expanded - the index of the block the user expanded, if any.
 * @returns the marks, hides, and replacements the editor should draw.
 */
export function planPreviewDecorations(source, tree, blocks, expanded) {
    const marks = [];
    const hides = [];
    const replaces = [];
    /**
     * Whether a range lies inside the expanded block.
     * @param from - the range's start.
     * @param to - the range's end.
     * @returns true when the range is inside the expanded block.
     */
    const isExpanded = (from, to) => {
        if (expanded === undefined)
            return false;
        const block = blocks[expanded];
        if (block === undefined)
            return false;
        return from >= block.start && to <= block.end;
    };
    /**
     * The block a range belongs to.
     * @param blocks - the document's blocks.
     * @param from - the range's start.
     * @param to - the range's end.
     * @returns the block index, or undefined when the range is in no block.
     */
    const blockOf = (from, to) => {
        for (const block of blocks) {
            if (from >= block.start && to <= block.end)
                return block.index;
        }
        return undefined;
    };
    // A table is drawn whole, so nothing inside it is styled or hidden: the
    // replaced range must stay free of other decorations.
    const tableBlocks = blocks.filter(block => block.kind === 'table' && !isExpanded(block.start, block.end));
    for (const block of tableBlocks) {
        const table = parseTable(source.slice(block.start, block.end));
        if (table === undefined)
            continue;
        replaces.push({ from: block.start, to: block.end, kind: 'table', table, block: block.index });
    }
    /**
     * Whether a range lies inside a table that is drawn whole.
     * @param from - the range's start.
     * @param to - the range's end.
     * @returns true when the range is inside a drawn table.
     */
    const insideTable = (from, to) => tableBlocks.some(block => from >= block.start && to <= block.end);
    // Footnotes are an extension, not part of CommonMark, so the syntax tree
    // has no node for them: they are found in the source.
    const definitions = new Map();
    for (const block of blocks) {
        const match = FOOTNOTE_DEFINITION.exec(block.text);
        if (match === null)
            continue;
        if (isExpanded(block.start, block.end))
            continue;
        definitions.set(match[1], { block: block.index, text: definitionText(block.text, match[0].length) });
    }
    const definitionBlocks = new Set([...definitions.values()].map(definition => definition.block));
    // The footnotes are numbered by the order of their first reference.
    const numbers = new Map();
    let nextNumber = 0;
    for (const block of blocks) {
        if (definitionBlocks.has(block.index))
            continue;
        if (isExpanded(block.start, block.end))
            continue;
        for (const match of block.text.matchAll(FOOTNOTE_REFERENCE)) {
            if (numbers.has(match[1]))
                continue;
            numbers.set(match[1], (nextNumber += 1));
        }
    }
    for (const [id, definition] of definitions) {
        const block = blocks[definition.block];
        replaces.push({
            from: block.start,
            to: block.end,
            kind: 'footnote',
            text: definition.text,
            number: numbers.get(id),
            block: definition.block,
        });
    }
    for (const block of blocks) {
        if (definitionBlocks.has(block.index))
            continue;
        if (isExpanded(block.start, block.end))
            continue;
        for (const match of block.text.matchAll(FOOTNOTE_REFERENCE)) {
            const id = match[1];
            const definition = definitions.get(id);
            const number = numbers.get(id);
            // An undefined footnote stays plain text: there is no note to point at.
            if (definition === undefined || number === undefined)
                continue;
            const from = block.start + match.index;
            const to = from + match[0].length;
            // A reference inside a drawn table belongs to that table, not to the
            // document's footnote list.
            if (insideTable(from, to))
                continue;
            replaces.push({ from, to, kind: 'footnote-ref', text: definition.text, number });
        }
    }
    /**
     * Walk one node and its children.
     * @param node - the node to walk.
     * @param listKind - the kind of the list the node sits in, if any.
     */
    const walk = (node, listKind) => {
        const name = node.type.name;
        const from = node.from;
        const to = node.to;
        if (from >= to)
            return;
        if (isExpanded(from, to))
            return;
        if (insideTable(from, to))
            return;
        switch (name) {
            // The inline markers are the noise of a source view: hiding them is what
            // turns `**bold**` into bold.
            case 'EmphasisMark':
            case 'CodeMark':
            case 'StrikethroughMark':
            // A heading's hash and a quote's angle are structure, not text.
            case 'HeaderMark':
            case 'QuoteMark':
                hides.push({ from, to });
                break;
            case 'ListMark':
                // A list marker is drawn, not shown: `-` reads as a bullet.
                replaces.push({
                    from,
                    to,
                    kind: 'bullet',
                    text: listKind === 'ordered' ? source.slice(from, to) : '•',
                    block: blockOf(from, to),
                });
                break;
            case 'StrongEmphasis':
            case 'Emphasis':
            case 'Strikethrough':
            case 'InlineCode': {
                // Style the run's content, never the whole node: the markers are
                // hidden separately, and overlapping ranges are not allowed.
                const content = runContent(node);
                if (content !== undefined) {
                    const className = name === 'StrongEmphasis'
                        ? 'cm-review-strong'
                        : name === 'Emphasis'
                            ? 'cm-review-em'
                            : name === 'Strikethrough'
                                ? 'cm-review-strike'
                                : 'cm-review-code';
                    marks.push({ from: content.from, to: content.to, class: className });
                }
                break;
            }
            case 'URL':
                marks.push({ from, to, class: 'cm-review-marker' });
                break;
            case 'LinkMark':
            case 'CodeInfo':
                marks.push({ from, to, class: 'cm-review-marker' });
                break;
            default: {
                const level = headingLevel(name);
                if (level > 0) {
                    // The heading's own text: past its hash markers and the space after.
                    let textFrom = from;
                    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
                        if (child.type.name !== 'HeaderMark')
                            continue;
                        textFrom = child.to;
                        break;
                    }
                    while (textFrom < to && (source[textFrom] === ' ' || source[textFrom] === '\t'))
                        textFrom += 1;
                    marks.push({ from: textFrom, to, class: `cm-review-h${String(level)}` });
                }
                break;
            }
        }
        const childListKind = name === 'BulletList' ? 'bullet' : name === 'OrderedList' ? 'ordered' : listKind;
        for (let child = node.firstChild; child !== null; child = child.nextSibling) {
            walk(child, childListKind);
        }
    };
    walk(tree.topNode, undefined);
    // The editor adds the ranges in order, and CodeMirror refuses out-of-order
    // ranges. Sorting here keeps that guarantee with the editor.
    const byPosition = (left, right) => left.from - right.from || left.to - right.to;
    return {
        marks: [...marks].sort(byPosition),
        hides: [...hides].sort(byPosition),
        replaces: [...replaces].sort(byPosition),
    };
}
//# sourceMappingURL=preview.js.map