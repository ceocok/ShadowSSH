import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { defaultLng, setLocale } from '../i18n';

type SettingsState = {
  language: string;
  showPopupFileEditor: string;
  shareFileEditorTabs: string;
  autoCopyOnSelect: string;
  fileManagerRowSizeMultiplier: string;
  fileManagerColWidths: string;
  fileManagerShowDeleteConfirmation: string;
  terminalScrollbackLimit: string;
  terminalEnableRightClickPaste: string;
};

const STORAGE_KEY = 'shadowssh:settings';
const DEFAULT_FILE_MANAGER_COL_WIDTHS = {
  type: 34,
  name: 90,
  size: 74,
  permissions: 86,
  modified: 132,
};

const DEFAULT_SETTINGS: SettingsState = {
  language: defaultLng,
  showPopupFileEditor: 'true',
  shareFileEditorTabs: 'true',
  autoCopyOnSelect: 'false',
  fileManagerRowSizeMultiplier: '1.0',
  fileManagerColWidths: JSON.stringify(DEFAULT_FILE_MANAGER_COL_WIDTHS),
  fileManagerShowDeleteConfirmation: 'true',
  terminalScrollbackLimit: '5000',
  terminalEnableRightClickPaste: 'true',
};

const loadStoredSettings = (): SettingsState => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    const merged = {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
    if (!merged.language || !['zh-CN', 'en-US'].includes(merged.language)) {
      merged.language = 'zh-CN';
    }
    return merged;
  } catch (error) {
    console.error('[SettingsStore] 读取本地设置失败，使用默认值。', error);
    return { ...DEFAULT_SETTINGS };
  }
};

const saveStoredSettings = (settings: SettingsState) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<SettingsState>(loadStoredSettings());
  const parsedFileManagerColWidths = ref<Record<string, number>>(DEFAULT_FILE_MANAGER_COL_WIDTHS);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const syncDerivedState = () => {
    try {
      const parsedWidths = JSON.parse(settings.value.fileManagerColWidths) as Record<string, number>;
      parsedFileManagerColWidths.value = {
        ...DEFAULT_FILE_MANAGER_COL_WIDTHS,
        ...Object.fromEntries(
          Object.entries(parsedWidths).filter(([, value]) => typeof value === 'number' && value > 0),
        ),
      };
    } catch (parseError) {
      console.error('[SettingsStore] 解析文件管理器列宽失败，回退默认值。', parseError);
      parsedFileManagerColWidths.value = DEFAULT_FILE_MANAGER_COL_WIDTHS;
      settings.value.fileManagerColWidths = JSON.stringify(DEFAULT_FILE_MANAGER_COL_WIDTHS);
    }

    setLocale(settings.value.language || defaultLng);
    saveStoredSettings(settings.value);
  };

  async function loadInitialSettings() {
    isLoading.value = true;
    error.value = null;
    settings.value = loadStoredSettings();
    syncDerivedState();
    isLoading.value = false;
  }

  async function updateMultipleSettings(updates: Partial<SettingsState>) {
    settings.value = {
      ...settings.value,
      ...updates,
    };
    syncDerivedState();
  }

  async function updateFileManagerLayoutSettings(multiplier: number, widths: Record<string, number>) {
    const nextWidths = {
      ...parsedFileManagerColWidths.value,
      ...Object.fromEntries(
        Object.entries(widths).filter(([, value]) => typeof value === 'number' && value > 0),
      ),
    };

    parsedFileManagerColWidths.value = nextWidths;
    await updateMultipleSettings({
      fileManagerRowSizeMultiplier: String(multiplier > 0 ? multiplier : 1),
      fileManagerColWidths: JSON.stringify(nextWidths),
    });
  }

  const showPopupFileEditorBoolean = computed(() => settings.value.showPopupFileEditor !== 'false');
  const shareFileEditorTabsBoolean = computed(() => settings.value.shareFileEditorTabs !== 'false');
  const autoCopyOnSelectBoolean = computed(() => settings.value.autoCopyOnSelect === 'true');
  const fileManagerRowSizeMultiplierNumber = computed(() => {
    const parsed = parseFloat(settings.value.fileManagerRowSizeMultiplier);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  });
  const fileManagerColWidthsObject = computed(() => parsedFileManagerColWidths.value);
  const fileManagerShowDeleteConfirmationBoolean = computed(
    () => settings.value.fileManagerShowDeleteConfirmation !== 'false',
  );
  const terminalScrollbackLimitNumber = computed(() => {
    const parsed = parseInt(settings.value.terminalScrollbackLimit, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5000;
  });
  const terminalEnableRightClickPasteBoolean = computed(
    () => settings.value.terminalEnableRightClickPaste !== 'false',
  );
  return {
    settings,
    isLoading,
    error,
    showPopupFileEditorBoolean,
    shareFileEditorTabsBoolean,
    autoCopyOnSelectBoolean,
    fileManagerRowSizeMultiplierNumber,
    fileManagerColWidthsObject,
    fileManagerShowDeleteConfirmationBoolean,
    terminalScrollbackLimitNumber,
    terminalEnableRightClickPasteBoolean,
    loadInitialSettings,
    updateMultipleSettings,
    updateFileManagerLayoutSettings,
  };
});
