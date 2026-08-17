/**
 * dsh-niao-message 宿主端类型声明。
 *
 * 宿主端导出 cordis 插件入口（name / apply），通过监听宿主事件
 * `session/event` 与 `subagent/end` 驱动 terminal-notifier 弹出
 * macOS 通知中心横幅。
 *
 * @module dsh-niao-message
 */

/** 三大通知组 key（与 lib/index.js 的 GROUP_KEYS 对应）。 */
export type GroupKey = 'abnormal' | 'waiting' | 'success'

/** 点击横幅时的行为配置。 */
export interface ClickConfig {
  /** 用 `open -a` 打开的应用名（如 'DeepSeek Harness'）。 */
  open?: string
  /** 备选：按 bundle id 激活应用（如 'com.google.Chrome'）。 */
  activate?: string
}

/** 单个通知组的配置。 */
export interface GroupConfig {
  /** 是否启用该组。 */
  enabled?: boolean
  /** macOS 提示音名。 */
  sound?: string
  /** 横幅标题模板（支持 {var}）。 */
  title?: string
  /** 横幅消息模板（支持 {var}：{reason} {tool}）。 */
  message?: string
}

/** 插件配置；所有字段可选，未提供时使用 DEFAULTS。 */
export interface NiaoMessageConfig {
  /** 总开关：false 时全部组静默。 */
  enabled?: boolean
  /** terminal-notifier 可执行文件路径；留空自动探测。 */
  tool?: string
  /** 点击横幅时的行为（对象 / 自定义 shell 字符串）。 */
  click?: string | ClickConfig
  /** 重复通知：true=未点击通知存在时仍继续弹新通知。 */
  allowRepeat?: boolean
  /** 同类通知节流窗口（毫秒）。 */
  throttleMs?: number
  /** approval/asked 后的宽限期（毫秒）。 */
  approvalGraceMs?: number
  /** 未点击去重标记文件路径。 */
  pendingFile?: string
  /** 设置面板持久化配置文件路径。 */
  configFile?: string
  /** 标记过期时间（毫秒）。 */
  pendingMaxAgeMs?: number
  /** 三大通知组配置。 */
  groups?: Partial<Record<GroupKey, GroupConfig>>
}

export declare const name: 'dsh-niao-message'

/** 解析 terminal-notifier 可执行文件路径（配置 → 插件自带 → node-notifier 自带 → 系统路径 → PATH）。 */
export declare function resolveTool(tool?: string): string

export declare function apply(ctx: unknown, config?: NiaoMessageConfig): void
