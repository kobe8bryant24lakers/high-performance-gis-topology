import { describe, it, expect, vi } from 'vitest'
import {
  type ShortcutDefinition,
  matchesShortcut,
  buildShortcutRegistry,
  shouldSuppressNavKey,
} from '@/composables/use-keyboard-shortcuts'

describe('matchesShortcut', () => {
  function fakeEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      key: '',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
    } as KeyboardEvent
  }

  it('matches simple key', () => {
    const shortcut: ShortcutDefinition = { key: 'Escape', label: 'Clear', handler: vi.fn() }
    expect(matchesShortcut(fakeEvent({ key: 'Escape' }), shortcut)).toBe(true)
  })

  it('rejects wrong key', () => {
    const shortcut: ShortcutDefinition = { key: 'Escape', label: 'Clear', handler: vi.fn() }
    expect(matchesShortcut(fakeEvent({ key: 'Enter' }), shortcut)).toBe(false)
  })

  it('matches key with ctrl modifier', () => {
    const shortcut: ShortcutDefinition = { key: 'k', ctrl: true, label: 'Search', handler: vi.fn() }
    expect(matchesShortcut(fakeEvent({ key: 'k', ctrlKey: true }), shortcut)).toBe(true)
    expect(matchesShortcut(fakeEvent({ key: 'k', metaKey: true }), shortcut)).toBe(true)
  })

  it('rejects ctrl shortcut without modifier', () => {
    const shortcut: ShortcutDefinition = { key: 'k', ctrl: true, label: 'Search', handler: vi.fn() }
    expect(matchesShortcut(fakeEvent({ key: 'k' }), shortcut)).toBe(false)
  })
})

describe('buildShortcutRegistry', () => {
  it('builds a registry from definitions', () => {
    const defs: ShortcutDefinition[] = [
      { key: 'Escape', label: 'Clear selection', handler: vi.fn() },
      { key: '/', label: 'Focus search', handler: vi.fn() },
    ]
    const registry = buildShortcutRegistry(defs)
    expect(registry).toHaveLength(2)
    expect(registry[0].label).toBe('Clear selection')
  })
})

describe('shouldSuppressNavKey', () => {
  it('suppresses Tab on interactive elements', () => {
    expect(shouldSuppressNavKey('Tab', 'BUTTON')).toBe(true)
    expect(shouldSuppressNavKey('Tab', 'A')).toBe(true)
    expect(shouldSuppressNavKey('Tab', 'SELECT')).toBe(true)
  })

  it('suppresses Backspace on interactive elements', () => {
    expect(shouldSuppressNavKey('Backspace', 'BUTTON')).toBe(true)
    expect(shouldSuppressNavKey('Backspace', 'A')).toBe(true)
  })

  it('does not suppress Tab/Backspace on non-interactive elements', () => {
    expect(shouldSuppressNavKey('Tab', 'DIV')).toBe(false)
    expect(shouldSuppressNavKey('Backspace', 'CANVAS')).toBe(false)
    expect(shouldSuppressNavKey('Tab', 'BODY')).toBe(false)
  })

  it('does not suppress non-navigation keys on any element', () => {
    expect(shouldSuppressNavKey('Escape', 'BUTTON')).toBe(false)
    expect(shouldSuppressNavKey('/', 'A')).toBe(false)
    expect(shouldSuppressNavKey('?', 'SELECT')).toBe(false)
  })
})
