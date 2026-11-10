/**
 * The fine-tune dials, prop rows and sketch marks, which predate the Tailwind UI. They read the Ice
 * tokens that `.ui` defines in `ui/tailwind.css`.
 */
export const OVERLAY_CSS = `
:host { all: initial; }
.num { font-variant-numeric: tabular-nums; }
.hint { color: var(--ink-2); font-size: 12px; }
.notice { color: var(--del); font-size: 12px; }
.link {
  border: 0; background: none; padding: 0; color: var(--accent); font-weight: 500; font-size: 12px;
  text-decoration: underline; text-underline-offset: 2px;
}
.link.quiet { color: var(--ink-2); }
.icon {
  position: relative; width: 26px; height: 26px; display: grid; place-items: center;
  border: 0; border-radius: 7px; background: var(--surface-2); color: var(--ink-2);
  box-shadow: inset 0 0 0 1px var(--line);
  transition: background-color 150ms ease-out, color 150ms ease-out;
}
.icon::before { content: ""; position: absolute; inset: -4px; }
@media (hover: hover) and (pointer: fine) { .icon:hover:not(:disabled) { background: var(--surface-3); color: var(--ink); } }
.icon svg { width: 13px; height: 13px; }
.confirm {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; padding: 6px 8px;
  border-radius: 7px; background: var(--accent-soft); font-size: 12px; scroll-margin: 12px;
}
.confirm > span { flex: 1 1 100%; }

.fine-tune { display: flex; flex-direction: column; gap: 2px; }
.dial { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px 10px; margin: 0 -10px; border-radius: 9px; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--ring); }
.dial-line {
  display: flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 10px; margin: 0 -10px;
  border: 0; border-radius: 7px; background: transparent; text-align: left;
  transition: background-color 150ms ease-out;
}
@media (hover: hover) and (pointer: fine) { .dial-line:hover { background: var(--surface-2); } }
.dial-line .dial-text { color: var(--accent); font: 500 11.5px/1 var(--font-mono); }
.dial-head { display: flex; align-items: center; gap: 8px; min-height: 22px; }
.dial-label { flex: 1; font-weight: 500; color: var(--ink); }
.dial-control { display: grid; grid-template-columns: 26px 1fr 26px; align-items: center; gap: 4px; }
.dial-control .icon:disabled { opacity: 0.35; cursor: default; }
.dial-value {
  height: 26px; display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0;
  border-radius: 7px; background: rgb(0 0 0 / 0.25); box-shadow: inset 0 0 0 1px var(--line);
  color: var(--accent); font: 500 11.5px/1 var(--font-mono);
  cursor: ew-resize; touch-action: none; user-select: none;
}
.dial-value:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.dial-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.swatch { width: 12px; height: 12px; flex: none; border-radius: 3px; box-shadow: inset 0 0 0 1px var(--line); }
.dial-source { color: var(--ink-3); font: 500 10.5px/1.4 var(--font-mono); }
.segments { display: inline-flex; gap: 2px; padding: 2px; border-radius: 7px; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line); }
.segment {
  height: 20px; padding: 0 7px; border: 0; border-radius: 5px; background: transparent;
  color: var(--ink-2); font-size: 11.5px; font-weight: 500;
  transition: background-color 150ms ease-out, color 150ms ease-out;
}
.segment[aria-checked="true"] { background: var(--accent-soft); color: var(--accent); box-shadow: inset 0 0 0 1px var(--ring); }
.segment:disabled { cursor: default; }
.props { display: flex; flex-direction: column; padding-bottom: 8px; margin-bottom: 6px; border-bottom: 1px solid var(--line); }
.group-label { color: var(--ink-2); font: 500 10.5px/1 var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 0 8px; }
.prop { display: flex; flex-direction: column; gap: 3px; padding: 4px 0; }
.prop-head { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.prop-done { display: flex; align-items: baseline; gap: 10px; }
.prop .segments:has(:disabled), .prop .select:disabled, .prop .switch:disabled { opacity: 0.55; }
.select {
  height: 24px; max-width: 60%; padding: 0 6px; border: 0; border-radius: 7px;
  background: var(--surface-2); color: var(--ink); font: inherit; font-size: 12px; box-shadow: inset 0 0 0 1px var(--line);
}
.switch {
  position: relative; width: 30px; height: 18px; flex: none; border: 0; border-radius: 999px;
  background: var(--surface-3); transition: background-color 150ms ease-out;
}
.switch::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
  background: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.3); transition: transform 150ms ease-out;
}
.switch::before { content: ""; position: absolute; inset: -11px -5px; }
.switch[aria-checked="true"] { background: var(--accent); }
.switch[aria-checked="true"]::after { transform: translateX(12px); }

.layer { position: fixed; inset: 0; z-index: 2147483644; touch-action: none; cursor: crosshair; }
.drawn { position: fixed; inset: 0; z-index: 2147483644; pointer-events: none; overflow: hidden; }
.drawn-page { position: absolute; left: 0; top: 0; }
.drawn svg { position: absolute; left: 0; top: 0; overflow: visible; }
.box-mark { position: absolute; border: 1.5px dashed var(--accent); border-radius: 6px; background: var(--accent-soft); }
.label-input {
  position: absolute; pointer-events: auto; min-width: 160px; padding: 4px 8px; border-radius: 6px;
  border: 0; background: var(--accent); color: var(--on-accent); font-size: 12px; box-shadow: var(--glass);
}
.label-input::placeholder { color: rgb(7 21 35 / 0.6); }
.label-input:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
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
  .icon, .segment, .switch, .switch::after, .dial-line { transition: none; }
}
`
