import { onMounted, onUnmounted, ref } from 'vue'
import { telemetry } from '@/utils/telemetry'

export interface ShortcutDefinition {
  key: string
  ctrl?: boolean
  shift?: boolean
  label: string
  handler: () => void
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
