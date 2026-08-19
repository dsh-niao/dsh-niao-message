/**
 * dsh-niao-message — 浏览器端（静态 bundle 入口）。
 *
 * 在 DSH 设置弹窗左侧边注册「通知管理」设置页（settings.section）：
 *   - 「是否启用」总开关；
 *   - 「通知行为」：重复通知开关、点击横幅后打开的应用；
 *   - 「通知分组」：三大组（异常终止 / 需要你操作 / 正常完成），每组一个
 *     启用开关、提示音与标题/消息模板（{reason} {tool} 变量）。
 *
 * 所有配置通过同源 JSON 路由 /api/dsh-niao-message 读写（宿主端持久化到
 * ~/.dsh/dsh-niao-message.config.json）。面板提供「保存」与「测试通知」。
 *
 * 纯 React（React.createElement，无 JSX）+ fetch；不访问额外 ctx 服务。
 *
 * @module dsh-niao-message/client
 */

import React from 'react'

/** 宿主路由（与 lib/index.js 的 ROUTE_PATH 对应）。 */
const ROUTE = '/api/dsh-niao-message'

/**
 * 三大通知组配置面板。每个组是一个真正的配置单元：开启后，该组覆盖的
 * 全部情况都会弹出通知（与宿主端 GROUP_KEYS 对应）。
 */
const GROUPS = [
  {
    key: 'abnormal',
    name: '异常终止',
    note: '任务未能正常完成，被迫异常结束',
    covers: ['上下文超限', '任务阻塞', '任务被中止', '任务被中断', '回答出错'],
  },
  {
    key: 'waiting',
    name: '需要你操作',
    note: '对话暂停，等待你的确认、授权或指示后才能继续',
    covers: ['等待用户确认（提问 / 是否继续）', '等待用户批准（授权）'],
  },
  {
    key: 'success',
    name: '正常完成',
    note: '任务顺利执行完成',
    covers: ['回答完成', '子代理结束'],
  },
]

/** 可选的 macOS 提示音。 */
const SOUNDS = ['Glass', 'Ping', 'Basso', 'Sosumi', 'Submarine', 'Hero', 'Funk', 'Pop', 'default']

/** 各组模板可用变量提示。 */
const VAR_HINT = {
  abnormal: '可用变量：{reason}（具体原因）',
  waiting: '可用变量：{tool}（工具名）——等待批准时',
  success: '',
}

/** 同源 JSON 请求到宿主路由。 */
async function rpc(action, payload) {
  try {
    const res = await fetch(ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    const data = await res.json()
    if (data && data.ok) return { ok: true, value: data.value }
    return { ok: false, error: (data && data.error && data.error.message) || `HTTP ${res.status}` }
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) }
  }
}

/** 读取当前配置。 */
async function getConfig() {
  const res = await rpc('get-config')
  return res.ok ? res.value.config : null
}

/** 读取本机已安装应用（浏览器 / DeepSeek Harness 桌面应用）。 */
async function listApps() {
  const res = await rpc('list-apps')
  const a = res.ok && res.value && res.value.apps
  return {
    harness: a && Array.isArray(a.harness) ? a.harness : [],
    browsers: a && Array.isArray(a.browsers) ? a.browsers : [],
  }
}

/* ------------------------------------------------------------------ */
/* 面板组件                                                              */
/* ------------------------------------------------------------------ */

/** 单个开关行。 */
function ToggleRow(props) {
  return React.createElement('label', {
    className: 'nio-msg-toggle',
    title: props.hint || '',
  },
    React.createElement('input', {
      type: 'checkbox',
      checked: !!props.checked,
      onChange: (e) => props.onChange(e.target.checked),
    }),
    React.createElement('span', { className: 'nio-msg-toggle-text' }, props.children),
  )
}

/** 配置面板主体。 */
function ConfigPanel() {
  const [config, setConfig] = React.useState(null)
  const [apps, setApps] = React.useState({ harness: [], browsers: [] })
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [testResult, setTestResult] = React.useState(null)
  const testBusy = React.useRef(false)

  // 进入面板时读取宿主配置，并并行拉取本机应用列表。
  React.useEffect(() => {
    let alive = true
    getConfig().then((cfg) => { if (alive && cfg) setConfig(cfg) })
    listApps().then((names) => { if (alive) setApps(names) })
    return () => { alive = false }
  }, [])

  /** 更新某个通知组的某个字段（enabled / sound / title / message）。 */
  const patchGroup = (key, field, value) => {
    setConfig((prev) => {
      if (!prev) return prev
      const groups = { ...(prev.groups || {}) }
      groups[key] = { ...(groups[key] || {}), [field]: value }
      return { ...prev, groups }
    })
    setSaved(false)
  }

  /** 更新「点击通知后打开」的应用名（留空 = 点击后仅消失）。 */
  const patchClickOpen = (open) => {
    setConfig((prev) => {
      if (!prev) return prev
      return { ...prev, click: { ...(prev.click || {}), open } }
    })
    setSaved(false)
  }

  /** 保存全部配置到宿主。 */
  const save = async () => {
    if (!config) return
    setSaving(true)
    const res = await rpc('set-config', { config })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      if (res.value.config) setConfig(res.value.config)
    } else {
      window.alert('保存失败：' + res.error)
    }
  }

  /** 发送一条测试通知。不显示 loading：点击后等待结果，成败以提示条展示。 */
  const test = async () => {
    if (testBusy.current) return
    testBusy.current = true
    const res = await rpc('test')
    testBusy.current = false
    setTestResult(res.ok
      ? { ok: true, text: '已发送测试通知，请查看通知中心' }
      : { ok: false, text: '测试失败：' + res.error })
  }

  if (!config) {
    return React.createElement('div', { className: 'nio-msg' },
      React.createElement('p', { className: 'nio-msg-note' }, '正在加载通知配置…'))
  }

  const root = React.createElement('div', { className: 'nio-msg' },
    /* 顶部操作行 */
    React.createElement('div', { className: 'nio-msg-top' },
      React.createElement('span', { className: 'nio-msg-title' }, '通知管理'),
      React.createElement('div', { className: 'nio-msg-top-actions' },
        React.createElement('button', { type: 'button', className: 'nio-msg-btn', onClick: test }, '测试通知'),
        React.createElement('button', { type: 'button', className: 'nio-msg-btn primary', onClick: save, disabled: saving || !config },
          saving ? '保存中…' : '保存'),
      ),
    ),
    saved ? React.createElement('div', { className: 'nio-msg-testbar nio-msg-testbar-ok' },
      React.createElement('span', { className: 'nio-msg-testbar-text' }, '已保存 ✓（配置热加载生效）'),
      React.createElement('button', { type: 'button', className: 'nio-msg-close', 'aria-label': '关闭提示', onClick: () => setSaved(false) }, '×'),
    ) : null,
    testResult ? React.createElement('div', { className: 'nio-msg-testbar ' + (testResult.ok ? 'nio-msg-testbar-ok' : 'nio-msg-testbar-err') },
      React.createElement('span', { className: 'nio-msg-testbar-text' }, testResult.text),
      React.createElement('button', { type: 'button', className: 'nio-msg-close', 'aria-label': '关闭提示', onClick: () => setTestResult(null) }, '×'),
    ) : null,

    /* 一、是否启用 */
    React.createElement('div', { className: 'nio-msg-block' },
      React.createElement('h3', { className: 'nio-msg-block-title' }, '是否启用'),
      React.createElement(ToggleRow, {
        checked: config.enabled,
        onChange: (v) => { setConfig({ ...config, enabled: v }); setSaved(false) },
        hint: '关闭后所有场景都不再弹系统通知',
      }, '启用 macOS 系统通知'),
    ),

    /* 二、通知行为 */
    React.createElement('div', { className: 'nio-msg-block' },
      React.createElement('h3', { className: 'nio-msg-block-title' }, '通知行为'),
      React.createElement(ToggleRow, {
        checked: !!config.allowRepeat,
        onChange: (v) => { setConfig({ ...config, allowRepeat: v }); setSaved(false) },
        hint: '开启后，即使通知栏还有未点击的通知，新通知也会照常弹出；关闭时，未点击通知处理前新通知会被跳过',
      }, '重复通知：存在未点击的通知时，有新通知仍继续弹出'),
      React.createElement('p', { className: 'nio-msg-scene-desc' },
        config.allowRepeat
          ? '当前已开启：存在未点击的通知时，新通知仍照常弹出'
          : '当前已关闭：存在未点击的通知时，新通知将被跳过，避免刷屏'),
      React.createElement('label', { className: 'nio-msg-field' },
        React.createElement('span', { className: 'nio-msg-field-label' }, '点击通知后打开'),
        React.createElement('select', {
          className: 'nio-msg-input nio-msg-select-open',
          value: (config.click && config.click.open) || '',
          onChange: (e) => patchClickOpen(e.target.value),
        },
          React.createElement('option', { value: '' }, '不打开任何应用'),
          // 保留旧值：用户此前保存过但已不在本机列表中的应用
          (() => {
            const cur = (config.click && config.click.open) || ''
            return cur && !apps.harness.includes(cur) && !apps.browsers.includes(cur)
              ? React.createElement('option', { key: 'custom', value: cur }, cur)
              : null
          })(),
          apps.harness.length
            ? React.createElement('optgroup', { key: 'harness', label: 'DeepSeek Harness' },
                apps.harness.map((n) => React.createElement('option', { key: n, value: n }, n)),
              )
            : null,
          apps.browsers.length
            ? React.createElement('optgroup', { key: 'browsers', label: '浏览器' },
                apps.browsers.map((n) => React.createElement('option', { key: n, value: n }, n)),
              )
            : null,
        ),
      ),
      React.createElement('p', { className: 'nio-msg-scene-desc' },
        '点击通知横幅时激活的应用；选「不打开任何应用」时，点击横幅仅消失'),
    ),

    /* 三、通知分组（每组一个开关：开启后该组全部情况都通知） */
    React.createElement('div', { className: 'nio-msg-block' },
      React.createElement('h3', { className: 'nio-msg-block-title' }, '通知分组'),
      React.createElement('p', { className: 'nio-msg-note' }, '把可能出现通知的情况分为三大类，开启某组后，该组覆盖的所有情况都会弹出通知：'),
      GROUPS.map((group) => {
        const g = (config.groups && config.groups[group.key]) || {}
        return React.createElement('div', { key: group.key, className: 'nio-msg-group' },
          React.createElement('div', { className: 'nio-msg-group-head' },
            React.createElement(ToggleRow, {
              checked: !!g.enabled,
              onChange: (v) => patchGroup(group.key, 'enabled', v),
              hint: '开启后，以下情况都会弹出通知：' + group.covers.join('、'),
            }, group.name),
            React.createElement('select', {
              className: 'nio-msg-select',
              value: g.sound || 'Glass',
              onChange: (e) => patchGroup(group.key, 'sound', e.target.value),
              title: '提示音',
            }, SOUNDS.map((s) => React.createElement('option', { key: s, value: s }, s))),
          ),
          React.createElement('p', { className: 'nio-msg-group-desc' }, group.note),
          React.createElement('p', { className: 'nio-msg-group-list' }, '覆盖：' + group.covers.join('、')),
          React.createElement('div', { className: 'nio-msg-tpl-row' },
            React.createElement('label', { className: 'nio-msg-field' },
              React.createElement('span', { className: 'nio-msg-field-label' }, '标题'),
              React.createElement('input', {
                className: 'nio-msg-input',
                value: g.title || '',
                onChange: (e) => patchGroup(group.key, 'title', e.target.value),
              }),
            ),
            React.createElement('label', { className: 'nio-msg-field' },
              React.createElement('span', { className: 'nio-msg-field-label' }, '消息'),
              React.createElement('input', {
                className: 'nio-msg-input',
                value: g.message || '',
                onChange: (e) => patchGroup(group.key, 'message', e.target.value),
              }),
            ),
          ),
          VAR_HINT[group.key] ? React.createElement('p', { className: 'nio-msg-group-desc' }, VAR_HINT[group.key]) : null,
        )
      }),
    ),
  )

  return root
}

/* ------------------------------------------------------------------ */
/* 样式                                                                */
/* ------------------------------------------------------------------ */

const CSS = `
.nio-msg{display:flex;flex-direction:column;gap:14px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}
.nio-msg-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.nio-msg-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}
.nio-msg-top-actions{display:flex;gap:8px}
.nio-msg-btn{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:6px;padding:5px 12px;font-size:12px;font-family:inherit}
.nio-msg-btn:hover{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, var(--dsw-alias-bg-layer-2))}
.nio-msg-btn:disabled{opacity:.55;cursor:default}
.nio-msg-btn.primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, var(--dsw-alias-bg-layer-2))}
.nio-msg-btn.primary:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 24%, var(--dsw-alias-bg-layer-2))}
.nio-msg-testbar{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;font-size:12px;margin:0}
.nio-msg-testbar-ok{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 35%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 8%,var(--dsw-alias-bg-layer-1))}
.nio-msg-testbar-err{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,var(--dsw-alias-bg-layer-1))}
.nio-msg-testbar-text{flex:1;min-width:0}
.nio-msg-close{cursor:pointer;flex:none;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:4px;background:transparent;color:inherit;font-size:14px;line-height:1;font-family:inherit;padding:0}
.nio-msg-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.nio-msg-block{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:12px 14px;background:var(--dsw-alias-bg-layer-1)}
.nio-msg-block-title{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.nio-msg-note{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.nio-msg-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.nio-msg-toggle input{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.nio-msg-toggle-text{font-size:13px}
.nio-msg-scene-desc{margin:0;font-size:11px;color:var(--dsw-alias-label-secondary)}
.nio-msg-group{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 55%,var(--dsw-alias-bg-layer-1))}
.nio-msg-group-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.nio-msg-group-desc{margin:0;font-size:11px;color:var(--dsw-alias-label-secondary)}
.nio-msg-group-list{margin:0;font-size:11px;color:var(--dsw-alias-label-secondary)}
.nio-msg-select{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:6px;padding:3px 6px;font-size:12px;font-family:inherit}
.nio-msg-tpl-row{display:flex;gap:10px;flex-wrap:wrap;padding-top:2px}
.nio-msg-field{display:flex;flex-direction:column;gap:3px;flex:1;min-width:180px}
.nio-msg-field-label{font-size:11px;color:var(--dsw-alias-label-secondary)}
.nio-msg-input{box-sizing:border-box;width:100%;height:28px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:0 8px;font-size:12px;font-family:inherit;outline:none}
.nio-msg-input:focus{border-color:var(--dsw-alias-brand-primary)}
.nio-msg-select-open{height:30px;cursor:pointer}
.nio-msg-select-open option,.nio-msg-select-open optgroup{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
.nio-msg-nav-bell{display:inline-flex;align-items:center;justify-content:center;flex:none}
`

/* ------------------------------------------------------------------ */
/* 设置面板导航图标（铃铛）                                              */
/* ------------------------------------------------------------------ */

/**
 * DSH 设置弹窗的 section 导航图标由 shell 渲染：只对内置 id（models /
 * agent-presets / plugins）有专属图标，其余（含本插件）一律回退为设置齿轮。
 * `settings.section` 注册契约不支持自定义图标，因此在插件内用一个轻量的
 * MutationObserver：找到左侧导航中文本为「通知管理」的那一行，把齿轮 SVG
 * 替换为铃铛 SVG（stroke 继承 currentColor，深浅主题都适配）。
 */
const BELL_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'

/** 把设置面板导航中「通知管理」行的齿轮图标替换为铃铛。 */
function patchSettingsNavIcon() {
  const buttons = document.querySelectorAll('button')
  for (const btn of buttons) {
    if (btn.dataset.niaoIconPatched) continue
    let hasLabel = false
    for (const span of btn.querySelectorAll('span')) {
      if (span.textContent && span.textContent.includes('通知管理')) { hasLabel = true; break }
    }
    if (!hasLabel) continue
    const icon = btn.querySelector('svg')
    if (!icon) continue
    btn.dataset.niaoIconPatched = '1'
    const bell = document.createElement('span')
    bell.className = 'nio-msg-nav-bell'
    bell.setAttribute('aria-hidden', 'true')
    bell.innerHTML = BELL_SVG
    icon.replaceWith(bell)
  }
}

/* ------------------------------------------------------------------ */
/* 插件入口                                                             */
/* ------------------------------------------------------------------ */

/** 浏览器插件入口：注册设置页 + 注入样式 + 导航图标补丁。 */
export function apply(ctx) {
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.setAttribute('data-plugin', 'dsh-niao-message')
    tag.setAttribute('data-plugin-css', 'dsh-niao-message')
    tag.textContent = CSS
    document.head.append(tag)
    return () => tag.remove()
  }, 'dsh-niao-message: styles')

  // 设置面板打开/关闭与 React 重渲染都会重建导航行，用 MutationObserver
  // 持续补齐铃铛图标（已打标记的行跳过）。
  ctx.effect(() => {
    const observer = new MutationObserver(patchSettingsNavIcon)
    observer.observe(document.body, { childList: true, subtree: true })
    patchSettingsNavIcon()
    return () => observer.disconnect()
  }, 'dsh-niao-message: nav icon')

  // 页面回到前台（用户回到 DSH 页面）时，请求宿主端清空本插件弹出的
  // 全部系统通知——通知只在「不在页面时」提醒，回到页面即自动消失。
  //
  // 两种宿主形态都要覆盖：
  //   1) 浏览器页签：visibilitychange（切回页签 → visible）触发；
  //   2) 独立窗口 PWA（把页面安装成本地应用）：窗口失焦时 visibilityState
  //      可能保持不变（不产生 visible 事件），需监听 window focus 事件，
  //      窗口重新激活时触发。
  // 事件驱动、无轮询开销；1s 内去重避免双事件同时触发重复请求。
  ctx.effect(() => {
    let lastDismiss = 0
    const dismiss = () => {
      const now = Date.now()
      if (now - lastDismiss < 1000) return
      lastDismiss = now
      rpc('dismiss-all')
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') dismiss()
    }
    const onFocus = () => dismiss()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
    }
  }, 'dsh-niao-message: dismiss on visible')

  const slots = ctx.get('slots')
  if (!slots) return

  // 注册设置弹窗左侧边的「通知管理」设置页。
  slots.inject('settings.section', () => slots.register(
    { name: 'settings.section', id: 'dsh-niao-message', order: 35, label: () => '通知管理' },
    () => React.createElement(ConfigPanel, null),
  ))
}
