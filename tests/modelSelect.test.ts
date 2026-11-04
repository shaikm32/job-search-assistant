import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import React, { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'
import { ModelSelect, MODEL_SELECT_PLACEHOLDER } from '../src/components/common/ModelSelect.js'
import type { AiModelDescriptor } from '../shared/domain/ai.js'

;(globalThis as typeof globalThis & { React: typeof React }).React = React

const MODELS: AiModelDescriptor[] = [
  { modelId: 'gpt-4o', displayName: 'GPT-4o', supportedOperations: ['analyze_resume'], structuredOutput: 'json_schema', reasoning: false, contextCapacity: 128000 },
  { modelId: 'gpt-4o-mini', displayName: 'GPT-4o Mini', supportedOperations: ['analyze_resume'], structuredOutput: 'json_schema', reasoning: false, contextCapacity: 128000 },
  { modelId: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet', supportedOperations: ['analyze_resume'], structuredOutput: 'json_schema', reasoning: false, contextCapacity: 200000 },
]

function renderModelSelect(
  overrides: { value?: string | null; disabled?: boolean; error?: string | null; placeholder?: string } = {},
): string {
  const props: Parameters<typeof ModelSelect>[0] = {
    id: 'aiModel',
    label: 'AI Model',
    models: MODELS,
    value: overrides.value ?? null,
    disabled: overrides.disabled ?? false,
    onChange: () => undefined,
  }
  if (overrides.error !== undefined) {
    props.error = overrides.error
  }
  if (overrides.placeholder !== undefined) {
    props.placeholder = overrides.placeholder
  }
  return renderToStaticMarkup(createElement(ModelSelect, props))
}

describe('ModelSelect (searchable combobox)', () => {
  it('renders a labelled combobox input with a hidden listbox and one option per model', () => {
    const markup = renderModelSelect()
    assert.match(markup, /<label class="field-label" for="aiModel">AI Model<\/label>/)
    assert.match(markup, /<input[^>]*role="combobox"[^>]*>/)
    assert.match(markup, /aria-expanded="false"/)
    assert.match(markup, /<div[^>]*role="listbox"[^>]*hidden[^>]*>/)
    assert.equal((markup.match(/role="option"/g) ?? []).length, 3)
    assert.match(markup, /GPT-4o/)
    assert.match(markup, /GPT-4o Mini/)
    assert.match(markup, /Claude 3\.5 Sonnet/)
  })

  it('shows no selection by default and prompts with the placeholder', () => {
    const markup = renderModelSelect()
    assert.match(markup, /<input[^>]*value=""[^>]*>/)
    assert.match(markup, /<input[^>]*placeholder="Please select a model"[^>]*>/)
    assert.equal((markup.match(/data-selected="true"/g) ?? []).length, 0)
    assert.equal(MODEL_SELECT_PLACEHOLDER, 'Please select a model')
  })

  it('accepts an overriding placeholder', () => {
    const markup = renderModelSelect({ placeholder: 'Choose a model' })
    assert.match(markup, /<input[^>]*placeholder="Choose a model"[^>]*>/)
  })

  it('shows the selected model in the input and marks its option selected', () => {
    const markup = renderModelSelect({ value: 'claude-3-5-sonnet' })
    assert.match(markup, /<input[^>]*value="Claude 3\.5 Sonnet"[^>]*>/)
    assert.match(markup, /data-selected="true"/)
    assert.equal((markup.match(/data-selected="true"/g) ?? []).length, 1)
  })

  it('renders a validation message wired to the combobox input', () => {
    const markup = renderModelSelect({ error: 'Please select an AI model.' })
    assert.match(markup, /<p class="field-error" id="aiModel-error" role="alert">Please select an AI model\.<\/p>/)
    assert.match(markup, /<input[^>]*aria-invalid="true"[^>]*>/)
    assert.match(markup, /<input[^>]*aria-describedby="aiModel-error"[^>]*>/)
    // The combobox stays labelled and interactive; only the message is added.
    assert.match(markup, /<label class="field-label" for="aiModel">AI Model<\/label>/)
  })

  it('omits the error wiring when no error is present', () => {
    const markup = renderModelSelect({ error: null })
    assert.equal(markup.includes('field-error'), false)
    assert.equal(markup.includes('aria-invalid'), false)
    assert.equal(markup.includes('aria-describedby'), false)
  })

  it('disables the combobox when disabled or when there are no models', () => {
    const disabled = renderModelSelect({ disabled: true })
    assert.match(disabled, /<input[^>]*disabled[^>]*>/)

    const empty = renderToStaticMarkup(
      createElement(ModelSelect, { id: 'aiModel', label: 'AI Model', models: [], value: null, onChange: () => undefined }),
    )
    assert.match(empty, /disabled/)
  })
})

describe('ModelSelect outside-click behavior', () => {
  let currentDom: JSDOM

  beforeEach(() => {
    // No global state to save; each test sets up its own DOM
  })

  afterEach(() => {
    currentDom?.window.close()
  })

  function mount(
    props: Parameters<typeof ModelSelect>[0],
  ): { document: Document; root: ReturnType<typeof createRoot> } {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' })
    currentDom = dom
    globalThis.document = dom.window.document
    globalThis.window = dom.window
    globalThis.Node = dom.window.Node
    globalThis.HTMLElement = dom.window.HTMLElement
    globalThis.MouseEvent = dom.window.MouseEvent
    globalThis.Event = dom.window.Event
    globalThis.IS_REACT_ACT_ENVIRONMENT = true

    const container = dom.window.document.createElement('div')
    dom.window.document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(createElement(ModelSelect, props))
    })
    return { document: dom.window.document, root, dom }
  }

  it('closes the dropdown when clicking outside with an empty search field', () => {
    const { document, root } = mount({
      id: 'aiModel',
      label: 'AI Model',
      models: MODELS,
      value: null,
      onChange: () => undefined,
    })

    const input = document.getElementById('aiModel') as HTMLInputElement
    act(() => {
      input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const listbox = document.getElementById('aiModel-listbox')
    assert.ok(listbox, 'listbox should be rendered')
    assert.ok(!listbox.hasAttribute('hidden'), 'dropdown should be open after clicking input')

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    assert.ok(listbox.hasAttribute('hidden'), 'dropdown should close after outside click with empty search')
    root.unmount()
  })

  it('closes the dropdown when clicking outside with a populated search field', () => {
    const { document, root } = mount({
      id: 'aiModel',
      label: 'AI Model',
      models: MODELS,
      value: null,
      onChange: () => undefined,
    })

    const input = document.getElementById('aiModel') as HTMLInputElement

    act(() => {
      input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    input.value = 'gpt'
    act(() => {
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const listbox = document.getElementById('aiModel-listbox')
    assert.ok(listbox, 'listbox should be rendered')
    assert.ok(!listbox.hasAttribute('hidden'), 'dropdown should be open with populated search')

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    assert.ok(listbox.hasAttribute('hidden'), 'dropdown should close after outside click with populated search')
    root.unmount()
  })

  it('does not close the dropdown when mousedown happens inside the combobox', () => {
    const { document, root } = mount({
      id: 'aiModel',
      label: 'AI Model',
      models: MODELS,
      value: null,
      onChange: () => undefined,
    })

    const input = document.getElementById('aiModel') as HTMLInputElement
    act(() => {
      input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const listbox = document.getElementById('aiModel-listbox')
    assert.ok(!listbox.hasAttribute('hidden'), 'dropdown should be open')

    const firstOption = listbox.querySelector('[role="option"]') as HTMLElement
    assert.ok(firstOption, 'first option should exist')
    act(() => {
      firstOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    assert.ok(!listbox.hasAttribute('hidden'), 'dropdown should stay open when mousedown is inside combobox')
    root.unmount()
  })
})

describe('ModelSelect dropdown placement', () => {
  let currentDom: JSDOM

  afterEach(() => {
    currentDom?.window.close()
  })

  function mount(): { document: Document; root: ReturnType<typeof createRoot>; dom: JSDOM } {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' })
    currentDom = dom
    globalThis.document = dom.window.document
    globalThis.window = dom.window
    globalThis.Node = dom.window.Node
    globalThis.HTMLElement = dom.window.HTMLElement
    globalThis.MouseEvent = dom.window.MouseEvent
    globalThis.Event = dom.window.Event
    globalThis.IS_REACT_ACT_ENVIRONMENT = true

    const container = dom.window.document.createElement('div')
    dom.window.document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        createElement(ModelSelect, {
          id: 'aiModel',
          label: 'AI Model',
          models: MODELS,
          value: null,
          onChange: () => undefined,
        }),
      )
    })
    return { document: dom.window.document, root, dom }
  }

  /**
   * jsdom performs no layout: stub the combobox rect and the viewport height so
   * the available space above/below the field can be controlled per test.
   */
  function stubLayout(
    dom: JSDOM,
    document: Document,
    rect: { top: number; bottom: number },
    viewportHeight: number,
  ): void {
    Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: viewportHeight })
    const input = document.getElementById('aiModel') as HTMLInputElement
    const combobox = input.closest('.combobox') as HTMLElement
    assert.ok(combobox, 'combobox container should exist')
    const left = 10
    const width = 300
    combobox.getBoundingClientRect = () =>
      ({
        top: rect.top,
        bottom: rect.bottom,
        left,
        right: left + width,
        width,
        height: rect.bottom - rect.top,
        x: left,
        y: rect.top,
        toJSON: () => ({}),
      }) as DOMRect
  }

  function openDropdown(document: Document): HTMLElement {
    const input = document.getElementById('aiModel') as HTMLInputElement
    act(() => {
      input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const listbox = document.getElementById('aiModel-listbox') as HTMLElement
    assert.ok(listbox, 'listbox should be rendered')
    assert.ok(!listbox.hasAttribute('hidden'), 'dropdown should be open after clicking input')
    return listbox
  }

  it('never positions the listbox with viewport pixel coordinates', () => {
    const { document, root, dom } = mount()
    stubLayout(dom, document, { top: 400, bottom: 440 }, 900)
    const listbox = openDropdown(document)

    // The listbox is anchored by CSS to the combobox; any viewport `top`/`left`
    // (or inline `position: fixed`) reintroduces the detachment bug.
    assert.equal(listbox.style.left, '', 'listbox must not receive an inline left offset')
    assert.equal(listbox.style.top, '', 'listbox must not receive an inline top offset')
    assert.equal(listbox.style.position, '', 'listbox must not be positioned inline')
    assert.notEqual(listbox.style.maxHeight, '', 'listbox max-height should be computed')
    root.unmount()
  })

  it('anchors below the input when there is room, and flips above near the viewport bottom', () => {
    const roomy = mount()
    stubLayout(roomy.dom, roomy.document, { top: 100, bottom: 140 }, 800)
    const belowListbox = openDropdown(roomy.document)
    assert.equal(belowListbox.getAttribute('data-placement'), 'below')
    assert.equal(belowListbox.style.maxHeight, '224px')
    roomy.root.unmount()

    const cramped = mount()
    // Only 52px below the field, ~500px above it.
    stubLayout(cramped.dom, cramped.document, { top: 500, bottom: 540 }, 600)
    const aboveListbox = openDropdown(cramped.document)
    assert.equal(aboveListbox.getAttribute('data-placement'), 'above')
    assert.equal(aboveListbox.style.maxHeight, '224px')
    cramped.root.unmount()
  })

  it('clamps max-height to the available space when space is tight', () => {
    const { document, root, dom } = mount()
    // 202px below (less than the 224px cap), only 2px above, so it stays below.
    stubLayout(dom, document, { top: 10, bottom: 50 }, 260)
    const listbox = openDropdown(document)

    assert.equal(listbox.getAttribute('data-placement'), 'below')
    assert.equal(listbox.style.maxHeight, '202px')
    root.unmount()
  })

  it('never drops max-height below the 40px floor', () => {
    const { document, root, dom } = mount()
    stubLayout(dom, document, { top: 10, bottom: 30 }, 40)
    const listbox = openDropdown(document)

    assert.equal(listbox.style.maxHeight, '40px')
    root.unmount()
  })
})
