// packages/backend/src/types/settings.types.ts

// Define PaneName here as it's logically related to layout/sidebar settings
export type PaneName = 'connections' | 'terminal' | 'commandBar' | 'fileManager' | 'editor' | 'statusMonitor';

/**
 * 布局节点接口 (Mirrors frontend definition for backend use)
 */
export interface LayoutNode {
  id: string; // 唯一 ID (Note: Backend might not always use/store this)
  type: 'pane' | 'container'; // 节点类型：面板或容器
  component?: PaneName; // 如果 type 是 'pane'，指定要渲染的组件
  direction?: 'horizontal' | 'vertical'; // 如果 type 是 'container'，指定分割方向
  children?: LayoutNode[]; // 如果 type 是 'container'，包含子节点数组
  size?: number; // 节点在父容器中的大小比例 (例如 20, 50, 30)
}

/**
 * 侧栏配置数据结构 (Managed by Settings Repository/Service)
 */
export interface SidebarConfig {
    left: PaneName[];
    right: PaneName[];
}

/**
 * 用于更新侧栏配置的 DTO
 */
export interface UpdateSidebarConfigDto extends SidebarConfig {} // Simple alias for now, can add validation later

/**
 * 完整的应用设置接口 (聚合所有设置类型)
 * 注意：这只是一个示例结构，实际可能需要根据 SettingsRepository 的实现调整
 */
export interface AppSettings {
    sidebar?: SidebarConfig;
    showStatusMonitorIpAddress?: boolean; // 是否在状态监视器中显示IP地址
    // 可以添加其他设置模块，例如：
    // security?: SecuritySettings;
    // general?: GeneralSettings;
}
