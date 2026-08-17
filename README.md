# dsh-niao-message

[English](README.md) | [中文](README.zh.md)

macOS system notifications for DeepSeek Harness, with a **settings panel**.

Uses **terminal-notifier** to post Notification Center banners at the moments that genuinely need the human; **clicking a banner opens a configured app** (DeepSeek Harness by default).

## Notifiable scenarios (enabled ✅ / disabled ⬜ by default)

| Scenario | Event | Default | Sound |
|---|---|---|---|
| Waiting for user answer | `tool/call` with `ask_user_question` (blocks until you answer) | ✅ | Glass |
| Pending approval | `approval/asked` unresolved after the grace window | ✅ | Ping |
| Tool call failure | `tool/result` with `error` (agent usually retries in-turn; keep off) | ⬜ | Basso |
| Answer complete | `turn/end` reason=`completed` | ✅ | Glass |
| Answer error | `turn/end` reason=`error` | ✅ | Sosumi |
| Task aborted | `turn/end` reason=`aborted` (user cancelled) | ⬜ | Glass |
| Context over limit | `turn/end` reason=`max-tokens` | ⬜ | Glass |
| Task blocked | `turn/end` reason=`blocked` | ⬜ | Glass |
| Task interrupted | `turn/end` reason=`interrupted` | ⬜ | Glass |
| Subagent finished | `subagent/end` | ⬜ | Glass |

Each scenario has its own **enable toggle**, **sound**, **title template** and **message template** (variables `{tool}` `{name}` `{code}`).

## Settings panel

After install, open the DSH settings dialog (⚙️ at the sidebar foot); the left nav gains a **「通知管理」** page:

- **是否启用 (Enable)**: master switch; when off, every scenario is silent.
- **场景启用配置 (Scenario toggles)**: every node from the table above, each row with an enable toggle and a sound picker.
- **通知模板 (Templates)**: per-scenario title / message editors (with variable hints).
- Top-right **保存 (Save)** (hot-reloads config, persisted to `~/.dsh/dsh-niao-message.config.json`) and **测试通知 (Test)** (posts a test banner immediately).

## Features

- **Click to open an app**: clicking a banner runs `open -a '<AppName>'` (or activates a bundle id / a custom shell command).
- **Un-clicked dedupe**: while an un-clicked DSH notification is pending (marker file with expiry), new notifications are skipped — no banner stacking, no permanent silence from a stale banner.
- **Throttle**: identical notifications coalesce within 3 s; throttled/deduped sends do not consume the throttle window.
- **Zero manual install, works out of the box**: the plugin ships the macOS notification binary itself (arm64 for Apple Silicon; Intel Macs fall back to the x86_64 binary bundled with the npm dependency `node-notifier`; the `tool` config can still override with a system-installed version).
- **Host-side event driven**: listens to host `session/event` and `subagent/end` (not the browser page), so banners appear even when the tab is backgrounded.

## Install

```sh
# Option 1: install the local folder (symlink; edits take effect on restart)
cd ~/.dsh/profiles/web
npm install /Users/majun/code/0item-dsh-plugins/dsh-niao-message

# Option 2: pack and install the tarball
cd /Users/majun/code/0item-dsh-plugins/dsh-niao-message && npm pack
cd ~/.dsh/profiles/web
npm install ../0item-dsh-plugins/dsh-niao-message/dsh-niao-message-0.2.0.tgz
```

Add the package to the profile's `dependencies` and `dsh.profile.bundles`, then restart `dsh web`.

> **Migrating from the old `dsh-notify`**: comment out or remove the `dsh-notify` row in `~/.dsh/profiles/web/cordis.patch.yml`, otherwise both plugins fire duplicate banners.

## Configuration priority

`DEFAULTS` (in-plugin) < profile patch `cordis.patch.yml` `config` < settings-panel file `~/.dsh/dsh-niao-message.config.json` (highest).

Patch-layer overrides (config hot-reloads):

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

| Key | Meaning | Default |
|---|---|---|
| `enabled` | master switch | `true` |
| `tool` | terminal-notifier binary path (auto: plugin-bundled → node-notifier bundled → system paths) | auto |
| `click.open` | app name for `open -a` on click | `DeepSeek Harness` |
| `click.activate` | bundle id to activate on click | — |
| `click` (string) | custom click shell command | — |
| `throttleMs` | same-kind coalescing window (ms) | `3000` |
| `approvalGraceMs` | grace window before an unresolved approval notifies | `1000` |
| `pendingFile` | dedupe marker file | `~/.dsh/dsh-niao-message-pending.json` |
| `configFile` | settings-panel persistence file | `~/.dsh/dsh-niao-message.config.json` |
| `pendingMaxAgeMs` | marker expiry (ms) | `300000` |
| `scenarios.<key>.enabled / sound / title / message` | per-scenario config | see table above |

Legacy toggles (`onQuestion` / `onApproval` / `onToolError` / `onTurnError` / `onComplete`) are still recognized and map to the matching scenario's `enabled`.

## Verification

- Settings panel: open Settings → 「通知管理」 → **测试通知** → a test banner appears.
- End-to-end: run a task → 「DSH · 任务完成」 appears; when the agent asks → 「需要你回答」.
- Click: clicking the banner activates DeepSeek Harness and deletes the marker file.
- Dedupe: leave the first banner un-clicked, trigger another completion → new banner skipped (`skipped (un-clicked notification pending)` in logs).

## Development

```sh
npm install          # install deps (node-notifier + esbuild)
npm run build        # build browser bundle (src/client.js → lib/client.js)
npm run check        # syntax-check host / client source / build script / smoke
npm run smoke        # smoke test (fake ctx + fake webServer + capture script, 30 checks, no real banners)
```

## Dependencies

**Zero manual install.** Everything is shipped with the plugin:

- **macOS notification binary**: `lib/vendor/terminal-notifier.app` (arm64, bundled — Apple Silicon works out of the box).
- **npm dependency `node-notifier`** (installed automatically): bundles an x86_64 terminal-notifier for Intel Macs.
- **macOS built-in `open` command**: click-to-open.
- To use a system-installed terminal-notifier (e.g. Homebrew), set `tool` in the config.

## License

MIT (bundled component licenses in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md))
