# dsh-niao-message

[中文](README.md) | [English](README.en.md)

macOS system notifications for DeepSeek Harness, with a built-in **settings panel** (Settings dialog →「通知管理」).

Uses **terminal-notifier** to post Notification Center banners at the moments that genuinely need the human; **clicking a banner opens a configured app** (configurable; by default it just dismisses).

## Features

- **Three notification groups**: every notifiable situation is grouped into "Abnormal termination / Action needed / Completed", each group having one toggle, one sound and its own title/message templates — simple and intuitive.
- **Click to open an app**: clicking a banner runs `open -a '<AppName>'` (or activates a bundle id / a custom shell command) and clears the un-clicked dedupe marker.
- **Auto-dismiss on return**: every notification is posted under the `-group dsh-niao` id; when you switch back to the DSH page (browser tab or standalone PWA window — driven by `visibilitychange` + `focus`, pure event-driven, zero polling), all notifications from this plugin are removed automatically — banners only remind you while you are away.
- **Un-clicked dedupe**: while an un-clicked DSH notification is pending (marker file with expiry), new notifications are skipped — no banner stacking, no permanent silence from a stale banner.
- **Throttle**: identical notifications coalesce within 3 s; throttled/deduped sends do not consume the throttle window.
- **Zero manual install**: the plugin ships the macOS notification binary itself (arm64, works out of the box on Apple Silicon); Intel Macs automatically fall back to the x86_64 binary bundled with the npm dependency `node-notifier` — no system tool to install.
- **Host-side event driven**: listens to host `session/event` and `subagent/end` (not the browser page), so banners appear even when the tab is backgrounded.

## The three groups

| Group | Default | Sound | Covers |
|---|---|---|---|
| **Abnormal termination** | ✅ on | Sosumi | Context over limit, task blocked, task aborted, task interrupted, answer error |
| **Action needed** | ✅ on | Ping | Awaiting your answer (question / continue), awaiting your approval (authorization) |
| **Completed** | ✅ on | Glass | Answer complete, subagent finished |

> Note: **a single tool-call failure is not notified** — it is an in-process failure and the agent usually retries or continues within the same turn, so it does not mean the task abnormally terminated; only a turn ending abnormally (the "Abnormal termination" group above) is alerted.

Default templates:

| Group | Title | Message |
|---|---|---|
| Abnormal termination | `DSH · 任务异常终止` | `任务未能正常完成：{reason}` |
| Action needed | `DSH · 需要你操作` | `对话已暂停，等待你的确认或授权` |
| Completed | `DSH · 任务完成` | `任务已顺利完成` |

Template variables:

| Variable | Meaning | Group |
|---|---|---|
| `{reason}` | Specific reason (context over limit / blocked / aborted / interrupted / error) | Abnormal termination |
| `{tool}` | Tool awaiting approval | Action needed |

## Settings panel

After install, open the DSH settings dialog (⚙️ at the sidebar foot); the left nav gains a **「通知管理」** page:

- **是否启用 (Enable)**: master switch; when off, every group is silent.
- **通知行为 (Behavior)**: repeat-notification toggle (keep posting while an un-clicked notification exists) and the app to open on click (auto-scans installed DeepSeek Harness desktop apps and browsers).
- **通知分组 (Groups)**: each of the three groups with a toggle, a sound picker and title/message template editors (with variable hints).
- Top-right **保存 (Save)** (takes effect immediately, persisted to `~/.dsh/dsh-niao-message.config.json`) and **测试通知 (Test)** (posts a test banner immediately).

## Install

Install the package in a DSH profile (e.g. `web`) and add it to the bundle:

```sh
# Option 1 (official CLI — maintains the bundles list automatically)
dsh plugin --profile web add dsh-niao-message

# Option 2 (manual pnpm)
cd ~/.dsh/profiles/web
pnpm add dsh-niao-message
```

For the manual way, add the package to the profile's `dsh.profile.bundles` and restart `dsh web`:

```json
{
  "dependencies": { "dsh-niao-message": "^0.1.0" },
  "dsh": { "profile": { "bundles": [ "...", "dsh-niao-message" ] } }
}
```

> The package declares `dsh.bundle` (a bundle package), so `dsh plugin add` appends the bundles entry automatically; dependencies (`@deepseek-ai/schemastery`, `node-notifier`) are resolved at install time.

## Configuration priority

`Config` schema defaults (validated by Cordis) < profile patch `cordis.patch.yml` `config` < settings-panel file `~/.dsh/dsh-niao-message.config.json` (highest).

Patch-layer override example (config hot-reloads):

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

| Key | Meaning | Default |
|---|---|---|
| `enabled` | master switch | `true` |
| `tool` | terminal-notifier binary path (auto: plugin-bundled → node-notifier bundled → system paths) | auto |
| `click.open` | app name for `open -a` on click | empty (dismiss only) |
| `click.activate` | bundle id to activate on click | — |
| `click` (string) | custom click shell command | — |
| `allowRepeat` | keep posting while an un-clicked notification exists | `false` |
| `throttleMs` | same-kind coalescing window (ms) | `3000` |
| `approvalGraceMs` | grace window before an unresolved approval notifies | `1000` |
| `pendingFile` | dedupe marker file | `~/.dsh/dsh-niao-message-pending.json` |
| `configFile` | settings-panel persistence file | `~/.dsh/dsh-niao-message.config.json` |
| `pendingMaxAgeMs` | marker expiry (ms) | `300000` |
| `groups.<key>.enabled / sound / title / message` | per-group config (key ∈ abnormal / waiting / success) | see table above |

## Verification

- Settings panel: open Settings → 「通知管理」 → **测试通知** → a test banner appears.
- End-to-end: run a task → 「DSH · 任务完成」 appears; when the agent asks → 「DSH · 需要你操作」.
- Click: clicking the banner activates the configured app and deletes the marker file.
- Auto-dismiss: post a notification, switch to another app/tab, then switch back to the DSH page → the plugin's notifications are removed automatically (works in browser tabs and standalone PWA windows).
- Dedupe: leave the first banner un-clicked, trigger another completion → new banner skipped (`skipped (un-clicked notification pending)` in logs).

## Development

```sh
npm install          # install deps (node-notifier + esbuild)
npm run build        # build browser bundle (src/client.js → lib/client.js)
npm run check        # syntax-check host / client / build script / smoke
npm run smoke        # smoke test (fake ctx + fake webServer + capture script, 38 checks, no real banners)
```

## Dependencies

**Zero manual install.** Everything is shipped with the plugin:

- **macOS notification binary**: `lib/vendor/terminal-notifier.app` (arm64, bundled — Apple Silicon works out of the box).
- **npm dependency `node-notifier`** (installed automatically): bundles an x86_64 terminal-notifier for Intel Macs.
- **macOS built-in `open` command**: click-to-open.
- To use a system-installed terminal-notifier (e.g. Homebrew), set `tool` in the config.

## License

MIT (bundled component licenses in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md))
