# dsh-niao-message

[English](README.en.md) | [中文](README.md)

DeepSeek Harness 的 **macOS 系统通知** 插件，自带 **设置面板**（设置弹窗 →「通知管理」）。

用 **terminal-notifier** 在对话的关键节点向 macOS 通知中心弹出横幅；**点击横幅直接打开指定软件**（可配置，默认仅消失）。

## 特性

- **三大通知组**：把全部可通知情况归为「异常终止 / 需要你操作 / 正常完成」三组，每组一个开关 + 提示音 + 标题/消息模板，简单直观。
- **点击打开指定软件**：点击横幅执行 `open -a '<应用名>'`（或按 bundle id 激活 / 自定义 shell 命令），同时清除「未点击去重」标记。
- **回到页面即自动清空**：所有通知统一挂 `-group dsh-niao`；当你切回 DSH 页面（浏览器页签或独立窗口 PWA，监听 `visibilitychange` + `focus`，纯事件驱动零轮询）时，本插件弹出的全部系统通知自动消失——通知只在「你不在 DSH 页面时」提醒。
- **未点击去重**：通知中心还挂着未点击的 DSH 通知时，新通知自动跳过（标记文件 + 过期时间，防止刷屏与永久静默）。
- **节流**：同类通知 3 秒内合并为一条；被节流/去重拦下的通知不消耗节流配额。
- **零手动安装**：插件自带 macOS 通知二进制（arm64，Apple Silicon 开箱即用）；Intel Mac 自动回退到 npm 依赖 `node-notifier` 自带的 x86_64 二进制，无需用户安装任何系统工具。
- **宿主端事件驱动**：监听宿主进程的 `session/event` 与 `subagent/end`（非浏览器页面），标签页后台/最小化时通知照常弹出。

## 三大通知组

| 组 | 默认 | 提示音 | 覆盖情况 |
|---|---|---|---|
| **异常终止** | ✅ 开 | Sosumi | 上下文超限、任务阻塞、任务被中止、任务被中断、回答出错 |
| **需要你操作** | ✅ 开 | Ping | 等待用户确认（提问 / 是否继续）、等待用户批准（授权） |
| **正常完成** | ✅ 开 | Glass | 回答完成、子代理结束 |

> 说明：**单次工具调用失败不通知**——它只是过程性失败，Agent 通常会在同一轮内重试或继续，并不代表任务异常终止；只有整轮以异常结束（上述「异常终止」组）才会提醒。

默认模板：

| 组 | 标题 | 消息 |
|---|---|---|
| 异常终止 | `DSH · 任务异常终止` | `任务未能正常完成：{reason}` |
| 需要你操作 | `DSH · 需要你操作` | `对话已暂停，等待你的确认或授权` |
| 正常完成 | `DSH · 任务完成` | `任务已顺利完成` |

每组模板支持以下变量：

| 变量 | 含义 | 可用组 |
|---|---|---|
| `{reason}` | 具体原因（上下文超限 / 任务阻塞 / 任务被中止 / 任务被中断 / 任务出错） | 异常终止 |
| `{tool}` | 等待批准的工具名 | 需要你操作 |

## 设置面板

安装后，打开 DSH 设置弹窗（左下角 ⚙️），左侧边会出现 **「通知管理」** 设置页：

- **是否启用**：总开关，关闭后所有组静默。
- **通知行为**：重复通知开关（存在未点击通知时是否继续弹）、点击横幅后打开的应用（自动扫描 DeepSeek Harness 桌面应用与浏览器）。
- **通知分组**：三大组各一个开关 + 提示音 + 标题/消息模板编辑（含模板变量提示）。
- 右上角 **保存**（配置即时生效，持久化到 `~/.dsh/dsh-niao-message.config.json`）与 **测试通知**（立即弹一条测试横幅）。

## 安装

在 DSH profile（如 `web`）中安装本包并加入 bundle：

```sh
# 方式一（官方 CLI，自动维护 bundles 列表）
dsh plugin --profile web add dsh-niao-message

# 方式二（pnpm 手动）
cd ~/.dsh/profiles/web
pnpm add dsh-niao-message
```

手动方式需要把包加入 profile 的 `dsh.profile.bundles`，然后重启 `dsh web`：

```json
{
  "dependencies": { "dsh-niao-message": "^0.1.0" },
  "dsh": { "profile": { "bundles": [ "...", "dsh-niao-message" ] } }
}
```

> 包声明了 `dsh.bundle`（组合包），`dsh plugin add` 会自动追加 bundles 项；依赖（`@deepseek-ai/schemastery`、`node-notifier`）随安装自动解析。

## 配置优先级

`Config` schema 默认值（插件内置，Cordis 校验并填充） < profile 补丁层 `cordis.patch.yml` 的 `config` < 设置面板保存的 `~/.dsh/dsh-niao-message.config.json`（最高）。

补丁层覆盖示例（config 改动热加载生效）：

```yaml
- insert:
    - id: dsh-niao-message
      name: 'dsh-niao-message'
      config:
        click:
          open: DeepSeek Harness
        groups:
          abnormal:
            enabled: true
            sound: Basso
            title: 'DSH · 工具出错'
            message: '任务异常：{reason}'
```

| 配置项 | 含义 | 默认 |
|---|---|---|
| `enabled` | 总开关 | `true` |
| `tool` | terminal-notifier 可执行文件路径（留空自动探测：插件自带 → node-notifier 自带 → 系统路径） | 自动探测 |
| `click.open` | 点击横幅时用 `open -a` 打开的应用名 | 空（仅消失） |
| `click.activate` | 备选：按 bundle id 激活应用 | — |
| `click`（字符串） | 备选：自定义点击 shell 命令 | — |
| `allowRepeat` | 存在未点击通知时仍继续弹新通知 | `false` |
| `throttleMs` | 同类通知节流窗口 | `3000` |
| `approvalGraceMs` | 批准宽限期（期内自动放行则静默） | `1000` |
| `pendingFile` | 去重标记文件路径 | `~/.dsh/dsh-niao-message-pending.json` |
| `configFile` | 设置面板持久化配置文件 | `~/.dsh/dsh-niao-message.config.json` |
| `pendingMaxAgeMs` | 标记过期时间 | `300000` |
| `groups.<key>.enabled / sound / title / message` | 三大组独立配置（key ∈ abnormal / waiting / success） | 见上表 |

## 验证

- 设置面板：打开设置弹窗 → 左侧「通知管理」→ 点「测试通知」→ 通知中心出现测试横幅。
- 功能是否生效：发起一次任务 → 完成后出现「DSH · 任务完成」；Agent 提问时出现「DSH · 需要你操作」。
- 点击行为：点击横幅 → 配置的应用被激活 + 标记文件被删除。
- 自动清空：发一条通知后切到其它应用/页签，再切回 DSH 页面 → 本插件弹出的通知自动消失（浏览器页签与独立窗口 PWA 均支持）。
- 去重行为：不点第一条通知，再触发一次完成 → 新通知被跳过（插件日志出现 `skipped (un-clicked notification pending)`）。

## 开发

```sh
npm install          # 安装依赖（node-notifier + esbuild）
npm run build        # 构建浏览器端 bundle（src/client.js → lib/client.js）
npm run check        # 语法检查宿主端 / 客户端 / 构建脚本 / smoke
npm run smoke        # 冒烟测试（fake ctx + 假 webServer + 录制脚本，不弹真实通知，38 项）
```

## 依赖

**零手动安装**。插件自带了全部所需组件：

- **macOS 通知二进制**：`lib/vendor/terminal-notifier.app`（arm64，随插件分发，Apple Silicon 开箱即用）。
- **npm 依赖 `node-notifier`**（安装插件时自动安装）：自带 x86_64 版 terminal-notifier，覆盖 Intel Mac。
- **macOS 系统自带的 `open` 命令**：点击横幅打开软件。
- 如需使用系统自装的 terminal-notifier（如 Homebrew 版本），在配置里设 `tool` 即可覆盖。

## 许可证

MIT（附带组件许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)）
