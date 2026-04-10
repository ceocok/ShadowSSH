import { Router } from 'express';
import {
  login,
  changePassword,
  getAuthStatus,
  needsSetup,
  setupAdmin,
  logout
} from './auth.controller';
import { isAuthenticated } from './auth.middleware';

const router = Router();

// --- Setup Routes (Public) ---
// GET /api/v1/auth/needs-setup - 检查是否需要初始设置 (公开访问)
router.get('/needs-setup', needsSetup);

// POST /api/v1/auth/setup - 执行初始管理员设置 (公开访问，控制器内部检查)
router.post('/setup', setupAdmin);

// POST /api/v1/auth/login - 用户登录接口
router.post('/login', login);

// PUT /api/v1/auth/password - 修改密码接口 (需要认证)
router.put('/password', isAuthenticated, changePassword);

// GET /api/v1/auth/status - 获取当前认证状态 (需要认证)
router.get('/status', isAuthenticated, getAuthStatus);

// POST /api/v1/auth/logout - 用户登出接口 (公开访问)
router.post('/logout', logout);


export default router;
