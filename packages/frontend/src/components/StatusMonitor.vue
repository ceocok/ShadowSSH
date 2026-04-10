<template>
  <div class="status-monitor" :class="{ 'is-empty': !activeSessionId }">
    <div v-if="!activeSessionId" class="status-state">
      <i class="fas fa-plug"></i>
      <span>{{ t('layout.noActiveSession.title') }}</span>
    </div>

    <div v-else-if="currentStatusError" class="status-state is-error">
      <i class="fas fa-exclamation-triangle"></i>
      <span>{{ t('statusMonitor.errorPrefix') }} {{ currentStatusError }}</span>
    </div>

    <div v-else-if="!currentServerStatus" class="status-state">
      <i class="fas fa-spinner fa-spin"></i>
      <span>{{ t('statusMonitor.loading') }}</span>
    </div>

    <div v-else class="status-grid">
      <div class="status-meta-row">
        <label>{{ t('statusMonitor.cpuModelLabel') }}</label>
        <div class="status-meta-row__content">
          <span class="status-meta-row__value" :title="displayCpuModel">{{ displayCpuModel }}</span>
        </div>
      </div>

      <div class="status-meta-row">
        <label>{{ t('statusMonitor.osLabel') }}</label>
        <div class="status-meta-row__content">
          <span class="status-meta-row__value" :title="displayOsName">{{ displayOsName }}</span>
        </div>
      </div>

      <div class="status-resource-list">
        <div class="status-resource-row">
          <label class="status-resource-row__label">{{ t('statusMonitor.cpuLabel') }}</label>
          <div class="status-resource-row__body">
            <el-progress
              :percentage="displayCpuPercent"
              :stroke-width="14"
              color="#3b82f6"
              :show-text="false"
              class="themed-progress"
              :class="{ 'no-transition': isSwitchingSession }"
            />
            <span class="status-resource-row__metrics">{{ formatPercentageText(displayCpuPercent) }}</span>
          </div>
        </div>

        <div class="status-resource-row">
          <label class="status-resource-row__label">{{ t('statusMonitor.memoryLabel') }}</label>
          <div class="status-resource-row__body">
            <el-progress
              :percentage="displayMemPercent"
              :stroke-width="14"
              color="#22c55e"
              :show-text="false"
              class="themed-progress"
              :class="{ 'no-transition': isSwitchingSession }"
            />
            <span class="status-resource-row__metrics">{{ memDisplay }} ({{ formatPercentageText(displayMemPercent) }})</span>
          </div>
        </div>

        <div class="status-resource-row">
          <label class="status-resource-row__label">{{ t('statusMonitor.swapLabel') }}</label>
          <div class="status-resource-row__body">
            <el-progress
              :percentage="displaySwapPercent"
              :stroke-width="14"
              :color="(currentServerStatus?.swapPercent ?? 0) > 0 ? '#eab308' : '#94a3b8'"
              :show-text="false"
              class="themed-progress"
              :class="{ 'no-transition': isSwitchingSession }"
            />
            <span class="status-resource-row__metrics">{{ swapDisplay }} ({{ formatPercentageText(displaySwapPercent) }})</span>
          </div>
        </div>

        <div class="status-resource-row">
          <label class="status-resource-row__label">{{ t('statusMonitor.diskLabel') }}</label>
          <div class="status-resource-row__body">
            <el-progress
              :percentage="displayDiskPercent"
              :stroke-width="14"
              color="#0ea5e9"
              :show-text="false"
              class="themed-progress"
              :class="{ 'no-transition': isSwitchingSession }"
            />
            <span class="status-resource-row__metrics">{{ diskDisplay }} ({{ formatPercentageText(displayDiskPercent) }})</span>
          </div>
        </div>
      </div>

      <div class="status-network-row">
        <label class="status-network-row__label">{{ t('statusMonitor.networkLabel') }}:</label>
        <div class="status-network-row__values">
          <span class="status-network-row__rate is-down">
            <i class="fas fa-arrow-down"></i>
            <span>{{ formatBytesPerSecond(currentServerStatus?.netRxRate) }}</span>
          </span>
          <span class="status-network-row__rate is-up">
            <i class="fas fa-arrow-up"></i>
            <span>{{ formatBytesPerSecond(currentServerStatus?.netTxRate) }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, type PropType, nextTick } from 'vue';
import { ElProgress } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { useSessionStore } from '../stores/session.store';
import { storeToRefs } from 'pinia';

const { t } = useI18n();
const sessionStore = useSessionStore();
const { sessions } = storeToRefs(sessionStore);
const isSwitchingSession = ref(false);

const formatPercentageText = (percentage: number): string => `${Math.round(percentage)}%`;

interface ServerStatus {
  cpuPercent?: number;
  memPercent?: number;
  memUsed?: number;
  memTotal?: number;
  swapPercent?: number;
  swapUsed?: number;
  swapTotal?: number;
  diskPercent?: number;
  diskUsed?: number;
  diskTotal?: number;
  cpuModel?: string;
  netRxRate?: number;
  netTxRate?: number;
  netInterface?: string;
  osName?: string;
}

const props = defineProps({
  activeSessionId: {
    type: String as PropType<string | null>,
    required: false,
    default: null,
  },
});

const currentSessionState = computed(() => {
  return props.activeSessionId ? sessions.value.get(props.activeSessionId) : null;
});

const currentServerStatus = computed<ServerStatus | null>(() => {
  return currentSessionState.value?.statusMonitorManager?.serverStatus?.value ?? null;
});

const displayCpuPercent = computed(() => currentServerStatus.value?.cpuPercent ?? 0);
const displayMemPercent = computed(() => currentServerStatus.value?.memPercent ?? 0);
const displaySwapPercent = computed(() => currentServerStatus.value?.swapPercent ?? 0);
const displayDiskPercent = computed(() => currentServerStatus.value?.diskPercent ?? 0);

const currentStatusError = computed<string | null>(() => {
  return currentSessionState.value?.statusMonitorManager?.statusError?.value ?? null;
});

const cachedCpuModel = ref<string | null>(null);
const cachedOsName = ref<string | null>(null);

watch(currentServerStatus, (newData) => {
  if (newData?.cpuModel) {
    cachedCpuModel.value = newData.cpuModel;
  }
  if (newData?.osName) {
    cachedOsName.value = newData.osName;
  }
}, { immediate: true });

watch(() => props.activeSessionId, async (newId, oldId) => {
  if (newId !== oldId) {
    isSwitchingSession.value = true;
    await nextTick();
    isSwitchingSession.value = false;
  }
});

const displayCpuModel = computed(() => {
  return (currentServerStatus.value?.cpuModel ?? cachedCpuModel.value) || t('statusMonitor.notAvailable');
});

const displayOsName = computed(() => {
  return (currentServerStatus.value?.osName ?? cachedOsName.value) || t('statusMonitor.notAvailable');
});

const formatBytesPerSecond = (bytes?: number): string => {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return t('statusMonitor.notAvailable');
  if (bytes < 1024) return `${bytes} ${t('statusMonitor.bytesPerSecond')}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${t('statusMonitor.kiloBytesPerSecond')}`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ${t('statusMonitor.megaBytesPerSecond')}`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ${t('statusMonitor.gigaBytesPerSecond')}`;
};

const formatKbToGb = (kb?: number): string => {
  if (kb === undefined || kb === null) return t('statusMonitor.notAvailable');
  if (kb === 0) return `0.0 ${t('statusMonitor.gigaBytes')}`;
  const gb = kb / 1024 / 1024;
  return `${gb.toFixed(1)} ${t('statusMonitor.gigaBytes')}`;
};

const formatMemorySize = (mb?: number): string => {
  if (mb === undefined || mb === null || isNaN(mb)) return t('statusMonitor.notAvailable');
  if (mb < 1024) {
    const value = Number.isInteger(mb) ? mb : mb.toFixed(1);
    return `${value} ${t('statusMonitor.megaBytes')}`;
  }
  return `${(mb / 1024).toFixed(1)} ${t('statusMonitor.gigaBytes')}`;
};

const memDisplay = computed(() => {
  const data = currentServerStatus.value;
  if (!data || data.memUsed === undefined || data.memTotal === undefined) return t('statusMonitor.notAvailable');
  return `${formatMemorySize(data.memUsed)} / ${formatMemorySize(data.memTotal)}`;
});

const diskDisplay = computed(() => {
  const data = currentServerStatus.value;
  if (!data || data.diskUsed === undefined || data.diskTotal === undefined) return t('statusMonitor.notAvailable');
  return `${formatKbToGb(data.diskUsed)} / ${formatKbToGb(data.diskTotal)}`;
});

const swapDisplay = computed(() => {
  const data = currentServerStatus.value;
  const used = data?.swapUsed ?? 0;
  const total = data?.swapTotal ?? 0;
  if (total === 0) {
    return t('statusMonitor.swapNotAvailable');
  }
  return `${formatMemorySize(used)} / ${formatMemorySize(total)}`;
});

</script>

<style scoped>
.status-monitor {
  height: 100%;
  padding: 12px 14px;
  overflow-y: auto;
  overflow-x: hidden;
  color: var(--text-color);
  background: transparent;
  font-size: 13px;
}

.status-state {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  text-align: center;
  color: var(--text-color-secondary);
}

.status-state i {
  color: inherit;
  font-size: 24px;
}

.status-state.is-error {
  color: #dc2626;
}

.status-grid {
  display: grid;
  gap: 8px;
}

.status-meta-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
}

.status-meta-row label,
.status-resource-row__label,
.status-network-row__label {
  color: var(--text-color-secondary);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
}

.status-meta-row__content {
  min-width: 0;
}

.status-meta-row__value {
  display: block;
  color: var(--text-color);
  font-size: 12px;
  line-height: 1.3;
  white-space: nowrap;
}

.status-meta-row__value.is-interactive {
  cursor: pointer;
}

.status-resource-list {
  display: grid;
  gap: 8px;
  padding-top: 2px;
}

.status-resource-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
}

.status-resource-row__body {
  display: grid;
  grid-template-columns: minmax(76px, 108px) minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.status-resource-row__metrics {
  min-width: 0;
  color: var(--text-color);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.3;
  white-space: nowrap;
}

.status-network-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
}

.status-network-row__values {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px 14px;
  min-width: 0;
}

.status-network-row__rate {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.3;
  white-space: nowrap;
}

.status-network-row__rate.is-down {
  color: #16a34a;
}

.status-network-row__rate.is-up {
  color: #f97316;
}

.status-network-row__rate i {
  color: inherit;
  font-size: 11px;
}

::v-deep(.el-progress-bar__outer) {
  background-color: var(--surface-soft-bg) !important;
  height: 14px !important;
  border-radius: 999px !important;
}

::v-deep(.themed-progress .el-progress-bar__inner) {
  transition: width 0.3s ease-in-out;
  border-radius: 999px !important;
}

::v-deep(.themed-progress.no-transition .el-progress-bar__inner) {
  transition: none !important;
}

::v-deep(.themed-progress .el-progress-bar) {
  margin-right: 0 !important;
}

@media (max-width: 960px) {
  .status-resource-row__body {
    grid-template-columns: minmax(70px, 96px) minmax(0, 1fr);
  }
}
</style>
