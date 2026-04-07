import { onMounted, onUnmounted, ref } from 'vue'
import { telemetry } from '@/utils/telemetry'

/** Keys that conflict with standard browser/accessibility behavior */
const NAVIGATION_KEYS = new Set(['Tab', 'Backspace'])

/** Elements where navigation keys should not be intercepted */
const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'SELECT', 'DETAILS', 'SUMMARY'])

export interface ShortcutDefinition {
  key: string
  ctrl?: boolean
  shift?: boolean
  label: string
  handler: () => void
}

/**
 * Returns true if a navigation key (Tab, Backspace) should NOT be intercepted
 * because the target is an interactive element where the key has standard behavior.
 */
export function shouldSuppressNavKey(key: string, targetTagName: string): boolean {
  return NAVIGATION_KEYS.has(key) && INTERACTIVE_TAGS.has(targetTagName)
}

export function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutDefinition): boolean {
  if (event.key !== shortcut.key) return false
  if (shortcut.ctrl && !(event.ctrlKey || event.metaKey)) return false
  if (!shortcut.ctrl && (event.ctrlKey || event.metaKey)) return false
  if (shortcut.shift && !event.shiftKey) return false
  if (!shortcut.shift && event.shiftKey) return false
  return true
}

export function buildShortcutRegistry(definitions: ShortcutDefinition[]): ShortcutDefinition[] {
  return [...definitions]
}

export function useKeyboardShortcuts(definitions: ShortcutDefinition[]) {
  const showHelp = ref(false)
  const registry = buildShortcutRegistry(definitions)

  function handleKeydown(event: KeyboardEvent) {
    // Ignore shortcuts when typing in input/textarea
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Allow Escape to blur inputs
      if (event.key === 'Escape') {
        target.blur()
        return
      }
      return
    }

    for (const shortcut of registry) {
      if (matchesShortcut(event, shortcut)) {
        // Don't intercept Tab/Backspace when focus is on interactive elements
        // to preserve standard accessibility navigation
        if (shouldSuppressNavKey(shortcut.key, target.tagName)) {
          return
        }
        event.preventDefault()
        shortcut.handler()
        telemetry.emit('keyboard_shortcut', 1)
        return
      }
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })

  return { showHelp, registry }
}
