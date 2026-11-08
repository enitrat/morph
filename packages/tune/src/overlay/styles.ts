import { EDGE, PANEL_MAX_HEIGHT, PANEL_WIDTH, TAB } from "./geometry"

/** The overlay's stylesheet, scoped by its shadow root; nothing of the host page reaches it. */
export const OVERLAY_CSS = `
:host { all: initial; }
.root {
  --accent: #6236e0;
  --accent-soft: rgb(98 54 224 / 0.1);
  --on-accent: #fff;
  --bg: #fff;
  --raised: #f6f6f7;
  --fg: #18181b;
  --muted: #6b6b76;
  --line: rgb(0 0 0 / 0.1);
  --danger: #c4314b;
  --ring: #18181b;
  --shadow: 0 0 0 1px rgb(0 0 0 / 0.06), 0 8px 24px rgb(0 0 0 / 0.12), 0 2px 6px rgb(0 0 0 / 0.06);
  font: 400 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
  color-scheme: light;
}
.root[data-theme="dark"] {
  --accent: #8f6ff5;
  --accent-soft: rgb(143 111 245 / 0.16);
  --bg: #1c1c1f;
  --raised: #26262a;
  --fg: #f4f4f5;
  --muted: #a1a1aa;
  --line: rgb(255 255 255 / 0.1);
  --danger: #f2667f;
  --ring: #f4f4f5;
  --shadow: 0 0 0 1px rgb(255 255 255 / 0.08), 0 8px 24px rgb(0 0 0 / 0.5);
  color-scheme: dark;
}
*, *::before, *::after { box-sizing: border-box; }
button, textarea, input { font: inherit; color: inherit; }
button { touch-action: manipulation; cursor: pointer; }
:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 11.5px; }
.num { font-variant-numeric: tabular-nums; }

.tab {
  position: fixed; right: 0; top: 50%; translate: 0 -50%; z-index: 2147483646;
  width: 28px; height: 44px; display: grid; place-items: center;
  border: 0; border-radius: 8px 0 0 8px; background: var(--accent); color: var(--on-accent);
  box-shadow: var(--shadow);
  transition: width 150ms ease-out;
}
@media (hover: hover) and (pointer: fine) { .tab:hover { width: 34px; } }
.tab svg { width: 15px; height: 15px; }

.panel {
  position: fixed; z-index: 2147483646; width: ${PANEL_WIDTH}px; max-height: min(${PANEL_MAX_HEIGHT}px, calc(100vh - ${2 * EDGE}px));
  display: flex; flex-direction: column; background: var(--bg); border-radius: 12px;
  box-shadow: var(--shadow); overflow: hidden;
  transition: opacity 150ms ease-out, translate 150ms cubic-bezier(0.32, 0.72, 0, 1);
}
.panel[data-x="right"] { right: ${TAB}px; }
.panel[data-x="left"] { left: ${EDGE}px; }
.panel[data-x="bottom"] { left: calc(50% - ${PANEL_WIDTH / 2}px); }
@starting-style { .panel { opacity: 0; translate: 0 6px; } }

.head {
  display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 14px;
  border-bottom: 1px solid var(--line); cursor: grab; touch-action: none; user-select: none;
}
.head:active { cursor: grabbing; }
.title { font-weight: 600; }
.status { color: var(--muted); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icon {
  position: relative; width: 28px; height: 28px; display: grid; place-items: center;
  border: 0; border-radius: 6px; background: transparent; color: var(--muted);
  transition: background-color 150ms ease-out, color 150ms ease-out;
}
.icon::before { content: ""; position: absolute; inset: -6px; }
@media (hover: hover) and (pointer: fine) { .icon:hover { background: var(--raised); color: var(--fg); } }
.icon svg { width: 14px; height: 14px; }

.body { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
.hint { color: var(--muted); font-size: 12px; }
.quote {
  display: flex; flex-direction: column; gap: 2px;
  color: var(--muted); border-left: 2px solid var(--line); padding-left: 8px;
}
.quote p { margin: 0; }
.quote-mark { font-size: 12px; }

.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
  padding: 3px 4px 3px 8px; border-radius: 6px; background: var(--accent-soft);
}
.chip-name { font-weight: 500; }
.chip-where { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip .icon { width: 20px; height: 20px; }
.chip .icon::before { inset: -4px; }
.chip .icon svg { width: 11px; height: 11px; }

.tools { display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--raised); }
.tool {
  flex: 1; height: 28px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-weight: 500;
  transition: background-color 150ms ease-out, color 150ms ease-out;
}
.tool svg { width: 13px; height: 13px; }
.tool[aria-pressed="true"] { background: var(--bg); color: var(--fg); box-shadow: 0 0 0 1px var(--line); }
@media (hover: hover) and (pointer: fine) { .tool:hover { color: var(--fg); } }

.field {
  width: 100%; min-height: 64px; resize: none; padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--line); background: var(--bg); line-height: 1.45;
}
.field::placeholder { color: var(--muted); }
.field:focus-visible { outline: none; border-color: var(--muted); }

.marks { display: flex; flex-direction: column; gap: 4px; }
.mark-row { display: flex; align-items: center; gap: 6px; color: var(--muted); }
.mark-row span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.foot {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line);
}
.foot .hint { flex: 1; }
.button {
  height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--bg); font-weight: 500;
  transition: background-color 150ms ease-out, scale 150ms ease-out;
}
.button:active:not(:disabled) { scale: 0.96; }
.button.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); }
.button:disabled { opacity: 0.5; cursor: default; }
@media (hover: hover) and (pointer: fine) {
  .button:not(.primary):not(:disabled):hover { background: var(--raised); }
}
kbd {
  font: 500 11px/1 ui-monospace, "SF Mono", Menlo, monospace; padding: 2px 4px; border-radius: 4px;
  background: var(--raised); color: var(--muted);
}
.primary kbd { background: rgb(255 255 255 / 0.18); color: inherit; }

.slots { display: flex; flex-direction: column; gap: 6px; }
.slot {
  display: grid; grid-template-columns: 22px 1fr auto; align-items: start; gap: 8px; width: 100%;
  padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg);
  text-align: left; transition: border-color 150ms ease-out, background-color 150ms ease-out;
}
.slot[aria-checked="true"] { border-color: var(--accent); background: var(--accent-soft); }
.slot:disabled { cursor: default; }
.slot.planning .slot-title { color: var(--muted); font-weight: 400; }
@media (hover: hover) and (pointer: fine) {
  .slot:not(:disabled):not([aria-checked="true"]):hover { background: var(--raised); }
}
.key {
  width: 20px; height: 20px; display: grid; place-items: center; border-radius: 5px;
  background: var(--raised); color: var(--muted); font: 500 11px/1 ui-monospace, Menlo, monospace;
}
.slot[aria-checked="true"] .key { background: var(--accent); color: var(--on-accent); }
.panel[data-pill] { width: auto; border-radius: 999px; }
.pill { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 8px; }
.pill-keys { display: flex; gap: 4px; }
.pill .key {
  width: 28px; height: 28px; border: 0; transition: background-color 150ms ease-out, color 150ms ease-out;
}
.pill .key:disabled { opacity: 0.4; cursor: default; }
.pill .key[aria-checked="true"] { background: var(--accent); color: var(--on-accent); }
.pill .button { height: 28px; border-radius: 999px; }
.slot-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.slot-title { font-weight: 500; }
.slot-sub { color: var(--muted); font-size: 12px; }
.clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.stat { font-size: 11.5px; white-space: nowrap; }
.slot-wrap { position: relative; }
.refine { position: absolute; right: 10px; bottom: 8px; transition: opacity 150ms ease-out; }
.refine::before { content: ""; position: absolute; inset: -8px -6px; }
.refine:disabled { opacity: 0.5; cursor: default; }
@media (hover: hover) and (pointer: fine) {
  .slot-wrap:not(:hover):not(:focus-within):not(:has([aria-checked="true"])) .refine { opacity: 0; }
}
.feedback { display: flex; flex-direction: column; gap: 8px; }
.trail {
  margin: 0; padding: 6px 14px; border-bottom: 1px solid var(--line); color: var(--muted);
  font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.trail-round { color: var(--fg); font-weight: 500; }
.add { color: #1f8a4c; }
.del { color: var(--danger); }
.root[data-theme="dark"] .add { color: #4cc483; }
.failed .slot-sub { color: var(--danger); }
.slot-why { color: var(--muted); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.link {
  border: 0; background: none; padding: 0; color: var(--accent); font-weight: 500; font-size: 12px;
  text-decoration: underline; text-underline-offset: 2px;
}
.link.quiet { color: var(--muted); }
.notice { color: var(--danger); font-size: 12px; }
.confirm {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; padding: 6px 8px;
  border-radius: 6px; background: var(--accent-soft); font-size: 12px; scroll-margin: 12px;
}
.confirm > span { flex: 1 1 100%; }

.fine-tune { display: flex; flex-direction: column; gap: 2px; padding-top: 8px; border-top: 1px solid var(--line); }
.dial { display: flex; flex-direction: column; gap: 3px; padding: 6px 0 8px; }
.dial-line {
  display: flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 8px; margin: 0 -8px;
  border: 0; border-radius: 6px; background: transparent; text-align: left;
  transition: background-color 150ms ease-out;
}
@media (hover: hover) and (pointer: fine) { .dial-line:hover { background: var(--raised); } }
.dial-line .dial-text { color: var(--muted); }
.dial-head { display: flex; align-items: center; gap: 8px; min-height: 22px; }
.dial-label { flex: 1; font-weight: 500; }
.dial-control { display: grid; grid-template-columns: 28px 1fr 28px; align-items: center; gap: 4px; }
.dial-control .icon:disabled { opacity: 0.4; cursor: default; }
.dial-value {
  height: 28px; display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0;
  border-radius: 6px; background: var(--raised); cursor: ew-resize; touch-action: none; user-select: none;
}
.dial-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.swatch { width: 14px; height: 14px; flex: none; border-radius: 4px; box-shadow: inset 0 0 0 1px var(--line); }
.dial-source { color: var(--muted); font-size: 12px; }
.segments { display: inline-flex; gap: 2px; padding: 2px; border-radius: 6px; background: var(--raised); }
.segment {
  height: 20px; padding: 0 6px; border: 0; border-radius: 4px; background: transparent;
  color: var(--muted); font-size: 11.5px; font-weight: 500;
  transition: background-color 150ms ease-out, color 150ms ease-out;
}
.segment[aria-checked="true"] { background: var(--bg); color: var(--fg); box-shadow: 0 0 0 1px var(--line); }
.segment:disabled { cursor: default; }
.props { display: flex; flex-direction: column; padding-bottom: 6px; margin-bottom: 4px; border-bottom: 1px solid var(--line); }
.group-label { color: var(--muted); font-size: 11.5px; font-weight: 500; padding: 2px 0 4px; }
.prop { display: flex; flex-direction: column; gap: 3px; padding: 4px 0; }
.prop-head { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.prop-done { display: flex; align-items: baseline; gap: 10px; }
.prop .segments:has(:disabled), .prop .select:disabled, .prop .switch:disabled { opacity: 0.55; }
.select {
  height: 24px; max-width: 60%; padding: 0 6px; border: 0; border-radius: 6px;
  background: var(--raised); color: var(--fg); font: inherit; font-size: 12px;
}
.switch {
  position: relative; width: 30px; height: 18px; flex: none; border: 0; border-radius: 999px;
  background: var(--line); transition: background-color 150ms ease-out;
}
.switch::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
  background: var(--bg); box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); transition: transform 150ms ease-out;
}
.switch::before { content: ""; position: absolute; inset: -11px -5px; }
.switch[aria-checked="true"] { background: var(--accent); }
.switch[aria-checked="true"]::after { transform: translateX(12px); }
.spinner {
  width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--line);
  border-top-color: var(--accent); animation: spin 800ms linear infinite; display: inline-block;
  vertical-align: -2px; margin-right: 6px;
}
@keyframes spin { to { rotate: 360deg; } }

.target {
  position: fixed; top: 0; left: 0; z-index: 2147483643; pointer-events: none;
  outline: 1.5px solid var(--accent); outline-offset: 2px; border-radius: 3px;
}
.layer { position: fixed; inset: 0; z-index: 2147483644; touch-action: none; cursor: crosshair; }
.drawn { position: fixed; inset: 0; z-index: 2147483644; pointer-events: none; overflow: hidden; }
.drawn-page { position: absolute; left: 0; top: 0; }
.drawn svg { position: absolute; left: 0; top: 0; overflow: visible; }
.box-mark {
  position: absolute; border: 1.5px dashed var(--accent); border-radius: 6px; background: var(--accent-soft);
}
.label-input {
  position: absolute; pointer-events: auto; min-width: 160px; padding: 4px 8px; border-radius: 6px;
  border: 0; background: var(--accent); color: var(--on-accent); font-size: 12px;
  box-shadow: var(--shadow);
}
.label-input::placeholder { color: rgb(255 255 255 / 0.7); }
.label-input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
.aim { position: fixed; pointer-events: none; border-radius: 4px; }
.aim-source { outline: 1.5px dashed var(--accent); outline-offset: 2px; }
.aim-target { outline: 2px solid var(--accent); outline-offset: 2px; }
.aim-target[data-place="inside"] { background: var(--accent-soft); }
.aim-target[data-place="before"] { box-shadow: 0 -6px 0 -2px var(--accent); }
.aim-target[data-place="after"] { box-shadow: 0 6px 0 -2px var(--accent); }
.aim-place {
  position: absolute; right: 0; padding: 1px 5px; border-radius: 4px; background: var(--accent);
  color: var(--on-accent); font-size: 11px; font-weight: 500;
}
.aim-target[data-place="before"] .aim-place { bottom: calc(100% + 6px); }
.aim-target[data-place="after"] .aim-place, .aim-target[data-place="inside"] .aim-place { top: calc(100% + 6px); }
.snap-tag {
  position: absolute; padding: 2px 6px; border-radius: 4px; background: var(--accent); color: var(--on-accent);
  font-size: 12px; font-weight: 500; line-height: 1.3; white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .panel, .tab, .button, .slot, .tool, .icon, .segment, .switch, .switch::after { transition: none; }
  .spinner { animation: none; }
}
`
