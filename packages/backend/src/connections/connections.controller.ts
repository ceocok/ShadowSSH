import { Request, Response } from 'express';
import * as ConnectionService from './connection.service';
import * as SshService from '../services/ssh.service';
import * as ConnectionRepository from './connection.repository';

const normalizeConnectionHost = (value: string | null | undefined): string => {
    if (!value) {
        return '';
    }
    const normalized = value.trim();
    if (normalized.startsWith('[') && normalized.endsWith(']')) {
        return normalized.slice(1, -1).trim();
    }
    return normalized;
};


/**
 * 创建新连接 (POST /api/v1/connections)
 */
export const createConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        const newConnection = await ConnectionService.createConnection(req.body);
        res.status(201).json({ message: '连接创建成功。', connection: newConnection });

    } catch (error: any) {
        console.error('Controller: 创建连接时发生错误:', error);
        if (error.message.includes('缺少') || error.message.includes('需要提供')) {
             res.status(400).json({ message: error.message });
        } else {
             res.status(500).json({ message: error.message || '创建连接时发生内部服务器错误。' });
        }
    }
};

/**
 * 获取连接列表 (GET /api/v1/connections)
 */
export const getConnections = async (req: Request, res: Response): Promise<void> => {
    try {
        const connections = await ConnectionService.getAllConnections();
        res.status(200).json(connections);
    } catch (error: any) {
        console.error('Controller: 获取连接列表时发生错误:', error);
        res.status(500).json({ message: error.message || '获取连接列表时发生内部服务器错误。' });
    }
};

/**
 * 获取单个连接信息 (GET /api/v1/connections/:id)
 */
export const getConnectionById = async (req: Request, res: Response): Promise<void> => {
    try {
        const connectionId = parseInt(req.params.id, 10);
        if (isNaN(connectionId)) {
            res.status(400).json({ message: '无效的连接 ID。' });
            return;
        }

        const connection = await ConnectionService.getConnectionById(connectionId);

        if (!connection) {
            res.status(404).json({ message: '连接未找到。' });
        } else {
            res.status(200).json(connection);
        }
    } catch (error: any) {
        console.error(`Controller: 获取连接 ${req.params.id} 时发生错误:`, error);
        res.status(500).json({ message: error.message || '获取连接信息时发生内部服务器错误。' });
    }
};

/**
 * 更新连接信息 (PUT /api/v1/connections/:id)
 */
export const updateConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        const connectionId = parseInt(req.params.id, 10);
        if (isNaN(connectionId)) {
            res.status(400).json({ message: '无效的连接 ID。' });
            return;
        }


        const updatedConnection = await ConnectionService.updateConnection(connectionId, req.body);

        if (!updatedConnection) {
            res.status(404).json({ message: '连接未找到。' });
        } else {
            res.status(200).json({ message: '连接更新成功。', connection: updatedConnection });
        }
    } catch (error: any) {
        console.error(`Controller: 更新连接 ${req.params.id} 时发生错误:`, error);
         if (error.message.includes('需要提供')) {
              res.status(400).json({ message: error.message });
         } else {
              res.status(500).json({ message: error.message || '更新连接时发生内部服务器错误。' });
         }
    }
};

/**
 * 删除连接 (DELETE /api/v1/connections/:id)
 */
export const deleteConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        const connectionId = parseInt(req.params.id, 10);
        if (isNaN(connectionId)) {
            res.status(400).json({ message: '无效的连接 ID。' });
            return;
        }

        const deleted = await ConnectionService.deleteConnection(connectionId);

        if (!deleted) {
            res.status(404).json({ message: '连接未找到。' });
        } else {
            res.status(200).json({ message: '连接删除成功。' });
        }
    } catch (error: any) {
        console.error(`Controller: 删除连接 ${req.params.id} 时发生错误:`, error);
        res.status(500).json({ message: error.message || '删除连接时发生内部服务器错误。' });
    }
};


/**
 * 测试连接 (POST /api/v1/connections/:id/test)
 */
export const testConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        const connectionId = parseInt(req.params.id, 10);
        if (isNaN(connectionId)) {
            res.status(400).json({ message: '无效的连接 ID。' });
            return;
        }

        // 调用 SshService 进行连接测试，现在它会返回延迟
        const { latency } = await SshService.testConnection(connectionId);

        res.status(200).json({ success: true, message: '连接测试成功。', latency }); // 返回延迟

    } catch (error: any) {
        console.error(`Controller: 测试连接 ${req.params.id} 时发生错误:`, error);
        res.status(500).json({ success: false, message: error.message || '测试连接时发生内部服务器错误。' });
    }
};


/**
 * 测试未保存的连接信息 (POST /api/v1/connections/test-unsaved)
 */
export const testUnsavedConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        // 从请求体中提取连接信息 (添加 ssh_key_id)
        const { host, port, username, auth_method, password, private_key, passphrase, proxy_id, ssh_key_id } = req.body;
        const normalizedHost = normalizeConnectionHost(host);

        // 基本验证
        if (!normalizedHost || !port || !username || !auth_method) {
            res.status(400).json({ success: false, message: '缺少必要的连接信息 (host, port, username, auth_method)。' });
            return;
        }
        // 密码认证时，password 字段必须存在，但可以为空字符串
        if (auth_method === 'password' && password === undefined) {
            res.status(400).json({ success: false, message: '密码认证方式需要提供 password 字段 (可以为空字符串)。' });
            return;
        }
        // 密钥认证时，必须提供 ssh_key_id 或 private_key
        if (auth_method === 'key' && !ssh_key_id && !private_key) {
            res.status(400).json({ success: false, message: '密钥认证方式需要提供 ssh_key_id 或 private_key。' });
            return;
        }
        // 如果同时提供了 ssh_key_id 和 private_key，优先使用 ssh_key_id (或者可以报错，这里选择优先)
        if (auth_method === 'key' && ssh_key_id && private_key) {
             console.warn('[testUnsavedConnection] 同时提供了 ssh_key_id 和 private_key，将优先使用 ssh_key_id。');
             // 不需要额外操作，后续逻辑会处理
        }

        // 构建传递给服务层的连接配置对象
        // 注意：这里传递的是未经验证和加密处理的原始数据
        const connectionConfig = {
            host: normalizedHost,
            port: parseInt(port, 10), // 确保 port 是数字
            username,
            auth_method,
            password, // 传递原始密码
            private_key: ssh_key_id ? undefined : private_key, // 如果有 ssh_key_id，则不传递 private_key
            passphrase: ssh_key_id ? undefined : passphrase,   // 如果有 ssh_key_id，则不传递 passphrase
            ssh_key_id: ssh_key_id ? parseInt(ssh_key_id, 10) : null, // 传递 ssh_key_id (确保是数字或 null)
            proxy_id: proxy_id ? parseInt(proxy_id, 10) : null // 确保 proxy_id 是数字或 null
        };

        // 验证 port 和 proxy_id 是否为有效数字
        if (isNaN(connectionConfig.port)) {
             res.status(400).json({ success: false, message: '端口号必须是有效的数字。' });
             return;
        }
        if (proxy_id && isNaN(connectionConfig.proxy_id as number)) {
             res.status(400).json({ success: false, message: '代理 ID 必须是有效的数字。' });
             return;
        }
        // 验证 ssh_key_id (如果提供了)
        if (ssh_key_id && isNaN(connectionConfig.ssh_key_id as number)) {
             res.status(400).json({ success: false, message: 'SSH 密钥 ID 必须是有效的数字。' });
             return;
        }


        // 调用 SshService 进行连接测试，现在它会返回延迟
        // 注意：SshService.testUnsavedConnection 需要处理原始凭证
        const { latency } = await SshService.testUnsavedConnection(connectionConfig);

        // 如果 SshService.testUnsavedConnection 没有抛出错误，则表示成功
        res.status(200).json({ success: true, message: '连接测试成功。', latency });

    } catch (error: any) {
        console.error(`Controller: 测试未保存连接时发生错误:`, error);
        // SshService 会抛出包含具体原因的 Error
        res.status(500).json({ success: false, message: error.message || '测试连接时发生内部服务器错误。' });
    }
};



/**
 * 克隆连接 (POST /api/v1/connections/:id/clone)
 */
export const cloneConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        const originalConnectionId = parseInt(req.params.id, 10);
        const { name: newName } = req.body; // 从请求体获取新名称

        if (isNaN(originalConnectionId)) {
            res.status(400).json({ message: '无效的原始连接 ID。' });
            return;
        }
        if (!newName || typeof newName !== 'string') {
            res.status(400).json({ message: '需要提供有效的字符串类型的新连接名称 (name)。' });
            return;
        }

        const clonedConnection = await ConnectionService.cloneConnection(originalConnectionId, newName);

        res.status(201).json({ message: '连接克隆成功。', connection: clonedConnection });

    } catch (error: any) {
        console.error(`Controller: 克隆连接 ${req.params.id} 时发生错误:`, error);
        if (error.message.includes('未找到')) {
             res.status(404).json({ message: error.message });
        } else if (error.message.includes('名称已存在')) {
             res.status(409).json({ message: error.message }); // 409 Conflict for duplicate name
        } else {
             res.status(500).json({ message: error.message || '克隆连接时发生内部服务器错误。' });
        }
    }
};
/**
 * 为多个连接添加一个标签 (POST /api/v1/connections/add-tag)
 * 注意：我们改变了路由和方法 (POST)，并使用请求体传递所有信息，以避免嵌套事务。
 */
export const addTagToConnections = async (req: Request, res: Response): Promise<void> => {
    try {
        const { connection_ids, tag_id } = req.body;

        // 验证输入
        if (!Array.isArray(connection_ids) || !connection_ids.every(id => typeof id === 'number')) {
            res.status(400).json({ message: 'connection_ids 必须是一个数字数组。' });
            return;
        }
        if (typeof tag_id !== 'number' || tag_id <= 0) {
            res.status(400).json({ message: 'tag_id 必须是一个有效的正整数。' });
            return;
        }
        if (connection_ids.length === 0) {
             res.status(400).json({ message: 'connection_ids 不能为空数组。' });
             return;
        }

        // 调用服务层批量添加标签
        await ConnectionService.addTagToConnections(connection_ids, tag_id);

        res.status(200).json({ message: '标签已成功添加到指定连接。' });

    } catch (error: any) {
        console.error(`Controller: 为多个连接添加标签 ${req.body?.tag_id} 时发生错误:`, error);
        // 可以根据服务层抛出的错误类型返回更具体的错误码
        if (error.message.includes('标签 ID') && error.message.includes('不存在')) {
             res.status(400).json({ message: error.message }); // Bad request if tag doesn't exist
        } else {
             res.status(500).json({ message: error.message || '为连接添加标签时发生内部服务器错误。' });
        }
    }
};


/**
 * 更新单个连接的标签 (PUT /api/v1/connections/:id/tags)
 * (保留此接口，但主要逻辑由 addTagToConnections 处理)
 */
export const updateConnectionTags = async (req: Request, res: Response): Promise<void> => {
    try {
        const connectionId = parseInt(req.params.id, 10);
        const { tag_ids } = req.body;

        if (isNaN(connectionId)) {
            res.status(400).json({ message: '无效的连接 ID。' });
            return;
        }
        if (!Array.isArray(tag_ids) || !tag_ids.every(id => typeof id === 'number')) {
             res.status(400).json({ message: 'tag_ids 必须是一个数字数组。' });
             return;
        }

        const success = await ConnectionService.updateConnectionTags(connectionId, tag_ids);

        if (!success) {
            res.status(404).json({ message: '连接未找到或更新标签失败。' });
        } else {
            res.status(200).json({ message: '连接标签更新成功。' });
        }
    } catch (error: any) {
        console.error(`Controller: 更新连接 ${req.params.id} 的标签时发生错误:`, error);
        if (error.message.includes('未找到')) {
             res.status(404).json({ message: error.message });
        } else {
             res.status(500).json({ message: error.message || '更新连接标签时发生内部服务器错误。' });
        }
    }
};
