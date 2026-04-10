<script setup lang="ts">
import { reactive, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth.store';

const { t } = useI18n();
const authStore = useAuthStore();
const { isLoading, error } = storeToRefs(authStore);

const credentials = reactive({
  username: '',
  password: '',
});

const rememberMe = ref(false);

const handleSubmit = async () => {
  await authStore.login({
    ...credentials,
    rememberMe: rememberMe.value,
  });
};
</script>

<template>
  <div class="auth-shell">
    <div class="auth-card">
      <div class="auth-card__mark">S</div>

      <form class="auth-form" @submit.prevent="handleSubmit">
        <input
          v-model="credentials.username"
          type="text"
          autocomplete="username"
          :disabled="isLoading"
          required
          :placeholder="t('login.username')"
          class="auth-input"
        />

        <input
          v-model="credentials.password"
          type="password"
          autocomplete="current-password"
          :disabled="isLoading"
          required
          :placeholder="t('login.password')"
          class="auth-input"
        />

        <label class="auth-remember">
          <input v-model="rememberMe" type="checkbox" :disabled="isLoading" />
          <span>{{ t('login.rememberMe', '记住我') }}</span>
        </label>

        <p v-if="error" class="auth-error">{{ error }}</p>

        <button class="auth-submit" type="submit" :disabled="isLoading">
          {{ isLoading ? t('common.loading', '处理中...') : t('login.loginButton', '登录') }}
        </button>
      </form>
    </div>
  </div>
</template>

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

.auth-remember {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.auth-error {
  margin: 0;
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--danger-soft-bg);
  color: var(--danger-color);
  font-size: 13px;
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
