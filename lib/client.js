window.__ModuleLoader__.load({
  id: "dsh-niao-message",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.js
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);
var ROUTE = "/api/dsh-niao-message";
var SCENARIOS = [
  { key: "question", name: "\u7B49\u5F85\u7528\u6237\u786E\u8BA4", desc: "Agent \u8C03\u7528 ask_user_question \u63D0\u95EE\uFF0C\u963B\u585E\u7B49\u5F85\u4F60\u7684\u56DE\u7B54" },
  { key: "approval", name: "\u7B49\u5F85\u7528\u6237\u6279\u51C6", desc: "\u5DE5\u5177\u8C03\u7528\u7B49\u5F85\u6279\u51C6\uFF0C\u5BBD\u9650\u671F\u540E\u4ECD\u672A\u51B3" },
  { key: "tool-error", name: "\u5DE5\u5177\u8C03\u7528\u5931\u8D25", desc: "\u5355\u4E2A\u5DE5\u5177\u6267\u884C\u51FA\u9519\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF0CAgent \u901A\u5E38\u4F1A\u5728\u540C\u4E00\u8F6E\u5185\u91CD\u8BD5\uFF09" },
  { key: "done", name: "\u56DE\u7B54\u5B8C\u6210", desc: "\u6574\u8F6E\u6B63\u5E38\u5B8C\u6210" },
  { key: "turn-error", name: "\u56DE\u7B54\u51FA\u9519", desc: "\u6574\u8F6E\u4EE5\u9519\u8BEF\u7ED3\u675F" },
  { key: "aborted", name: "\u4EFB\u52A1\u88AB\u4E2D\u6B62", desc: "\u7528\u6237\u4E3B\u52A8\u53D6\u6D88\u672C\u8F6E" },
  { key: "max-tokens", name: "\u4E0A\u4E0B\u6587\u8D85\u9650", desc: "\u8FBE\u5230 max-tokens \u4E0A\u9650" },
  { key: "blocked", name: "\u4EFB\u52A1\u963B\u585E", desc: "\u672C\u8F6E\u5904\u4E8E\u963B\u585E\u72B6\u6001" },
  { key: "interrupted", name: "\u4EFB\u52A1\u88AB\u4E2D\u65AD", desc: "\u672C\u8F6E\u88AB\u4E2D\u65AD" },
  { key: "subagent-end", name: "\u5B50\u4EE3\u7406\u7ED3\u675F", desc: "\u5B50\u4EE3\u7406\u4EFB\u52A1\u7ED3\u675F\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09" }
];
var SOUNDS = ["Glass", "Ping", "Basso", "Sosumi", "Submarine", "Hero", "Funk", "Pop", "default"];
var VAR_HINT = {
  question: "",
  approval: "\u53EF\u7528\u53D8\u91CF\uFF1A{tool}\uFF08\u5DE5\u5177\u540D\uFF09",
  "tool-error": "\u53EF\u7528\u53D8\u91CF\uFF1A{name}\uFF08\u9519\u8BEF\u540D\uFF09\u3001{code}\uFF08\u9519\u8BEF\u7801\uFF09",
  done: "",
  "turn-error": "",
  aborted: "",
  "max-tokens": "",
  blocked: "",
  interrupted: "",
  "subagent-end": ""
};
async function rpc(action, payload) {
  try {
    const res = await fetch(ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await res.json();
    if (data && data.ok) return { ok: true, value: data.value };
    return { ok: false, error: data && data.error && data.error.message || `HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  }
}
async function getConfig() {
  const res = await rpc("get-config");
  return res.ok ? res.value.config : null;
}
function ToggleRow(props) {
  return import_react.default.createElement(
    "label",
    {
      className: "nio-msg-toggle",
      title: props.hint || ""
    },
    import_react.default.createElement("input", {
      type: "checkbox",
      checked: !!props.checked,
      onChange: (e) => props.onChange(e.target.checked)
    }),
    import_react.default.createElement("span", { className: "nio-msg-toggle-text" }, props.children)
  );
}
function ConfigPanel(props) {
  const [config, setConfig] = import_react.default.useState(null);
  const [saving, setSaving] = import_react.default.useState(false);
  const [saved, setSaved] = import_react.default.useState(false);
  const [testing, setTesting] = import_react.default.useState(false);
  const [testResult, setTestResult] = import_react.default.useState(null);
  import_react.default.useEffect(() => {
    let alive = true;
    getConfig().then((cfg) => {
      if (alive && cfg) setConfig(cfg);
    });
    return () => {
      alive = false;
    };
  }, []);
  const patchScenario = (key, field, value) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const scenarios = { ...prev.scenarios };
      scenarios[key] = { ...scenarios[key], [field]: value };
      return { ...prev, scenarios };
    });
    setSaved(false);
  };
  const save = async () => {
    if (!config) return;
    setSaving(true);
    const res = await rpc("set-config", { config });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      if (res.value.config) setConfig(res.value.config);
    } else {
      window.alert("\u4FDD\u5B58\u5931\u8D25\uFF1A" + res.error);
    }
  };
  const test = async () => {
    setTesting(true);
    const res = await rpc("test");
    setTesting(false);
    setTestResult(res.ok ? "\u5DF2\u53D1\u9001\u6D4B\u8BD5\u901A\u77E5\uFF0C\u8BF7\u67E5\u770B\u901A\u77E5\u4E2D\u5FC3" : "\u6D4B\u8BD5\u5931\u8D25\uFF1A" + res.error);
  };
  if (!config) {
    return import_react.default.createElement(
      "div",
      { className: "nio-msg" },
      import_react.default.createElement("p", { className: "nio-msg-note" }, "\u6B63\u5728\u52A0\u8F7D\u901A\u77E5\u914D\u7F6E\u2026")
    );
  }
  const root = import_react.default.createElement(
    "div",
    { className: "nio-msg" },
    /* 顶部操作行 */
    import_react.default.createElement(
      "div",
      { className: "nio-msg-top" },
      import_react.default.createElement("span", { className: "nio-msg-title" }, "\u901A\u77E5\u7BA1\u7406"),
      import_react.default.createElement(
        "div",
        { className: "nio-msg-top-actions" },
        import_react.default.createElement(
          "button",
          { type: "button", className: "nio-msg-btn", onClick: test, disabled: testing },
          testing ? "\u53D1\u9001\u4E2D\u2026" : "\u6D4B\u8BD5\u901A\u77E5"
        ),
        import_react.default.createElement(
          "button",
          { type: "button", className: "nio-msg-btn primary", onClick: save, disabled: saving || !config },
          saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"
        )
      )
    ),
    saved ? import_react.default.createElement("p", { className: "nio-msg-saved" }, "\u5DF2\u4FDD\u5B58 \u2713\uFF08\u914D\u7F6E\u70ED\u52A0\u8F7D\u751F\u6548\uFF09") : null,
    testResult ? import_react.default.createElement("p", { className: "nio-msg-test" }, testResult) : null,
    /* 一、是否启用 */
    import_react.default.createElement(
      "div",
      { className: "nio-msg-block" },
      import_react.default.createElement("h3", { className: "nio-msg-block-title" }, "\u662F\u5426\u542F\u7528"),
      import_react.default.createElement(ToggleRow, {
        checked: config.enabled,
        onChange: (v) => {
          setConfig({ ...config, enabled: v });
          setSaved(false);
        },
        hint: "\u5173\u95ED\u540E\u6240\u6709\u573A\u666F\u90FD\u4E0D\u518D\u5F39\u7CFB\u7EDF\u901A\u77E5"
      }, "\u542F\u7528 macOS \u7CFB\u7EDF\u901A\u77E5")
    ),
    /* 二、场景启用配置 */
    import_react.default.createElement(
      "div",
      { className: "nio-msg-block" },
      import_react.default.createElement("h3", { className: "nio-msg-block-title" }, "\u573A\u666F\u542F\u7528\u914D\u7F6E"),
      import_react.default.createElement("p", { className: "nio-msg-note" }, "\u52FE\u9009\u9700\u8981\u5728\u5BF9\u8BDD\u4E2D\u5F39\u51FA\u7CFB\u7EDF\u901A\u77E5\u7684\u8282\u70B9\uFF1A"),
      SCENARIOS.map((scene) => import_react.default.createElement(
        "div",
        { key: scene.key, className: "nio-msg-scene" },
        import_react.default.createElement(
          "div",
          { className: "nio-msg-scene-head" },
          import_react.default.createElement(ToggleRow, {
            checked: !!(config.scenarios[scene.key] && config.scenarios[scene.key].enabled),
            onChange: (v) => patchScenario(scene.key, "enabled", v)
          }, scene.name),
          import_react.default.createElement("select", {
            className: "nio-msg-select",
            value: config.scenarios[scene.key] && config.scenarios[scene.key].sound || "Glass",
            onChange: (e) => patchScenario(scene.key, "sound", e.target.value),
            title: "\u63D0\u793A\u97F3"
          }, SOUNDS.map((s) => import_react.default.createElement("option", { key: s, value: s }, s)))
        ),
        import_react.default.createElement("p", { className: "nio-msg-scene-desc" }, scene.desc)
      ))
    ),
    /* 三、通知模板 */
    import_react.default.createElement(
      "div",
      { className: "nio-msg-block" },
      import_react.default.createElement("h3", { className: "nio-msg-block-title" }, "\u901A\u77E5\u6A21\u677F"),
      import_react.default.createElement("p", { className: "nio-msg-note" }, "\u81EA\u5B9A\u4E49\u5404\u573A\u666F\u7684\u6A2A\u5E45\u6807\u9898\u4E0E\u6D88\u606F\u6587\u6848\uFF08{var} \u4E3A\u6A21\u677F\u53D8\u91CF\uFF09\uFF1A"),
      SCENARIOS.map((scene) => import_react.default.createElement(
        "div",
        { key: scene.key, className: "nio-msg-tpl" },
        import_react.default.createElement("div", { className: "nio-msg-tpl-head" }, scene.name),
        import_react.default.createElement(
          "div",
          { className: "nio-msg-tpl-row" },
          import_react.default.createElement(
            "label",
            { className: "nio-msg-field" },
            import_react.default.createElement("span", { className: "nio-msg-field-label" }, "\u6807\u9898"),
            import_react.default.createElement("input", {
              className: "nio-msg-input",
              value: config.scenarios[scene.key] && config.scenarios[scene.key].title || "",
              onChange: (e) => patchScenario(scene.key, "title", e.target.value)
            })
          ),
          import_react.default.createElement(
            "label",
            { className: "nio-msg-field" },
            import_react.default.createElement("span", { className: "nio-msg-field-label" }, "\u6D88\u606F"),
            import_react.default.createElement("input", {
              className: "nio-msg-input",
              value: config.scenarios[scene.key] && config.scenarios[scene.key].message || "",
              onChange: (e) => patchScenario(scene.key, "message", e.target.value)
            })
          )
        ),
        VAR_HINT[scene.key] ? import_react.default.createElement("p", { className: "nio-msg-scene-desc" }, VAR_HINT[scene.key]) : null
      ))
    )
  );
  return root;
}
var CSS = `
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
`;
var inject = [];
function apply(ctx) {
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.setAttribute("data-plugin", "dsh-niao-message");
    tag.setAttribute("data-plugin-css", "dsh-niao-message");
    tag.textContent = CSS;
    document.head.append(tag);
    return () => tag.remove();
  }, "dsh-niao-message: styles");
  const slots = ctx.get("slots");
  if (!slots) return;
  slots.inject("settings.section", () => slots.register(
    { name: "settings.section", id: "dsh-niao-message", order: 35, label: () => "\u901A\u77E5\u7BA1\u7406" },
    (props) => import_react.default.createElement(ConfigPanel, { close: props && props.close ? props.close : null })
  ));
}
    return module.exports;
  }
});
