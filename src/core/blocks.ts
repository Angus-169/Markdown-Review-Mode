/**
 * Top-level Markdown block model — the single source of truth shared by the
 * Host and Client halves.
 *
 * The block boundaries are a *normative* contract, not an implementation detail:
 * both halves parse the same text with this module, so a block index means the
 * same thing on the wire as it does on screen. The parser is deliberately
 * line-based and CommonMark-flavoured rather than token-based: the model needs
 * exact source offsets, and a token stream (markdown-it, micromark) does not
 * carry them for inline content.
 *
 * Invariants the rest of the plugin relies on:
 *
 * - Blocks are ordered, non-overlapping, and every block's content range lies
 *   inside the source.
 * - `start`/`end` bound the block's own text (no surrounding whitespace).
 * - `spanEnd` closes the partition: it is the next block's `start`, so
 *   `source.slice(block.start, block.spanEnd)` is exactly the block plus the
 *   whitespace that separates it from the next one.
 * - `separator` is that separating whitespace verbatim, so a patch can rebuild
 *   the document by replacing block texts and keeping separators.
 *
 * Offsets are UTF-16 code-unit indices into the original source, matching
 * both JavaScript string indices and CodeMirror 6 document positions.
 *
 * @module markdown-review-mode/core/blocks
 */

/** The block kinds this model distinguishes. */
export type BlockKind =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'blockquote'
  | 'code'
  | 'table'
  | 'html'
  | 'hr'
  | 'image'

/** One top-level block of a Markdown document. */
export interface Block {
  /** 0-based position in the block list. */
  readonly index: number
  /** What the block is, for the whole-block degradation decision. */
  readonly kind: BlockKind
  /** Offset of the block's first content character (inclusive). */
  readonly start: number
  /** Offset just past the block's last content character (exclusive). */
  readonly end: number
  /** Offset where the next block starts; equals `source.length` for the last block. */
  readonly spanEnd: number
  /** The block's own text: `source.slice(start, end)`. */
  readonly text: string
  /** The whitespace between this block and the next one: `source.slice(end, spanEnd)`. */
  readonly separator: string
  /** Stable content hash of `text`. */
  readonly hash: string
  /** 1-based source line of `start`. */
  readonly line: number
}

/** Kinds whose interior is addressable; the others degrade to whole-block anchors. */
const INTRA_BLOCK_KINDS: ReadonlySet<BlockKind> = new Set<BlockKind>([
  'heading',
  'paragraph',
  'list',
  'blockquote',
])

/**
 * Whether a block supports a character selection inside it.
 * @param kind - the block kind to test.
 * @returns true when an intra-block range is meaningful for that kind.
 */
export function supportsIntraBlockSelection(kind: BlockKind): boolean {
  return INTRA_BLOCK_KINDS.has(kind)
}

/**
 * A 64-bit content hash rendered as 16 lowercase hex characters.
 *
 * The model needs a *synchronous* hash usable in the browser, where
 * `crypto.subtle` is asynchronous and therefore unusable inside a StateField
 * transaction. FNV-1a over UTF-16 code units, run twice with different offset
 * bases, gives a 64-bit value with adequate collision behaviour for
 * same-length block comparison.
 *
 * @param text - the text to hash.
 * @returns 16 hex characters.
 */
export function hashText(text: string): string {
  let low = 0x811c9dc5
  let high = 0x01000193
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    low ^= code
    low = Math.imul(low, 0x01000193) >>> 0
    high ^= code + index
    high = Math.imul(high, 0x85ebca6b) >>> 0
  }
  const lowHex = low.toString(16).padStart(8, '0')
  const highHex = high.toString(16).padStart(8, '0')
  return `${highHex}${lowHex}`
}

/** One source line with its offset in the original text. */
interface SourceLine {
  /** The line's text without its terminator and without a trailing CR. */
  readonly text: string
  /** Offset of the line's first character. */
  readonly start: number
  /** Offset just past the line's last character (before its terminator). */
  readonly end: number
}

/**
 * Split the source into lines, keeping each line's offsets.
 *
 * A CRLF terminator counts as two characters, so a line's `end` excludes both
 * the CR and the LF; the terminator itself belongs to the separator of the
 * block that owns the line.
 *
 * @param source - the document text.
 * @returns the source's lines in order.
 */
function splitLines(source: string): SourceLine[] {
  const lines: SourceLine[] = []
  let cursor = 0
  while (cursor <= source.length) {
    const newline = source.indexOf('\n', cursor)
    if (newline === -1) {
      const end = source.length
      const text = source.slice(cursor, end).endsWith('\r')
        ? source.slice(cursor, end - 1)
        : source.slice(cursor, end)
      lines.push({ text, start: cursor, end: text.length === end - cursor ? end : end - 1 })
      break
    }
    const raw = source.slice(cursor, newline)
    const endsWithCr = raw.endsWith('\r')
    lines.push({
      text: endsWithCr ? raw.slice(0, -1) : raw,
      start: cursor,
      end: cursor + raw.length - (endsWithCr ? 1 : 0),
    })
    cursor = newline + 1
  }
  return lines
}

const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+|$)/
const THEMATIC_BREAK = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const BULLET_ITEM = /^ {0,3}([-*+])(?:[ \t]+|$)/
const ORDERED_ITEM = /^ {0,3}(\d{1,9})([.)])(?:[ \t]+|$)/
const BLOCK_QUOTE = /^ {0,3}>/
const TABLE_DELIMITER = /^\s*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?\s*$/
const HTML_START = /^ {0,3}<(?:[A-Za-z!/?]|\/[A-Za-z])/
const IMAGE_ONLY = /^!\[[^\]]*\]\([^)]*\)$/
const INDENTED = /^(?: {4}|\t)/

/**
 * Whether a line starts a block that interrupts a paragraph.
 * @param text - the line's text.
 * @returns true when the line begins a new top-level block.
 */
function startsBlock(text: string): boolean {
  return ATX_HEADING.test(text)
    || THEMATIC_BREAK.test(text)
    || FENCE.test(text)
    || BLOCK_QUOTE.test(text)
    || BULLET_ITEM.test(text)
    || ORDERED_ITEM.test(text)
    || HTML_START.test(text)
}

/**
 * Whether a line is blank.
 * @param text - the line's text.
 * @returns true when the line holds only whitespace.
 */
function isBlank(text: string): boolean {
  return text.trim().length === 0
}

/**
 * The offset of a line's first non-whitespace character.
 * @param source - the document text.
 * @param line - the line to inspect.
 * @returns the content offset, or the line's end when it holds only whitespace.
 */
function contentStart(source: string, line: SourceLine): number {
  let offset = line.start
  while (offset < line.end && (source[offset] === ' ' || source[offset] === '\t')) offset += 1
  return offset
}

/**
 * The offset just past a line's last non-whitespace character.
 * @param source - the document text.
 * @param line - the line to inspect.
 * @returns the content end, or the line's start when it holds only whitespace.
 */
function contentEnd(source: string, line: SourceLine): number {
  let offset = line.end
  while (offset > line.start && (source[offset - 1] === ' ' || source[offset - 1] === '\t')) offset -= 1
  return offset
}

/** A block under construction, before the partition is closed. */
interface DraftBlock {
  kind: BlockKind
  start: number
  end: number
  line: number
}

/**
 * Parse a Markdown document into top-level blocks.
 *
 * The splitter recognises the constructs the review model needs to address:
 * headings, paragraphs, lists, block quotes, fenced code, tables, HTML blocks,
 * thematic breaks, and image-only paragraphs. Nesting inside a list or a quote
 * is not split further — a list is one addressable block.
 *
 * @param source - the document text.
 * @returns the document's blocks in order; empty for an empty document.
 */
export function parseBlocks(source: string): Block[] {
  const lines = splitLines(source)
  const drafts: DraftBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (isBlank(line.text)) {
      index += 1
      continue
    }

    const fence = FENCE.exec(line.text)
    if (fence !== null) {
      const marker = fence[1]
      const close = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`)
      let last = index
      let cursor = index + 1
      while (cursor < lines.length) {
        if (close.test(lines[cursor].text)) {
          last = cursor
          break
        }
        last = cursor
        cursor += 1
      }
      drafts.push({ kind: 'code', start: contentStart(source, line), end: contentEnd(source, lines[last]), line: line.start })
      index = last + 1
      continue
    }

    if (ATX_HEADING.test(line.text)) {
      drafts.push({ kind: 'heading', start: contentStart(source, line), end: contentEnd(source, line), line: line.start })
      index += 1
      continue
    }

    if (THEMATIC_BREAK.test(line.text)) {
      drafts.push({ kind: 'hr', start: contentStart(source, line), end: contentEnd(source, line), line: line.start })
      index += 1
      continue
    }

    if (BLOCK_QUOTE.test(line.text)) {
      let last = index
      let cursor = index + 1
      while (cursor < lines.length) {
        const candidate = lines[cursor]
        if (BLOCK_QUOTE.test(candidate.text)) {
          last = cursor
          cursor += 1
          continue
        }
        if (isBlank(candidate.text)) break
        if (startsBlock(candidate.text)) break
        last = cursor
        cursor += 1
      }
      drafts.push({ kind: 'blockquote', start: contentStart(source, line), end: contentEnd(source, lines[last]), line: line.start })
      index = last + 1
      continue
    }

    if (BULLET_ITEM.test(line.text) || ORDERED_ITEM.test(line.text)) {
      let last = index
      let cursor = index + 1
      while (cursor < lines.length) {
        const candidate = lines[cursor]
        if (isBlank(candidate.text)) {
          const following = lines[cursor + 1]
          if (following === undefined) break
          if (!BULLET_ITEM.test(following.text) && !ORDERED_ITEM.test(following.text)) break
          last = cursor
          cursor += 1
          continue
        }
        if (INDENTED.test(candidate.text)) {
          last = cursor
          cursor += 1
          continue
        }
        if (BULLET_ITEM.test(candidate.text) || ORDERED_ITEM.test(candidate.text)) {
          last = cursor
          cursor += 1
          continue
        }
        break
      }
      drafts.push({ kind: 'list', start: contentStart(source, line), end: contentEnd(source, lines[last]), line: line.start })
      index = last + 1
      continue
    }

    if (line.text.trimStart().startsWith('|') && lines[index + 1] !== undefined && TABLE_DELIMITER.test(lines[index + 1].text)) {
      let last = index + 1
      let cursor = index + 2
      while (cursor < lines.length && !isBlank(lines[cursor].text)) {
        last = cursor
        cursor += 1
      }
      drafts.push({ kind: 'table', start: contentStart(source, line), end: contentEnd(source, lines[last]), line: line.start })
      index = last + 1
      continue
    }

    if (HTML_START.test(line.text)) {
      let last = index
      let cursor = index + 1
      while (cursor < lines.length && !isBlank(lines[cursor].text)) {
        last = cursor
        cursor += 1
      }
      drafts.push({ kind: 'html', start: contentStart(source, line), end: contentEnd(source, lines[last]), line: line.start })
      index = last + 1
      continue
    }

    let last = index
    let cursor = index + 1
    while (cursor < lines.length) {
      const candidate = lines[cursor]
      if (isBlank(candidate.text)) break
      if (startsBlock(candidate.text)) break
      last = cursor
      cursor += 1
    }
    const text = source.slice(contentStart(source, line), contentEnd(source, lines[last]))
    const kind: BlockKind = IMAGE_ONLY.test(text.trim()) ? 'image' : 'paragraph'
    drafts.push({ kind, start: contentStart(source, line), end: contentEnd(source, lines[last]), line: line.start })
    index = last + 1
  }

  return closePartition(source, drafts)
}

/**
 * Close a block draft list into the final partition.
 * @param source - the document text.
 * @param drafts - the blocks under construction.
 * @returns the closed blocks.
 */
function closePartition(source: string, drafts: DraftBlock[]): Block[] {
  return drafts.map((draft, index) => {
    const next = drafts[index + 1]
    const spanEnd = next === undefined ? source.length : next.start
    const text = source.slice(draft.start, draft.end)
    return {
      index,
      kind: draft.kind,
      start: draft.start,
      end: draft.end,
      spanEnd,
      text,
      separator: source.slice(draft.end, spanEnd),
      hash: hashText(text),
      line: lineOf(source, draft.start),
    }
  })
}

/**
 * The 1-based source line of an offset.
 * @param source - the document text.
 * @param offset - the offset to locate.
 * @returns the line number.
 */
export function lineOf(source: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source[index] === '\n') line += 1
  }
  return line
}

/**
 * The block that owns an offset.
 * @param blocks - the document's blocks.
 * @param offset - the offset to locate.
 * @returns the owning block, or undefined when the offset lies outside every block.
 */
export function blockAt(blocks: readonly Block[], offset: number): Block | undefined {
  for (const block of blocks) {
    if (offset >= block.start && offset < block.spanEnd) return block
  }
  return undefined
}

/**
 * The block whose content contains an offset.
 *
 * An offset that falls in the whitespace between two blocks belongs to
 * neither; the caller decides whether to snap it left or right.
 *
 * @param blocks - the document's blocks.
 * @param offset - the offset to locate.
 * @returns the containing block, or undefined.
 */
export function contentBlockAt(blocks: readonly Block[], offset: number): Block | undefined {
  for (const block of blocks) {
    if (offset >= block.start && offset < block.end) return block
  }
  return undefined
}
