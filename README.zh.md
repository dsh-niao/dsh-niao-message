# dsh-niao-message

[English](README.md) | [中文](README.zh.md)

DeepSeek Harness 的 **macOS 系统通知** 插件，带 **设置面板**。

用 **terminal-notifier** 在对话的关键节点向 macOS 通知中心弹出横幅，**点击横幅直接打开指定软件**（默认 DeepSeek Harness，可配置）。

## 可通知场景（默认开启 ✅ / 关闭 ⬜）

| 场景 | 判定事件 | 默认 | 提示音 |
|---|---|---|---|
| 等待用户确认 | `tool/call` 且工具为 `ask_user_question`（阻塞等你回答） | ✅ | Glass |
| 等待用户批准 | `approval/asked` 超过宽限期仍未决 | ✅ | Ping |
| 工具调用失败 | `tool/result` 带 `error`（Agent 通常会在同轮内重试，建议关闭） | ⬜ | Basso |
| 回答完成 | `turn/end` reason=`completed` | ✅ | Glass |
| 回答出错 | `turn/end` reason=`error` | ✅ | Sosumi |
| 任务被中止 | `turn/end` reason=`aborted`（用户取消） | ⬜ | Glass |
| 上下文超限 | `turn/end` reason=`max-tokens` | ⬜ | Glass |
| 任务阻塞 | `turn/end` reason=`blocked` | ⬜ | Glass |
| 任务被中断 | `turn/end` reason=`interrupted` | ⬜ | Glass |
| 子代理结束 | `subagent/end` | ⬜ | Glass |

每个场景可独立设置：**启用开关**、**提示音**、**标题模板**、**消息模板**（支持 `{tool}` `{name}` `{code}` 变量）。

## 设置面板

安装后，打开 DSH 设置弹窗（左下角 ⚙️），左侧边会出现 **「通知管理」** 设置页：

- **是否启用**：总开关，关闭后所有场景静默。
- **场景启用配置**：罗列上表全部节点，每行一个启用开关 + 提示音下拉。
- **通知模板**：每个场景的标题 / 消息文案编辑（含模板变量提示）。
- 右上角 **保存**（配置热加载生效，持久化到 `~/.dsh/dsh-niao-message.config.json`）与 **测试通知**（立即弹一条测试横幅）。

## 特性

- **点击打开指定软件**：点击横幅执行 `open -a '<应用名>'`（或按 bundle id 激活 / 自定义 shell 命令）。
- **未点击去重**：通知中心还挂着未点击的 DSH 通知时，新通知自动跳过（标记文件 + 过期时间，防止永久静默）。
- **节流**：同类通知 3 秒内合并为一条；被去重/节流拦下的通知不消耗节流配额。
- **零手动安装，开箱即用**：不需要用户安装任何系统工具——插件自带 macOS 通知二进制（Apple Silicon arm64 版随包分发；Intel Mac 回退使用 npm 依赖 `node-notifier` 自带的 x86_64 二进制；`tool` 配置项仍可覆盖为系统自装版本）。
- **纯宿主端事件驱动**：监听的是宿主进程的 `session/event` 与 `subagent/end`（非浏览器页面），标签页后台/最小化时通知照常弹出。

## 安装

在 profile（如 `web`）中安装本包：

```sh
# 方式一：把本地文件夹作为依赖安装（symlink，改代码即时生效）
cd ~/.dsh/profiles/web
npm install /Users/majun/code/0item-dsh-plugins/dsh-niao-message

# 方式二：打包后安装（拷贝，发布前推荐）
cd /Users/majun/code/0item-dsh-plugins/dsh-niao-message
npm pack
cd ~/.dsh/profiles/web
npm install ../0item-dsh-plugins/dsh-niao-message/dsh-niao-message-0.2.0.tgz
```

然后把包加入 profile 的 `package.json` 依赖与 `dsh.profile.bundles`，重启 `dsh web`：

```json
{
  "dependencies": { "dsh-niao-message": "^0.2.0" },
  "dsh": { "profile": { "bundles": [ "...", "dsh-niao-message" ] } }
}
```

> **从旧版 `dsh-notify` 迁移**：如果 `~/.dsh/profiles/web/cordis.patch.yml` 里已有 `dsh-notify`（`./notify6.mjs`）行，请注释或删除它，否则两个插件会重复弹通知。

## 配置优先级

`DEFAULTS`（插件内置） < profile 补丁层 `cordis.patch.yml` 的 `config` < 设置面板保存的 `~/.dsh/dsh-niao-message.config.json`（最高）。

也可以在补丁层直接覆盖（config 改动热加载生效）：

```yaml
- insert:
    - id: dsh-niao-message
      name: 'dsh-niao-message'
      config:
        click:
          open: DeepSeek Harness
        enabled: true
        scenarios:
          'tool-error':
            enabled: true
            sound: Basso
            title: 'DSH · 工具出错'
            message: '{name} ({code})'
```

| 配置项 | 含义 | 默认 |
|---|---|---|
| `enabled` | 总开关 | `true` |
| `tool` | terminal-notifier 可执行文件路径（留空自动探测：插件自带 → node-notifier 自带 → 系统路径） | 自动探测 |
| `click.open` | 点击横幅时用 `open -a` 打开的应用名 | `DeepSeek Harness` |
| `click.activate` | 备选：按 bundle id 激活应用 | — |
| `click`（字符串） | 备选：自定义点击 shell 命令 | — |
| `throttleMs` | 同类通知节流窗口 | `3000` |
| `approvalGraceMs` | 批准宽限期（自动放行则静默） | `1000` |
| `pendingFile` | 去重标记文件路径 | `~/.dsh/dsh-niao-message-pending.json` |
| `configFile` | 设置面板持久化配置文件 | `~/.dsh/dsh-niao-message.config.json` |
| `pendingMaxAgeMs` | 标记过期时间 | `300000` |
| `scenarios.<key>.enabled / sound / title / message` | 各场景独立配置 | 见上表 |

旧版开关（`onQuestion` / `onApproval` / `onToolError` / `onTurnError` / `onComplete`）仍被识别，映射到对应场景的 `enabled`。

## 验证

- 设置面板：打开设置弹窗 → 左侧「通知管理」→ 点「测试通知」→ 通知中心出现测试横幅。
- 功能是否生效：发起一次任务 → 完成后出现「DSH · 任务完成」；Agent 提问时出现「需要你回答」。
- 点击行为：点击横幅 → DeepSeek Harness 被激活 + 标记文件被删除。
- 去重行为：不点第一条通知，再触发一次完成 → 新通知被跳过（插件日志出现 `skipped (un-clicked notification pending)`）。

## 开发

```sh
npm install          # 安装依赖（node-notifier + esbuild）
npm run build        # 构建浏览器端 bundle（src/client.js → lib/client.js）
npm run check        # 语法检查 lib/index.js / src/client.js / 构建脚本 / smoke
npm run smoke        # 冒烟测试（fake ctx + 假 webServer + 录制脚本，不弹真实通知，30 项）
```

## 依赖

**零手动安装**。插件自带了全部所需组件：

- **macOS 通知二进制**：`lib/vendor/terminal-notifier.app`（arm64，随插件分发，Apple Silicon 开箱即用）。
- **npm 依赖 `node-notifier`**（安装插件时自动安装）：自带 x86_64 版 terminal-notifier，覆盖 Intel Mac。
- **macOS 系统自带的 `open` 命令**：点击横幅打开软件。
- 如需使用系统自装的 terminal-notifier（如 Homebrew 版本），在配置里设 `tool` 即可覆盖。

## 许可证

MIT（附带组件许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)）
