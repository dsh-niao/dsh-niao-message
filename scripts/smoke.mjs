#!/usr/bin/env node
/**
 * dsh-niao-message 冒烟测试（不弹真实通知）。
 *
 * 用 fake ctx（含假 webServer 路由）+ 指向「参数录制脚本」的假 tool，
 * 模拟 session/event 事件流与设置面板 HTTP 请求，验证：
 *   - 三大通知组（abnormal / waiting / success）的触发与开关
 *   - 总开关 enabled
 *   - 节流、未点击去重、点击参数（open -a + 删标记）、批准宽限期
 *   - 设置面板路由：get-config / set-config（持久化到临时文件）/ test
 *   - vendored 二进制存在且可执行
 *
 * 注意：异步子进程在本环境启动较慢（数百毫秒），所有断言都通过
 * waitFor 轮询等待，而不是固定 sleep。
 *
 * 运行：npm run smoke（共 33 项断言）
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 轮询直到条件成立或超时；返回最终条件值。 */
async function waitFor(cond, timeoutMs = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (cond()) return true
    await sleep(50)
  }
  return cond()
}

/* ------------------------------------------------------------------ */
/* 临时目录与假 tool                                                     */
/* ------------------------------------------------------------------ */

const TMP_DIR = join(tmpdir(), 'dsh-niao-message-smoke')
rmSync(TMP_DIR, { recursive: true, force: true })
mkdirSync(TMP_DIR, { recursive: true })
const CAPTURE = join(TMP_DIR, 'capture.log')
const MARKER = join(TMP_DIR, 'pending.json')
const CONFIG_FILE = join(TMP_DIR, 'config.json')
const FAKE_TOOL = join(TMP_DIR, 'capture.sh')

// 假 tool：把收到的参数原样追加到日志文件。
writeFileSync(FAKE_TOOL, `#!/bin/sh\necho "$@" >> '${CAPTURE}'\n`)
execFileSync('chmod', ['+x', FAKE_TOOL])

/** 读取捕获日志（每条通知一行）。 */
const log = () => (existsSync(CAPTURE) ? readFileSync(CAPTURE, 'utf8').trim().split('\n').filter(Boolean) : [])

/* ------------------------------------------------------------------ */
/* fake ctx 与插件加载                                                   */
/* ------------------------------------------------------------------ */

let routeHandler = null
const effects = []
const listeners = {}
const ctx = {
  on: (event, fn) => { listeners[event] = fn },
  effect: (setup) => { effects.push(setup()) },
  logger: { debug: () => {}, warn: () => {}, info: () => {} },
  timer: { timeout: (cb, ms) => { const t = setTimeout(cb, ms); return () => clearTimeout(t) } },
  get: (service) => {
    if (service === 'webServer') {
      return {
        register: (route) => {
          routeHandler = route.handler
          return () => { routeHandler = null }
        },
      }
    }
    return undefined
  },
}

const { apply, resolveTool } = await import('../lib/index.js')
apply(ctx, {
  tool: FAKE_TOOL,
  click: { open: 'DeepSeek Harness' },
  pendingFile: MARKER,
  configFile: CONFIG_FILE,
  throttleMs: 100,
  approvalGraceMs: 50,
})

const emit = (type, data) => listeners['session/event']({ id: 's1' }, { type, data })

/* ------------------------------------------------------------------ */
/* HTTP 请求工具（调用宿主路由 handler）                                  */
/* ------------------------------------------------------------------ */

function makeReq(method, payload, origin = 'http://127.0.0.1:3080') {
  const text = payload === undefined ? '' : JSON.stringify(payload)
  return {
    method,
    headers: { origin, host: '127.0.0.1:3080' },
    [Symbol.asyncIterator]: async function* () {
      if (text) yield text
    },
  }
}

function makeRes() {
  const out = { status: 0, headers: {}, body: '' }
  return {
    setHeader: (k, v) => { out.headers[k] = v },
    writeHead: (s) => { out.status = s },
    end: (chunk) => { out.body = String(chunk) },
    out,
  }
}

async function http(action, payload) {
  const res = makeRes()
  await routeHandler(makeReq('POST', { action, ...payload }), res)
  return { status: res.out.status, data: JSON.parse(res.out.body) }
}

/* ------------------------------------------------------------------ */
/* 断言                                                                */
/* ------------------------------------------------------------------ */

let pass = 0
let fail = 0
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

/* 0. 开箱即用：vendored 二进制存在且可执行（无需用户安装任何工具） */
const LIB_DIR = dirname(fileURLToPath(import.meta.url)) + '/..'
const VENDORED = join(LIB_DIR, 'lib', 'vendor', 'terminal-notifier.app', 'Contents', 'MacOS', 'terminal-notifier')
console.log('vendored binary check…')
check('vendored：自带 terminal-notifier .app 存在', existsSync(VENDORED))
try {
  const out = execFileSync(VENDORED, ['-help'], { stdio: 'pipe' })
  check('vendored：二进制可执行（-help 输出）', String(out).includes('terminal-notifier'))
} catch {
  check('vendored：二进制可执行（-help 输出）', false)
}
check('vendored：未配置 tool 时默认解析到自带二进制', resolveTool() === VENDORED)
check('vendored：显式 tool 配置优先', resolveTool(FAKE_TOOL) === FAKE_TOOL)

console.log('dsh-niao-message smoke')

const clearAll = () => { rmSync(CAPTURE, { force: true }); rmSync(MARKER, { force: true }) }

/* 1+2. 提问 → waiting 组通知；紧随其后的同类提问在节流窗口内被合并 */
clearAll()
emit('tool/call', { name: 'ask_user_question' })   // sent
emit('tool/call', { name: 'ask_user_question' })   // 同一 tick，throttleMs=100 内 → throttled
await waitFor(() => log().length === 1)
check('询问：ask_user_question 触发通知', log().length === 1 && log()[0].includes('需要你操作'))
check('节流：窗口内同类通知被合并', log().length === 1)

/* 3. 去重：标记存在时其他组也被跳过 */
emit('turn/end', { reason: { kind: 'completed' } })
await sleep(800)
check('去重：有未点击标记时新通知被跳过', log().length === 1)
check('去重：标记文件已写入', existsSync(MARKER))

/* 4. 点击参数：open -a + 删除标记命令 */
check('点击：-execute 含 open -a DeepSeek Harness', log()[0].includes("open -a 'DeepSeek Harness'"))
check('点击：-execute 含删除标记命令', log()[0].includes(`rm -f '${MARKER}'`))

/* 5. 整轮出错 → abnormal 组；清除标记后，整轮完成 → success 组 */
clearAll()
emit('turn/end', { reason: { kind: 'error' } })
await waitFor(() => log().length === 1 && log()[0].includes('任务异常'))
check('整轮出错：触发通知（abnormal 组）', log().length === 1 && log()[0].includes('任务异常'))
clearAll()
emit('turn/end', { reason: { kind: 'completed' } })
await waitFor(() => log().length === 1 && log()[0].includes('任务完成'))
check('整轮完成：触发通知（success 组）', log().length === 1 && log()[0].includes('任务完成'))

/* 6. 单工具错误：abnormal 组默认开启 → 触发通知 */
clearAll()
emit('tool/result', { error: { code: 'EACCES', name: 'EACCES' } })
await waitFor(() => log().length === 1 && log()[0].includes('任务异常'))
check('工具错误：abnormal 组默认开启 → 通知', log().length === 1 && log()[0].includes('任务异常'))

/* 7. 批准：宽限期后仍未决 → waiting 组通知；{tool} 变量按组模板替换 */
clearAll()
const setWaitingTpl = await http('set-config', { config: { groups: { waiting: { message: '需要批准：{tool}' } } } })
check('set-config：自定义 waiting 组消息模板', setWaitingTpl.status === 200)
emit('approval/asked', { id: 'a1', toolName: 'bash' })
await waitFor(() => log().length === 1 && log()[0].includes('需要你操作'))
check('批准：宽限期后仍待人工决定 → 通知', log().length === 1 && log()[0].includes('需要你操作'))
check('批准：模板变量 {tool} 被替换', log()[0].includes('bash'))

/* 8. 批准：宽限期内已决定 → 静默 */
clearAll()
emit('approval/asked', { id: 'a2', toolName: 'bash' })
await sleep(10)
emit('approval/decided', { id: 'a2' })
await sleep(800)
check('批准：宽限期内自动放行 → 静默', log().length === 0)

/* 9. 异常类 turn/end（中止/超限/阻塞/中断）→ abnormal 组，节流窗口内合并为一条 */
clearAll()
for (const kind of ['aborted', 'max-tokens', 'blocked', 'interrupted']) {
  emit('turn/end', { reason: { kind } })
}
await waitFor(() => log().length === 1)
check('异常类 turn/end：触发 abnormal 组通知', log().length === 1 && log()[0].includes('任务异常'))

/* 10. 子代理结束 → success 组 */
clearAll()
listeners['subagent/end']({})
await waitFor(() => log().length === 1)
check('子代理结束：触发通知（success 组）', log().length === 1 && log()[0].includes('任务完成'))

/* 11. 设置面板路由：get-config */
const get1 = await http('get-config')
check('get-config：返回 200 且含分组配置', get1.status === 200 && !!get1.data.value.config.groups.abnormal)
check('get-config：abnormal 组默认开启', get1.data.value.config.groups.abnormal.enabled === true)

/* 12. 设置面板路由：set-config 关闭 abnormal 组 → 工具错误静默；再开启 → 生效 */
const set1 = await http('set-config', { config: { groups: { abnormal: { enabled: false } } } })
check('set-config：关闭 abnormal 组', set1.status === 200 && set1.data.value.config.groups.abnormal.enabled === false)
check('set-config：配置已写入文件', existsSync(CONFIG_FILE))
clearAll()
emit('tool/result', { error: { code: 'EACCES', name: 'EACCES' } })
await sleep(800)
check('set-config 后：abnormal 关闭 → 工具错误不通知', log().length === 0)
const set1b = await http('set-config', { config: { groups: { abnormal: { enabled: true, message: '{name} ({code})' } } } })
check('set-config：重新开启 abnormal 组并自定义模板', set1b.status === 200 && set1b.data.value.config.groups.abnormal.enabled === true)
clearAll()
emit('tool/result', { error: { code: 'EACCES', name: 'EACCES' } })
await waitFor(() => log().length === 1)
check('set-config 后：abnormal 开启 → 工具错误触发通知', log().length === 1 && log()[0].includes('任务异常'))
check('工具错误模板：{name}/{code} 被替换', log()[0].includes('EACCES'))

/* 13. 总开关 enabled=false → 全部静默 */
const set2 = await http('set-config', { config: { enabled: false } })
check('set-config：关闭总开关', set2.status === 200 && set2.data.value.config.enabled === false)
clearAll()
emit('tool/call', { name: 'ask_user_question' })
await sleep(800)
check('总开关关闭后：不通知', log().length === 0)

/* 14. 测试通知 action：force 发送 */
const set3 = await http('set-config', { config: { enabled: true } })
check('set-config：重新开启总开关', set3.status === 200 && set3.data.value.config.enabled === true)
clearAll()
const test1 = await http('test')
await waitFor(() => log().length === 1)
check('test：返回 sent', test1.status === 200 && test1.data.value.result === 'sent')
check('test：实际发送通知', log().length === 1 && log()[0].includes('通知测试'))

/* 15. 非同名 origin 拒绝 */
const crossRes = makeRes()
await routeHandler(makeReq('POST', { action: 'get-config' }, 'https://evil.example'), crossRes)
check('跨站 POST 被拒绝', crossRes.out.status === 403)

/* 清理：插件 effect 返回的 disposer 应能停止所有定时器 */
for (const dispose of effects) dispose()
await sleep(10)

console.log(fail === 0 ? `\n全部通过（${pass} 项）` : `\n${fail} 项失败 / ${pass} 项通过`)
process.exit(fail === 0 ? 0 : 1)
