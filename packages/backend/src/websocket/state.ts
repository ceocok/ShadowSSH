import { ClientState } from './types';
import { SftpService } from '../sftp/sftp.service';
import { StatusMonitorService } from '../services/status-monitor.service';
import { settingsService } from '../settings/settings.service'; // 添加导入

// 存储所有活动客户端的状态 (key: sessionId)
export const clientStates = new Map<string, ClientState>();

// --- 服务实例化 ---
// 将 clientStates 传递给需要访问共享状态的服务
export const sftpService = new SftpService(clientStates);
export const statusMonitorService = new StatusMonitorService(clientStates);
export { settingsService }; // 导出 settingsService
