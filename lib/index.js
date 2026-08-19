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
 *   - 三大通知组（异常终止 / 需要你操作 / 正常完成），每组一个开关、
 *     提示音与标题/消息模板（{reason} {tool} 变量）。
 *
 * 事件驱动依据（Host Event 契约）：
 *   - 'session/event'(session, event)：event.type ∈ tool/call、approval/asked、
 *     approval/decided、turn/end
 *   - 'subagent/end'(info)
 *
 * 注意：tool/result 带 error（单次工具调用失败）不触发通知——它是过程性
 * 失败，Agent 通常会在同一轮内重试或继续，不代表任务异常终止。
 *
 * 自动清理：本插件发出的所有通知统一挂在 -group dsh-niao 下；浏览器端在
 * 页面切回前台（visibilitychange → visible）时请求 'dismiss-all'，宿主端
 * 按组清空本插件全部通知并清除未点击标记——通知只在你「不在 DSH 页面时」
 * 提醒，回到页面即自动消失。零轮询、零常驻开销。
 *
 * 注意（cordis 约定）：配置是 apply 的【第二个参数】，绝不能读 ctx.config。
 *
 * @module dsh-niao-message
 */

import { execFile } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-niao-message'

/** 本文件所在目录（lib/）。 */
const LIB_DIR = dirname(fileURLToPath(import.meta.url))

/** 同源路由路径（exact 匹配）。 */
const ROUTE_PATH = '/api/dsh-niao-message'

/** 三大通知组（配置模型：用户只需为每组设置开关 / 提示音 / 模板）。 */
const GROUP_KEYS = ['abnormal', 'waiting', 'success']

/** terminal-notifier 分组标识：本插件发出的通知统一挂在此组下，
 *  便于「切回 DSH 页面」时按组一次性清空（不影响通知中心里其它应用的通知）。 */
const NOTIFICATION_GROUP = 'dsh-niao'

/** turn/end 的 reason.kind → 组（kind 未列出的不通知）。 */
const TURN_KIND_TO_GROUP = {
  completed: 'success',
  error: 'abnormal',
  aborted: 'abnormal',
  'max-tokens': 'abnormal',
  blocked: 'abnormal',
  interrupted: 'abnormal',
}

/** turn/end 的 reason.kind → 中文原因（供 {reason} 模板变量）。 */
const TURN_KIND_REASON = {
  error: '任务出错',
  aborted: '任务被中止',
  'max-tokens': '上下文超限',
  blocked: '任务阻塞',
  interrupted: '任务被中断',
}

/** 运行时默认配置（用户可在 profile 补丁层或设置面板覆盖）。 */
const DEFAULTS = {
  /** 总开关：false 时全部组静默。 */
  enabled: true,
  /** terminal-notifier 可执行文件路径；留空则按候选路径自动探测。 */
  tool: '',
  /** 点击横幅时的行为：open=应用名 / activate=bundle id / 字符串=自定义 shell。
   *  为空（默认）时点击横幅仅消失、不打开任何应用。 */
  click: {},
  /** 重复通知：true=通知栏已有未点击的 DSH 通知时仍继续弹新通知；
   *  false=发现未点击通知就跳过（默认，避免刷屏）。 */
  allowRepeat: false,
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
  /** 三大组配置：每组 enabled / sound / title / message（{var} 为模板变量）。 */
  groups: {
    abnormal: {
      enabled: true,
      sound: 'Sosumi',
      title: 'DSH · 任务异常终止',
      message: '任务未能正常完成：{reason}',
    },
    waiting: {
      enabled: true,
      sound: 'Ping',
      title: 'DSH · 需要你操作',
      message: '对话已暂停，等待你的确认或授权',
    },
    success: {
      enabled: true,
      sound: 'Glass',
      title: 'DSH · 任务完成',
      message: '任务已顺利完成',
    },
  },
}

/** 面板可持久化的键（tool / pendingFile / configFile 由 patch 配置决定）。 */
const PERSIST_KEYS = ['enabled', 'allowRepeat', 'click', 'throttleMs', 'approvalGraceMs', 'pendingMaxAgeMs', 'groups']

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
 * 解析最终配置：DEFAULTS ← patch config ← 配置文件（面板保存，最高优先级）。
 */
function resolveConfig(config) {
  const cfg = deepMerge(DEFAULTS, config || {})

  // 配置文件（设置面板持久化）覆盖补丁层与默认值。
  const file = readConfigFile(cfg.configFile)
  if (file) {
    cfg.enabled = typeof file.enabled === 'boolean' ? file.enabled : cfg.enabled
    cfg.allowRepeat = typeof file.allowRepeat === 'boolean' ? file.allowRepeat : cfg.allowRepeat
    cfg.click = file.click || cfg.click
    cfg.throttleMs = typeof file.throttleMs === 'number' ? file.throttleMs : cfg.throttleMs
    cfg.approvalGraceMs = typeof file.approvalGraceMs === 'number' ? file.approvalGraceMs : cfg.approvalGraceMs
    cfg.pendingMaxAgeMs = typeof file.pendingMaxAgeMs === 'number' ? file.pendingMaxAgeMs : cfg.pendingMaxAgeMs
    if (file.groups && typeof file.groups === 'object') {
      for (const group of GROUP_KEYS) {
        if (file.groups[group] && typeof file.groups[group] === 'object') {
          cfg.groups[group] = { ...cfg.groups[group], ...file.groups[group] }
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

/** 渲染消息模板：替换 {reason} {tool} 等变量（未知变量原样保留）。 */
function renderTemplate(template, vars = {}) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match))
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

/** 删除待点击标记（点击横幅 / 切回页面清空通知后调用）。 */
function clearPending(file) {
  try {
    unlinkSync(file)
  } catch {
    /* 文件不存在 = 已清理 */
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
 * 弹出一条通知中心横幅。key 为组名（abnormal / waiting / success）。
 * 默认跳过节流窗口内与未点击去重；opts.force 时直接发送（用于「测试通知」）。
 * 失败只记日志，绝不抛出。
 * @returns {'sent' | 'throttled' | 'deduped'}
 */
function sendNotify(ctx, cfg, throttleMap, groupKey, title, message, sound, opts = {}) {
  if (!opts.force) {
    if (!shouldThrottle(throttleMap, groupKey, cfg.throttleMs)) return 'throttled'
    if (!cfg.allowRepeat && readPending(cfg.pendingFile)) {
      ctx.logger?.debug?.('dsh-niao-message: skipped (un-clicked notification pending)')
      return 'deduped'
    }
  }
  const args = ['-title', title, '-message', message, '-sound', sound, '-group', NOTIFICATION_GROUP, ...buildClickArgs(cfg.click, cfg.pendingFile)]
  execFile(cfg.tool, args, (error) => {
    if (error) ctx.logger?.warn(`dsh-niao-message: terminal-notifier failed: ${error.message}`)
  })
  markPending(cfg.pendingFile, title, cfg.pendingMaxAgeMs)
  markThrottle(throttleMap, groupKey)
  return 'sent'
}

/**
 * 按通知组发送：总开关或该组开关关闭时静默（返回 'disabled'），
 * 否则渲染模板并交给 sendNotify（节流/去重由它处理）。
 * 所有事件分支都经由这里，保证模板渲染与组开关检查只写一处。
 */
function notifyGroup(ctx, cfg, throttleMap, groupKey, vars = {}) {
  const g = cfg.groups[groupKey]
  if (!cfg.enabled || !g || !g.enabled) return 'disabled'
  return sendNotify(ctx, cfg, throttleMap, groupKey, renderTemplate(g.title, vars), renderTemplate(g.message, vars), g.sound)
}

/** 定时器封装：优先用 ctx.timer.timeout（随插件卸载自动清理）。 */
function schedule(ctx, callback, delay) {
  if (ctx.timer?.timeout) return ctx.timer.timeout(callback, delay)
  const timer = setTimeout(callback, delay)
  return () => clearTimeout(timer)
}

/* ------------------------------------------------------------------ */
/* 工具：扫描已安装应用（浏览器 / DeepSeek Harness）                      */
/* ------------------------------------------------------------------ */

/** 扫描 macOS 常见应用目录。 */
const APP_DIRS = ['/Applications', '/System/Applications', join(homedir(), 'Applications')]

/** 已知浏览器名单（命中即算浏览器，不再读 Info.plist）。 */
const KNOWN_BROWSER_NAMES = [
  'Safari', 'Safari Technology Preview', 'Google Chrome', 'Chrome', 'Chrome Canary',
  'Microsoft Edge', 'Edge', 'Firefox', 'Firefox Developer Edition', 'Firefox Nightly',
  'Arc', 'Brave Browser', 'Brave', 'Opera', 'Vivaldi', 'Tor Browser', 'Chromium',
  'Min', 'Orion', 'Sidekick', 'Zen', 'Zen Browser', 'SigmaOS', 'Floorp', 'Waterfox',
  'DuckDuckGo', 'Ungoogled Chromium', 'Thorium', 'WaveBox', 'Mullvad Browser',
  'LibreWolf', 'Iridium', 'Falkon', 'Pale Moon', 'SeaMonkey', 'Qutebrowser',
  'Epiphany', 'GNOME Web', 'Midori', 'Otter Browser', 'Dooble', 'Beaker Browser',
]

/** 读取一个 .app 的 Info.plist（失败返回 null）。 */
function readInfoPlist(appPath) {
  return new Promise((resolve) => {
    execFile('plutil', ['-convert', 'json', '-o', '-', join(appPath, 'Contents', 'Info.plist')], { timeout: 5000 }, (error, stdout) => {
      if (error) { resolve(null); return }
      try { resolve(JSON.parse(stdout)) } catch { resolve(null) }
    })
  })
}

/** 收集全部已安装应用条目（去重，含所在目录）。
 *  除顶层 .app 外，还递归一层 *.localized 容器目录（Chrome 安装的
 *  PWA 桌面应用位于 ~/Applications/Chrome Apps.localized/ 等位置）。 */
function collectInstalledApps() {
  const seen = new Set()
  const apps = []
  for (const dir of APP_DIRS) {
    let entries
    try { entries = readdirSync(dir) } catch { continue }
    const candidates = []
    for (const entry of entries) {
      if (entry.endsWith('.app')) candidates.push(join(dir, entry))
      else if (entry.endsWith('.localized')) {
        let sub
        try { sub = readdirSync(join(dir, entry)) } catch { continue }
        for (const subEntry of sub) {
          if (subEntry.endsWith('.app')) candidates.push(join(dir, entry, subEntry))
        }
      }
    }
    for (const appPath of candidates) {
      try {
        if (!statSync(appPath).isDirectory()) continue
      } catch { continue }
      const name = basename(appPath).slice(0, -4)
      if (seen.has(name)) continue
      seen.add(name)
      apps.push({ dir: dirname(appPath), name })
    }
  }
  return apps
}

/**
 * 扫描本机应用，识别：
 *  - DeepSeek Harness 桌面应用（名称 / bundle id 命中 deepseek 或 harness）；
 *  - 可用的浏览器（已知名单，或 Info.plist 声明了 http/https URL scheme）。
 * @returns {{ harness: string[], browsers: string[] }} 去重排序的应用名列表。
 */
async function listInstalledApps() {
  const apps = collectInstalledApps()
  const harness = new Set()
  const browsers = new Set()

  /** 已知名单直接判定；其余进候选队列，并发读 Info.plist 确认。 */
  const candidates = []
  for (const app of apps) {
    if (/deepseek|harness/i.test(app.name)) candidates.push({ ...app, role: 'harness' })
    else if (KNOWN_BROWSER_NAMES.some((n) => n.toLowerCase() === app.name.toLowerCase())) browsers.add(app.name)
    else candidates.push({ ...app, role: 'browser' })
  }

  const CONCURRENCY = 12
  let cursor = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const c = candidates[cursor++]
      const plist = await readInfoPlist(join(c.dir, c.name + '.app'))
      if (!plist) continue
      const bundleId = typeof plist.CFBundleIdentifier === 'string' ? plist.CFBundleIdentifier : ''
      if (c.role === 'harness') {
        if (/deepseek|harness/i.test(bundleId) || /deepseek|harness/i.test(c.name)) harness.add(c.name)
      } else {
        const schemes = (Array.isArray(plist.CFBundleURLTypes) ? plist.CFBundleURLTypes : [])
          .flatMap((t) => (Array.isArray(t && t.CFBundleURLSchemes) ? t.CFBundleURLSchemes : []))
          .map((s) => String(s).toLowerCase())
        // 名单外的应用需要同时满足：声明了 http/https scheme，且名字带浏览器
        // 特征词（避免把「能开链接但不是浏览器」的 ChatGPT、网盘类应用误判）。
        const browserName = /browser|chrome|firefox|edge|arc|brave|opera|vivaldi|safari|webkit|navigator|explorer|thorium|waterfox|palemoon|librewolf|floorp|zen|orion|sidekick|sigma|duckduckgo|mullvad|iridium|qutebrowser|epiphany|midori|otter|dooble|beaker/i.test(c.name)
        if (browserName && (schemes.includes('http') || schemes.includes('https'))) browsers.add(c.name)
      }
    }
  })
  await Promise.all(workers)

  const sort = (set) => [...set].sort((a, b) => a.localeCompare(b, 'zh'))
  return { harness: sort(harness), browsers: sort(browsers) }
}

/* ------------------------------------------------------------------ */
/* HTTP 路由（浏览器设置面板读取 / 写入配置）                               */
/* ------------------------------------------------------------------ */

/** 浏览器面板可见的配置视图（纯数据，避免把内部对象引用暴露出去）。 */
function publicConfig(cfg) {
  const view = {
    enabled: cfg.enabled,
    allowRepeat: cfg.allowRepeat,
    click: { ...cfg.click },
    throttleMs: cfg.throttleMs,
    approvalGraceMs: cfg.approvalGraceMs,
    pendingMaxAgeMs: cfg.pendingMaxAgeMs,
    groups: {},
  }
  for (const group of GROUP_KEYS) view.groups[group] = { ...cfg.groups[group] }
  return view
}

/** 把设置面板提交的补丁合并进运行中配置（逐字段类型校验 + groups 白名单）。 */
function applyConfigPatch(cfg, patch) {
  if (typeof patch.enabled === 'boolean') cfg.enabled = patch.enabled
  if (typeof patch.allowRepeat === 'boolean') cfg.allowRepeat = patch.allowRepeat
  if (patch.click && typeof patch.click === 'object') cfg.click = { ...cfg.click, ...patch.click }
  if (typeof patch.throttleMs === 'number') cfg.throttleMs = patch.throttleMs
  if (typeof patch.approvalGraceMs === 'number') cfg.approvalGraceMs = patch.approvalGraceMs
  if (typeof patch.pendingMaxAgeMs === 'number') cfg.pendingMaxAgeMs = patch.pendingMaxAgeMs
  if (patch.groups && typeof patch.groups === 'object') {
    for (const group of GROUP_KEYS) {
      if (patch.groups[group] && typeof patch.groups[group] === 'object') {
        cfg.groups[group] = { ...cfg.groups[group], ...patch.groups[group] }
      }
    }
  }
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
        applyConfigPatch(cfg, patch)
        writeConfigFile(cfg.configFile, cfg)
        responseJson(res, 200, { ok: true, value: { config: publicConfig(cfg) } })
        break
      }
      case 'list-apps': {
        const apps = await listInstalledApps()
        responseJson(res, 200, { ok: true, value: { apps } })
        break
      }
      case 'test': {
        const g = cfg.groups.success || {}
        const result = sendNotify(ctx, cfg, throttleMap, 'success', 'DSH · 通知测试', '通知功能工作正常（dsh-niao-message）', g.sound || 'Glass', { force: true })
        responseJson(res, 200, { ok: true, value: { result } })
        break
      }
      // 浏览器端切回 DSH 页面时调用：按组清空本插件发出的全部系统通知，
      // 并清除未点击标记（通知已消失，去重不再有意义）。
      case 'dismiss-all': {
        execFile(cfg.tool, ['-remove', NOTIFICATION_GROUP], (error) => {
          if (error) ctx.logger?.warn(`dsh-niao-message: remove notifications failed: ${error.message}`)
        })
        clearPending(cfg.pendingFile)
        responseJson(res, 200, { ok: true, value: { result: 'dismissed' } })
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

  /** 宽限期到、且该批准仍未决时真正弹通知（waiting 组）。 */
  const fireApproval = (id, toolName) => {
    if (disposed || !pendingApprovals.has(id)) return
    notifyGroup(ctx, cfg, throttleMap, 'waiting', { tool: toolName ?? '工具调用' })
  }

  /** 会话事件 → 组通知。 */
  ctx.on('session/event', (session, event) => {
    try {
      const { type, data } = event
      if (!cfg.enabled) return

      // waiting：Agent 提问阻塞等你回答。
      if (type === 'tool/call' && data.name === 'ask_user_question') {
        notifyGroup(ctx, cfg, throttleMap, 'waiting')
        return
      }

      // waiting：等待批准（宽限期后再弹，期内自动放行则静默）。
      if (type === 'approval/asked') {
        if (!cfg.groups.waiting?.enabled) return
        const id = data.id
        pendingApprovals.add(id)
        approvalDisposers.set(id, schedule(ctx, () => fireApproval(id, data.toolName), cfg.approvalGraceMs))
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

      // turn/end：按 reason.kind 归组（completed→success，其余异常类→abnormal）。
      // 注意：工具调用失败（tool/result 带 error）不在此列——它只是单次调用
      // 过程性失败，Agent 通常会在同一轮内重试或继续，并不代表任务异常终止。
      if (type === 'turn/end') {
        const kind = data.reason?.kind
        const group = TURN_KIND_TO_GROUP[kind]
        if (!group) return
        // {reason} = 具体中文原因（异常组通知更清晰）。
        notifyGroup(ctx, cfg, throttleMap, group, { reason: TURN_KIND_REASON[kind] || '' })
        return
      }
    } catch (error) {
      ctx.logger?.warn(`dsh-niao-message: ${error.message}`)
    }
  })

  /** 子代理结束 → success 组。 */
  ctx.on('subagent/end', () => {
    try {
      notifyGroup(ctx, cfg, throttleMap, 'success')
    } catch (error) {
      ctx.logger?.warn(`dsh-niao-message: ${error.message}`)
    }
  })

  // 设置面板配置路由（webServer 为可选服务）。注意：Loader 并发启动各 entry，
  // 本插件未声明 inject，apply 可能在 webServer 完成监听之前执行，此时
  // ctx.get('webServer') 返回 undefined 而错过路由注册。因此在
  // internal/service 事件上重试，等 webServer 出现后再注册。
  let routeRegistered = false
  const registerRoute = () => {
    if (routeRegistered || disposed) return
    const ws = ctx.get('webServer')
    if (!ws) return
    routeRegistered = true
    const detach = ws.register({
      kind: 'exact',
      path: ROUTE_PATH,
      handler: (req, res) => handle(ctx, cfg, throttleMap, req, res),
    })
    ctx.effect(() => detach, 'dsh-niao-message: route')
  }
  registerRoute()
  ctx.on('internal/service', (name) => {
    if (name === 'webServer') registerRoute()
  })

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
