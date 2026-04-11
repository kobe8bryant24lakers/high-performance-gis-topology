<template>
  <Teleport to="body">
    <div v-if="visible" class="help-overlay" @click.self="$emit('close')">
      <div class="help-dialog">
        <div class="help-header">
          <h3>Keyboard Shortcuts</h3>
          <button class="help-close" @click="$emit('close')">&times;</button>
        </div>
        <table class="help-table">
          <tbody>
            <tr v-for="shortcut in shortcuts" :key="shortcut.key">
              <td class="help-key">
                <kbd v-if="shortcut.ctrl">Ctrl+</kbd>
                <kbd v-if="shortcut.shift">Shift+</kbd>
                <kbd>{{ displayKey(shortcut.key) }}</kbd>
              </td>
              <td class="help-desc">{{ shortcut.label }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { ShortcutDefinition } from '@/composables/use-keyboard-shortcuts'

defineProps<{
  visible: boolean
  shortcuts: ShortcutDefinition[]
}>()

defineEmits<{
  close: []
}>()

function displayKey(key: string): string {
  const map: Record<string, string> = {
    Escape: 'Esc',
    Backspace: '\u232B',
    Tab: 'Tab',
    '/': '/',
    '?': '?',
  }
  return map[key] ?? key
}
</script>

<style scoped>
.help-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.help-dialog {
  background: #1e1e2e;
  border: 1px solid #45475a;
  border-radius: 8px;
  padding: 24px;
  min-width: 320px;
  max-width: 480px;
  color: #cdd6f4;
}

.help-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.help-header h3 {
  margin: 0;
  font-size: 16px;
}

.help-close {
  background: none;
  border: none;
  color: #cdd6f4;
  font-size: 20px;
  cursor: pointer;
}

.help-table {
  width: 100%;
  border-collapse: collapse;
}

.help-table tr {
  border-bottom: 1px solid #313244;
}

.help-table td {
  padding: 8px 4px;
  font-size: 13px;
}

.help-key {
  white-space: nowrap;
  width: 100px;
}

kbd {
  display: inline-block;
  padding: 2px 6px;
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 3px;
  font-family: monospace;
  font-size: 12px;
}

.help-desc {
  color: #a6adc8;
}
</style>
