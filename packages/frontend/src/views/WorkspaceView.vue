<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import type { Terminal as XtermTerminal } from 'xterm';
import { useI18n } from 'vue-i18n';
import { useDeviceDetection } from '../composables/useDeviceDetection';
import { useConnectionsStore, type ConnectionInfo } from '../stores/connections.store';
import { useSessionStore } from '../stores/session.store';
import { useAuthStore } from '../stores/auth.store';
import { useSettingsStore } from '../stores/settings.store';
import type { SessionTabInfoWithStatus, SshTerminalInstance } from '../stores/session/types';
import type { WebSocketDependencies } from '../composables/useSftpActions';
import { useUiNotificationsStore } from '../stores/uiNotifications.store';
import { useWorkspaceEventSubscriber, useWorkspaceEventOff } from '../composables/workspaceEvents';
import { isIpLiteral, normalizeConnectionHost } from '../utils/network';
import StatusMonitor from '../components/StatusMonitor.vue';
import Terminal from '../components/Terminal.vue';
import FileManager from '../components/FileManager.vue';
import CommandInputBar from '../components/CommandInputBar.vue';
import VirtualKeyboard from '../components/VirtualKeyboard.vue';

const LAST_CONNECTED_SSH_KEY = 'shadowssh:last-connected-ssh-connection-id';

const router = useRouter();
const { locale } = useI18n();
const connectionsStore = useConnectionsStore();
const sessionStore = useSessionStore();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const uiNotificationsStore = useUiNotificationsStore();
const { isMobile } = useDeviceDetection();

const { connections, isLoading: isLoadingConnections } = storeToRefs(connectionsStore);
const { sessions, sessionTabsWithStatus, activeSessionId, activeSession } = storeToRefs(sessionStore);

const subscribeToWorkspaceEvents = useWorkspaceEventSubscriber();
const unsubscribeFromWorkspaceEvents = useWorkspaceEventOff();

const showServerPicker = ref(false);
const activeServerPickerPlacement = ref<'tabbar' | 'footer' | null>(null);
const serverPickerFooterRef = ref<HTMLElement | null>(null);
const serverPickerTabbarRef = ref<HTMLElement | null>(null);
const connectionPanelRef = ref<HTMLElement | null>(null);
const settingsPanelRef = ref<HTMLElement | null>(null);
const isVirtualKeyboardVisible = ref(false);
const hasAttemptedAutoConnect = ref(false);
const toolbarUploadInputRef = ref<HTMLInputElement | null>(null);
const keyUploadInputRef = ref<HTMLInputElement | null>(null);
const fileManagerComponentRefs = new Map<string, any>();
const activeFileManagerComponentRef = ref<any | null>(null);
const terminalStageRef = ref<HTMLElement | null>(null);
const virtualKeyboardWrapperRef = ref<HTMLElement | null>(null);
const showConnectionPanel = ref(false);
const showSettingsPanel = ref(false);
const editingConnectionId = ref<number | null>(null);
const connectionForm = ref({
  name: '',
  host: '',
  port: 22,
  username: 'root',
  auth_method: 'password' as 'password' | 'key',
  password: '',
  private_key: '',
});
const connectionFormLoading = ref(false);
const connectionFormMessage = ref('');
const connectionFormSuccess = ref(false);
const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});
const passwordFormLoading = ref(false);
const passwordFormMessage = ref('');
const passwordFormSuccess = ref(false);
const isStatusPanelCollapsed = ref(false);
const isFilesPanelCollapsed = ref(false);
const visualViewportHeight = ref<number | null>(null);
const visualViewportOffsetTop = ref(0);
const keyboardOpen = ref(false);
const baseViewportHeight = ref<number | null>(null);
const keyboardShift = ref(0);
const virtualKeyboardHeight = ref(0);
const virtualKeyboardTopOverride = ref<number | null>(null);
const virtualKeyboardPinnedToKeyboard = ref(true);
const isDraggingVirtualKeyboard = ref(false);
const dragStartPointerY = ref(0);
const dragStartKeyboardTop = ref(0);

const sshConnections = computed(() => {
  return [...connections.value]
    .filter(connection => connection.type === 'SSH')
    .sort((left, right) => {
      const lastLeft = left.last_connected_at ?? 0;
      const lastRight = right.last_connected_at ?? 0;
      if (lastRight !== lastLeft) {
        return lastRight - lastLeft;
      }
      return (left.name || left.host).localeCompare(right.name || right.host);
    });
});

const activeConnection = computed(() => {
  const currentSession = activeSession.value;
  if (!currentSession) return null;
  return connections.value.find(connection => connection.id === Number(currentSession.connectionId)) ?? null;
});

const activeSessionStatus = computed(() => {
  return sessionTabsWithStatus.value.find(tab => tab.sessionId === activeSessionId.value)?.status ?? 'disconnected';
});

const activeConnectionIp = computed(() => {
  const session = activeSession.value;
  const resolvedTargetIp = session?.resolvedTargetIp ?? null;
  const statusIp = session?.statusMonitorManager?.serverStatus?.value?.serverIp;
  const configuredHost = activeConnection.value?.host || null;
  if (isIpLiteral(configuredHost)) {
    return configuredHost;
  }
  return resolvedTargetIp || statusIp || configuredHost;
});

const activeConnectionSummaryHost = computed(() => {
  return activeConnectionIp.value || activeConnection.value?.host || null;
});

const fileManagerEntries = computed(() => {
  return sessionTabsWithStatus.value
    .map(tab => {
      const session = sessions.value.get(tab.sessionId);
      if (!session) return null;
      const wsDeps: WebSocketDependencies = {
        sendMessage: session.wsManager.sendMessage,
        onMessage: session.wsManager.onMessage,
        isConnected: session.wsManager.isConnected,
        isSftpReady: session.wsManager.isSftpReady,
      };

      return {
        sessionId: tab.sessionId,
        instanceId: `workspace-file-manager-${tab.sessionId}`,
        dbConnectionId: session.connectionId,
        wsDeps,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
});

const activeFileManagerEntry = computed(() => {
  return fileManagerEntries.value.find(entry => entry.sessionId === activeSessionId.value) ?? null;
});

const hasActiveWorkspaceSession = computed(() => sessionTabsWithStatus.value.length > 0);

const shellStyle = computed(() => {
  if (!isMobile.value || !baseViewportHeight.value) {
    return undefined;
  }

  return {
    height: `${baseViewportHeight.value}px`,
  };
});

const bodyStyle = computed(() => {
  if (!isMobile.value || keyboardShift.value <= 0) {
    return undefined;
  }

  return {
    transform: `translateY(-${keyboardShift.value}px)`,
  };
});

const keyboardInset = computed(() => {
  if (!isMobile.value || !keyboardOpen.value || !baseViewportHeight.value || !visualViewportHeight.value) {
    return 0;
  }

  return Math.max(0, baseViewportHeight.value - visualViewportHeight.value);
});

const FLOATING_KEYBOARD_EDGE_GAP = 8;
const FLOATING_KEYBOARD_KEYBOARD_GAP = 2;

const getVirtualKeyboardBounds = () => {
  const viewportTop = visualViewportOffsetTop.value;
  const viewportHeight = visualViewportHeight.value ?? window.innerHeight;
  const minTop = Math.max(FLOATING_KEYBOARD_EDGE_GAP, Math.round(viewportTop + FLOATING_KEYBOARD_EDGE_GAP));
  const maxTop = Math.max(
    minTop,
    Math.round(viewportTop + viewportHeight - virtualKeyboardHeight.value - FLOATING_KEYBOARD_KEYBOARD_GAP),
  );
  return { minTop, maxTop };
};

const virtualKeyboardStyle = computed(() => {
  if (!isMobile.value || !isVirtualKeyboardVisible.value) {
    return undefined;
  }

  const { minTop, maxTop } = getVirtualKeyboardBounds();
  const defaultTop = maxTop;
  const resolvedTop = virtualKeyboardPinnedToKeyboard.value || virtualKeyboardTopOverride.value === null
    ? defaultTop
    : Math.min(maxTop, Math.max(minTop, virtualKeyboardTopOverride.value));

  return {
    top: `${resolvedTop}px`,
  };
});

const setFileManagerRef = (sessionId: string, instance: any | null) => {
  if (instance) {
    fileManagerComponentRefs.set(sessionId, instance);
    if (sessionId === activeSessionId.value) {
      activeFileManagerComponentRef.value = instance;
    }
  } else {
    fileManagerComponentRefs.delete(sessionId);
    if (sessionId === activeSessionId.value) {
      activeFileManagerComponentRef.value = null;
    }
  }
};

const getActiveFileManagerRef = () => {
  return activeFileManagerComponentRef.value;
};

const triggerActiveFileUpload = () => {
  toolbarUploadInputRef.value?.click();
};

const triggerActiveNewFolder = () => {
  getActiveFileManagerRef()?.handleNewFolderContextMenuClick?.();
};

const triggerActiveNewFile = () => {
  getActiveFileManagerRef()?.handleNewFileContextMenuClick?.();
};

const handleToolbarFileUpload = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) {
    return;
  }

  getActiveFileManagerRef()?.uploadFiles?.(Array.from(input.files));
  input.value = '';
};

const getWsUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/`;
};

const reconnectSession = (sessionId: string) => {
  const session = sessions.value.get(sessionId);
  if (!session) {
    return;
  }

  sessionStore.activateSession(sessionId);
  session.wsManager.markReconnectInProgress?.();
  session.wsManager.disconnect();
  window.setTimeout(() => {
    session.wsManager.connect(getWsUrl());
  }, 60);
};

const getAutoConnectCandidate = () => {
  const storedId = typeof window !== 'undefined'
    ? Number(window.localStorage.getItem(LAST_CONNECTED_SSH_KEY) ?? '')
    : NaN;

  if (Number.isFinite(storedId)) {
    const storedConnection = sshConnections.value.find(connection => connection.id === storedId);
    if (storedConnection) {
      return storedConnection;
    }
  }

  return sshConnections.value[0] ?? null;
};

const attemptAutoConnect = () => {
  if (hasAttemptedAutoConnect.value || sessionTabsWithStatus.value.length > 0) {
    return;
  }

  hasAttemptedAutoConnect.value = true;
  const { connectionIds: persistedConnectionIds, activeConnectionId, manualCloseAll } = sessionStore.getPersistedOpenConnections();

  if (manualCloseAll && persistedConnectionIds.length === 0) {
    return;
  }

  if (persistedConnectionIds.length > 0) {
    persistedConnectionIds.forEach(connectionId => {
      const connection = sshConnections.value.find(item => String(item.id) === String(connectionId));
      if (connection) {
        sessionStore.openNewSession(connection.id);
      }
    });

    if (activeConnectionId) {
      const targetSession = Array.from(sessions.value.values()).find(session => session.connectionId === String(activeConnectionId));
      if (targetSession) {
        sessionStore.activateSession(targetSession.sessionId);
      }
    }
    return;
  }

  const connection = getAutoConnectCandidate();

  if (!connection) {
    return;
  }

  const result = sessionStore.handleConnectRequest(connection);
  if (result && result.opened === false && result.message) {
    uiNotificationsStore.showError(result.message);
  }
};

const closeServerPicker = () => {
  showServerPicker.value = false;
  activeServerPickerPlacement.value = null;
};

const resetConnectionFormFeedback = () => {
  connectionFormMessage.value = '';
  connectionFormSuccess.value = false;
};

const resetConnectionForm = () => {
  editingConnectionId.value = null;
  connectionForm.value = {
    name: '',
    host: '',
    port: 22,
    username: 'root',
    auth_method: 'password',
    password: '',
    private_key: '',
  };
  resetConnectionFormFeedback();
};

const resetPasswordFormFeedback = () => {
  passwordFormMessage.value = '';
  passwordFormSuccess.value = false;
};

const closeConnectionPanel = () => {
  showConnectionPanel.value = false;
  resetConnectionForm();
};

const closeSettingsPanel = () => {
  showSettingsPanel.value = false;
  resetPasswordFormFeedback();
};

const toggleServerPicker = (placement: 'tabbar' | 'footer') => {
  closeConnectionPanel();
  closeSettingsPanel();
  if (showServerPicker.value && activeServerPickerPlacement.value === placement) {
    closeServerPicker();
    return;
  }

  activeServerPickerPlacement.value = placement;
  showServerPicker.value = true;
};

const toggleConnectionPanel = async () => {
  closeServerPicker();
  closeSettingsPanel();
  showConnectionPanel.value = !showConnectionPanel.value;
  resetConnectionFormFeedback();
};

const toggleSettingsPanel = () => {
  closeServerPicker();
  closeConnectionPanel();
  showSettingsPanel.value = !showSettingsPanel.value;
  resetPasswordFormFeedback();
};

const handleDocumentClick = (event: MouseEvent) => {
  if (!showServerPicker.value) {
    if (showConnectionPanel.value && connectionPanelRef.value && !connectionPanelRef.value.contains(event.target as Node)) {
      closeConnectionPanel();
    }
    if (showSettingsPanel.value && settingsPanelRef.value && !settingsPanelRef.value.contains(event.target as Node)) {
      closeSettingsPanel();
    }
    return;
  }

  const activePickerRef = activeServerPickerPlacement.value === 'tabbar'
    ? serverPickerTabbarRef.value
    : serverPickerFooterRef.value;

  if (!activePickerRef) {
    closeServerPicker();
    return;
  }

  if (!activePickerRef.contains(event.target as Node)) {
    closeServerPicker();
  }

  if (showConnectionPanel.value && connectionPanelRef.value && !connectionPanelRef.value.contains(event.target as Node)) {
    closeConnectionPanel();
  }
  if (showSettingsPanel.value && settingsPanelRef.value && !settingsPanelRef.value.contains(event.target as Node)) {
    closeSettingsPanel();
  }
};

const connectToServer = (connection: ConnectionInfo) => {
  closeServerPicker();
  const result = sessionStore.handleConnectRequest(connection);
  if (result && result.opened === false && result.message) {
    uiNotificationsStore.showError(result.message);
  }
};

const copyActiveConnectionIp = async () => {
  if (!activeConnectionIp.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(activeConnectionIp.value);
    uiNotificationsStore.showSuccess('IP 已复制');
  } catch (error) {
    console.error('[WorkspaceView] 复制 IP 失败:', error);
    uiNotificationsStore.showError('复制 IP 失败');
  }
};

const toggleLanguage = async () => {
  const nextLocale = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN';
  locale.value = nextLocale;
  await settingsStore.updateMultipleSettings({ language: nextLocale });
};

const submitConnectionForm = async () => {
  resetConnectionFormFeedback();

  if (!connectionForm.value.host.trim() || !connectionForm.value.username.trim()) {
    connectionFormMessage.value = '请填写 IP/域名 和 用户。';
    return;
  }

  if (connectionForm.value.port < 1 || connectionForm.value.port > 65535) {
    connectionFormMessage.value = '端口必须在 1 到 65535 之间。';
    return;
  }

  if (!editingConnectionId.value && connectionForm.value.auth_method === 'password' && !connectionForm.value.password) {
    connectionFormMessage.value = '请输入密码。';
    return;
  }

  if (!editingConnectionId.value && connectionForm.value.auth_method === 'key' && !connectionForm.value.private_key.trim()) {
    connectionFormMessage.value = '请上传或粘贴 SSH 密钥。';
    return;
  }

  connectionFormLoading.value = true;
  try {
    const normalizedHost = normalizeConnectionHost(connectionForm.value.host);
    const payload = {
      name: connectionForm.value.name.trim() || `${connectionForm.value.username.trim()}@${normalizedHost}`,
      type: 'SSH' as const,
      host: normalizedHost,
      port: connectionForm.value.port,
      username: connectionForm.value.username.trim(),
      auth_method: connectionForm.value.auth_method,
      password: connectionForm.value.auth_method === 'password' && connectionForm.value.password ? connectionForm.value.password : undefined,
      private_key: connectionForm.value.auth_method === 'key' && connectionForm.value.private_key.trim() ? connectionForm.value.private_key : undefined,
    };

    const success = editingConnectionId.value
      ? await connectionsStore.updateConnection(editingConnectionId.value, payload)
      : await connectionsStore.addConnection(payload);

    if (!success) {
      throw new Error(connectionsStore.error || '保存连接失败。');
    }

    const wasEditing = editingConnectionId.value !== null;
    connectionFormSuccess.value = true;
    connectionFormMessage.value = wasEditing ? '连接已更新。' : '连接已保存。';
    window.setTimeout(() => {
      closeConnectionPanel();
    }, 420);
  } catch (error: any) {
    connectionFormSuccess.value = false;
    connectionFormMessage.value = error.message || '保存连接失败。';
  } finally {
    connectionFormLoading.value = false;
  }
};

const startEditConnection = (connection: ConnectionInfo) => {
  closeServerPicker();
  editingConnectionId.value = connection.id;
  connectionForm.value = {
    name: connection.name || '',
    host: normalizeConnectionHost(connection.host),
    port: connection.port,
    username: connection.username || 'root',
    auth_method: connection.auth_method || 'password',
    password: '',
    private_key: '',
  };
  resetConnectionFormFeedback();
  showConnectionPanel.value = true;
};

const deleteManagedConnection = async (connection: ConnectionInfo) => {
  const success = await connectionsStore.deleteConnection(connection.id);
  if (!success) {
    connectionFormSuccess.value = false;
    connectionFormMessage.value = connectionsStore.error || '删除连接失败。';
    return;
  }

  if (editingConnectionId.value === connection.id) {
    resetConnectionForm();
  }
  connectionFormSuccess.value = true;
  connectionFormMessage.value = '连接已删除。';
};

const triggerKeyUpload = () => {
  keyUploadInputRef.value?.click();
};

const handleKeyUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  try {
    connectionForm.value.private_key = await file.text();
    connectionFormMessage.value = `已载入密钥：${file.name}`;
    connectionFormSuccess.value = true;
  } catch (error: any) {
    connectionFormMessage.value = error.message || '读取密钥文件失败。';
    connectionFormSuccess.value = false;
  } finally {
    input.value = '';
  }
};

const submitPasswordForm = async () => {
  resetPasswordFormFeedback();

  if (!passwordForm.value.currentPassword || !passwordForm.value.newPassword) {
    passwordFormMessage.value = '请完整填写当前密码和新密码。';
    return;
  }

  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    passwordFormMessage.value = '两次输入的新密码不一致。';
    return;
  }

  passwordFormLoading.value = true;
  try {
    await authStore.changePassword(passwordForm.value.currentPassword, passwordForm.value.newPassword);
    passwordFormSuccess.value = true;
    passwordFormMessage.value = '密码已更新。';
    passwordForm.value = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    };
    window.setTimeout(() => {
      closeSettingsPanel();
    }, 420);
  } catch (error: any) {
    passwordFormSuccess.value = false;
    passwordFormMessage.value = error.message || '修改密码失败。';
  } finally {
    passwordFormLoading.value = false;
  }
};

const handleGlobalKeyDown = (event: KeyboardEvent) => {
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();

    const tabs = sessionTabsWithStatus.value;
    const currentId = activeSessionId.value;

    if (!tabs.length || !currentId) {
      return;
    }

    const currentIndex = tabs.findIndex(tab => tab.sessionId === currentId);
    if (currentIndex === -1) {
      return;
    }

    const nextIndex = event.key === 'ArrowDown'
      ? (currentIndex + 1) % tabs.length
      : (currentIndex - 1 + tabs.length) % tabs.length;

    const nextSessionId = tabs[nextIndex]?.sessionId;
    if (nextSessionId) {
      sessionStore.activateSession(nextSessionId);
    }
  }
};

const handleSendCommand = (command: string, targetSessionId?: string) => {
  const sessionToCommand = targetSessionId
    ? sessions.value.get(targetSessionId) ?? null
    : activeSession.value;

  if (!sessionToCommand) {
    return;
  }

  const terminalManager = sessionToCommand.terminalManager as SshTerminalInstance | undefined;
  if (!terminalManager) {
    return;
  }

  if (terminalManager.isSshConnected && !terminalManager.isSshConnected.value && command.trim() === '') {
    const connectionInfo = connections.value.find(connection => connection.id === Number(sessionToCommand.connectionId));
    if (connectionInfo) {
      const result = sessionStore.handleConnectRequest(connectionInfo);
      if (result && result.opened === false && result.message) {
        uiNotificationsStore.showError(result.message);
      }
    }
    return;
  }

  if (typeof terminalManager.sendData === 'function') {
    const commandToSend = command.trim();
    const dataToSend = command === '\x03' ? command : `${command}\r`;
    terminalManager.sendData(dataToSend);

  }
};

const handleSendCommandEvent = (payload: { command: string; sessionId?: string }) => {
  handleSendCommand(payload.command, payload.sessionId);
};

const handleTerminalInput = (payload: { sessionId: string; data: string }) => {
  const session = sessions.value.get(payload.sessionId);
  const manager = session?.terminalManager as SshTerminalInstance | undefined;
  if (!session || !manager) {
    return;
  }

  if (payload.data === '\r' && manager.isSshConnected && !manager.isSshConnected.value) {
    const connectionInfo = connections.value.find(connection => connection.id === Number(session.connectionId));
    if (connectionInfo) {
      const result = sessionStore.handleConnectRequest(connectionInfo);
      if (result && result.opened === false && result.message) {
        uiNotificationsStore.showError(result.message);
      }
    }
    return;
  }

  manager.handleTerminalData(payload.data);
};

const handleTerminalResize = (payload: { sessionId: string; dims: { cols: number; rows: number } }) => {
  sessions.value.get(payload.sessionId)?.terminalManager.handleTerminalResize(payload.dims);
};

const handleTerminalReady = (payload: { sessionId: string; terminal: XtermTerminal; searchAddon: any | null }) => {
  sessions.value.get(payload.sessionId)?.terminalManager.handleTerminalReady(payload);
};

const handleClearTerminal = () => {
  const terminalManager = activeSession.value?.terminalManager as SshTerminalInstance | undefined;
  if (terminalManager?.terminalInstance?.value && typeof terminalManager.terminalInstance.value.clear === 'function') {
    terminalManager.terminalInstance.value.clear();
  }
};

const handleScrollToBottomRequest = (payload: { sessionId: string }) => {
  const terminalManager = sessions.value.get(payload.sessionId)?.terminalManager as SshTerminalInstance | undefined;
  terminalManager?.terminalInstance?.value?.scrollToBottom();
};

const handleVirtualKeyPress = (keySequence: string) => {
  const terminalManager = activeSession.value?.terminalManager as SshTerminalInstance | undefined;
  if (terminalManager && typeof terminalManager.sendData === 'function') {
    terminalManager.sendData(keySequence);
  }
};

const refreshActiveServerStatus = () => {
  const statusMonitorManager = activeSession.value?.statusMonitorManager;
  statusMonitorManager?.requestImmediateRefresh?.();
};

const toggleVirtualKeyboard = () => {
  if (isMobile.value && keyboardOpen.value) {
    return;
  }
  isVirtualKeyboardVisible.value = !isVirtualKeyboardVisible.value;
};

const collapseMobilePanelsIfNeeded = () => {
  if (!isMobile.value) {
    isStatusPanelCollapsed.value = false;
    isFilesPanelCollapsed.value = false;
    return;
  }

  if (hasActiveWorkspaceSession.value) {
    isStatusPanelCollapsed.value = true;
    isFilesPanelCollapsed.value = true;
  }
};

const toggleStatusPanelCollapsed = () => {
  if (!isMobile.value) return;
  isStatusPanelCollapsed.value = !isStatusPanelCollapsed.value;
};

const toggleFilesPanelCollapsed = () => {
  if (!isMobile.value) return;
  isFilesPanelCollapsed.value = !isFilesPanelCollapsed.value;
};

const syncVisualViewport = () => {
  if (!isMobile.value) {
    visualViewportHeight.value = null;
    visualViewportOffsetTop.value = 0;
    keyboardOpen.value = false;
    keyboardShift.value = 0;
    return;
  }

  const height = window.visualViewport
    ? Math.round(window.visualViewport.height)
    : window.innerHeight;

  if (!baseViewportHeight.value || height > baseViewportHeight.value) {
    baseViewportHeight.value = height;
  }

  if (window.visualViewport) {
    visualViewportHeight.value = height;
    visualViewportOffsetTop.value = Math.round(window.visualViewport.offsetTop);
  } else {
    visualViewportHeight.value = height;
    visualViewportOffsetTop.value = 0;
  }

  keyboardOpen.value = !!baseViewportHeight.value && height < baseViewportHeight.value - 120;
};

const syncVirtualKeyboardMetrics = () => {
  if (!isMobile.value || !isVirtualKeyboardVisible.value) {
    virtualKeyboardHeight.value = 0;
    return;
  }

  nextTick(() => {
    requestAnimationFrame(() => {
      const element = virtualKeyboardWrapperRef.value;
      virtualKeyboardHeight.value = element ? Math.round(element.offsetHeight) : 0;
      if (keyboardOpen.value && virtualKeyboardTopOverride.value !== null) {
        const { minTop, maxTop } = getVirtualKeyboardBounds();
        virtualKeyboardTopOverride.value = Math.min(maxTop, Math.max(minTop, virtualKeyboardTopOverride.value));
      }
    });
  });
};

const handleVirtualKeyboardDragMove = (event: PointerEvent) => {
  if (!isDraggingVirtualKeyboard.value) {
    return;
  }

  const { minTop, maxTop } = getVirtualKeyboardBounds();
  const nextTop = dragStartKeyboardTop.value + (event.clientY - dragStartPointerY.value);
  virtualKeyboardTopOverride.value = Math.min(maxTop, Math.max(minTop, Math.round(nextTop)));
};

const stopVirtualKeyboardDrag = () => {
  isDraggingVirtualKeyboard.value = false;
  if (virtualKeyboardTopOverride.value !== null) {
    const { maxTop } = getVirtualKeyboardBounds();
    if (Math.abs(virtualKeyboardTopOverride.value - maxTop) <= 10) {
      virtualKeyboardPinnedToKeyboard.value = true;
      virtualKeyboardTopOverride.value = null;
    }
  }
  window.removeEventListener('pointermove', handleVirtualKeyboardDragMove);
  window.removeEventListener('pointerup', stopVirtualKeyboardDrag);
  window.removeEventListener('pointercancel', stopVirtualKeyboardDrag);
};

const startVirtualKeyboardDrag = (event: PointerEvent) => {
  if (!isMobile.value || !isVirtualKeyboardVisible.value) {
    return;
  }

  event.preventDefault();
  isDraggingVirtualKeyboard.value = true;
  virtualKeyboardPinnedToKeyboard.value = false;
  dragStartPointerY.value = event.clientY;
  const { maxTop } = getVirtualKeyboardBounds();
  dragStartKeyboardTop.value = virtualKeyboardTopOverride.value ?? maxTop;

  window.addEventListener('pointermove', handleVirtualKeyboardDragMove);
  window.addEventListener('pointerup', stopVirtualKeyboardDrag);
  window.addEventListener('pointercancel', stopVirtualKeyboardDrag);
};

const syncKeyboardShift = () => {
  if (!isMobile.value || !keyboardOpen.value || !hasActiveWorkspaceSession.value || !terminalStageRef.value) {
    keyboardShift.value = 0;
    return;
  }

  const rect = terminalStageRef.value.getBoundingClientRect();
  const desiredTop = 10;
  const unshiftedTop = rect.top + keyboardShift.value;
  keyboardShift.value = unshiftedTop > desiredTop ? Math.round(unshiftedTop - desiredTop) : 0;
};

const syncMobileViewportLayout = () => {
  syncVisualViewport();
  nextTick(() => {
    requestAnimationFrame(() => {
      syncKeyboardShift();
      syncVirtualKeyboardMetrics();
    });
  });
};

onMounted(async () => {
  window.addEventListener('keydown', handleGlobalKeyDown);
  document.addEventListener('click', handleDocumentClick);
  window.addEventListener('resize', syncMobileViewportLayout);
  window.visualViewport?.addEventListener('resize', syncMobileViewportLayout);
  window.visualViewport?.addEventListener('scroll', syncMobileViewportLayout);

  subscribeToWorkspaceEvents('terminal:sendCommand', handleSendCommandEvent);
  subscribeToWorkspaceEvents('terminal:input', handleTerminalInput);
  subscribeToWorkspaceEvents('terminal:resize', handleTerminalResize);
  subscribeToWorkspaceEvents('terminal:ready', handleTerminalReady);
  subscribeToWorkspaceEvents('terminal:clear', handleClearTerminal);
  subscribeToWorkspaceEvents('terminal:scrollToBottomRequest', handleScrollToBottomRequest);

  if (!connections.value.length && !isLoadingConnections.value) {
    await connectionsStore.fetchConnections();
  } else if (!connections.value.length) {
    try {
      await connectionsStore.fetchConnections();
    } catch (error) {
      console.error('[WorkspaceView] 获取连接列表失败:', error);
    }
  }

  await nextTick();
  syncMobileViewportLayout();
  collapseMobilePanelsIfNeeded();
  attemptAutoConnect();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown);
  document.removeEventListener('click', handleDocumentClick);
  window.removeEventListener('resize', syncMobileViewportLayout);
  window.visualViewport?.removeEventListener('resize', syncMobileViewportLayout);
  window.visualViewport?.removeEventListener('scroll', syncMobileViewportLayout);

  unsubscribeFromWorkspaceEvents('terminal:sendCommand', handleSendCommandEvent);
  unsubscribeFromWorkspaceEvents('terminal:input', handleTerminalInput);
  unsubscribeFromWorkspaceEvents('terminal:resize', handleTerminalResize);
  unsubscribeFromWorkspaceEvents('terminal:ready', handleTerminalReady);
  unsubscribeFromWorkspaceEvents('terminal:clear', handleClearTerminal);
  unsubscribeFromWorkspaceEvents('terminal:scrollToBottomRequest', handleScrollToBottomRequest);

  stopVirtualKeyboardDrag();
  sessionStore.cleanupAllSessions();
});

watch(activeSessionId, (newId) => {
  activeFileManagerComponentRef.value = newId ? fileManagerComponentRefs.get(newId) ?? null : null;
}, { immediate: true });

watch([isMobile, hasActiveWorkspaceSession], () => {
  collapseMobilePanelsIfNeeded();
}, { immediate: true });

watch([keyboardOpen, activeSessionId, isStatusPanelCollapsed, isFilesPanelCollapsed], () => {
  syncMobileViewportLayout();
});

watch(isVirtualKeyboardVisible, () => {
  syncMobileViewportLayout();
  if (!isVirtualKeyboardVisible.value) {
    virtualKeyboardTopOverride.value = null;
    virtualKeyboardPinnedToKeyboard.value = true;
  }
});

watch(keyboardOpen, (open) => {
  if (!isMobile.value) {
    return;
  }

  if (open) {
    isVirtualKeyboardVisible.value = true;
    virtualKeyboardPinnedToKeyboard.value = true;
    virtualKeyboardTopOverride.value = null;
  } else {
    isVirtualKeyboardVisible.value = false;
    virtualKeyboardTopOverride.value = null;
    virtualKeyboardPinnedToKeyboard.value = true;
  }
  syncMobileViewportLayout();
});
</script>

<template>
  <div
    class="workspace-shell"
    :class="{ 'is-mobile': isMobile, 'is-keyboard-open': keyboardOpen }"
    :style="shellStyle"
  >
    <section class="workspace-body" :style="bodyStyle">
      <div class="workspace-main">
        <aside class="workspace-sidepanel">
          <section
            class="workspace-card workspace-server-card"
            :class="{ 'is-collapsed': isMobile && hasActiveWorkspaceSession && isStatusPanelCollapsed }"
          >
            <div class="workspace-card__header">
              <div class="workspace-server-header">
                <div class="workspace-server-summary">
                  <button
                    v-if="isMobile && hasActiveWorkspaceSession"
                    class="workspace-card__collapse-toggle"
                    type="button"
                    @click="toggleStatusPanelCollapsed"
                  >
                    <p class="workspace-card__eyebrow">服务器状态</p>
                    <i class="fas" :class="isStatusPanelCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
                  </button>
                  <p v-else class="workspace-card__eyebrow">服务器状态</p>
                  <div v-if="activeConnection" class="workspace-server-summary__meta-group">
                    <span
                      class="workspace-server-summary__meta workspace-server-summary__meta--host"
                      :title="`${activeConnection.username}@${activeConnectionSummaryHost}`"
                    >
                      {{ activeConnection.username }}@{{ activeConnectionSummaryHost }}
                    </span>
                    <span class="workspace-server-summary__meta workspace-server-summary__meta--port">端口 {{ activeConnection.port }}</span>
                  </div>
                  <span v-else class="workspace-server-summary__meta workspace-server-summary__meta--empty">未连接</span>
                </div>
              </div>
              <button
                class="workspace-status-refresh"
                type="button"
                title="刷新状态"
                :disabled="!activeSessionId"
                @click="refreshActiveServerStatus"
              >
                <i class="fas fa-rotate-right"></i>
              </button>
            </div>

            <div
              v-show="!(isMobile && hasActiveWorkspaceSession && isStatusPanelCollapsed)"
              class="workspace-card__body workspace-status-body"
            >
              <StatusMonitor :active-session-id="activeSessionId" />
            </div>
          </section>

          <section
            class="workspace-card workspace-files-card"
            :class="{ 'is-collapsed': isMobile && hasActiveWorkspaceSession && isFilesPanelCollapsed }"
          >
            <div class="workspace-card__header workspace-card__header--files">
              <div class="workspace-server-header">
                <div class="workspace-server-summary">
                  <button
                    v-if="isMobile && hasActiveWorkspaceSession"
                    class="workspace-card__collapse-toggle"
                    type="button"
                    @click="toggleFilesPanelCollapsed"
                  >
                    <p class="workspace-card__eyebrow">SFTP 文件</p>
                    <i class="fas" :class="isFilesPanelCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
                  </button>
                  <p v-else class="workspace-card__eyebrow">SFTP 文件</p>
                </div>
              </div>
              <div class="workspace-card__toolbar">
                <input
                  ref="toolbarUploadInputRef"
                  type="file"
                  class="hidden"
                  multiple
                  @change="handleToolbarFileUpload"
                />
                <button class="workspace-card__tool-button" type="button" title="上传" @click="triggerActiveFileUpload">
                  <i class="fas fa-upload"></i>
                </button>
                <button class="workspace-card__tool-button" type="button" title="新建文件夹" @click="triggerActiveNewFolder">
                  <i class="fas fa-folder-plus"></i>
                </button>
                <button class="workspace-card__tool-button" type="button" title="新建文件" @click="triggerActiveNewFile">
                  <i class="far fa-file-alt"></i>
                </button>
              </div>
            </div>

            <div
              v-show="!(isMobile && hasActiveWorkspaceSession && isFilesPanelCollapsed)"
              class="workspace-card__body workspace-files-body"
            >
              <template v-if="activeFileManagerEntry">
                <div
                  v-for="entry in fileManagerEntries"
                  :key="entry.sessionId"
                  v-show="entry.sessionId === activeSessionId"
                  class="workspace-files-instance"
                >
                  <FileManager
                    :session-id="entry.sessionId"
                    :instance-id="entry.instanceId"
                    :db-connection-id="entry.dbConnectionId"
                    :ws-deps="entry.wsDeps"
                    :is-mobile="isMobile"
                    :ref="(instance) => setFileManagerRef(entry.sessionId, instance)"
                    class="workspace-file-manager"
                  />
                </div>
              </template>

              <div v-else class="workspace-placeholder workspace-placeholder--compact">
                <i class="fas fa-folder-open"></i>
                <p>连接服务器后即可浏览文件</p>
              </div>
            </div>
          </section>
        </aside>

        <main class="workspace-terminal-panel">
          <section class="workspace-card workspace-terminal-card">
            <div class="workspace-card__header workspace-card__header--terminal">
              <div class="workspace-terminal-header">
                <p class="workspace-card__eyebrow">SSH 终端</p>
                <div v-if="sessionTabsWithStatus.length" class="workspace-terminal-tabbar-row">
                  <div class="workspace-terminal-tabbar">
                    <button
                      v-for="tab in sessionTabsWithStatus"
                      :key="tab.sessionId"
                      class="workspace-tab"
                      :class="{ 'is-active': tab.sessionId === activeSessionId }"
                      type="button"
                      @click="sessionStore.activateSession(tab.sessionId)"
                    >
                      <span class="workspace-tab__status" :class="`is-${tab.status}`"></span>
                      <span class="workspace-tab__title">{{ tab.connectionName }}</span>
                      <button
                        class="workspace-tab__reconnect"
                        type="button"
                        title="重新连接"
                        @click.stop="reconnectSession(tab.sessionId)"
                      >
                        <i class="fas fa-rotate-right"></i>
                      </button>
                      <span
                        class="workspace-tab__close"
                        role="button"
                        tabindex="0"
                        @click.stop="sessionStore.closeSession(tab.sessionId)"
                        @keydown.enter.stop.prevent="sessionStore.closeSession(tab.sessionId)"
                      >
                        <i class="fas fa-times"></i>
                      </span>
                    </button>
                  </div>

                  <div ref="serverPickerTabbarRef" class="workspace-picker workspace-picker--tabbar">
                    <button class="workspace-tab workspace-tab--adder" type="button" @click.stop="toggleServerPicker('tabbar')">
                      <i class="fas fa-plus"></i>
                    </button>

                    <transition name="workspace-fade">
                      <div v-if="showServerPicker && activeServerPickerPlacement === 'tabbar'" class="workspace-picker__panel is-tabbar">
                        <div class="workspace-picker__header">
                          <span>已保存服务器</span>
                        </div>

                        <div v-if="sshConnections.length" class="workspace-picker__list">
                          <div
                            v-for="connection in sshConnections"
                            :key="`tabbar-${connection.id}`"
                            class="workspace-picker__item"
                          >
                            <button
                              class="workspace-picker__item-main"
                              type="button"
                              @click="connectToServer(connection)"
                            >
                              <span class="workspace-picker__name">{{ connection.name || connection.host }}</span>
                              <span class="workspace-picker__meta">{{ connection.username }}@{{ connection.host }}:{{ connection.port }}</span>
                            </button>
                            <div class="workspace-picker__item-actions">
                              <button type="button" title="编辑" @click.stop="startEditConnection(connection)">
                                <i class="fas fa-pen"></i>
                              </button>
                              <button type="button" title="删除" @click.stop="deleteManagedConnection(connection)">
                                <i class="fas fa-trash"></i>
                              </button>
                            </div>
                          </div>
                        </div>

                        <div v-else class="workspace-picker__empty">
                          暂无可连接的 SSH 服务器
                        </div>
                      </div>
                    </transition>
                  </div>
                </div>
                <div v-else class="workspace-terminal-tabbar__empty">
                  无活动会话
                </div>
              </div>
              <button
                class="workspace-terminal-badge workspace-terminal-badge--copyable"
                type="button"
                :title="activeConnectionIp ? `点击复制 ${activeConnectionIp}` : '等待连接'"
                @click="copyActiveConnectionIp"
              >
                <span class="workspace-terminal-badge__text">{{ activeConnectionIp || '等待连接' }}</span>
              </button>
            </div>

            <div ref="terminalStageRef" class="workspace-terminal-stage">
              <template v-if="sessionTabsWithStatus.length">
                <div
                  v-for="tab in sessionTabsWithStatus"
                  :key="tab.sessionId"
                  v-show="tab.sessionId === activeSessionId"
                  class="workspace-terminal-instance"
                >
                  <Terminal
                    :session-id="tab.sessionId"
                    :is-active="tab.sessionId === activeSessionId"
                    class="workspace-terminal"
                  />
                </div>
              </template>

              <div v-else class="workspace-placeholder">
                <i class="fas fa-plug"></i>
                <h3>无活动会话</h3>
                <p>点击左下角 + 添加服务器</p>
              </div>
            </div>
          </section>
        </main>
      </div>

      <div class="workspace-footer-grid">
        <div class="workspace-inline-nav">
          <div ref="connectionPanelRef" class="workspace-picker">
            <button
              class="workspace-nav-button"
              type="button"
              @click.stop="toggleConnectionPanel"
            >
              <i class="fas fa-circle-plus"></i>
              <span class="workspace-nav-button__label">新增连接</span>
            </button>

            <transition name="workspace-fade">
              <div v-if="showConnectionPanel" class="workspace-picker__panel workspace-picker__panel--form is-inline">
                <div class="workspace-inline-form">
                  <div class="workspace-inline-form__header">
                    <div>
                      <p class="workspace-inline-form__eyebrow">Connection</p>
                      <h3>{{ editingConnectionId ? '编辑连接' : '新增连接' }}</h3>
                    </div>
                    <button class="workspace-inline-form__close" type="button" @click="closeConnectionPanel">
                      <i class="fas fa-xmark"></i>
                    </button>
                  </div>

                  <div class="workspace-inline-form__grid">
                    <label class="workspace-inline-form__field">
                      <span>名称</span>
                      <input v-model="connectionForm.name" type="text" placeholder="例如：Tokyo" />
                    </label>
                    <label class="workspace-inline-form__field">
                      <span>IP 或域名</span>
                      <input v-model="connectionForm.host" type="text" placeholder="server.example.com" />
                    </label>
                    <label class="workspace-inline-form__field">
                      <span>端口</span>
                      <input v-model.number="connectionForm.port" type="number" min="1" max="65535" />
                    </label>
                    <label class="workspace-inline-form__field">
                      <span>用户</span>
                      <input v-model="connectionForm.username" type="text" placeholder="root" />
                    </label>
                  </div>

                  <div class="workspace-inline-form__auth-switch">
                    <button
                      type="button"
                      :class="{ 'is-active': connectionForm.auth_method === 'password' }"
                      @click="connectionForm.auth_method = 'password'"
                    >
                      密码
                    </button>
                    <button
                      type="button"
                      :class="{ 'is-active': connectionForm.auth_method === 'key' }"
                      @click="connectionForm.auth_method = 'key'"
                    >
                      密钥
                    </button>
                  </div>

                  <div v-if="connectionForm.auth_method === 'password'" class="workspace-inline-form__field workspace-inline-form__field--key">
                    <div class="workspace-inline-form__key-header">
                      <span>密码</span>
                      <div class="workspace-inline-form__key-actions">
                        <span class="workspace-inline-form__upload workspace-inline-form__upload--ghost" aria-hidden="true">
                          <i class="fas fa-upload"></i>
                          <span>上传密钥</span>
                        </span>
                      </div>
                    </div>
                    <input v-model="connectionForm.password" type="password" placeholder="输入 SSH 密码" />
                  </div>

                  <div v-else class="workspace-inline-form__field workspace-inline-form__field--key">
                    <div class="workspace-inline-form__key-header">
                      <span>SSH 密钥</span>
                      <div class="workspace-inline-form__key-actions">
                        <input
                          ref="keyUploadInputRef"
                          type="file"
                          class="hidden"
                          @change="handleKeyUpload"
                        />
                        <button class="workspace-inline-form__upload" type="button" @click="triggerKeyUpload">
                          <i class="fas fa-upload"></i>
                          <span>上传密钥</span>
                        </button>
                      </div>
                    </div>
                    <textarea
                      v-model="connectionForm.private_key"
                      rows="1"
                      placeholder="粘贴私钥内容，或上传私钥文件"
                    />
                  </div>

                  <div class="workspace-inline-form__footer">
                    <p class="workspace-inline-form__message" :class="{ 'is-success': connectionFormSuccess, 'is-error': connectionFormMessage && !connectionFormSuccess }">
                      {{ connectionFormMessage }}
                    </p>
                    <div class="workspace-inline-form__footer-actions">
                      <button
                        v-if="editingConnectionId"
                        class="workspace-inline-form__ghost"
                        type="button"
                        @click="resetConnectionForm"
                      >
                        取消编辑
                      </button>
                      <button class="workspace-inline-form__submit" type="button" :disabled="connectionFormLoading" @click="submitConnectionForm">
                        {{ connectionFormLoading ? '保存中...' : (editingConnectionId ? '保存修改' : '保存') }}
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </transition>
          </div>

          <div ref="serverPickerFooterRef" class="workspace-picker">
            <button class="workspace-nav-button" type="button" @click.stop="toggleServerPicker('footer')">
              <i class="fas fa-server"></i>
              <span class="workspace-nav-button__label">连接管理</span>
            </button>

            <transition name="workspace-fade">
              <div v-if="showServerPicker && activeServerPickerPlacement === 'footer'" class="workspace-picker__panel is-inline">
                <div class="workspace-picker__header">
                  <span>已保存服务器</span>
                </div>

                <div v-if="sshConnections.length" class="workspace-picker__list">
                  <div
                    v-for="connection in sshConnections"
                    :key="`footer-${connection.id}`"
                    class="workspace-picker__item"
                  >
                    <button
                      class="workspace-picker__item-main"
                      type="button"
                      @click="connectToServer(connection)"
                    >
                      <span class="workspace-picker__name">{{ connection.name || connection.host }}</span>
                      <span class="workspace-picker__meta">{{ connection.username }}@{{ connection.host }}:{{ connection.port }}</span>
                    </button>
                    <div class="workspace-picker__item-actions">
                      <button type="button" title="编辑" @click.stop="startEditConnection(connection)">
                        <i class="fas fa-pen"></i>
                      </button>
                      <button type="button" title="删除" @click.stop="deleteManagedConnection(connection)">
                        <i class="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                </div>

                <div v-else class="workspace-picker__empty">
                  暂无可连接的 SSH 服务器
                </div>
              </div>
            </transition>
          </div>

          <button
            class="workspace-nav-button is-active"
            type="button"
            @click="router.push({ name: 'Workspace' })"
          >
            <i class="fas fa-terminal"></i>
            <span class="workspace-nav-button__label">工作台</span>
          </button>

          <div ref="settingsPanelRef" class="workspace-picker">
            <button
              class="workspace-nav-button"
              type="button"
              @click.stop="toggleSettingsPanel"
            >
              <i class="fas fa-sliders-h"></i>
              <span class="workspace-nav-button__label">设置</span>
            </button>

            <transition name="workspace-fade">
              <div v-if="showSettingsPanel" class="workspace-picker__panel workspace-picker__panel--form is-inline">
                <div class="workspace-inline-form">
                  <div class="workspace-inline-form__header">
                    <div>
                      <p class="workspace-inline-form__eyebrow">Security</p>
                      <h3>修改密码</h3>
                    </div>
                    <button class="workspace-inline-form__close" type="button" @click="closeSettingsPanel">
                      <i class="fas fa-xmark"></i>
                    </button>
                  </div>

                  <label class="workspace-inline-form__field">
                    <span>当前密码</span>
                    <input v-model="passwordForm.currentPassword" type="password" placeholder="输入当前密码" />
                  </label>
                  <label class="workspace-inline-form__field">
                    <span>新密码</span>
                    <input v-model="passwordForm.newPassword" type="password" placeholder="输入新密码" />
                  </label>
                  <label class="workspace-inline-form__field">
                    <span>确认新密码</span>
                    <input v-model="passwordForm.confirmPassword" type="password" placeholder="再次输入新密码" />
                  </label>

                  <div class="workspace-inline-form__footer">
                    <p class="workspace-inline-form__message" :class="{ 'is-success': passwordFormSuccess, 'is-error': passwordFormMessage && !passwordFormSuccess }">
                      {{ passwordFormMessage }}
                    </p>
                    <button class="workspace-inline-form__submit" type="button" :disabled="passwordFormLoading" @click="submitPasswordForm">
                      {{ passwordFormLoading ? '提交中...' : '更新密码' }}
                    </button>
                  </div>
                </div>
              </div>
            </transition>
          </div>

          <button
            class="workspace-nav-button"
            type="button"
            @click="toggleLanguage"
          >
            <i class="fas fa-language"></i>
            <span class="workspace-nav-button__label">{{ locale === 'zh-CN' ? 'English' : '中文' }}</span>
          </button>

          <button
            class="workspace-nav-button"
            type="button"
            @click="authStore.logout()"
          >
            <i class="fas fa-right-from-bracket"></i>
            <span class="workspace-nav-button__label">退出登录</span>
          </button>
        </div>
        <div class="workspace-footer-grid__terminal">
          <CommandInputBar
            class="workspace-command-bar"
            :is-mobile="isMobile"
            :is-virtual-keyboard-visible="isVirtualKeyboardVisible"
            @toggle-virtual-keyboard="toggleVirtualKeyboard"
          />
        </div>
      </div>
    </section>

    <div
      v-if="isMobile"
      v-show="isVirtualKeyboardVisible"
      ref="virtualKeyboardWrapperRef"
      class="workspace-keyboard workspace-keyboard--floating"
      :class="{ 'is-dragging': isDraggingVirtualKeyboard }"
      :style="virtualKeyboardStyle"
    >
      <div
        class="workspace-keyboard__drag-handle"
        @pointerdown.stop.prevent="startVirtualKeyboardDrag"
      >
        <span class="workspace-keyboard__drag-pill"></span>
      </div>

      <VirtualKeyboard
        :compact="keyboardOpen"
        @send-key="handleVirtualKeyPress"
      />
    </div>
  </div>
</template>

<style scoped>
.workspace-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  background:
    var(--surface-page-radial),
    var(--surface-page-linear);
  color: var(--text-color);
  font-family: "SF Pro Display", "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
}

.workspace-nav-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 18px;
  background: transparent;
  color: var(--text-color-secondary);
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.workspace-nav-button:hover,
.workspace-nav-button.is-active {
  background: var(--accent-soft-bg);
  color: var(--accent-color);
  transform: translateY(-1px);
}

.workspace-nav-button i {
  font-size: 16px;
  color: inherit;
}

.workspace-nav-button__label {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%) translateY(6px);
  padding: 8px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-bg-color) 18%, #020617);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease, transform 0.16s ease;
  z-index: 120;
}

.workspace-nav-button:hover .workspace-nav-button__label {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.workspace-picker {
  position: relative;
}

.workspace-picker__panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 12px);
  width: 280px;
  padding: 12px;
  border: 1px solid var(--surface-card-border);
  border-radius: 24px;
  background: var(--surface-card-bg);
  box-shadow: var(--surface-card-shadow);
  backdrop-filter: blur(24px);
  z-index: 40;
}

.workspace-picker__panel--form {
  width: 360px;
  max-width: min(360px, calc(100vw - 32px));
  padding: 14px;
}

.workspace-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 10px;
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 600;
}

.workspace-picker__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow: auto;
}

.workspace-picker__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--surface-input-border);
  border-radius: 18px;
  background: var(--surface-input-bg);
  text-align: left;
  transition: border-color 0.18s ease, background-color 0.18s ease, transform 0.18s ease;
}

.workspace-picker__item:hover {
  border-color: var(--input-focus-border-color);
  background: var(--accent-soft-bg);
  transform: translateY(-1px);
}

.workspace-picker__item-main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 2px 4px;
  text-align: left;
}

.workspace-picker__name {
  color: var(--text-color);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.workspace-picker__meta {
  color: var(--text-color-secondary);
  font-size: 12px;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-picker__item-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.workspace-picker__item-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: var(--surface-overlay-soft);
  color: var(--text-color-secondary);
  box-shadow: 0 8px 18px rgba(148, 163, 184, 0.12);
}

.workspace-picker__item-actions button:last-child {
  color: #e11d48;
}

.workspace-picker__empty {
  padding: 20px 14px;
  border-radius: 18px;
  background: var(--surface-input-bg);
  color: var(--text-color-secondary);
  font-size: 13px;
  text-align: center;
}

.workspace-inline-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.workspace-inline-form__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.workspace-inline-form__eyebrow {
  margin: 0 0 6px;
  color: var(--text-color-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.28em;
  text-transform: uppercase;
}

.workspace-inline-form__header h3 {
  margin: 0;
  color: var(--text-color);
  font-size: 22px;
  letter-spacing: -0.04em;
}

.workspace-inline-form__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 999px;
  background: var(--surface-soft-bg);
  color: var(--text-color-secondary);
}

.workspace-inline-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.workspace-inline-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workspace-inline-form__field span {
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 600;
}

.workspace-inline-form__field input,
.workspace-inline-form__field select,
.workspace-inline-form__field textarea {
  width: 100%;
  border: 1px solid var(--surface-input-border);
  border-radius: 16px;
  background: var(--surface-input-bg);
  color: var(--text-color);
  font-size: 14px;
  outline: none;
  padding: 0 14px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.workspace-inline-form__field input,
.workspace-inline-form__field select {
  height: 42px;
}

.workspace-inline-form__field textarea {
  height: 42px;
  min-height: 42px;
  max-height: 180px;
  box-sizing: border-box;
  line-height: 20px;
  padding: 10px 14px;
  resize: vertical;
}

.workspace-inline-form__field input:focus,
.workspace-inline-form__field select:focus,
.workspace-inline-form__field textarea:focus {
  border-color: var(--input-focus-border-color);
  background: var(--surface-overlay-soft);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--input-focus-glow) 28%, transparent);
}

.workspace-inline-form__field--key {
  gap: 10px;
}

.workspace-inline-form__key-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.workspace-inline-form__key-actions {
  display: inline-flex;
  align-items: center;
}

.workspace-inline-form__upload {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--surface-input-border);
  border-radius: 999px;
  background: var(--surface-overlay-soft);
  color: var(--text-color);
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 10px 22px rgba(148, 163, 184, 0.08);
}

.workspace-inline-form__upload--ghost {
  visibility: hidden;
  pointer-events: none;
}

.workspace-inline-form__auth-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 6px;
  border-radius: 18px;
  background: var(--surface-soft-bg);
}

.workspace-inline-form__auth-switch button {
  height: 38px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--text-color-secondary);
  font-size: 13px;
  font-weight: 700;
  transition: background-color 0.18s ease, box-shadow 0.18s ease, color 0.18s ease;
}

.workspace-inline-form__auth-switch button.is-active {
  background: var(--surface-overlay-soft);
  color: var(--text-color);
  box-shadow: 0 10px 22px rgba(148, 163, 184, 0.16);
}

.workspace-inline-form__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 4px;
  min-width: 0;
}

.workspace-inline-form__footer-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.workspace-inline-form__message {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 18px;
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.workspace-inline-form__message.is-success {
  color: #16a34a;
}

.workspace-inline-form__message.is-error {
  color: #e11d48;
}

.workspace-inline-form__submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: var(--button-primary-gradient);
  box-shadow: var(--button-primary-shadow);
  color: white;
  font-size: 13px;
  font-weight: 700;
}

.workspace-inline-form__submit:disabled {
  opacity: 0.6;
}

.workspace-inline-form__ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  padding: 0 14px;
  border: 1px solid var(--surface-input-border);
  border-radius: 999px;
  background: var(--surface-overlay-soft);
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 700;
}


.workspace-server-summary__meta.is-copyable {
  cursor: pointer;
  transition: color 0.16s ease;
}

.workspace-server-summary__meta.is-copyable:hover {
  color: var(--accent-color);
}

.workspace-body {
  flex: 1 1 auto;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  padding: 12px 18px 18px 18px;
}

.workspace-tab {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  max-width: 188px;
  height: 48px;
  padding: 10px 12px;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: 18px;
  background: transparent;
  color: var(--text-color-secondary);
  transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.workspace-tab:hover {
  background: var(--surface-overlay-soft);
}

.workspace-tab.is-active {
  border-color: color-mix(in srgb, var(--accent-color) 28%, transparent);
  background: var(--surface-card-bg);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--accent-color) 12%, transparent);
  color: var(--text-color);
}

.workspace-tab__status {
  flex-shrink: 0;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #cbd5e1;
}

.workspace-tab__status.is-connected {
  background: #22c55e;
}

.workspace-tab__status.is-connecting {
  background: #f59e0b;
}

.workspace-tab__status.is-error {
  background: #ef4444;
}

.workspace-tab__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.workspace-tab__reconnect {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-color-secondary);
  transition: color 0.18s ease, background-color 0.18s ease;
}

.workspace-tab__reconnect:hover {
  color: var(--accent-color);
  background: var(--accent-strong-soft-bg);
}

.workspace-tab__reconnect i {
  color: inherit;
  font-size: 11px;
}

.workspace-tab__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  color: var(--text-color-secondary);
}

.workspace-tab__close:hover {
  background: var(--surface-soft-bg);
  color: var(--text-color);
}

.workspace-tab__close i {
  color: inherit;
  font-size: 11px;
}

.workspace-main {
  display: grid;
  grid-template-columns: 364px minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.workspace-sidepanel,
.workspace-terminal-panel {
  min-height: 0;
}

.workspace-sidepanel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.workspace-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--surface-card-border);
  border-radius: 28px;
  background: var(--surface-card-bg);
  box-shadow: var(--surface-card-shadow);
  overflow: hidden;
}

.workspace-server-card {
  align-self: start;
  height: 228px;
  min-height: 228px;
  max-height: 228px;
}

.workspace-card.is-collapsed {
  min-height: 0;
}

.workspace-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 10px;
}

.workspace-card__header--terminal {
  align-items: center;
  padding-bottom: 10px;
  position: relative;
  overflow: visible;
  z-index: 30;
}

.workspace-card__header--files {
  align-items: center;
}

.workspace-card__eyebrow {
  margin: 0;
  color: var(--text-color-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}

.workspace-card__header h2 {
  margin: 0;
  color: var(--text-color);
  font-size: 17px;
  line-height: 1.2;
  font-weight: 700;
}

.workspace-card__collapse-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
}

.workspace-card__collapse-toggle i {
  font-size: 11px;
  color: var(--text-color-secondary);
}

.workspace-terminal-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
  max-width: calc(100% - 140px);
}

.workspace-terminal-tabbar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 2px;
  flex: 0 1 auto;
  scrollbar-width: none;
  width: auto;
  max-width: 100%;
}

.workspace-terminal-tabbar::-webkit-scrollbar {
  display: none;
}

.workspace-terminal-tabbar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  max-width: calc(100% - 4px);
  min-width: 0;
}

.workspace-picker--tabbar {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.workspace-tab--adder {
  justify-content: center;
  width: 48px;
  min-width: 48px;
  padding: 0;
}

.workspace-tab--adder i {
  color: inherit;
  font-size: 13px;
}

.workspace-terminal-tabbar__empty {
  color: var(--text-color-secondary);
  font-size: 13px;
  font-weight: 500;
}

.workspace-server-header {
  min-width: 0;
}

.workspace-server-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

.workspace-server-summary__meta-group {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
  flex: 1 1 auto;
  max-width: min(100%, 480px);
  margin-left: auto;
  text-align: right;
}

.workspace-server-summary__meta {
  display: inline-block;
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
}

.workspace-server-summary__meta--host {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-server-summary__meta--port {
  flex-shrink: 0;
}

.workspace-server-summary__meta--empty {
  margin-left: auto;
}

.workspace-card__toolbar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.workspace-card__tool-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--surface-input-border);
  border-radius: 999px;
  background: var(--surface-input-bg);
  color: var(--text-color-secondary);
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.workspace-card__tool-button:hover {
  background: var(--accent-soft-bg);
  color: var(--accent-color);
  transform: translateY(-1px);
}

.workspace-card__tool-button i {
  color: inherit;
  font-size: 13px;
}

.workspace-status-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-color-secondary);
  flex-shrink: 0;
  transition: color 0.16s ease, transform 0.16s ease;
}

.workspace-status-refresh:hover:not(:disabled) {
  color: var(--accent-color);
  transform: translateY(-1px);
}

.workspace-status-refresh:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.workspace-status-refresh i {
  color: inherit;
  font-size: 15px;
}


.workspace-card__body {
  min-height: 0;
  flex: 1;
}

.workspace-terminal-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  flex-shrink: 0;
  margin-top: 28px;
  min-height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  outline: none;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  max-width: 240px;
}

.workspace-terminal-badge {
  background: var(--accent-soft-bg);
  color: var(--accent-color);
}

.workspace-terminal-badge__text {
  display: inline-block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-terminal-badge--copyable {
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
}

.workspace-terminal-badge--copyable:hover {
  background: var(--accent-strong-soft-bg);
  box-shadow: 0 10px 22px color-mix(in srgb, var(--accent-color) 18%, transparent);
  transform: translateY(-1px);
}

.workspace-status-body {
  flex: 0 0 auto;
  min-height: 0;
  overflow: hidden;
  padding: 0 12px 12px;
}

.workspace-files-body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  padding: 0 10px 10px;
}

.workspace-files-instance,
.workspace-file-manager,
.workspace-terminal-instance,
.workspace-terminal {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.workspace-files-instance {
  min-height: 0;
  flex: 1;
}

.workspace-files-card {
  min-height: 0;
}

.workspace-inline-nav {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  gap: 10px;
  flex-shrink: 0;
  padding: 10px 12px;
  border: 1px solid var(--surface-card-border);
  border-radius: 24px;
  background: color-mix(in srgb, var(--surface-card-bg) 88%, transparent);
  backdrop-filter: blur(18px);
  box-shadow: var(--surface-card-shadow);
  z-index: 80;
}

.workspace-inline-nav .workspace-picker {
  position: relative;
}

.workspace-picker__panel.is-inline {
  left: 0;
  bottom: calc(100% + 10px);
}

.workspace-picker__panel.is-tabbar {
  left: auto;
  right: 0;
  top: calc(100% + 10px);
  bottom: auto;
  z-index: 200;
}

.workspace-terminal-card {
  min-height: 0;
  flex: 1;
  overflow: visible;
}

.workspace-terminal-stage {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 10px 10px;
}

.workspace-terminal-instance {
  min-height: 0;
  flex: 1;
}

.workspace-terminal-panel {
  display: flex;
  min-height: 0;
}

.workspace-placeholder {
  display: flex;
  width: 100%;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 100%;
  min-height: 0;
  color: var(--text-color-secondary);
  text-align: center;
}

.workspace-placeholder i {
  font-size: 26px;
  color: var(--text-color-secondary);
}

.workspace-placeholder h3,
.workspace-placeholder p {
  margin: 0;
}

.workspace-placeholder h3 {
  color: var(--text-color);
  font-size: 18px;
}

.workspace-placeholder--compact {
  gap: 8px;
  padding: 20px;
}

.workspace-command-bar {
  min-width: 0;
}

.workspace-footer-grid {
  display: grid;
  grid-template-columns: 364px minmax(0, 1fr);
  gap: 16px;
  min-width: 0;
  flex-shrink: 0;
  align-items: end;
}

.workspace-footer-grid__terminal {
  min-width: 0;
  display: grid;
  gap: 6px;
  align-self: end;
}

.workspace-keyboard {
  border: 1px solid var(--surface-card-border);
  border-radius: 24px;
  overflow: hidden;
  background: var(--surface-card-bg);
}

.workspace-keyboard--floating {
  position: fixed;
  left: 12px;
  right: 12px;
  width: auto;
  border-radius: 20px;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.22);
  z-index: 9999;
  touch-action: none;
}

.workspace-keyboard.is-dragging {
  opacity: 0.96;
}

.workspace-keyboard__drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0 4px;
  cursor: grab;
  touch-action: none;
}

.workspace-keyboard.is-dragging .workspace-keyboard__drag-handle {
  cursor: grabbing;
}

.workspace-keyboard__drag-pill {
  display: inline-block;
  width: 42px;
  height: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-color-secondary) 28%, transparent);
}

.workspace-fade-enter-active,
.workspace-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.workspace-fade-enter-from,
.workspace-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.workspace-shell.is-mobile .workspace-main,
.workspace-shell.is-mobile .workspace-footer-grid {
  grid-template-columns: minmax(0, 1fr);
}

.workspace-shell.is-mobile {
  position: fixed;
  inset: 0;
  width: 100%;
  overflow: hidden;
  overscroll-behavior: none;
}

.workspace-shell.is-mobile .workspace-sidepanel {
  display: none;
}

.workspace-shell.is-mobile .workspace-server-card {
  height: 220px;
  min-height: 220px;
  max-height: 220px;
}

.workspace-shell.is-mobile .workspace-server-card.is-collapsed,
.workspace-shell.is-mobile .workspace-files-card.is-collapsed {
  height: auto;
  min-height: 0;
  max-height: none;
}

.workspace-shell.is-mobile .workspace-server-card.is-collapsed .workspace-card__header,
.workspace-shell.is-mobile .workspace-files-card.is-collapsed .workspace-card__header {
  padding-bottom: 16px;
}

@media (max-width: 1200px) {
  .workspace-main,
  .workspace-footer-grid {
    grid-template-columns: 334px minmax(0, 1fr);
  }
}

@media (max-width: 960px) {
  .workspace-body {
    padding: 12px;
  }

  .workspace-shell.is-mobile .workspace-body {
    padding-bottom: 12px;
  }

  .workspace-main,
  .workspace-footer-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace-sidepanel {
    display: none;
  }

  .workspace-inline-nav {
    justify-content: center;
    gap: 8px;
    padding: 10px;
  }

  .workspace-nav-button {
    width: 42px;
    height: 42px;
    border-radius: 16px;
  }

  .workspace-server-card {
    height: 220px;
    min-height: 220px;
    max-height: 220px;
  }

  .workspace-server-card.is-collapsed,
  .workspace-files-card.is-collapsed {
    height: auto;
    min-height: 0;
    max-height: none;
  }

  .workspace-picker__panel--form,
  .workspace-picker__panel.is-inline {
    position: fixed;
    left: 12px !important;
    right: 12px !important;
    width: auto;
    max-width: none;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 96px);
  }

  .workspace-picker__panel--form {
    max-height: min(70vh, 560px);
    overflow: auto;
  }

  .workspace-keyboard--floating {
    left: 10px;
    right: 10px;
    border-radius: 18px;
  }

  .workspace-inline-form__header {
    align-items: center;
  }

  .workspace-inline-form__header h3 {
    font-size: 20px;
  }

  .workspace-inline-form__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace-inline-form__key-header,
  .workspace-inline-form__footer {
    flex-direction: column;
    align-items: stretch;
  }

  .workspace-inline-form__key-actions,
  .workspace-inline-form__footer-actions {
    width: 100%;
  }

  .workspace-inline-form__upload,
  .workspace-inline-form__submit,
  .workspace-inline-form__ghost {
    width: 100%;
    justify-content: center;
  }
}
</style>
