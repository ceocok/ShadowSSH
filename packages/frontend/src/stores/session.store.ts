

import { defineStore } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useConnectionsStore, type ConnectionInfo } from './connections.store';


import {
  sessions,
  activeSessionId,
} from './session/state';


import {
  sessionTabs,
  sessionTabsWithStatus,
  activeSession,
} from './session/getters';


import * as sessionActions from './session/actions/sessionActions';
import * as editorActions from './session/actions/editorActions';
import * as sftpManagerActions from './session/actions/sftpManagerActions';
import * as commandInputActions from './session/actions/commandInputActions';


import type { FileInfo } from './fileEditor.store';




export const useSessionStore = defineStore('session', () => {
  // --- 依赖 ---
  const { t } = useI18n();
  const connectionsStore = useConnectionsStore();
  const router = useRouter();

  // --- 包装 Actions 以注入依赖 ---

  // Session Actions
  const openNewSession = (connectionId: number | string) =>
    sessionActions.openNewSession(connectionId, { connectionsStore, t }); // 移除了 router 和不正确的 registerSshSuspendHandlers
  const activateSession = (sessionId: string) => sessionActions.activateSession(sessionId);
  const closeSession = (sessionId: string) => sessionActions.closeSession(sessionId);
  const handleConnectRequest = (connection: ConnectionInfo) =>
    sessionActions.handleConnectRequest(connection, {
      connectionsStore,
      router,
      t,
    });
  const handleOpenNewSession = (connectionId: number | string) =>
    sessionActions.handleOpenNewSession(connectionId, { connectionsStore, t }); // 移除了 router 和不正确的 registerSshSuspendHandlers
  const cleanupAllSessions = () => sessionActions.cleanupAllSessions();
  const getPersistedOpenConnections = () => sessionActions.getPersistedOpenConnections();

  // SFTP Manager Actions
  const getOrCreateSftpManager = (sessionId: string, instanceId: string) =>
    sftpManagerActions.getOrCreateSftpManager(sessionId, instanceId, { t });
  const removeSftpManager = (sessionId: string, instanceId: string) =>
    sftpManagerActions.removeSftpManager(sessionId, instanceId);

  // Editor Actions
  const openFileInSession = (sessionId: string, fileInfo: FileInfo) =>
    editorActions.openFileInSession(sessionId, fileInfo, { getOrCreateSftpManager, t });
  const closeEditorTabInSession = (sessionId: string, tabId: string) =>
    editorActions.closeEditorTabInSession(sessionId, tabId);
  const setActiveEditorTabInSession = (sessionId: string, tabId: string) =>
    editorActions.setActiveEditorTabInSession(sessionId, tabId);
  const updateFileContentInSession = (sessionId: string, tabId: string, newContent: string) =>
    editorActions.updateFileContentInSession(sessionId, tabId, newContent);
  const saveFileInSession = (sessionId: string, tabId: string) =>
    editorActions.saveFileInSession(sessionId, tabId, { getOrCreateSftpManager, t });
  const changeEncodingInSession = (sessionId: string, tabId: string, newEncoding: string) =>
    editorActions.changeEncodingInSession(sessionId, tabId, newEncoding);
  const closeOtherTabsInSession = (sessionId: string, targetTabId: string) =>
    editorActions.closeOtherTabsInSession(sessionId, targetTabId);
  const closeTabsToTheRightInSession = (sessionId: string, targetTabId: string) =>
    editorActions.closeTabsToTheRightInSession(sessionId, targetTabId);
  const closeTabsToTheLeftInSession = (sessionId: string, targetTabId: string) =>
    editorActions.closeTabsToTheLeftInSession(sessionId, targetTabId);
  const updateTabScrollPositionInSession = (sessionId: string, tabId: string, scrollTop: number, scrollLeft: number) =>
    editorActions.updateTabScrollPositionInSession(sessionId, tabId, scrollTop, scrollLeft);

  // Command Input Actions
  const updateSessionCommandInput = (sessionId: string, content: string) =>
    commandInputActions.updateSessionCommandInput(sessionId, content);


  return {
    // State (直接从 state 模块导出，Pinia 会处理)
    sessions,
    activeSessionId,
    // Getters (直接从 getters 模块导出)
    sessionTabs,
    sessionTabsWithStatus,
    activeSession,

    // Wrapped Actions
    openNewSession,
    activateSession,
    closeSession,
    handleConnectRequest,
    handleOpenNewSession,
    cleanupAllSessions,
    getPersistedOpenConnections,
    getOrCreateSftpManager,
    removeSftpManager,
    openFileInSession,
    closeEditorTabInSession,
    setActiveEditorTabInSession,
    updateFileContentInSession,
    saveFileInSession,
    changeEncodingInSession,
    closeOtherTabsInSession,
    closeTabsToTheRightInSession,
    closeTabsToTheLeftInSession,
    updateTabScrollPositionInSession,
    updateSessionCommandInput,
  };
});
