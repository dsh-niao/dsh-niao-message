/**
 * dsh-niao-message — 浏览器端（静态 bundle 入口）。
 *
 * 在 DSH 设置弹窗左侧边注册「通知管理」设置页（settings.section）：
 *   - 「是否启用」总开关；
 *   - 「通知模板」：每个场景的标题 / 消息模板（支持 {tool} {name} {code} 变量）；
 *   - 「场景启用配置」：罗列全部可通知节点（等待用户确认 / 等待批准 / 工具失败 /
 *     回答完成 / 回答出错 / 中止 / 超限 / 阻塞 / 中断 / 子代理结束），各自独立
 *     开关与提示音。
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

/** 全部可通知场景（key 与宿主端 SCENARIO_KEYS / scenarios 对应）。 */
const SCENARIOS = [
  { key: 'question', name: '等待用户确认', desc: 'Agent 调用 ask_user_question 提问，阻塞等待你的回答' },
  { key: 'approval', name: '等待用户批准', desc: '工具调用等待批准，宽限期后仍未决' },
  { key: 'tool-error', name: '工具调用失败', desc: '单个工具执行出错（默认关闭，Agent 通常会在同一轮内重试）' },
  { key: 'done', name: '回答完成', desc: '整轮正常完成' },
  { key: 'turn-error', name: '回答出错', desc: '整轮以错误结束' },
  { key: 'aborted', name: '任务被中止', desc: '用户主动取消本轮' },
  { key: 'max-tokens', name: '上下文超限', desc: '达到 max-tokens 上限' },
  { key: 'blocked', name: '任务阻塞', desc: '本轮处于阻塞状态' },
  { key: 'interrupted', name: '任务被中断', desc: '本轮被中断' },
  { key: 'subagent-end', name: '子代理结束', desc: '子代理任务结束（默认关闭）' },
]

/** 可选的 macOS 提示音。 */
const SOUNDS = ['Glass', 'Ping', 'Basso', 'Sosumi', 'Submarine', 'Hero', 'Funk', 'Pop', 'default']

/** 各场景模板可用变量提示。 */
const VAR_HINT = {
  question: '',
  approval: '可用变量：{tool}（工具名）',
  'tool-error': '可用变量：{name}（错误名）、{code}（错误码）',
  done: '',
  'turn-error': '',
  aborted: '',
  'max-tokens': '',
  blocked: '',
  interrupted: '',
  'subagent-end': '',
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
function ConfigPanel(props) {
  const [config, setConfig] = React.useState(null)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState(null)

  // 进入面板时读取宿主配置。
  React.useEffect(() => {
    let alive = true
    getConfig().then((cfg) => { if (alive && cfg) setConfig(cfg) })
    return () => { alive = false }
  }, [])

  /** 更新某场景的某个字段。 */
  const patchScenario = (key, field, value) => {
    setConfig((prev) => {
      if (!prev) return prev
      const scenarios = { ...prev.scenarios }
      scenarios[key] = { ...scenarios[key], [field]: value }
      return { ...prev, scenarios }
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

  /** 发送一条测试通知。 */
  const test = async () => {
    setTesting(true)
    const res = await rpc('test')
    setTesting(false)
    setTestResult(res.ok ? '已发送测试通知，请查看通知中心' : '测试失败：' + res.error)
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
        React.createElement('button', { type: 'button', className: 'nio-msg-btn', onClick: test, disabled: testing },
          testing ? '发送中…' : '测试通知'),
        React.createElement('button', { type: 'button', className: 'nio-msg-btn primary', onClick: save, disabled: saving || !config },
          saving ? '保存中…' : '保存'),
      ),
    ),
    saved ? React.createElement('p', { className: 'nio-msg-saved' }, '已保存 ✓（配置热加载生效）') : null,
    testResult ? React.createElement('p', { className: 'nio-msg-test' }, testResult) : null,

    /* 一、是否启用 */
    React.createElement('div', { className: 'nio-msg-block' },
      React.createElement('h3', { className: 'nio-msg-block-title' }, '是否启用'),
      React.createElement(ToggleRow, {
        checked: config.enabled,
        onChange: (v) => { setConfig({ ...config, enabled: v }); setSaved(false) },
        hint: '关闭后所有场景都不再弹系统通知',
      }, '启用 macOS 系统通知'),
    ),

    /* 二、场景启用配置 */
    React.createElement('div', { className: 'nio-msg-block' },
      React.createElement('h3', { className: 'nio-msg-block-title' }, '场景启用配置'),
      React.createElement('p', { className: 'nio-msg-note' }, '勾选需要在对话中弹出系统通知的节点：'),
      SCENARIOS.map((scene) => React.createElement('div', { key: scene.key, className: 'nio-msg-scene' },
        React.createElement('div', { className: 'nio-msg-scene-head' },
          React.createElement(ToggleRow, {
            checked: !!(config.scenarios[scene.key] && config.scenarios[scene.key].enabled),
            onChange: (v) => patchScenario(scene.key, 'enabled', v),
          }, scene.name),
          React.createElement('select', {
            className: 'nio-msg-select',
            value: (config.scenarios[scene.key] && config.scenarios[scene.key].sound) || 'Glass',
            onChange: (e) => patchScenario(scene.key, 'sound', e.target.value),
            title: '提示音',
          }, SOUNDS.map((s) => React.createElement('option', { key: s, value: s }, s))),
        ),
        React.createElement('p', { className: 'nio-msg-scene-desc' }, scene.desc),
      )),
    ),

    /* 三、通知模板 */
    React.createElement('div', { className: 'nio-msg-block' },
      React.createElement('h3', { className: 'nio-msg-block-title' }, '通知模板'),
      React.createElement('p', { className: 'nio-msg-note' }, '自定义各场景的横幅标题与消息文案（{var} 为模板变量）：'),
      SCENARIOS.map((scene) => React.createElement('div', { key: scene.key, className: 'nio-msg-tpl' },
        React.createElement('div', { className: 'nio-msg-tpl-head' }, scene.name),
        React.createElement('div', { className: 'nio-msg-tpl-row' },
          React.createElement('label', { className: 'nio-msg-field' },
            React.createElement('span', { className: 'nio-msg-field-label' }, '标题'),
            React.createElement('input', {
              className: 'nio-msg-input',
              value: (config.scenarios[scene.key] && config.scenarios[scene.key].title) || '',
              onChange: (e) => patchScenario(scene.key, 'title', e.target.value),
            }),
          ),
          React.createElement('label', { className: 'nio-msg-field' },
            React.createElement('span', { className: 'nio-msg-field-label' }, '消息'),
            React.createElement('input', {
              className: 'nio-msg-input',
              value: (config.scenarios[scene.key] && config.scenarios[scene.key].message) || '',
              onChange: (e) => patchScenario(scene.key, 'message', e.target.value),
            }),
          ),
        ),
        VAR_HINT[scene.key] ? React.createElement('p', { className: 'nio-msg-scene-desc' }, VAR_HINT[scene.key]) : null,
      )),
    ),
  )

  return root
}

/* ------------------------------------------------------------------ */
/* 样式                                                                */
/* ------------------------------------------------------------------ */

const CSS = `
.nio-msg{display:flex;flex-direction:column;gap:14px;font-size:13px;line-height:1.5;color:#e6e8eb}
.nio-msg-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.nio-msg-title{font-size:15px;font-weight:600;color:#fff}
.nio-msg-top-actions{display:flex;gap:8px}
.nio-msg-btn{cursor:pointer;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.07);color:#e6e8eb;border-radius:6px;padding:5px 12px;font-size:12px;font-family:inherit}
.nio-msg-btn:hover{background:rgba(255,255,255,0.14)}
.nio-msg-btn:disabled{opacity:.55;cursor:default}
.nio-msg-btn.primary{border-color:rgba(88,130,255,0.55);color:#c9d6ff;background:rgba(88,130,255,0.16)}
.nio-msg-btn.primary:hover{background:rgba(88,130,255,0.26)}
.nio-msg-saved{color:#8fe3a0;font-size:12px;margin:0}
.nio-msg-test{color:#c9d6ff;font-size:12px;margin:0}
.nio-msg-block{display:flex;flex-direction:column;gap:8px;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:12px 14px;background:rgba(255,255,255,0.02)}
.nio-msg-block-title{margin:0;font-size:13px;font-weight:600;color:#fff}
.nio-msg-note{margin:0;font-size:12px;color:rgba(230,232,235,0.6)}
.nio-msg-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.nio-msg-toggle input{width:15px;height:15px;accent-color:#5882ff;cursor:pointer}
.nio-msg-toggle-text{font-size:13px}
.nio-msg-scene{display:flex;flex-direction:column;gap:2px;padding:6px 0;border-top:1px solid rgba(255,255,255,0.06)}
.nio-msg-scene:first-of-type{border-top:none}
.nio-msg-scene-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.nio-msg-scene-desc{margin:0;font-size:11px;color:rgba(230,232,235,0.5)}
.nio-msg-select{cursor:pointer;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.07);color:#e6e8eb;border-radius:6px;padding:3px 6px;font-size:12px;font-family:inherit}
.nio-msg-tpl{display:flex;flex-direction:column;gap:6px;padding:8px 0;border-top:1px solid rgba(255,255,255,0.06)}
.nio-msg-tpl:first-of-type{border-top:none}
.nio-msg-tpl-head{font-size:12px;font-weight:600;color:rgba(255,255,255,0.85)}
.nio-msg-tpl-row{display:flex;gap:10px;flex-wrap:wrap}
.nio-msg-field{display:flex;flex-direction:column;gap:3px;flex:1;min-width:180px}
.nio-msg-field-label{font-size:11px;color:rgba(230,232,235,0.6)}
.nio-msg-input{box-sizing:border-box;width:100%;height:28px;color:#fff;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.16);border-radius:6px;padding:0 8px;font-size:12px;font-family:inherit;outline:none}
.nio-msg-input:focus{border-color:rgba(88,130,255,0.6)}
`

/* ------------------------------------------------------------------ */
/* 插件入口                                                             */
/* ------------------------------------------------------------------ */

/**
 * 声明本客户端插件依赖的注入服务名。
 * 通过 ctx.get('slots') 可选读取，不声明硬依赖。
 */
export const inject = []

/** 浏览器插件入口：注册设置页 + 注入样式。 */
export function apply(ctx) {
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.setAttribute('data-plugin', 'dsh-niao-message')
    tag.setAttribute('data-plugin-css', 'dsh-niao-message')
    tag.textContent = CSS
    document.head.append(tag)
    return () => tag.remove()
  }, 'dsh-niao-message: styles')

  const slots = ctx.get('slots')
  if (!slots) return

  // 注册设置弹窗左侧边的「通知管理」设置页。
  slots.inject('settings.section', () => slots.register(
    { name: 'settings.section', id: 'dsh-niao-message', order: 35, label: () => '通知管理' },
    (props) => React.createElement(ConfigPanel, { close: props && props.close ? props.close : null }),
  ))
}
