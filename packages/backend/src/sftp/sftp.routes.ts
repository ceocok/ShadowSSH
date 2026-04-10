import { Router } from 'express';
import { isAuthenticated } from '../auth/auth.middleware';

const router = Router();

// 应用认证中间件
router.use(isAuthenticated);

export default router;
