import { defineStore } from 'pinia';
import apiClient from '../utils/apiClient';
import router from '../router';
import { setLocale } from '../i18n';

interface UserInfo {
    id: number;
    username: string;
    language?: 'en' | 'zh';
}

interface LoginPayload {
    username: string;
    password: string;
    rememberMe?: boolean;
}

interface AuthState {
    isAuthenticated: boolean;
    user: UserInfo | null;
    isLoading: boolean;
    error: string | null;
    needsSetup: boolean;
}

export const useAuthStore = defineStore('auth', {
    state: (): AuthState => ({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: null,
        needsSetup: false,
    }),
    getters: {
        loggedInUser: (state) => state.user?.username,
    },
    actions: {
        clearError() {
            this.error = null;
        },

        setError(errorMessage: string) {
            this.error = errorMessage;
        },

        async login(payload: LoginPayload) {
            this.isLoading = true;
            this.error = null;
            try {
                const response = await apiClient.post<{ message: string; user?: UserInfo }>('/auth/login', payload);
                if (!response.data.user) {
                    throw new Error('登录响应无效');
                }

                this.isAuthenticated = true;
                this.user = response.data.user;
                if (this.user?.language) {
                    setLocale(this.user.language);
                }
                window.location.href = '/';
                return { success: true };
            } catch (err: any) {
                this.isAuthenticated = false;
                this.user = null;
                this.error = err.response?.data?.message || err.message || '登录时发生未知错误。';
                return { success: false, error: this.error };
            } finally {
                this.isLoading = false;
            }
        },

        async logout() {
            this.isLoading = true;
            this.error = null;
            try {
                await apiClient.post('/auth/logout');
                this.isAuthenticated = false;
                this.user = null;
                await router.push({ name: 'Login' });
            } catch (err: any) {
                this.error = err.response?.data?.message || err.message || '登出时发生未知错误。';
            } finally {
                this.isLoading = false;
            }
        },

        async checkAuthStatus() {
            this.isLoading = true;
            try {
                const response = await apiClient.get<{ isAuthenticated: boolean; user: UserInfo }>('/auth/status');
                if (response.data.isAuthenticated && response.data.user) {
                    this.isAuthenticated = true;
                    this.user = response.data.user;
                    if (this.user?.language) {
                        setLocale(this.user.language);
                    }
                } else {
                    this.isAuthenticated = false;
                    this.user = null;
                }
            } catch (error: any) {
                this.isAuthenticated = false;
                this.user = null;
            } finally {
                this.isLoading = false;
            }
        },

        async changePassword(currentPassword: string, newPassword: string) {
            if (!this.isAuthenticated) {
                throw new Error('用户未登录，无法修改密码。');
            }
            this.isLoading = true;
            this.error = null;
            try {
                const response = await apiClient.put<{ message: string }>('/auth/password', {
                    currentPassword,
                    newPassword,
                });
                return true;
            } catch (err: any) {
                this.error = err.response?.data?.message || err.message || '修改密码时发生未知错误。';
                throw new Error(this.error ?? '修改密码时发生未知错误。');
            } finally {
                this.isLoading = false;
            }
        },

        async checkSetupStatus() {
            try {
                const response = await apiClient.get<{ needsSetup: boolean }>('/auth/needs-setup');
                this.needsSetup = response.data.needsSetup;
                return this.needsSetup;
            } catch (error: any) {
                this.needsSetup = false;
                return false;
            }
        },
    },
    persist: true,
});
