import { manifest } from "../stage/manifest"
import type { Stage } from "../stage/stage"
import { Slot } from "./Slot"

export function App({ stage }: { stage: Stage }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col items-center gap-10 px-4 py-14">
      <header data-morph className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance text-zinc-950">
          Point at any UI. Get three versions. Keep one.
        </h1>
        <p className="flex items-center gap-2 text-sm text-zinc-500">
          Press
          <kbd className="rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-xs text-zinc-800 shadow-[0_1px_0_var(--color-zinc-300)]">
            ⌥⇧R
          </kbd>
          and click the card
        </p>
      </header>
      <section className="board flex w-full justify-center rounded-3xl border border-zinc-200 p-8">
        {manifest.scenes.map((scene) => (
          <div
            key={scene.id}
            className="cell flex items-center justify-center"
            style={{ width: scene.cell.width, height: scene.cell.height }}
          >
            <Slot stage={stage} scene={scene} />
          </div>
        ))}
      </section>
    </main>
  )
}
