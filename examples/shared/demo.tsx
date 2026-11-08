"use client"

import { Stage } from "./stageshow/stage"
import { Window } from "./stageshow/window"
import type { Act } from "./stageshow/act"
import "./demo.css"

type Scene = { selected: boolean; panel: boolean; prompt: string; variant: boolean }
const initial: Scene = { selected: false, panel: false, prompt: "", variant: false }
const poster: Scene = {
  selected: true,
  panel: true,
  prompt: "Make this more inviting",
  variant: true,
}

async function script(a: Act<Scene>) {
  await a.wait(700)
  await a.move("target")
  await a.click()
  await a.set({ selected: true, panel: true })
  await a.wait(400)
  await a.move("prompt")
  await a.click()
  await a.type("prompt", "Make this more inviting")
  await a.wait(400)
  await a.move("generate")
  await a.click()
  await a.wait(700)
  await a.set({ variant: true })
}

export function Demo() {
  return (
    <Stage
      play="once"
      width={720}
      height={390}
      compact={{ below: 580, width: 358, height: 390 }}
      initial={initial}
      poster={poster}
      script={script}
      cursor={{ at: { wide: { x: 550, y: 300 }, compact: { x: 300, y: 310 } } }}
      className="tune-demo"
    >
      {(s) => (
        <Window url="localhost:3000" className="demo-window">
          <div className="demo-page">
            <div className="demo-nav">
              <strong>acme</strong>
              <span>Product&nbsp;&nbsp;&nbsp; About</span>
            </div>
            <div className="demo-content">
              <div
                data-target="target"
                className={`demo-target ${s.selected ? "is-selected" : ""} ${s.variant ? "is-variant" : ""}`}
              >
                {s.selected && <span className="demo-tag">Hero</span>}
                <div className="demo-heading">
                  Make room for
                  <br />
                  better work.
                </div>
                <p>A calmer place for your team to make things happen.</p>
                <span className="demo-cta">Get started</span>
              </div>
              {s.panel && (
                <div className="demo-panel">
                  <div className="demo-panel-title">
                    Tune <span>×</span>
                  </div>
                  <div className="demo-panel-body">
                    <div className="demo-label">
                      Hero <span>selected</span>
                    </div>
                    <div className="demo-input" data-target="prompt">
                      {s.prompt || "What should change?"}
                    </div>
                    <div className="demo-generate" data-target="generate">
                      Make variants <span>↵</span>
                    </div>
                    {s.variant && (
                      <div className="demo-variants">
                        <span>Original</span>
                        <strong>Variation 1</strong>
                        <span>Variation 2</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Window>
      )}
    </Stage>
  )
}
