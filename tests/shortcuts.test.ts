/**
 * The review editor's shortcuts.
 *
 * Ctrl+S inside the editor must save the document and must not fall through to
 * the browser's own "save page" dialog — the latter is why the key handler
 * returns true.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></html>', { pretendToBeVisual: true })
const globals = globalThis as unknown as Record<string, unknown>
globals.window = dom.window
globals.document = dom.window.document
globals.HTMLElement = dom.window.HTMLElement
globals.Node = dom.window.Node
globals.Range = dom.window.Range
globals.MutationObserver = dom.window.MutationObserver
globals.MouseEvent = dom.window.MouseEvent
globals.Event = dom.window.Event
globals.Window = dom.window.Window
globals.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
globals.requestAnimationFrame = (callback: FrameRequestCallback): number =>
  dom.window.setTimeout(() => callback(Date.now()), 0) as unknown as number
globals.cancelAnimationFrame = (handle: number): void => { dom.window.clearTimeout(handle) }

const { createReviewEditor } = await import('../src/client/editor.ts')
const { EditorView } = await import('@codemirror/view')

/**
 * Build the plugin's editor with spies for its actions.
 * @returns the editor and the spies.
 */
function build() {
  const host = dom.window.document.getElementById('editor')
  assert.ok(host !== null)
  const calls = { save: 0, submit: 0, change: 0 }
  const editor = createReviewEditor(host, {
    doc: 'some text',
    annotations: [],
    editable: true,
    onSelection: () => {},
    onChange: () => { calls.change += 1 },
    onSubmit: () => { calls.submit += 1 },
    onSave: () => { calls.save += 1 },
    onAnnotationClick: () => {},
  })
  return { editor, calls, view: editor.view }
}

test('Mod-s calls save', () => {
  const { editor, calls, view } = build()
  // Dispatch the real keydown the way the browser would. The other tests
  // check that it is consumed and that it does not trigger submit.
  const event = new dom.window.KeyboardEvent('keydown', {
    key: 's', ctrlKey: true, bubbles: true, cancelable: true,
  })
  view.contentDOM.dispatchEvent(event)

  assert.equal(calls.save, 1, 'save should be called exactly once')
  editor.view.destroy()
})

test('the save handler consumes the event (no browser save dialog)', () => {
  const { editor, view } = build()
  const event = new dom.window.KeyboardEvent('keydown', {
    key: 's', ctrlKey: true, bubbles: true, cancelable: true,
  })
  view.contentDOM.dispatchEvent(event)
  assert.equal(event.defaultPrevented, true, 'the browser save dialog must be suppressed')
  editor.view.destroy()
})

test('Mod-s does not trigger submit', () => {
  const { editor, calls, view } = build()
  const event = new dom.window.KeyboardEvent('keydown', {
    key: 's', ctrlKey: true, bubbles: true, cancelable: true,
  })
  view.contentDOM.dispatchEvent(event)
  assert.equal(calls.submit, 0)
  editor.view.destroy()
})

test('Mod-Enter still submits', () => {
  const { editor, calls, view } = build()
  const event = new dom.window.KeyboardEvent('keydown', {
    key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true,
  })
  view.contentDOM.dispatchEvent(event)
  assert.equal(calls.submit, 1)
  editor.view.destroy()
})

test('the editor can be closed for editing while a round is open', () => {
  const { editor, view } = build()
  assert.equal(view.state.readOnly, false, 'the editor starts writable')

  editor.setEditable(false)
  assert.equal(view.state.readOnly, true, 'the editor closes while a round is open')

  editor.setEditable(true)
  assert.equal(view.state.readOnly, false, 'the editor opens again when the round is done')
  editor.view.destroy()
})
