/**
 * dsh-niao-message 宿主端类型声明。
 *
 * 宿主端导出 cordis 插件入口（name / apply），通过监听宿主事件
 * `session/event` 驱动 terminal-notifier 弹出 macOS 通知中心横幅。
 * 本插件为纯宿主端实现，无浏览器端 bundle。
 *
 * @module dsh-niao-message
 */

/** 点击横幅时的行为配置。 */
export interface ClickConfig {
  /** 用 `open -a` 打开的应用名（如 'DeepSeek Harness'）。 */
  open?: string
  /** 备选：按 bundle id 激活应用（如 'com.google.Chrome'）。 */
  activate?: string
}

/** 单个通知场景的配置。 */
export interface ScenarioConfig {
  /** 是否启用该场景。 */
  enabled?: boolean
  /** macOS 提示音名。 */
  sound?: string
  /** 横幅标题模板（支持 {var}）。 */
  title?: string
  /** 横幅消息模板（支持 {var}，如 {tool} {name} {code}）。 */
  message?: string
}

/** 插件配置；所有字段可选，未提供时使用 DEFAULTS。 */
export interface NiaoMessageConfig {
  /** 总开关：false 时全部场景静默。 */
  enabled?: boolean
  /** terminal-notifier 可执行文件路径；留空自动探测。 */
  tool?: string
  /** 点击横幅时的行为。 */
  click?: string | ClickConfig
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
  /** 各场景独立配置。 */
  scenarios?: Record<string, ScenarioConfig>
  /** 旧版开关（兼容映射到 scenarios）：Agent 提问时通知。 */
  onQuestion?: boolean
  /** 旧版开关（兼容映射到 scenarios）：批准滞留时通知。 */
  onApproval?: boolean
  /** 旧版开关（兼容映射到 scenarios）：工具出错时通知。 */
  onToolError?: boolean
  /** 旧版开关（兼容映射到 scenarios）：整轮出错时通知。 */
  onTurnError?: boolean
  /** 旧版开关（兼容映射到 scenarios）：整轮完成时通知。 */
  onComplete?: boolean
}

export declare const name: 'dsh-niao-message'

/** 解析 terminal-notifier 可执行文件路径（配置 → 插件自带 → node-notifier 自带 → 系统路径 → PATH）。 */
export declare function resolveTool(tool?: string): string

export declare function apply(ctx: unknown, config?: NiaoMessageConfig): void
