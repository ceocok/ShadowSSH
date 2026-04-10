import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { ITheme } from 'xterm';
import { useDeviceDetection } from '../composables/useDeviceDetection';
import { darkUiTheme, darkXtermTheme, defaultUiTheme, defaultXtermTheme } from '../features/appearance/config/default-themes';

export const useAppearanceStore = defineStore('appearance', () => {
  const { isMobile } = useDeviceDetection();

  const terminalFontFamily = ref('Consolas, "Courier New", monospace, "Microsoft YaHei", "微软雅黑"');
  const terminalFontSizeDesktop = ref(14);
  const terminalFontSizeMobileValue = ref(9);
  const editorFontFamily = ref('Consolas, "Noto Sans SC", "Microsoft YaHei"');
  const editorFontSize = ref(14);
  const mobileEditorFontSize = ref(16);
  const terminalTextStrokeEnabled = ref(false);
  const terminalTextStrokeWidth = ref(1);
  const terminalTextStrokeColor = ref('#000000');
  const terminalTextShadowEnabled = ref(false);
  const terminalTextShadowOffsetX = ref(0);
  const terminalTextShadowOffsetY = ref(0);
  const terminalTextShadowBlur = ref(0);
  const terminalTextShadowColor = ref('rgba(0,0,0,0.5)');
  const initialAppearanceDataLoaded = ref(true);
  const currentThemeMode = ref<'light' | 'dark'>('light');
  let mediaQueryList: MediaQueryList | null = null;
  let mediaQueryHandler: ((event: MediaQueryListEvent) => void) | null = null;
  let isThemeListenerReady = false;

  const currentUiTheme = computed<Record<string, string>>(() => (
    currentThemeMode.value === 'dark' ? darkUiTheme : defaultUiTheme
  ));
  const currentTerminalTheme = computed<ITheme>(() => (
    currentThemeMode.value === 'dark' ? darkXtermTheme : defaultXtermTheme
  ));
  const effectiveTerminalTheme = computed<ITheme>(() => currentTerminalTheme.value);
  const currentTerminalFontFamily = computed(() => terminalFontFamily.value);
  const currentTerminalFontSize = computed(() => (isMobile.value ? terminalFontSizeMobileValue.value : terminalFontSizeDesktop.value));
  const currentEditorFontSize = computed(() => editorFontSize.value);
  const currentMobileEditorFontSize = computed(() => mobileEditorFontSize.value);
  const currentEditorFontFamily = computed(() => editorFontFamily.value);

  const applyThemeToDocument = () => {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const theme = currentUiTheme.value;
    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    root.dataset.theme = currentThemeMode.value;
    root.style.colorScheme = currentThemeMode.value;

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    themeColorMeta?.setAttribute('content', currentThemeMode.value === 'dark' ? '#020617' : '#f7f8fb');
  };

  const syncThemeModeWithSystem = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      currentThemeMode.value = 'light';
      applyThemeToDocument();
      return;
    }

    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    currentThemeMode.value = mediaQueryList.matches ? 'dark' : 'light';
    applyThemeToDocument();

    if (isThemeListenerReady) {
      return;
    }

    mediaQueryHandler = (event: MediaQueryListEvent) => {
      currentThemeMode.value = event.matches ? 'dark' : 'light';
      applyThemeToDocument();
    };

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', mediaQueryHandler);
    } else {
      mediaQueryList.addListener(mediaQueryHandler);
    }

    isThemeListenerReady = true;
  };

  async function loadInitialAppearanceData() {
    syncThemeModeWithSystem();
    initialAppearanceDataLoaded.value = true;
  }

  async function setTerminalFontSize(size: number) {
    terminalFontSizeDesktop.value = Math.max(8, Math.min(72, Math.round(size)));
  }

  async function setTerminalFontSizeMobile(size: number) {
    terminalFontSizeMobileValue.value = Math.max(8, Math.min(72, Math.round(size)));
  }

  async function setMobileEditorFontSize(size: number) {
    mobileEditorFontSize.value = Math.max(8, Math.min(40, Math.round(size)));
  }

  return {
    currentUiTheme,
    currentTerminalTheme,
    effectiveTerminalTheme,
    currentThemeMode,
    currentTerminalFontFamily,
    currentTerminalFontSize,
    currentEditorFontSize,
    currentMobileEditorFontSize,
    currentEditorFontFamily,
    initialAppearanceDataLoaded,
    terminalTextStrokeEnabled,
    terminalTextStrokeWidth,
    terminalTextStrokeColor,
    terminalTextShadowEnabled,
    terminalTextShadowOffsetX,
    terminalTextShadowOffsetY,
    terminalTextShadowBlur,
    terminalTextShadowColor,
    loadInitialAppearanceData,
    setTerminalFontSize,
    setTerminalFontSizeMobile,
    setMobileEditorFontSize,
  };
});
