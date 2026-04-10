<script setup lang="ts">
import { ref, defineEmits } from 'vue'; 

defineProps<{
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'send-key', keySequence: string): void;
}>();

// +++ Add state for modifier keys +++
const isCtrlActive = ref(false);
const isAltActive = ref(false);

// +++ Function to toggle modifier state +++
const toggleModifier = (modifier: 'ctrl' | 'alt') => {
  if (modifier === 'ctrl') {
    isCtrlActive.value = !isCtrlActive.value;
    isAltActive.value = false; // Ctrl and Alt are mutually exclusive
  } else if (modifier === 'alt') {
    isAltActive.value = !isAltActive.value;
    isCtrlActive.value = false; // Ctrl and Alt are mutually exclusive
  }
};

// +++ Modified sendKey function +++
const sendKey = (keyDef: KeyDefinition) => {
  // Handle modifier key clicks
  if (keyDef.type === 'modifier') {
    toggleModifier(keyDef.label.toLowerCase() as 'ctrl' | 'alt');
    return; // Just toggle state, don't emit anything
  }

  // Determine the sequence to send
  let sequence = keyDef.sequence ?? keyDef.label; // Default to label if no sequence (e.g., for 'A')

  if (isCtrlActive.value) {
    // Handle Ctrl combinations (example: convert A-Z to control characters 1-26)
    if (keyDef.type === 'char' && keyDef.label.length === 1 && keyDef.label >= 'A' && keyDef.label <= 'Z') {
      sequence = String.fromCharCode(keyDef.label.charCodeAt(0) - 'A'.charCodeAt(0) + 1);
    } else if (keyDef.label === 'Ctrl+C') { // Keep predefined Ctrl+C
       sequence = '\x03';
    }
    // Add more Ctrl combinations here if needed
    console.log(`[VirtualKeyboard] Sending Ctrl + ${keyDef.label} as ${JSON.stringify(sequence)}`);
  } else if (isAltActive.value) {
    // Handle Alt combinations (typically prefix with ESC)
    sequence = '\x1b' + sequence;
    console.log(`[VirtualKeyboard] Sending Alt + ${keyDef.label} as ${JSON.stringify(sequence)}`);
  } else {
     // Send the standard sequence
     console.log(`[VirtualKeyboard] Sending key: ${JSON.stringify(sequence)}`);
  }

  // Emit the final sequence
  emit('send-key', sequence);

  // Reset modifier state after sending a combined key
  if (isCtrlActive.value || isAltActive.value) {
    isCtrlActive.value = false;
    isAltActive.value = false;
  }
};

// +++ Define key structure +++
interface KeyDefinition {
  label: string;
  sequence?: string; // Sequence if different from label
  type: 'modifier' | 'control' | 'char' | 'navigation' | 'special'; // Key type
}

// 精简为移动端 SSH 常用补充键盘：
// 保留修饰键、方向键、Tab/Esc，以及少量高频控制组合字母。
const keyRows: KeyDefinition[][] = [
  [
    { label: 'Ctrl', type: 'modifier' },
    { label: 'C', type: 'char' },
    { label: '⌫', sequence: '\x7f', type: 'control' },
    { label: 'Alt', type: 'modifier' },
    { label: 'Tab', sequence: '\t', type: 'control' },
    { label: 'Esc', sequence: '\x1b', type: 'control' },
    { label: '↑', sequence: '\x1b[A', type: 'navigation' },
    { label: '↓', sequence: '\x1b[B', type: 'navigation' },
  ],
  [
    { label: '←', sequence: '\x1b[D', type: 'navigation' },
    { label: '→', sequence: '\x1b[C', type: 'navigation' },
    { label: 'A', type: 'char' },
    { label: 'D', type: 'char' },
    { label: 'L', type: 'char' },
    { label: 'R', type: 'char' },
    { label: 'U', type: 'char' },
    { label: 'W', type: 'char' },
    { label: 'Z', type: 'char' },
  ],
];
</script>

<template>
  <div
    class="virtual-keyboard-bar"
    :class="{ 'is-compact': compact }"
    @pointerdown.prevent
    @mousedown.prevent
  >
    <div v-for="(row, rowIndex) in keyRows" :key="rowIndex" class="virtual-keyboard-row">
      <button
        v-for="keyDef in row"
        :key="keyDef.label"
        @pointerdown.prevent.stop="sendKey(keyDef)"
        @mousedown.prevent.stop
        class="virtual-keyboard-key"
        :class="{
          'is-active':
            (keyDef.label === 'Ctrl' && isCtrlActive) ||
            (keyDef.label === 'Alt' && isAltActive)
        }"
        :title="keyDef.label"
      >
        {{ keyDef.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.virtual-keyboard-bar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--surface-card-bg) 92%, transparent);
  border-top: 1px solid var(--surface-card-border);
  backdrop-filter: blur(20px);
  overflow: hidden;
}

.virtual-keyboard-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.virtual-keyboard-key {
  min-width: 34px;
  padding: 6px 10px;
  border-radius: 12px;
  border: 1px solid var(--surface-input-border);
  background: var(--surface-input-bg);
  color: var(--text-color);
  font-size: 12px;
  text-align: center;
  flex: 0 0 auto;
}

.virtual-keyboard-bar.is-compact {
  border-top: 0;
}

.virtual-keyboard-bar.is-compact .virtual-keyboard-key {
  min-width: 32px;
  padding: 5px 8px;
  font-size: 11px;
}

.virtual-keyboard-key.is-active {
  background: var(--button-primary-gradient);
  color: #fff;
  border-color: transparent;
}
</style>
