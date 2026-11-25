/**
 * The CodeMirror half of the live preview.
 *
 * Four pieces:
 *
 * - a **state field** holding the block the reader has expanded, so the
 *   expansion survives edits and undo, and so only one passage is open at a
 *   time;
 * - a **view plugin** that turns the preview plan into decorations;
 * - **widgets** that draw what a replaced range stands for —a bullet, a
 *   table;
 * - **click handling** that expands the clicked block, and collapses it when
 *   clicked again.
 *
 * The reader sees prose; clicking a passage opens its source. Selecting a
 * passage (a drag) does not open it —a comment is written on the rendered
 * text, and only a deliberate click swaps it for source.
 *
 * @module markdown-review-mode/client/preview-view
 */

import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { StateEffect, StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { parseBlocks } from '../core/blocks.ts'
import { planPreviewDecorations } from '../core/preview.ts'
import type { PreviewTable } from '../core/preview.ts'
import { unionRanges } from '../core/anchors.ts'
import { annotationField } from './state.ts'
import { renderInlineMarkdown } from './inline.ts'
import type { InlineRun } from './inline.ts'
import { CHANGED_CLASS, HIGHLIGHT_CLASS, HIDDEN_CLASS, LOCK_CLASS } from './editor.ts'
import type { Annotation } from '../core/anchors.ts'
import type { Block } from '../core/blocks.ts'

/** Toggle one block's expanded state. */
export const toggleExpandedBlock = StateEffect.define<number>()

/**
 * The block the reader has expanded.
 *
 * Only one at a time: reading is a moving window, so opening a passage closes
 * the one before it.
 */
export const expandedBlocksField = StateField.define<number | undefined>({
  create() {
    return undefined
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (!effect.is(toggleExpandedBlock)) continue
      // Clicking the open block closes it again.
      return value === effect.value ? undefined : effect.value
    }
    return value
  },
})

/**
 * The block index an offset falls in.
 * @param blocks - the document's blocks.
 * @param offset - the offset to locate.
 * @returns the block index, or undefined when the offset is in no block.
 */
function blockIndexAt(blocks: readonly Block[], offset: number): number | undefined {
  for (const block of blocks) {
    if (offset >= block.start && offset < block.end) return block.index
  }
  return undefined
}

/**
 * The attribute a drawn element carries its block's identity in.
 *
 * A drawn element has no text, so a click on it cannot be mapped back to a
 * document position —the element says which block it belongs to instead.
 */
const BLOCK_ATTRIBUTE = 'data-review-block'

/**
 * Draw a run tree into an element.
 *
 * @param parent - the element to draw into.
 * @param runs - the runs to draw.
 */
function renderInto(parent: HTMLElement, runs: readonly InlineRun[]): void {
  for (const run of runs) {
    if (run.tag === '') {
      if (run.text !== undefined && run.text.length > 0) {
        parent.appendChild(document.createTextNode(run.text))
      }
      continue
    }
    const element = document.createElement(run.tag)
    if (run.href !== undefined && run.href.length > 0) {
      element.setAttribute('href', run.href)
      element.setAttribute('rel', 'noopener noreferrer')
      element.setAttribute('target', '_blank')
    }
    if (run.text !== undefined) element.textContent = run.text
    else renderInto(element, run.children ?? [])
    parent.appendChild(element)
  }
}

/**
 * A footnote, drawn where its definition was.
 */
class FootnoteWidget extends WidgetType {
  /** The note's text. */
  private readonly text: string
  /** The footnote's number. */
  private readonly number: number | undefined

  constructor(text: string, number: number | undefined) {
    super()
    this.text = text
    this.number = number
  }

  override eq(other: FootnoteWidget): boolean {
    return other.text === this.text && other.number === this.number
  }

  override toDOM(): HTMLElement {
    const note = document.createElement('div')
    note.className = 'cm-review-footnote'
    if (this.number !== undefined) {
      const label = document.createElement('span')
      label.className = 'cm-review-footnote-number'
      label.textContent = `[${String(this.number)}]`
      note.appendChild(label)
    }
    renderInto(note, renderInlineMarkdown(this.text))
    return note
  }
}

/**
 * A footnote reference, drawn as a superscript.
 */
class FootnoteRefWidget extends WidgetType {
  /** The footnote's number. */
  private readonly number: number
  /** The note's text, shown as the reference's tooltip. */
  private readonly text: string

  constructor(number: number, text: string) {
    super()
    this.number = number
    this.text = text
  }

  override eq(other: FootnoteRefWidget): boolean {
    return other.number === this.number && other.text === this.text
  }

  override toDOM(): HTMLElement {
    const reference = document.createElement('sup')
    reference.className = 'cm-review-footnote-ref'
    reference.textContent = String(this.number)
    reference.title = this.text
    return reference
  }
}

/**
 * A list bullet, drawn where the source's marker was.
 */
class BulletWidget extends WidgetType {
  /** The text the bullet draws. */
  private readonly text: string
  /** The block the bullet belongs to. */
  private readonly block: number | undefined

  constructor(text: string, block: number | undefined) {
    super()
    this.text = text
    this.block = block
  }

  override eq(other: BulletWidget): boolean {
    return other.text === this.text && other.block === this.block
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-review-bullet'
    span.textContent = this.text
    if (this.block !== undefined) span.setAttribute(BLOCK_ATTRIBUTE, String(this.block))
    return span
  }
}

/**
 * A table, drawn as a grid.
 */
class TableWidget extends WidgetType {
  /** The table's cells and alignment. */
  private readonly table: PreviewTable
  /** The block the table belongs to. */
  private readonly block: number | undefined

  constructor(table: PreviewTable, block: number | undefined) {
    super()
    this.table = table
    this.block = block
  }

  override eq(other: TableWidget): boolean {
    return JSON.stringify(other.table) === JSON.stringify(this.table) && other.block === this.block
  }

  override toDOM(): HTMLElement {
    const table = document.createElement('table')
    table.className = 'cm-review-table'
    if (this.block !== undefined) table.setAttribute(BLOCK_ATTRIBUTE, String(this.block))

    const head = document.createElement('thead')
    const headRow = document.createElement('tr')
    this.table.head.forEach((cell, index) => {
      const th = document.createElement('th')
      renderInto(th, renderInlineMarkdown(cell))
      th.style.textAlign = this.table.align[index] ?? 'left'
      headRow.appendChild(th)
    })
    head.appendChild(headRow)
    table.appendChild(head)

    const body = document.createElement('tbody')
    for (const row of this.table.rows) {
      const tr = document.createElement('tr')
      row.forEach((cell, index) => {
        const td = document.createElement('td')
        renderInto(td, renderInlineMarkdown(cell))
        td.style.textAlign = this.table.align[index] ?? 'left'
        tr.appendChild(td)
      })
      body.appendChild(tr)
    }
    table.appendChild(body)
    return table
  }
}

/**
 * The last failure the preview ran into.
 *
 * A decoration that cannot be built leaves the editor without any preview — * indistinguishable from "the preview is not implemented" unless something
 * says so. The failure is kept here so the panel can show it, and it is
 * logged for the browser console.
 */
let lastFailure: string | undefined

/**
 * The last failure the preview ran into.
 * @returns the message, or undefined when the preview is healthy.
 */
export function previewFailure(): string | undefined {
  return lastFailure
}

function buildDecorations(state: EditorState): DecorationSet {
  try {
    const decorations = buildPreviewDecorations(state)
    lastFailure = undefined
    return decorations
  } catch (error) {
    // A decoration that cannot be built must not take the editor with it.
    // Plain text is a working editor; a broken editor is not.
    const message = error instanceof Error ? error.message : String(error)
    lastFailure = message
    console.error('markdown-review-mode: the preview decorations could not be built', error)
    return Decoration.none
  }
}

/**
 * The decorations one document state draws.
 *
 * Two kinds live together: the Markdown preview (what the prose looks like)
 * and the annotation highlights (what the reader marked). The highlights are
 * drawn in both the rendered and the expanded form —a comment marks a
 * passage, not a spelling.
 *
 * A document whose syntax tree is empty has no preview to draw. That is
 * worth saying out loud: it means the Markdown language is missing from the
 * editor, and the reader would otherwise see plain source with no hint why.
 *
 * @param state - the editor state.
 * @returns the decoration set.
 */
function buildPreviewDecorations(state: EditorState): DecorationSet {
  const expanded = state.field(expandedBlocksField)
  const annotations = state.field(annotationField)
  // A stale annotation lost its anchored text: its range no longer describes
  // anything real, so drawing it would underline whatever now sits at those
  // offsets. An answered annotation is not a pending mark either.
  const drawn = annotations.filter(annotation =>
    annotation.status === 'open' && annotation.to > annotation.from)
  const source = state.doc.toString()
  const blocks = parseBlocks(source)
  // The editor parses the document lazily, for the viewport it shows. A
  // preview that only covers what happens to be on screen is a preview that
  // shows source further down, so the whole document is parsed here.
  //
  // `ensureSyntaxTree` gives up after 50 milliseconds by default and answers
  // `null` when it did; the budget is opened up so the tree really spans the
  // document.
  const tree = ensureSyntaxTree(state, state.doc.length, Number.POSITIVE_INFINITY) ?? syntaxTree(state)
  const plan = planPreviewDecorations(source, tree, blocks, expanded)

  // CodeMirror refuses decoration ranges that are added out of order, and it
  // refuses a range that overlaps another. `Decoration.set` sorts what it is
  // given, and the plan keeps hidden ranges, styled runs, and replaced ranges
  // disjoint, so the editor builds.
  //
  // A hidden range is a *marked* range the CSS hides, not a replacement:
  // `Decoration.replace` without a widget draws nothing and leaves the text
  // visible, which is how a "hide the markup" feature silently does nothing.
  const ranges = [
    ...plan.hides.map(hide => Decoration.mark({ class: HIDDEN_CLASS }).range(hide.from, hide.to)),
    ...plan.marks.map(mark => Decoration.mark({ class: mark.class }).range(mark.from, mark.to)),
    ...plan.replaces.map(replace => {
      const widget = replace.kind === 'table' && replace.table !== undefined
        ? new TableWidget(replace.table, replace.block)
        : replace.kind === 'footnote'
          ? new FootnoteWidget(replace.text ?? '', replace.number)
          : replace.kind === 'footnote-ref'
            ? new FootnoteRefWidget(replace.number ?? 0, replace.text ?? '')
            : new BulletWidget(replace.text ?? '•', replace.block)
      return Decoration.replace({ widget }).range(replace.from, replace.to)
    }),
    ...unionRanges(drawn.filter(item => item.kind !== 'lock'))
      .map(range => Decoration.mark({ class: HIGHLIGHT_CLASS }).range(range.from, range.to)),
    ...unionRanges(drawn.filter(item => item.kind === 'lock'))
      .map(range => Decoration.mark({ class: LOCK_CLASS }).range(range.from, range.to)),
  ]

  if (source.trim().length > 0 && tree.length === 0) {
    // The tree is empty: no Markdown parser is attached to this editor.
    ranges.push(Decoration.mark({ class: 'cm-review-no-preview' }).range(0, source.length))
  }

  return Decoration.set(ranges, true)
}

/**
 * The preview's decorations.
 *
 * They come from a **facet**, not from a view plugin: CodeMirror refuses a
 * replacement that spans a line break when it comes from a plugin, and a
 * table is exactly such a replacement. A facet may replace across lines.
 *
 * The facet depends on the **document**, not only on the annotation state:
 * without that, the preview would not follow the text as it is edited.
 */
export const previewDecorations = EditorView.decorations.compute(
  [expandedBlocksField, annotationField, 'doc'],
  state => buildDecorations(state),
)

/**
 * The annotation a document position falls in.
 *
 * The narrowest range wins, so a lock inside a wider comment is still
 * reachable on its own.
 *
 * @param annotations - the document's annotations.
 * @param position - the document position.
 * @returns the annotation, or undefined when the position is in none.
 */
export function annotationAt(
  annotations: readonly Annotation[],
  position: number,
): Annotation | undefined {
  let found: Annotation | undefined
  for (const annotation of annotations) {
    if (position < annotation.from || position > annotation.to) continue
    if (found === undefined || (annotation.to - annotation.from) < (found.to - found.from)) {
      found = annotation
    }
  }
  return found
}

/**
 * The block a drawn element belongs to, read from the element under the
 * pointer.
 *
 * A table is drawn as one element that replaces the whole block, so a click
 * on it has no text to map back to —and the coordinates land on whatever
 * text happens to be nearest. The element carries its block instead.
 *
 * @param event - the mouse event.
 * @returns the block index, or undefined when the pointer is not on a drawn
 * element.
 */
function drawnBlockOf(event: MouseEvent): number | undefined {
  const target = event.target
  if (!(target instanceof HTMLElement)) return undefined
  const element = target.closest(`[${BLOCK_ATTRIBUTE}]`)
  if (element === null) return undefined
  const value = element.getAttribute(BLOCK_ATTRIBUTE)
  if (value === null) return undefined
  const index = Number(value)
  return Number.isInteger(index) ? index : undefined
}

/**
 * Clicks on drawn elements.
 *
 * A drawn element has no text of its own, so a click on it cannot be mapped
 * back to a document position —the element carries its block instead.
 *
 * The listener is attached to the editor's content directly rather than
 * through CodeMirror's handler machinery: CodeMirror's own mousedown handling
 * claims the event for widgets and prevents the default, which skips every
 * later mousedown handler, and its click handling never reaches a plugin
 * handler for an element it did not start the interaction on.
 */
const drawnClickPlugin = ViewPlugin.fromClass(class {
  /** The listener, so it can be removed again. */
  private readonly onClick: (event: MouseEvent) => void
  /** The editor the listener belongs to. */
  private readonly view: EditorView

  constructor(view: EditorView) {
    this.view = view
    this.onClick = (event: MouseEvent) => {
      const block = drawnBlockOf(event)
      if (block === undefined) return
      view.dispatch({ effects: toggleExpandedBlock.of(block) })
    }
    view.contentDOM.addEventListener('click', this.onClick)
  }

  destroy(): void {
    this.view.contentDOM.removeEventListener('click', this.onClick)
  }
})

/**
 * Click handling: a click on a block expands it, a second click collapses it.
 *
 * A drag is not a click: the selection is not empty afterwards, so a comment
 * can be written on the rendered text without the passage opening underneath
 * the user's cursor.
 *
 * A click on a passage that carries an annotation opens that annotation
 * instead: the annotation is the more specific thing under the cursor, and
 * opening the passage's source would hide the very marker that was clicked.
 *
 * @param onAnnotationClick - called when an annotated passage is clicked.
 * @returns the extension that installs the handlers.
 */
export function previewClickHandlers(
  onAnnotationClick: (annotation: Annotation, clientX: number, clientY: number) => void,
) {
  let pressedBlock: number | undefined
  let pressedAnnotation: Annotation | undefined

  return [
    drawnClickPlugin,
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (event.detail !== 1) return false
        // A drawn element is handled by the listener above.
        if (drawnBlockOf(event) !== undefined) return false
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (position === null) return false
        pressedBlock = blockIndexAt(parseBlocks(view.state.doc.toString()), position)
        pressedAnnotation = annotationAt(view.state.field(annotationField), position)
        return false
      },
      mouseup(event, view) {
        const pressed = pressedBlock
        const annotation = pressedAnnotation
        pressedBlock = undefined
        pressedAnnotation = undefined
        if (pressed === undefined) return false
        // A drag left a selection behind: that was a selection, not a click.
        if (!view.state.selection.main.empty) return false
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (position === null) return false
        if (annotation !== undefined) {
          onAnnotationClick(annotation, event.clientX, event.clientY)
          return false
        }
        const released = blockIndexAt(parseBlocks(view.state.doc.toString()), position)
        if (released !== pressed) return false
        view.dispatch({ effects: toggleExpandedBlock.of(released) })
        return false
      },
    }),
  ]
}




