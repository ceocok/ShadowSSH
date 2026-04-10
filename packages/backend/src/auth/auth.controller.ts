import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { getDbInstance, runDb, getDb } from '../database/connection';
import { userRepository } from '../user/user.repository';

declare module 'express-session' {
    interface SessionData {
        userId?: number;
        username?: string;
        rememberMe?: boolean;
    }
}

interface UserRow {
    id: number;
    username: string;
    hashed_password: string;
    created_at: number;
    updated_at: number;
}

export const needsSetup = async (_req: Request, res: Response): Promise<void> => {
    try {
        const db = await getDbInstance();
        const row = await getDb<{ count: number }>(db, 'SELECT COUNT(*) as count FROM users');
        res.status(200).json({ needsSetup: !row || row.count === 0 });
    } catch (error: any) {
        res.status(500).json({ message: error.message || '检查初始化状态失败。' });
    }
};

export const setupAdmin = async (req: Request, res: Response): Promise<void> => {
    const { username, password, confirmPassword } = req.body;
    if (!username || !password || !confirmPassword) {
        res.status(400).json({ message: '请填写完整的用户名和密码。' });
        return;
    }
    if (password !== confirmPassword) {
        res.status(400).json({ message: '两次输入的密码不一致。' });
        return;
    }

    try {
        const db = await getDbInstance();
        const existing = await getDb<{ count: number }>(db, 'SELECT COUNT(*) as count FROM users');
        if (existing && existing.count > 0) {
            res.status(409).json({ message: '系统已完成初始化。' });
            return;
        }

        const now = Math.floor(Date.now() / 1000);
        const hashedPassword = await bcrypt.hash(password, 10);
        await runDb(
            db,
            'INSERT INTO users (username, hashed_password, created_at, updated_at) VALUES (?, ?, ?, ?)',
            [username.trim(), hashedPassword, now, now]
        );

        res.status(201).json({ message: '初始化成功。' });
    } catch (error: any) {
        res.status(500).json({ message: error.message || '初始化失败。' });
    }
};

export const login = async (req: Request, res: Response): Promise<void> => {
    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
        res.status(400).json({ message: '请输入用户名和密码。' });
        return;
    }

    try {
        const user = await userRepository.findUserByUsername(username.trim()) as UserRow | null;
        if (!user) {
            res.status(401).json({ message: '用户名或密码错误。' });
            return;
        }

        const passwordMatched = await bcrypt.compare(password, user.hashed_password);
        if (!passwordMatched) {
            res.status(401).json({ message: '用户名或密码错误。' });
            return;
        }

        req.session.userId = user.id;
        req.session.username = user.username;
        if (rememberMe) {
            req.session.cookie.maxAge = 315360000000;
        } else {
            req.session.cookie.maxAge = undefined;
        }

        res.status(200).json({
            message: '登录成功。',
            user: {
                id: user.id,
                username: user.username,
            }
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message || '登录失败。' });
    }
};

export const getAuthStatus = async (req: Request, res: Response): Promise<void> => {
    if (!req.session.userId || !req.session.username) {
        res.status(200).json({ isAuthenticated: false });
        return;
    }

    res.status(200).json({
        isAuthenticated: true,
        user: {
            id: req.session.userId,
            username: req.session.username,
        }
    });
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
        res.status(401).json({ message: '未授权。' });
        return;
    }
    if (!currentPassword || !newPassword) {
        res.status(400).json({ message: '请输入当前密码和新密码。' });
        return;
    }

    try {
        const user = await userRepository.findUserById(userId) as UserRow | null;
        if (!user) {
            res.status(404).json({ message: '用户不存在。' });
            return;
        }

        const passwordMatched = await bcrypt.compare(currentPassword, user.hashed_password);
        if (!passwordMatched) {
            res.status(401).json({ message: '当前密码错误。' });
            return;
        }

        const newHashedPassword = await bcrypt.hash(newPassword, 10);
        const now = Math.floor(Date.now() / 1000);
        const db = await getDbInstance();
        await runDb(db, 'UPDATE users SET hashed_password = ?, updated_at = ? WHERE id = ?', [newHashedPassword, now, userId]);

        res.status(200).json({ message: '密码修改成功。' });
    } catch (error: any) {
        res.status(500).json({ message: error.message || '密码修改失败。' });
    }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
    req.session.destroy((error) => {
        if (error) {
            res.status(500).json({ message: '登出失败。' });
            return;
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: '已登出。' });
    });
};
