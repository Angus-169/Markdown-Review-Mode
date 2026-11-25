/**
 * The floating surfaces' mousedown rule.
 *
 * The rule exists because a surface sits over the editor: taking the editor's
 * focus would collapse the selection and close the surface before the click
 * lands. But it must not take the reader's own cursor away inside a field,
 * which is the bug this file guards.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
const globals = globalThis as unknown as Record<string, unknown>
globals.window = dom.window
globals.document = dom.window.document
globals.HTMLElement = dom.window.HTMLElement
globals.Node = dom.window.Node
globals.Event = dom.window.Event
globals.MouseEvent = dom.window.MouseEvent

const { isTextField, keepEditorFocus } = await import('../src/client/dom.ts')

/**
 * Build an element of one tag name.
 * @param tag - the tag name.
 * @param parent - an optional parent to append into.
 * @returns the element.
 */
function element(tag: string, parent?: Element): HTMLElement {
  const created = dom.window.document.createElement(tag)
  parent?.appendChild(created)
  return created
}

/**
 * Run the rule against one target.
 * @param target - the event's target.
 * @returns whether the default was prevented.
 */
function prevented(target: EventTarget | null): boolean {
  let cancelled = false
  keepEditorFocus({ target, preventDefault: () => { cancelled = true } })
  return cancelled
}

test('a toolbar button keeps the editor focused', () => {
  assert.equal(prevented(element('button')), true)
})

test('the surface itself keeps the editor focused', () => {
  const surface = element('div')
  assert.equal(prevented(surface), true)
})

test('a textarea is left alone, so the reader can place a cursor', () => {
  assert.equal(prevented(element('textarea')), false)
})

test('an input is left alone', () => {
  assert.equal(prevented(element('input')), false)
})

test('a click inside a textarea keeps the field\'s own behaviour', () => {
  const textarea = element('textarea')
  const span = element('span', textarea)
  assert.equal(prevented(span), false)
})

test('a click outside a textarea is still prevented', () => {
  const surface = element('div')
  element('textarea', surface)
  const button = element('button', surface)
  assert.equal(prevented(button), true)
})

test('a contenteditable region counts as a field', () => {
  const region = element('div')
  region.setAttribute('contenteditable', 'true')
  assert.equal(prevented(region), false)
})

test('a non-element target is harmless', () => {
  assert.equal(isTextField(null), false)
  assert.equal(prevented(null), true)
})