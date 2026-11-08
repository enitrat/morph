import { useEffect, useImperativeHandle, useRef, useState } from "react"
import type { ReactNode, Ref } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Kbd } from "./Kbd"
import { ease, dur, spring } from "./lib/motion"

export type DockTool = {
  id: string
  label: string
  icon: ReactNode
  panel: ReactNode
  height: number
  badge?: number
  shortcut?: string
}
export type DockHandle = { open(id: string | null): void }

const ROW = 52
const MORPH = spring.move

export function MorphingDock({
  tools,
  children,
  width = 360,
  recede = true,
  onChange,
  ref,
}: {
  tools: DockTool[]
  children?: ReactNode
  width?: number
  recede?: boolean
  onChange?: (id: string | null) => void
  ref?: Ref<DockHandle>
}) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const surface = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState(Infinity)
  const tool = tools.find((t) => t.id === open) ?? null
  const dockWidth = tools.length * 48 + 12
  const panel = Math.min(width, room - 16)
  const w = tool ? panel : dockWidth
  const h = tool ? tool.height + ROW : ROW

  const set = (id: string | null) => {
    setOpen(id)
    onChange?.(id)
  }
  useImperativeHandle(ref, () => ({ open: set }))

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.composedPath()[0]
      const el = target instanceof Element ? target : null
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        el?.closest('input, textarea, select, [contenteditable="true"]')
      )
        return
      const t = tools.find((x) => x.shortcut && x.shortcut.toLowerCase() === e.key.toLowerCase())
      if (!t) return
      e.preventDefault()
      set(open === t.id ? null : t.id)
    }
    addEventListener("keydown", key)
    return () => removeEventListener("keydown", key)
  })

  useEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(() => setRoom(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === "Escape" && set(null)
    const away = (e: PointerEvent) =>
      surface.current && !e.composedPath().includes(surface.current) && set(null)
    addEventListener("keydown", key)
    addEventListener("pointerdown", away)
    return () => {
      removeEventListener("keydown", key)
      removeEventListener("pointerdown", away)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <div ref={root} className="relative size-full overflow-hidden">
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={tool && recede ? { scale: 0.985, opacity: 0.5 } : { scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.45, ease: ease.out }}
        inert={!!tool}
      >
        {children}
      </motion.div>

      <div className="pointer-events-none absolute inset-x-0 bottom-7 flex justify-center">
        <AnimatePresence>
          {!tool && hover && (
            <motion.div
              key="label"
              className="absolute bottom-[64px] flex justify-center"
              style={{ left: "50%", width: 0 }}
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                y: 4,
                scale: 0.96,
                transition: { duration: dur.exit, ease: ease.out },
              }}
              transition={{ duration: 0.16, ease: ease.out }}
            >
              <motion.span
                className="flex h-8 items-center gap-2 whitespace-nowrap rounded-full bg-surface pl-3 pr-1.5 text-[12.5px] text-ink shadow-[0_0_0_1px_var(--line),0_8px_24px_-8px_rgb(0_0_0/0.18)]"
                initial={false}
                animate={{
                  x: (tools.findIndex((t) => t.id === hover) - (tools.length - 1) / 2) * 48,
                }}
                transition={reduce ? { duration: 0 } : MORPH}
              >
                {tools.find((t) => t.id === hover)?.label}
                {tools.find((t) => t.id === hover)?.shortcut ? (
                  <Kbd>{tools.find((t) => t.id === hover)!.shortcut!.toUpperCase()}</Kbd>
                ) : (
                  <span className="w-1.5" />
                )}
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          ref={surface}
          role={tool ? "dialog" : "toolbar"}
          aria-label={tool ? tool.label : "Tools"}
          className="pointer-events-auto relative overflow-hidden bg-surface shadow-[0_0_0_1px_var(--line),0_2px_4px_rgb(0_0_0/0.04),0_18px_48px_-12px_rgb(0_0_0/0.22)]"
          initial={false}
          animate={{ width: w, height: h, borderRadius: tool ? 22 : 26 }}
          transition={reduce ? { duration: 0 } : MORPH}
        >
          <div
            className="absolute top-0"
            style={{ width: panel, height: h - ROW, left: "50%", marginLeft: -panel / 2 }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {tool && (
                <motion.div
                  key={tool.id}
                  className="absolute inset-0"
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6, transition: { duration: dur.exit, ease: ease.out } }}
                  transition={{ duration: 0.24, ease: ease.out, delay: 0.05 }}
                >
                  {tool.panel}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <motion.span
            aria-hidden
            className="absolute inset-x-3 h-px bg-line"
            style={{ bottom: ROW }}
            initial={false}
            animate={{ opacity: tool ? 1 : 0 }}
            transition={{ duration: 0.2, ease: ease.out }}
          />
          <div
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 px-1.5"
            style={{ height: ROW }}
          >
            {tools.map((t) => {
              const on = open === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-label={t.label}
                  aria-expanded={on}
                  onClick={() => set(on ? null : t.id)}
                  onPointerEnter={(e) => e.pointerType !== "touch" && setHover(t.id)}
                  onPointerLeave={(e) => e.pointerType !== "touch" && setHover(null)}
                  onFocus={() => setHover(t.id)}
                  onBlur={() => setHover(null)}
                  className={`ring-focus relative grid h-10 w-11 place-items-center rounded-full transition-colors duration-150 ${on ? "text-ink" : "text-ink-3 hover:text-ink"}`}
                >
                  {on && (
                    <motion.span
                      layoutId="tune-dock-plate"
                      className="absolute inset-0 rounded-full bg-surface-2"
                      transition={reduce ? { duration: 0 } : MORPH}
                    />
                  )}
                  <span className="relative">{t.icon}</span>
                  <AnimatePresence>
                    {!!t.badge && !on && (
                      <motion.span
                        key="badge"
                        aria-label={`${t.badge} new`}
                        className="tnum absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold leading-none text-white shadow-[0_0_0_2px_var(--surface)]"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{
                          scale: 0.5,
                          opacity: 0,
                          transition: { duration: dur.exit, ease: ease.out },
                        }}
                        transition={spring.snappy}
                      >
                        {t.badge}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              )
            })}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
