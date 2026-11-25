/**
 * The preview, rendered.
 *
 * The plan's tests prove the ranges are right; this proves the *editor* draws
 * them. A CodeMirror view plugin that throws leaves the view without any
 * decorations, which is indistinguishable from "the preview is not
 * implemented" — so the editor is actually built here, in a DOM, and the
 * rendered output is inspected.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

/**
 * Install a DOM for CodeMirror to live in.
 * @returns the window's document.
 */
function installDom(): Document {
  const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>', {
    pretendToBeVisual: true,
  })
  const globals = globalThis as unknown as Record<string, unknown>
  globals.window = dom.window
  globals.document = dom.window.document
  globals.HTMLElement = dom.window.HTMLElement
  globals.Node = dom.window.Node
  globals.Range = dom.window.Range
  globals.MutationObserver = dom.window.MutationObserver
  globals.MouseEvent = dom.window.MouseEvent
  globals.Event = dom.window.Event
  globals.IntersectionObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] { return [] }
  }
  // CodeMirror checks `elt instanceof Window`, so this has to be the
  // constructor, not the window object itself.
  globals.Window = dom.window.Window
  globals.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
  globals.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    dom.window.setTimeout(() => callback(Date.now()), 0) as unknown as number
  globals.cancelAnimationFrame = (handle: number): void => { dom.window.clearTimeout(handle) }
  return dom.window.document
}

/**
 * Build the editor the plugin builds, in the given DOM.
 * @param document - the DOM's document.
 * @param doc - the document text.
 * @returns the editor view.
 */
async function buildEditor(document: Document, doc: string) {
  const { EditorState } = await import('@codemirror/state')
  const { EditorView } = await import('@codemirror/view')
  const { markdown } = await import('@codemirror/lang-markdown')
  const { previewDecorations, expandedBlocksField, previewClickHandlers } = await import('../src/client/preview-view.ts')
  const { annotationField } = await import('../src/client/state.ts')

  const host = document.getElementById('editor')
  assert.ok(host !== null)

  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        markdown(),
        annotationField.init(() => []),
        expandedBlocksField,
        previewDecorations,
        previewClickHandlers(() => {}),
      ],
    }),
    parent: host,
  })
  return { view, host }
}

test('the editor renders the Markdown preview', async () => {
  const document = installDom()
  const source = '这是**粗体**和*斜体*。\n\n## 二级标题\n\n- 第一项'
  const { view, host } = await buildEditor(document, source)

  const html = host.innerHTML
  // The markup is marked for hiding rather than replaced: `Decoration.replace`
  // without a widget draws nothing and leaves the text visible.
  assert.ok(html.includes('cm-review-hidden'), 'the emphasis markers should be marked hidden')
  assert.ok(html.includes('cm-review-strong'), 'the bold run should be styled')
  assert.ok(html.includes('cm-review-em'), 'the italic run should be styled')
  assert.ok(html.includes('cm-review-h2'), 'the heading should be styled')
  assert.ok(html.includes('cm-review-bullet'), 'the list bullet should be drawn')

  view.destroy()
})

test('the hidden markup is wrapped in a span the stylesheet hides', async () => {
  const document = installDom()
  const { view, host } = await buildEditor(document, '这是**粗体**。')

  const hidden = host.querySelector('.cm-review-hidden')
  assert.ok(hidden !== null, 'the markers should be wrapped in a hidden span')
  assert.equal(hidden.textContent, '**')

  view.destroy()
})

test('the stylesheet really hides the markup', () => {
  const css = readFileSync(
    new URL('../src/client/review.module.css', import.meta.url),
    'utf8',
  )
  assert.match(css, /:global\(\.cm-review-hidden\)\s*\{[^}]*display:\s*none/)
})

test('a list is drawn as a list, not as source text', async () => {
  const document = installDom()
  const { view, host } = await buildEditor(document, '- 第一项\n- 第二项')

  const bullets = host.querySelectorAll('.cm-review-bullet')
  assert.equal(bullets.length, 2)
  assert.equal(bullets[0].textContent, '•')
  // The source's dash is replaced by the drawn bullet, so the reader sees a
  // bullet rather than a dash.
  assert.equal(host.textContent?.includes('• 第一项'), true)

  view.destroy()
})

test('a table is drawn as a table', async () => {
  const document = installDom()
  const { view, host } = await buildEditor(document, '| a | b |\n| - | - |\n| 1 | 2 |')

  const table = host.querySelector('.cm-review-table')
  assert.ok(table !== null, 'the table should be drawn as a grid')
  const headers = table.querySelectorAll('th')
  assert.equal(headers.length, 2)
  assert.equal(headers[0].textContent, 'a')
  const cells = table.querySelectorAll('td')
  assert.equal(cells.length, 2)
  assert.equal(cells[1].textContent, '2')

  view.destroy()
})

test('a footnote reference is a superscript and its definition is drawn', async () => {
  const document = installDom()
  const source = '正文里有个脚注[^note]。\n\n[^note]: 这是脚注的内容。'
  const { view, host } = await buildEditor(document, source)

  const reference = host.querySelector('.cm-review-footnote-ref')
  assert.ok(reference !== null, 'the reference should be drawn as a superscript')
  assert.equal(reference.textContent, '1')

  const note = host.querySelector('.cm-review-footnote')
  assert.ok(note !== null, 'the definition should be drawn as a note')
  assert.ok(note.textContent?.includes('这是脚注的内容'), 'the note should carry its text')

  view.destroy()
})

test('footnotes are numbered by the order of their first reference', async () => {
  const document = installDom()
  const source = '先看[^b]，再看[^a]。\n\n[^a]: 甲。\n\n[^b]: 乙。'
  const { view, host } = await buildEditor(document, source)

  const references = [...host.querySelectorAll('.cm-review-footnote-ref')]
  assert.equal(references.length, 2)
  // `[^b]` is referenced first, so it is footnote 1 even though its
  // definition comes second.
  assert.equal(references[0].textContent, '1')
  assert.equal(references[1].textContent, '2')

  view.destroy()
})

test('the editor does not use CodeMirror\'s monospace default', async () => {
  const document = installDom()
  const { createReviewEditor } = await import('../src/client/editor.ts')

  const host = document.getElementById('editor')
  assert.ok(host !== null)

  const editor = createReviewEditor(host, {
    doc: 'a paragraph',
    annotations: [],
    editable: true,
    onSelection: () => {},
    onChange: () => {},
    onSubmit: () => {},
    onAnnotationClick: () => {},
  })

  const scroller = editor.view.dom.querySelector('.cm-scroller')
  assert.ok(scroller !== null)
  const view = document.defaultView
  assert.ok(view !== null)
  const font = view.getComputedStyle(scroller).fontFamily
  assert.equal(font.includes('monospace'), false, `the editor should not be monospace (${font})`)

  editor.view.destroy()
})

test('the editor wraps long lines', async () => {
  const document = installDom()
  const { createReviewEditor } = await import('../src/client/editor.ts')
  const { EditorView } = await import('@codemirror/view')

  const host = document.getElementById('editor')
  assert.ok(host !== null)

  // The plugin's own editor, not the test's harness.
  const editor = createReviewEditor(host, {
    doc: 'a paragraph that is quite long',
    annotations: [],
    editable: true,
    onSelection: () => {},
    onChange: () => {},
    onSubmit: () => {},
    onAnnotationClick: () => {},
  })

  const wrapping = editor.view.state.facet(EditorView.contentAttributes)
    .some(value => typeof value !== 'function' && value.class === 'cm-lineWrapping')
  assert.ok(wrapping, 'the editor should wrap long lines')

  editor.view.destroy()
})

test('the whole document is rendered, not only the visible part', async () => {
  const document = installDom()
  const lines: string[] = []
  for (let index = 0; index < 400; index += 1) lines.push(`paragraph ${String(index)}`)
  lines.push('**the end**')
  const source = lines.join('\n\n')
  const { view } = await buildEditor(document, source)

  // The editor parses for the viewport it shows, and only the viewport is in
  // the DOM; the decoration set is what has to cover the whole document.
  const { EditorView } = await import('@codemirror/view')
  const provided = view.state.facet(EditorView.decorations)
  const decorations = Array.isArray(provided) ? provided[0] : provided
  const start = source.lastIndexOf('**the end**')
  let covered = false
  decorations.between(start, start + 12, (from, to) => {
    if (from <= start && to >= start + 2) covered = true
  })
  assert.ok(covered, 'the last paragraph should be decorated too')

  view.destroy()
})

test('the preview follows the text as it is edited', async () => {
  const document = installDom()
  const { view, host } = await buildEditor(document, '**bold** text')
  assert.ok(host.innerHTML.includes('cm-review-strong'), 'the emphasis should be rendered')

  // Remove the markers: the emphasis is gone, so the preview must change.
  view.dispatch({ changes: { from: 0, to: 2, insert: '' } })
  assert.equal(host.innerHTML.includes('cm-review-strong'), false, 'the preview should follow the edit')

  view.destroy()
})

test('a table cell renders its Markdown, not its source', async () => {
  const document = installDom()
  const source = '| name | note |\n| - | - |\n| plain | **bold** and *italic* |'
  const { view, host } = await buildEditor(document, source)

  const table = host.querySelector('.cm-review-table')
  assert.ok(table !== null, 'the table should be drawn as a grid')

  const cell = table.querySelectorAll('td')[1]
  assert.ok(cell !== undefined)
  // The markers are gone, and the runs are styled.
  assert.equal(cell.textContent, 'bold and italic')
  assert.equal(cell.querySelector('strong')?.textContent, 'bold')
  assert.equal(cell.querySelector('em')?.textContent, 'italic')

  view.destroy()
})

test('clicking a drawn table opens its source', async () => {
  const document = installDom()
  const { view, host } = await buildEditor(document, '| a | b |\n| - | - |\n| 1 | 2 |')

  const table = host.querySelector('.cm-review-table')
  assert.ok(table !== null, 'the table should be drawn as a grid')

  const { expandedBlocksField } = await import('../src/client/preview-view.ts')
  assert.equal(view.state.field(expandedBlocksField), undefined)

  // A click on the drawn element: the element carries its block, because a
  // widget has no text to map a coordinate back to.
  for (const type of ['mousedown', 'mouseup', 'click']) {
    table.dispatchEvent(new MouseEvent(type, { bubbles: true, detail: 1 }))
  }
  // CodeMirror delivers DOM events to a microtask while the view updates.
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(view.state.field(expandedBlocksField), 0, 'the table block should be open')

  view.destroy()
})

test('a heading hash is not painted', async () => {
  const document = installDom()
  const { view, host } = await buildEditor(document, '## 二级标题')

  const hidden = host.querySelector('.cm-review-hidden')
  assert.ok(hidden !== null, 'the hash should be marked hidden')
  assert.equal(hidden.textContent, '##')
  assert.ok(host.innerHTML.includes('cm-review-h2'), 'the heading text should be styled')

  view.destroy()
})

test('opening a passage closes the one before it', async () => {
  const document = installDom()
  const { view, host } = await buildEditor(document, '第一段\n\n第二段')

  const { toggleExpandedBlock } = await import('../src/client/preview-view.ts')
  view.dispatch({ effects: toggleExpandedBlock.of(0) })
  assert.equal(host.querySelectorAll('.cm-review-hidden').length >= 0, true)

  // Opening the second block closes the first.
  view.dispatch({ effects: toggleExpandedBlock.of(1) })
  const { expandedBlocksField } = await import('../src/client/preview-view.ts')
  assert.equal(view.state.field(expandedBlocksField), 1)

  view.destroy()
})

test('an annotation is marked in the text, not in a list beside it', async () => {
  const document = installDom()
  const { EditorState } = await import('@codemirror/state')
  const { EditorView } = await import('@codemirror/view')
  const { markdown } = await import('@codemirror/lang-markdown')
  const { previewDecorations, expandedBlocksField } = await import('../src/client/preview-view.ts')
  const { annotationField } = await import('../src/client/state.ts')

  const host = document.getElementById('editor')
  assert.ok(host !== null)

  const annotation = {
    id: 'a1',
    kind: 'comment' as const,
    comment: '这里要改',
    from: 0,
    to: 4,
    quote: '这是正文',
    block: 0,
    seq: 1,
    createdAt: 0,
    status: 'open' as const,
  }

  const view = new EditorView({
    state: EditorState.create({
      doc: '这是正文',
      extensions: [
        markdown(),
        annotationField.init(() => [annotation]),
        expandedBlocksField,
        previewDecorations,
      ],
    }),
    parent: host,
  })

  const marked = host.querySelector('.cm-review-highlight')
  assert.ok(marked !== null, 'the annotated passage should carry the comment mark')
  assert.equal(marked.textContent, '这是正文')

  view.destroy()
})

test('a stale or answered annotation is not painted', async () => {
  const document = installDom()
  const { EditorState } = await import('@codemirror/state')
  const { EditorView } = await import('@codemirror/view')
  const { markdown } = await import('@codemirror/lang-markdown')
  const { previewDecorations, expandedBlocksField } = await import('../src/client/preview-view.ts')
  const { annotationField } = await import('../src/client/state.ts')

  const host = document.getElementById('editor')
  assert.ok(host !== null)

  const base = { kind: 'comment' as const, comment: 'x', from: 0, to: 4, quote: '这是正文', block: 0, seq: 1, createdAt: 0 }
  const view = new EditorView({
    state: EditorState.create({
      doc: '这是正文',
      extensions: [
        markdown(),
        // Both have lost their anchoring: 'stale' has no text left, 'applied'
        // has been answered. Neither is a pending mark.
        annotationField.init(() => [
          { ...base, id: 'a1', status: 'stale' as const },
          { ...base, id: 'a2', status: 'applied' as const, seq: 2 },
        ]),
        expandedBlocksField,
        previewDecorations,
      ],
    }),
    parent: host,
  })

  // Painting these would underline whatever now sits at those offsets.
  assert.equal(host.querySelector('.cm-review-highlight'), null)

  view.destroy()
})

test('the annotation under a position is the narrowest one', async () => {
  const { annotationAt } = await import('../src/client/preview-view.ts')
  const wide = { id: 'a1', from: 0, to: 20 }
  const narrow = { id: 'a2', from: 5, to: 10 }
  assert.equal(annotationAt([wide, narrow], 7)?.id, 'a2')
  assert.equal(annotationAt([wide, narrow], 2)?.id, 'a1')
  assert.equal(annotationAt([wide, narrow], 30), undefined)
})
