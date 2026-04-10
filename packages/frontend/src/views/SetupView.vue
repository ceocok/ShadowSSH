<template>
  <div class="auth-shell">
    <div class="auth-card">
      <div class="auth-card__mark">S</div>

      <form @submit.prevent="handleSetup" class="auth-form">
        <input
          id="username"
          v-model="username"
          name="username"
          type="text"
          required
          :disabled="isLoading"
          :placeholder="$t('setup.username')"
          class="auth-input"
        />
        <input
          id="password"
          v-model="password"
          name="password"
          type="password"
          required
          :disabled="isLoading"
          :placeholder="$t('setup.password')"
          class="auth-input"
        />
        <input
          id="confirmPassword"
          v-model="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          :disabled="isLoading"
          :placeholder="$t('setup.confirmPassword')"
          class="auth-input"
        />

        <div v-if="error" class="auth-error">
          {{ error }}
        </div>
        <div v-if="successMessage" class="auth-success">
          {{ successMessage }}
        </div>

        <button type="submit" :disabled="isLoading" class="auth-submit">
          <span v-if="isLoading">{{ $t('setup.settingUp') }}</span>
          <span v-else>{{ $t('setup.submitButton') }}</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import apiClient from '../utils/apiClient';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth.store';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const isLoading = ref(false);
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);

const handleSetup = async () => {
  error.value = null;
  successMessage.value = null;

  if (password.value !== confirmPassword.value) {
    error.value = t('setup.error.passwordsDoNotMatch');
    return;
  }

  if (!username.value || !password.value) {
    error.value = t('setup.error.fieldsRequired');
    return;
  }

  isLoading.value = true;

  try {
    await apiClient.post('/auth/setup', {
      username: username.value,
      password: password.value,
      confirmPassword: confirmPassword.value
    });
    successMessage.value = t('setup.success');
    authStore.needsSetup = false;
    authStore.isAuthenticated = false;
    authStore.user = null;
    router.push('/login');
  } catch (err: any) {
    if (err.response?.data?.message) {
      error.value = err.response.data.message;
    } else if (err.message) {
      error.value = err.message;
    } else {
      error.value = t('setup.error.generic');
    }
    isLoading.value = false;
  }
};
</script>

<style scoped>
.auth-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    var(--surface-page-radial),
    var(--surface-page-linear);
}

.auth-card {
  width: min(460px, 100%);
  padding: 34px 32px;
  border: 1px solid var(--surface-card-border);
  border-radius: 32px;
  background: var(--surface-card-bg);
  box-shadow: var(--surface-card-shadow);
  backdrop-filter: blur(24px);
}

.auth-card__mark {
  margin-bottom: 28px;
  text-align: center;
  color: var(--text-color);
  font-size: 72px;
  font-weight: 800;
  line-height: 1;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.auth-input {
  width: 100%;
  box-sizing: border-box;
  padding: 14px 16px;
  border: 1px solid var(--surface-input-border);
  border-radius: 18px;
  background: var(--surface-input-bg);
  color: var(--text-color);
  font-size: 15px;
}

.auth-error,
.auth-success {
  margin: 0;
  padding: 12px 14px;
  border-radius: 16px;
  font-size: 13px;
}

.auth-error {
  background: var(--danger-soft-bg);
  color: var(--danger-color);
}

.auth-success {
  background: var(--success-soft-bg);
  color: var(--success-color);
}

.auth-submit {
  height: 52px;
  border: 0;
  border-radius: 18px;
  background: var(--auth-submit-gradient);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  box-shadow: var(--auth-submit-shadow);
}
</style>
