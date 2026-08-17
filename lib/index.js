/**
 * dsh-niao-message — DeepSeek Harness profile bundle（宿主端）。
 *
 * macOS 系统通知：在「真正需要人」的时机，用 terminal-notifier 向通知中心
 * 弹出横幅；点击横幅打开指定软件（默认 DeepSeek Harness）并清除「未点击
 * 去重」标记。
 *
 * 本版本支持浏览器端设置面板（settings.section「通知管理」）：
 *   - 通过同源路由 /api/dsh-niao-message 读取/写入配置；
 *   - 配置持久化到 configFile（默认 ~/.dsh/dsh-niao-message.config.json）；
 *   - 每个可通知场景（等待用户确认 / 等待批准 / 工具失败 / 完成 / 出错 /
 *     中止 / 超限 / 阻塞 / 中断 / 子代理结束）独立开关、提示音、标题/消息模板。
 *
 * 事件驱动依据（Host Event 契约）：
 *   - 'session/event'(session, event)：event.type ∈ tool/call、tool/result、
 *     approval/asked、approval/decided、turn/end
 *   - 'subagent/end'(info)
 *
 * 注意（cordis 约定）：配置是 apply 的【第二个参数】，绝不能读 ctx.config。
 *
 * @module dsh-niao-message
 */

import { execFile } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-niao-message'

/** 本文件所在目录（lib/）。 */
const LIB_DIR = dirname(fileURLToPath(import.meta.url))

/** 同源路由路径（exact 匹配）。 */
const ROUTE_PATH = '/api/dsh-niao-message'

/** 全部可通知场景的 key（与浏览器端面板 SCENARIOS 对应）。 */
const SCENARIO_KEYS = [
  'question',
  'approval',
  'tool-error',
  'done',
  'turn-error',
  'aborted',
  'max-tokens',
  'blocked',
  'interrupted',
  'subagent-end',
]

/** turn/end 的 reason.kind → 场景 key（kind 未列出的不通知）。 */
const TURN_KIND_TO_KEY = {
  completed: 'done',
  error: 'turn-error',
  aborted: 'aborted',
  'max-tokens': 'max-tokens',
  blocked: 'blocked',
  interrupted: 'interrupted',
}

/** 旧版 dsh-notify 顶层开关 → 场景 key 的兼容映射。 */
const LEGACY_TOGGLES = {
  onQuestion: 'question',
  onApproval: 'approval',
  onToolError: 'tool-error',
  onTurnError: 'turn-error',
  onComplete: 'done',
}

/** 运行时默认配置（用户可在 profile 补丁层或设置面板覆盖）。 */
const DEFAULTS = {
  /** 总开关：false 时全部场景静默。 */
  enabled: true,
  /** terminal-notifier 可执行文件路径；留空则按候选路径自动探测。 */
  tool: '',
  /** 点击横幅时的行为：open=应用名 / activate=bundle id / 字符串=自定义 shell。 */
  click: { open: 'DeepSeek Harness' },
  /** 同类通知节流窗口（毫秒）。 */
  throttleMs: 3000,
  /** approval/asked 后等待 approval/decided 的宽限期；期内自动放行则静默。 */
  approvalGraceMs: 1000,
  /** 标记过期时间（毫秒）。 */
  pendingMaxAgeMs: 5 * 60 * 1000,
  /** 「未点击通知仍在通知中心」的标记文件路径。 */
  pendingFile: join(homedir(), '.dsh', 'dsh-niao-message-pending.json'),
  /** 设置面板持久化配置文件路径。 */
  configFile: join(homedir(), '.dsh', 'dsh-niao-message.config.json'),
  /** 各场景配置：enabled / sound / title / message（{var} 为模板变量）。 */
  scenarios: {
    question: { enabled: true, sound: 'Glass', title: 'DSH · 需要你回答', message: 'Agent 正在等待你的回答' },
    approval: { enabled: true, sound: 'Ping', title: 'DSH · 需要你批准', message: '等待批准：{tool}' },
    'tool-error': { enabled: false, sound: 'Basso', title: 'DSH · 工具出错', message: '{name} ({code})' },
    done: { enabled: true, sound: 'Glass', title: 'DSH · 任务完成', message: '本轮任务已完成' },
    'turn-error': { enabled: true, sound: 'Sosumi', title: 'DSH · 任务出错', message: '本轮任务以错误结束' },
    aborted: { enabled: false, sound: 'Glass', title: 'DSH · 任务中止', message: '本轮任务被用户中止' },
    'max-tokens': { enabled: false, sound: 'Glass', title: 'DSH · 上下文超限', message: '本轮任务达到上下文上限' },
    blocked: { enabled: false, sound: 'Glass', title: 'DSH · 任务阻塞', message: '本轮任务处于阻塞状态' },
    interrupted: { enabled: false, sound: 'Glass', title: 'DSH · 任务中断', message: '本轮任务被中断' },
    'subagent-end': { enabled: false, sound: 'Glass', title: 'DSH · 子代理结束', message: '子代理任务已结束' },
  },
}

/** 面板可持久化的键（tool / pendingFile / configFile 由 patch 配置决定）。 */
const PERSIST_KEYS = ['enabled', 'click', 'throttleMs', 'approvalGraceMs', 'pendingMaxAgeMs', 'scenarios']

/* ------------------------------------------------------------------ */
/* 工具：terminal-notifier 定位                                          */
/* ------------------------------------------------------------------ */

/**
 * 定位 terminal-notifier 可执行文件，优先级从高到低：
 *   1. 用户显式配置的 `tool` 路径；
 *   2. 本插件自带（vendored）二进制 `lib/vendor/terminal-notifier.app`
 *      —— Apple Silicon (arm64)，随插件分发，用户无需安装任何工具；
 *   3. node-notifier 包自带的二进制（x86_64，Intel Mac 兜底；node-notifier
 *      是 npm 依赖，安装插件时自动安装，同样无需用户手动装系统工具）；
 *   4. 系统常见安装路径（/opt/homebrew、/usr/local、/usr）；
 *   5. 最后回退到 PATH 中的 `terminal-notifier`。
 */
export function resolveTool(tool) {
  if (tool && existsSync(tool)) return tool

  // 2) 插件自带的 arm64 .app（需保留完整 .app 结构，裸二进制会挂起）。
  const vendored = join(LIB_DIR, 'vendor', 'terminal-notifier.app', 'Contents', 'MacOS', 'terminal-notifier')
  if (existsSync(vendored)) return vendored

  // 3) node-notifier 打包的 terminal-notifier（x86_64 .app）。
  try {
    const require = createRequire(import.meta.url)
    const pkgJson = require.resolve('node-notifier/package.json')
    const bundled = join(dirname(pkgJson), 'vendor', 'mac.noindex', 'terminal-notifier.app', 'Contents', 'MacOS', 'terminal-notifier')
    if (existsSync(bundled)) return bundled
  } catch {
    /* node-notifier 未安装：继续探测系统路径 */
  }

  // 4) 系统常见安装路径。
  for (const candidate of ['/opt/homebrew/bin/terminal-notifier', '/usr/local/bin/terminal-notifier', '/usr/bin/terminal-notifier']) {
    if (existsSync(candidate)) return candidate
  }

  // 5) PATH。
  return tool || 'terminal-notifier'
}

/* ------------------------------------------------------------------ */
/* 配置解析                                                              */
/* ------------------------------------------------------------------ */

/** 深合并两个普通对象（数组与标量直接覆盖）。 */
function deepMerge(base, override) {
  if (override === undefined || override === null || typeof override !== 'object' || Array.isArray(override)) return override === undefined ? base : override
  const out = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) {
      out[key] = (base && typeof base[key] === 'object' && !Array.isArray(base[key]) && typeof value === 'object' && !Array.isArray(value))
        ? deepMerge(base[key], value)
        : value
    }
  }
  return out
}

/** 从磁盘读取配置文件（缺失/损坏返回 null）。 */
function readConfigFile(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

/** 把「面板持久化键」写入配置文件。 */
function writeConfigFile(file, cfg) {
  try {
    const persist = {}
    for (const key of PERSIST_KEYS) persist[key] = cfg[key]
    writeFileSync(file, JSON.stringify(persist, null, 2), 'utf8')
  } catch (error) {
    /* 配置写入失败不致命：仅影响下次启动的持久化 */
  }
}

/**
 * 解析最终配置：DEFAULTS ← patch config ← 配置文件（面板保存）。
 * 旧版顶层开关（onQuestion 等）映射到对应场景的 enabled（仅当面板未显式设置）。
 */
function resolveConfig(config) {
  const cfg = deepMerge(DEFAULTS, config || {})

  // 旧版开关兼容：patch 里给了 onXxx 布尔值且面板未覆盖 → 写进场景 enabled。
  for (const [opt, key] of Object.entries(LEGACY_TOGGLES)) {
    const explicit = config && typeof config[opt] === 'boolean'
    if (explicit && !(config && config.scenarios && typeof config.scenarios[key]?.enabled === 'boolean')) {
      cfg.scenarios[key].enabled = config[opt]
    }
  }

  // 配置文件（面板持久化）覆盖。
  const file = readConfigFile(cfg.configFile)
  if (file) {
    cfg.enabled = typeof file.enabled === 'boolean' ? file.enabled : cfg.enabled
    cfg.click = file.click || cfg.click
    cfg.throttleMs = typeof file.throttleMs === 'number' ? file.throttleMs : cfg.throttleMs
    cfg.approvalGraceMs = typeof file.approvalGraceMs === 'number' ? file.approvalGraceMs : cfg.approvalGraceMs
    cfg.pendingMaxAgeMs = typeof file.pendingMaxAgeMs === 'number' ? file.pendingMaxAgeMs : cfg.pendingMaxAgeMs
    if (file.scenarios && typeof file.scenarios === 'object') {
      for (const key of SCENARIO_KEYS) {
        if (file.scenarios[key] && typeof file.scenarios[key] === 'object') {
          cfg.scenarios[key] = { ...cfg.scenarios[key], ...file.scenarios[key] }
        }
      }
    }
  }

  cfg.tool = resolveTool(cfg.tool)
  return cfg
}

/* ------------------------------------------------------------------ */
/* 通知工具                                                              */
/* ------------------------------------------------------------------ */

/** Shell 单引号转义。 */
function shq(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "'\\''")
}

/**
 * 把 click 配置翻译成 terminal-notifier 参数；点击时除打开软件外，
 * 同时删除「未点击去重」标记（rm -f 挂载在 -execute 里）。
 */
function buildClickArgs(click, pendingFile) {
  const cleanup = `rm -f '${shq(pendingFile)}'`
  if (!click) return ['-execute', cleanup]
  if (typeof click === 'string') return ['-execute', `${click}; ${cleanup}`]
  if (click.activate) return ['-activate', String(click.activate), '-execute', cleanup]
  if (click.open) return ['-execute', `open -a '${shq(click.open)}'; ${cleanup}`]
  return ['-execute', cleanup]
}

/** 渲染消息模板：替换 {name} {code} {tool} 等变量。 */
function renderTemplate(template, vars) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) => (vars && key in vars ? String(vars[key]) : match))
}

/** 读取未过期（或不存在）的待点击标记。 */
function readPending(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof data?.expiresAt === 'number' && data.expiresAt > Date.now()) return data
  } catch {
    /* 缺失或损坏的标记 = 没有待点击通知 */
  }
  return null
}

/** 写入待点击标记。 */
function markPending(file, title, maxAgeMs) {
  try {
    writeFileSync(file, JSON.stringify({
      title,
      at: Date.now(),
      expiresAt: Date.now() + maxAgeMs,
    }), 'utf8')
  } catch (error) {
    /* 标记尽力而为：失败只影响去重，不影响通知 */
  }
}

/** 该 key 是否处于节流窗口内（窗口内返回 false 表示应拦截）。 */
function shouldThrottle(map, key, ms) {
  const last = map.get(key)
  if (last !== undefined && Date.now() - last < ms) return false
  return true
}

/** 记录一次真实发送（开始节流计时）。 */
function markThrottle(map, key) {
  map.set(key, Date.now())
}

/**
 * 弹出一条通知中心横幅。默认跳过节流窗口内与未点击去重；opts.force 时
 * 直接发送（用于「测试通知」）。失败只记日志，绝不抛出。
 * @returns {'sent' | 'throttled' | 'deduped'}
 */
function sendNotify(ctx, cfg, throttleMap, key, title, message, sound, opts = {}) {
  if (!opts.force) {
    if (!shouldThrottle(throttleMap, key, cfg.throttleMs)) return 'throttled'
    if (readPending(cfg.pendingFile)) {
      ctx.logger?.debug?.('dsh-niao-message: skipped (un-clicked notification pending)')
      return 'deduped'
    }
  }
  const args = ['-title', title, '-message', message, '-sound', sound, ...buildClickArgs(cfg.click, cfg.pendingFile)]
  execFile(cfg.tool, args, (error) => {
    if (error) ctx.logger?.warn(`dsh-niao-message: terminal-notifier failed: ${error.message}`)
  })
  markPending(cfg.pendingFile, title, cfg.pendingMaxAgeMs)
  markThrottle(throttleMap, key)
  return 'sent'
}

/** 定时器封装：优先用 ctx.timer.timeout（随插件卸载自动清理）。 */
function schedule(ctx, callback, delay) {
  if (ctx.timer?.timeout) return ctx.timer.timeout(callback, delay)
  const timer = setTimeout(callback, delay)
  return () => clearTimeout(timer)
}

/* ------------------------------------------------------------------ */
/* HTTP 路由（浏览器设置面板读取 / 写入配置）                               */
/* ------------------------------------------------------------------ */

/** 浏览器面板可见的配置视图（纯数据）。 */
function publicConfig(cfg) {
  const view = { enabled: cfg.enabled, click: cfg.click, throttleMs: cfg.throttleMs, approvalGraceMs: cfg.approvalGraceMs, pendingMaxAgeMs: cfg.pendingMaxAgeMs, scenarios: {} }
  for (const key of SCENARIO_KEYS) view.scenarios[key] = { ...cfg.scenarios[key] }
  return view
}

/** 处理设置面板请求：GET 返回配置；POST 按 action 分发。 */
async function handle(ctx, cfg, throttleMap, req, res) {
  if (req.method === 'GET') {
    responseJson(res, 200, { ok: true, value: { config: publicConfig(cfg) } })
    return
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    requestError(res, 405, 'method-not-allowed', 'Use GET or POST')
    return
  }
  if (!sameOriginPost(req)) {
    requestError(res, 403, 'origin-rejected', 'The request must originate from this DSH Web application')
    return
  }
  let parsed
  try {
    parsed = JSON.parse(await awaitBody(req, 64 * 1024))
  } catch (error) {
    requestError(res, error instanceof RangeError ? 413 : 400, 'invalid-request', String(error.message || error))
    return
  }
  const action = typeof parsed.action === 'string' ? parsed.action : ''
  try {
    switch (action) {
      case 'get-config':
        responseJson(res, 200, { ok: true, value: { config: publicConfig(cfg) } })
        break
      case 'set-config': {
        const patch = parsed.config && typeof parsed.config === 'object' ? parsed.config : {}
        if (typeof patch.enabled === 'boolean') cfg.enabled = patch.enabled
        if (patch.click && typeof patch.click === 'object') cfg.click = { ...cfg.click, ...patch.click }
        if (typeof patch.throttleMs === 'number') cfg.throttleMs = patch.throttleMs
        if (typeof patch.approvalGraceMs === 'number') cfg.approvalGraceMs = patch.approvalGraceMs
        if (typeof patch.pendingMaxAgeMs === 'number') cfg.pendingMaxAgeMs = patch.pendingMaxAgeMs
        if (patch.scenarios && typeof patch.scenarios === 'object') {
          for (const key of SCENARIO_KEYS) {
            if (patch.scenarios[key] && typeof patch.scenarios[key] === 'object') {
              cfg.scenarios[key] = { ...cfg.scenarios[key], ...patch.scenarios[key] }
            }
          }
        }
        writeConfigFile(cfg.configFile, cfg)
        responseJson(res, 200, { ok: true, value: { config: publicConfig(cfg) } })
        break
      }
      case 'test': {
        const s = cfg.scenarios.question || {}
        const result = sendNotify(ctx, cfg, throttleMap, 'test', 'DSH · 通知测试', '通知功能工作正常（dsh-niao-message）', s.sound || 'Glass', { force: true })
        responseJson(res, 200, { ok: true, value: { result } })
        break
      }
      default:
        requestError(res, 400, 'unknown-action', `unknown action: ${action}`)
    }
  } catch (error) {
    requestError(res, 500, 'internal', String(error.message || error))
  }
}

/* ------------------------------------------------------------------ */
/* 插件入口                                                              */
/* ------------------------------------------------------------------ */

/** 插件主体：监听事件流并翻译成通知；注册设置面板配置路由。 */
export function apply(ctx, config = {}) {
  const cfg = resolveConfig(config)
  const throttleMap = new Map()
  const pendingApprovals = new Set()
  const approvalDisposers = new Map()
  let disposed = false

  /** 宽限期到、且该批准仍未决时真正弹通知。 */
  const fireApproval = (id, toolName) => {
    if (disposed || !pendingApprovals.has(id)) return
    const s = cfg.scenarios.approval || {}
    if (!cfg.enabled || !s.enabled) return
    sendNotify(ctx, cfg, throttleMap, 'approval', renderTemplate(s.title, { tool: toolName ?? '工具调用' }), renderTemplate(s.message, { tool: toolName ?? '工具调用' }), s.sound)
  }

  /** 会话事件 → 场景通知。 */
  ctx.on('session/event', (session, event) => {
    try {
      const type = event.type
      const data = event.data
      if (!cfg.enabled) return

      if (type === 'tool/call' && data.name === 'ask_user_question') {
        const s = cfg.scenarios.question || {}
        if (!s.enabled) return
        sendNotify(ctx, cfg, throttleMap, 'question', s.title, renderTemplate(s.message, {}), s.sound)
        return
      }

      if (type === 'approval/asked') {
        const s = cfg.scenarios.approval || {}
        if (!s.enabled) return
        const id = data.id
        pendingApprovals.add(id)
        const dispose = schedule(ctx, () => fireApproval(id, data.toolName), cfg.approvalGraceMs)
        approvalDisposers.set(id, dispose)
        return
      }

      if (type === 'approval/decided') {
        const id = data.id
        pendingApprovals.delete(id)
        const dispose = approvalDisposers.get(id)
        if (dispose !== undefined) {
          dispose()
          approvalDisposers.delete(id)
        }
        return
      }

      if (type === 'tool/result' && data.error) {
        const s = cfg.scenarios['tool-error'] || {}
        if (!s.enabled) return
        const { code, name: errName } = data.error
        sendNotify(ctx, cfg, throttleMap, 'tool-error', s.title, renderTemplate(s.message, { name: errName ?? 'tool', code: code ?? 'unknown' }), s.sound)
        return
      }

      if (type === 'turn/end') {
        const key = TURN_KIND_TO_KEY[data.reason?.kind]
        if (!key) return
        const s = cfg.scenarios[key] || {}
        if (!s.enabled) return
        sendNotify(ctx, cfg, throttleMap, key, s.title, renderTemplate(s.message, {}), s.sound)
        return
      }
    } catch (error) {
      ctx.logger?.warn(`dsh-niao-message: ${error.message}`)
    }
  })

  /** 子代理结束 → 场景通知。 */
  ctx.on('subagent/end', () => {
    try {
      if (!cfg.enabled) return
      const s = cfg.scenarios['subagent-end'] || {}
      if (!s.enabled) return
      sendNotify(ctx, cfg, throttleMap, 'subagent-end', s.title, renderTemplate(s.message, {}), s.sound)
    } catch (error) {
      ctx.logger?.warn(`dsh-niao-message: ${error.message}`)
    }
  })

  // 设置面板配置路由（webServer 为可选服务）。
  const webServer = ctx.get('webServer')
  if (webServer) {
    const detach = webServer.register({
      kind: 'exact',
      path: ROUTE_PATH,
      handler: (req, res) => handle(ctx, cfg, throttleMap, req, res),
    })
    ctx.effect(() => detach, 'dsh-niao-message: route')
  }

  // 插件卸载 / 热重载时清理所有待批准定时器。
  ctx.effect(() => () => {
    disposed = true
    for (const dispose of approvalDisposers.values()) dispose()
    approvalDisposers.clear()
    pendingApprovals.clear()
  }, 'dsh-niao-message.approvalTimers')
}

/* ------------------------------------------------------------------ */
/* HTTP 工具                                                           */
/* ------------------------------------------------------------------ */

function responseJson(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body))
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.writeHead(status)
  res.end(bytes)
}

function requestError(res, status, code, message) {
  responseJson(res, status, { ok: false, error: { code, message } })
}

async function awaitBody(req, maxBytes) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += part.length
    if (bytes > maxBytes) throw new RangeError('request body too large')
    chunks.push(part)
  }
  if (chunks.length === 0) throw new TypeError('empty request body')
  return Buffer.concat(chunks).toString('utf-8')
}

/** 仅接受来自本 DSH Web 应用的同源 POST。 */
function sameOriginPost(req) {
  const fetchSite = req.headers['sec-fetch-site']
  if (fetchSite === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none'
  const host = req.headers.host
  if (host === undefined) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}
