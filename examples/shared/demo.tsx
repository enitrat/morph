"use client"

import { Stage } from "./stageshow/stage"
import { Window } from "./stageshow/window"
import { clock } from "./stageshow/clock"
import type { Act } from "./stageshow/act"
import {
  ActionBar,
  Chip,
  Composer,
  Marks,
  Pin,
  SessionBar,
  Sidebar,
  VariantCard,
  type PinState,
  type Variant,
} from "./demo-parts"
import "./demo.css"

type Pick = "fc" | "btn" | null
type Scene = {
  sel: Pick
  compose: Pick
  prompt: string
  pin1: PinState
  pin2: PinState
  card: boolean
  variant: Variant
  specs: boolean
  toast: boolean
  fade: boolean
}

const initial: Scene = {
  sel: null,
  compose: null,
  prompt: "",
  pin1: "off",
  pin2: "off",
  card: false,
  variant: "orig",
  specs: false,
  toast: false,
  fade: false,
}
const poster: Scene = { ...initial, pin1: "ready", pin2: "half", card: true, variant: "B" }

const ASK_1 = "More presence: larger icon tile"
const ASK_2 = "Softer corners"
const REST = { wide: { x: 610, y: 215 }, compact: { x: 300, y: 215 } }
const GEN_1 = 6200
const GEN_2 = 7800

async function script(a: Act<Scene>) {
  const t0 = clock.now()
  const at = (ms: number) => a.wait(Math.max(0, ms - (clock.now() - t0)))
  const ask = async (target: "fc" | "btn", text: string, pin: "pin1" | "pin2") => {
    await a.click()
    await a.set({ sel: target })
    await a.wait(300)
    await a.move("ask")
    await a.click()
    await a.set({ compose: target })
    await a.type("prompt", text, { interval: 26 })
    await a.wait(220)
    await a.move("send")
    await a.click()
    await a.set({ compose: null, sel: null, prompt: "", [pin]: "run" })
  }

  await a.wait(500)
  await a.move("fc")
  await a.wait(450)
  await ask("fc", ASK_1, "pin1")
  const started = clock.now() - t0
  await a.wait(250)
  await a.move("btn")
  await a.wait(350)
  await ask("btn", ASK_2, "pin2")

  await at(started + GEN_1)
  await a.set({ pin1: "ready", card: true, variant: "A" })
  await a.wait(900)
  await a.move("rowB")
  await a.click()
  await a.set({ variant: "B" })
  await a.wait(1000)
  if (a.layout === "wide") await a.key("s")
  else await a.wait(300)
  await a.set({ specs: true })
  await a.wait(1700)
  await a.move("keep")
  await a.click()
  await a.set({ card: false, specs: false, pin1: "kept", toast: true })
  await a.wait(1000)
  await a.move(REST)
  await a.wait(500)
  await a.set({ fade: true })
  await a.wait(400)
  await a.snap({ ...initial, fade: true })
  await a.wait(200)
  await a.set({ fade: false })
}

function Page({ s, compact }: { s: Scene; compact: boolean }) {
  return (
    <div className="d-page" data-fade={s.fade}>
      <nav className="d-nav">
        <b>Acme</b>
        <span>Product</span>
        <span>Customers</span>
        <span>Pricing</span>
      </nav>
      {compact && (
        <div className="d-cta">
          <div className="d-anchor">
            <div
              className="d-dc d-btn"
              data-target="btn"
              data-sel={s.sel === "btn" || s.compose === "btn"}
            >
              <Marks name="Button" size="118×28" />
              Start for free
            </div>
            {s.sel === "btn" && !s.compose && <ActionBar file="button.tsx:51" side="below" />}
            {s.compose === "btn" && <Composer text={s.prompt} side="below" />}
            <Pin n={2} state={s.pin2} ms={GEN_2} letter="A" />
          </div>
          <span className="d-btn d-btn-ghost">Book a demo</span>
        </div>
      )}
      {!compact && <h2>Everything runs on rails</h2>}
      <div className="d-cards">
        <FeatureCard s={s} />
        <PlainCard icon="🧩" title="Steps" body="Compose actions across 300+ integrations without code." />
        <PlainCard icon="📈" title="Insights" body="See every run, every retry, every minute." />
      </div>
      {!compact && (
        <>
          <h2>Simple pricing</h2>
          <div className="d-plans">
            <Plan name="Starter" price="$0" perks={["3 workflows", "1k runs / month"]} />
            <Plan name="Team" price="$24" perks={["Unlimited workflows", "50k runs / month"]} featured>
              <div className="d-anchor">
                <div
                  className="d-dc d-btn d-btn-solid"
                  data-target="btn"
                  data-sel={s.sel === "btn" || s.compose === "btn"}
                >
                  <Marks name="Button" size="189×26" />
                  Choose Team
                </div>
                {s.sel === "btn" && !s.compose && <ActionBar file="button.tsx:51" side="above" />}
                {s.compose === "btn" && <Composer text={s.prompt} side="above" />}
                <Pin n={2} state={s.pin2} ms={GEN_2} letter="A" />
              </div>
            </Plan>
            <Plan name="Enterprise" price="$89" perks={["Everything in Team", "Audit log"]} />
          </div>
        </>
      )}
      <VariantCard open={s.card} variant={s.variant} specs={s.specs} quote={ASK_1} />
      <Sidebar show={s.specs} />
      <SessionBar show={s.pin1 !== "off" || s.pin2 !== "off"}>
        {s.pin1 !== "off" && <Chip n={1} name="FeatureCard" state={s.pin1} ms={GEN_1} letter="B" />}
        {s.pin2 !== "off" && <Chip n={2} name="Button" state={s.pin2} ms={GEN_2} letter="A" />}
      </SessionBar>
      <div className="d-toast" data-show={s.toast}>
        <span>✓</span> Kept B <code>card.tsx</code>
      </div>
    </div>
  )
}

function FeatureCard({ s }: { s: Scene }) {
  const sel = s.sel === "fc" || s.compose === "fc"
  return (
    <div className="d-anchor">
      <div className="d-dc d-fc" data-target="fc" data-sel={sel} data-variant={s.variant}>
        <Marks name="FeatureCard" size="213×112" />
        <div className="d-fc-body" key={s.variant}>
          <span className="d-fc-tile">⚡</span>
          <div>
            <h3>Triggers</h3>
            <p>Start a workflow from any event, schedule or webhook.</p>
          </div>
        </div>
      </div>
      {sel && !s.compose && <ActionBar file="card.tsx:6" side="below" />}
      {s.compose === "fc" && <Composer text={s.prompt} side="below" />}
      <Pin n={1} state={s.pin1} ms={GEN_1} letter="B" />
    </div>
  )
}

function PlainCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="d-fc d-plain">
      <div className="d-fc-body">
        <span className="d-fc-tile">{icon}</span>
        <div>
          <h3>{title}</h3>
          <p>{body}</p>
        </div>
      </div>
    </div>
  )
}

function Plan({
  name,
  price,
  perks,
  featured,
  children,
}: {
  name: string
  price: string
  perks: string[]
  featured?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="d-plan" data-featured={featured}>
      <div className="d-plan-head">
        <b>{name}</b>
        {featured && <span>Popular</span>}
      </div>
      <div className="d-price">
        {price}
        <small>/month</small>
      </div>
      {children ?? <span className="d-btn">Choose {name}</span>}
      <ul>
        {perks.map((perk) => (
          <li key={perk}>✓ {perk}</li>
        ))}
      </ul>
    </div>
  )
}

export function Demo() {
  return (
    <Stage
      play="loop"
      width={720}
      height={424}
      compact={{ below: 580, width: 358, height: 424 }}
      initial={initial}
      poster={poster}
      script={script}
      keys="top"
      cursor={{ at: REST }}
      className="tune-demo"
    >
      {(s, _rect, layout) => (
        <Window url="acme.dev/pricing" className="demo-window">
          <Page s={s} compact={layout === "compact"} />
        </Window>
      )}
    </Stage>
  )
}
