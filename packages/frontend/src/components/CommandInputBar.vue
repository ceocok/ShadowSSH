<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount, defineExpose, computed, defineOptions } from 'vue'; // Import defineOptions
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '../stores/session.store'; 
import { useFocusSwitcherStore } from '../stores/focusSwitcher.store';
import { useWorkspaceEventEmitter } from '../composables/workspaceEvents';


defineOptions({ inheritAttrs: false });

const emitWorkspaceEvent = useWorkspaceEventEmitter(); // +++ 获取事件发射器 +++
const emit = defineEmits(['toggle-virtual-keyboard']);

const { t } = useI18n();
const focusSwitcherStore = useFocusSwitcherStore();
const sessionStore = useSessionStore(); // +++ 初始化 Session Store +++
// +++ Get active session ID from session store +++
const { activeSessionId } = storeToRefs(sessionStore);
const { updateSessionCommandInput } = sessionStore;

// Props definition is now empty as search results are no longer handled here
const props = defineProps<{
  // No props defined here currently
  isMobile?: boolean;
  isVirtualKeyboardVisible?: boolean; // +++ Add prop to receive state +++
}>();
// --- 移除本地 commandInput ref ---
// const commandInput = ref('');
const isSearching = ref(false);
const searchTerm = ref('');
// *** 移除本地的搜索结果 ref ***
// const searchResultCount = ref(0);
// const currentSearchResultIndex = ref(0);

// +++ 计算属性，用于获取和设置当前活动会话的命令输入 +++
const currentSessionCommandInput = computed({
  get: () => {
    if (!activeSessionId.value) return '';
    const session = sessionStore.sessions.get(activeSessionId.value);
    return session ? session.commandInputContent.value : '';
  },
  set: (newValue) => {
    if (activeSessionId.value) {
      updateSessionCommandInput(activeSessionId.value, newValue);
    }
  }
});

const hasActiveSession = computed(() => !!activeSessionId.value);
const currentSessionName = computed(() => {
  if (!activeSessionId.value) {
    return '未连接会话';
  }

  return sessionStore.sessions.get(activeSessionId.value)?.connectionName ?? '未连接会话';
});

const sendCommand = () => {
  const command = currentSessionCommandInput.value; // 使用计算属性获取值
  console.log(`[CommandInputBar] Sending command: ${command || '<Enter>'} `);
  emitWorkspaceEvent('terminal:sendCommand', { command });

  // 如果是空回车，并且有活动会话，则请求滚动到底部
  if (command.trim() === '' && activeSessionId.value) {
    console.log(`[CommandInputBar] Empty Enter detected. Requesting scroll to bottom for session: ${activeSessionId.value}`);
    emitWorkspaceEvent('terminal:scrollToBottomRequest', { sessionId: activeSessionId.value });
  }

  // 清空 store 中的值
  if (activeSessionId.value) {
    updateSessionCommandInput(activeSessionId.value, '');
  }
};

const toggleSearch = () => {
  isSearching.value = !isSearching.value;
  if (!isSearching.value) {
    searchTerm.value = ''; // 关闭搜索时清空
    emitWorkspaceEvent('search:close'); // 通知父组件关闭搜索
  } else {
    // 可以在这里聚焦搜索输入框
    // nextTick(() => searchInputRef.value?.focus());
  }
};

const performSearch = () => {
  emitWorkspaceEvent('search:start', { term: searchTerm.value });
  // 实际的计数更新逻辑应该由父组件通过 props 或事件传递回来
};

const findNext = () => {
  emitWorkspaceEvent('search:findNext');
};

const findPrevious = () => {
  emitWorkspaceEvent('search:findPrevious');
};

// 监听搜索词变化，执行搜索
watch(searchTerm, (newValue) => {
  if (isSearching.value) {
    performSearch();
  }
});

// 可以在这里添加一个 ref 用于聚焦搜索框
const searchInputRef = ref<HTMLInputElement | null>(null);
const commandInputRef = ref<HTMLInputElement | null>(null); // Ref for command input

// Removed debug computed property

const handleCommandInputKeydown = (event: KeyboardEvent) => {
  if (event.ctrlKey && event.key === 'f') {
    event.preventDefault(); // 阻止浏览器默认的查找行为
    isSearching.value = true;
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  } else if (event.key === 'ArrowUp') {
    return;
  } else if (event.key === 'ArrowDown') {
    return;
  } else if (event.ctrlKey && event.key === 'c' && currentSessionCommandInput.value === '') { // 检查计算属性的值
    // Handle Ctrl+C when input is empty
    event.preventDefault();
    console.log('[CommandInputBar] Ctrl+C detected with empty input. Sending SIGINT.');
    emitWorkspaceEvent('terminal:sendCommand', { command: '\x03' }); // Send ETX character (Ctrl+C)
  } else if (!event.altKey && event.key === 'Enter') {
     // Handle regular Enter key press - send current input (empty or not)
     event.preventDefault(); // Prevent default if needed, e.g., form submission
     sendCommand(); // Call the existing sendCommand function
 }
};

//  Handle blur event on command input
const handleCommandInputBlur = () => {
    return;
};

// +++ 监听 Store 中的触发器以激活终端搜索 +++
watch(() => focusSwitcherStore.activateTerminalSearchTrigger, () => {
    if (focusSwitcherStore.activateTerminalSearchTrigger > 0 && !isSearching.value) {
        console.log('[CommandInputBar] Received terminal search activation trigger from store.');
        toggleSearch(); // 调用组件内部的切换搜索方法来激活
    }
});

// --- Focus Actions ---
const focusCommandInput = (): boolean => {
  if (commandInputRef.value) {
    commandInputRef.value.focus();
    return true;
  }
  return false;
};

const focusSearchInput = (): boolean => {
  if (!isSearching.value) {
    // If search is not active, activate it first
    toggleSearch(); // This might need nextTick if toggleSearch is async
    nextTick(() => { // Ensure DOM is updated after toggleSearch
        if (searchInputRef.value) {
            searchInputRef.value.focus();
        }
    });
    // Since focusing might be async after toggle, we optimistically return true
    // or adjust based on toggleSearch's behavior. For simplicity, assume it works.
    return true;
  } else if (searchInputRef.value) {
    searchInputRef.value.focus();
    return true;
  }
  return false;
};

defineExpose({ focusCommandInput, focusSearchInput });

// --- Register/Unregister Focus Actions ---
let unregisterCommandInputFocus: (() => void) | null = null;
let unregisterTerminalSearchFocus: (() => void) | null = null;

onMounted(() => {
  unregisterCommandInputFocus = focusSwitcherStore.registerFocusAction('commandInput', focusCommandInput);
  unregisterTerminalSearchFocus = focusSwitcherStore.registerFocusAction('terminalSearch', focusSearchInput);
});

onBeforeUnmount(() => {
  if (unregisterCommandInputFocus) {
    unregisterCommandInputFocus();
  }
  if (unregisterTerminalSearchFocus) {
    unregisterTerminalSearchFocus();
  }
});

</script>

<template>
  <div :class="$attrs.class" class="command-shell">
    <div class="command-shell__status">
      <button
        type="button"
        class="command-shell__clear"
        :disabled="!hasActiveSession"
        :title="t('commandInputBar.clearTerminal', '清空终端')"
        @click="emitWorkspaceEvent('terminal:clear')"
      >
        <i class="fas fa-eraser"></i>
      </button>
    </div>

    <div class="command-shell__input">
      <input
        type="text"
        v-model="currentSessionCommandInput"
        :placeholder="t('commandInputBar.placeholder')"
        :disabled="!hasActiveSession"
        class="command-shell__field"
        ref="commandInputRef"
        data-focus-id="commandInput"
        @keydown="handleCommandInputKeydown"
        @blur="handleCommandInputBlur"
      />
    </div>

    <button
      v-if="props.isMobile"
      @click="emit('toggle-virtual-keyboard')"
      class="command-shell__icon"
      :title="props.isVirtualKeyboardVisible ? t('commandInputBar.hideKeyboard', '隐藏虚拟键盘') : t('commandInputBar.showKeyboard', '显示虚拟键盘')"
    >
      <i class="fas fa-keyboard" :class="{ 'opacity-60': !props.isVirtualKeyboardVisible }"></i>
    </button>

    <button
      class="command-shell__send"
      type="button"
      :disabled="!hasActiveSession"
      @click="sendCommand"
    >
      <span>发送</span>
      <i class="fas fa-arrow-up"></i>
    </button>
  </div>
</template>

<style scoped>
.command-shell {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--surface-card-border);
  border-radius: 24px;
  background: var(--surface-card-bg);
  box-shadow: var(--surface-card-shadow);
  backdrop-filter: blur(20px);
}

.command-shell__status {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 0 2px 0 0;
}

.command-shell__input {
  min-width: 0;
}

.command-shell__field {
  width: 100%;
  min-width: 0;
  height: 44px;
  box-sizing: border-box;
  padding: 0 16px;
  border: 1px solid var(--surface-input-border);
  border-radius: 18px;
  background: var(--surface-input-bg);
  color: var(--text-color);
  font-size: 14px;
  line-height: 1.2;
  box-shadow: inset 0 1px 1px var(--surface-input-highlight);
}

.command-shell__field:disabled {
  background: var(--surface-soft-bg);
  color: var(--text-color-secondary);
  cursor: not-allowed;
}

.command-shell__icon,
.command-shell__clear,
.command-shell__send {
  border: 0;
  border-radius: 18px;
  transition: transform 0.18s ease, opacity 0.18s ease, background-color 0.18s ease;
}

.command-shell__icon,
.command-shell__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: var(--surface-soft-bg);
  color: var(--text-color-secondary);
}

.command-shell__icon i {
  color: inherit;
  font-size: 16px;
}

.command-shell__clear i {
  color: inherit;
  font-size: 15px;
}

.command-shell__send {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 16px;
  background: var(--button-primary-gradient);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  box-shadow: var(--button-primary-shadow);
}

.command-shell__send i {
  color: inherit;
  font-size: 12px;
}

.command-shell__icon:hover,
.command-shell__send:hover:not(:disabled) {
  transform: translateY(-1px);
}

.command-shell__clear:disabled,
.command-shell__send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

@media (max-width: 960px) {
  .command-shell {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }

  .command-shell__status {
    display: none;
  }
}
</style>
