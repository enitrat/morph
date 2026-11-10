import { type Dispatch, useMemo, useState } from "react"

import { type Event, type State } from "../model"
import { fmt } from "../specs"
import { type Layer, layersOf } from "../tree"
import { Glyph } from "./Glyph"

/** Brings an element into view when a row selects it from off-screen. */
export function reveal(element: Element) {
  const box = element.getBoundingClientRect()
  if (box.bottom < 60 || box.top > innerHeight - 120)
    scrollTo({
      top: scrollY + box.top - 140,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    })
}

function Row({
  layer,
  depth,
  state,
  open,
  toggle,
  dispatch,
}: {
  layer: Layer
  depth: number
  state: State
  open: (layer: Layer) => boolean
  toggle: (layer: Layer) => void
  dispatch: Dispatch<Event>
}) {
  const { element } = layer
  const selected = state.selection.kind === "element" && state.selection.element === element
  const hovered = state.hover?.via === "page" && state.hover.element === element
  const box = element.getBoundingClientRect()
  const away = box.bottom < 0 || box.top > innerHeight
  const expanded = open(layer)
  return (
    <>
      <div
        role="treeitem"
        aria-selected={selected}
        aria-expanded={layer.children.length > 0 ? expanded : undefined}
        className={`flex h-7 cursor-default items-center gap-1.5 rounded-md pr-2 text-[12.5px] transition-colors duration-100 ${
          selected
            ? "bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--ring)]"
            : hovered
              ? "bg-surface-3 text-ink"
              : "text-ink hover:bg-surface-2"
        } ${away && !selected ? "opacity-60" : ""}`}
        style={{ paddingLeft: depth * 14 + 4 }}
        onPointerOver={() => {
          dispatch({ kind: "hovered", hover: { via: "layers", element } })
        }}
        onPointerOut={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            dispatch({ kind: "hovered", hover: null })
        }}
        onClick={() => {
          dispatch({ kind: "selected", element })
          reveal(element)
        }}
      >
        {layer.children.length > 0 ? (
          <button
            type="button"
            aria-label={expanded ? "Collapse" : "Expand"}
            className={`grid size-4 place-items-center text-ink-3 transition-transform duration-150 hover:text-ink ${expanded ? "rotate-90" : ""}`}
            onClick={(event) => {
              event.stopPropagation()
              toggle(layer)
            }}
          >
            <Glyph name="chev" size={11} />
          </button>
        ) : (
          <span className="size-4" />
        )}
        <i className="size-2.5 flex-none rotate-45 rounded-[1.5px] shadow-[inset_0_0_0_1.5px_currentColor] opacity-70" />
        <span className="truncate font-medium">{layer.name}</span>
        <span className="flex-1" />
        <span className="tnum flex-none font-mono text-[10.5px] text-ink-3">
          {away && "↕ "}
          {fmt(box.width)}×{fmt(box.height)}
        </span>
      </div>
      {expanded &&
        layer.children.map((child, i) => (
          <Row
            key={i}
            layer={child}
            depth={depth + 1}
            state={state}
            open={open}
            toggle={toggle}
            dispatch={dispatch}
          />
        ))}
    </>
  )
}

/** The page's components as a tree: hover a row to find it on the page, click to select it. */
export function Layers({ state, dispatch }: { state: State; dispatch: Dispatch<Event> }) {
  const tree = useMemo(() => layersOf(), [])
  const [toggled, setToggled] = useState(() => new Map<Element, boolean>())
  const focus = state.selection.kind === "element" ? state.selection.element : null
  const open = (layer: Layer) =>
    toggled.get(layer.element) ??
    (depthOpen(layer) ||
      (focus !== null && layer.element !== focus && layer.element.contains(focus)))
  return (
    <div role="tree" aria-label="Layers" className="grid gap-px p-2">
      {tree.length === 0 && (
        <p className="p-4 text-[12px] text-ink-3">No React components found on this page.</p>
      )}
      {tree.map((layer, i) => (
        <Row
          key={i}
          layer={layer}
          depth={0}
          state={state}
          open={open}
          toggle={(target) => {
            setToggled(new Map(toggled).set(target.element, !open(target)))
          }}
          dispatch={dispatch}
        />
      ))}
    </div>
  )
}

/** The outer shells start open so the tree shows something past the page wrapper. */
const depthOpen = (layer: Layer) => layer.children.length === 1
