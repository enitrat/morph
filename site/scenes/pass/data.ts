import { useEffect, useState, useSyncExternalStore } from "react"

// The boarding pass's data and live state. It lives outside the component files, so a seat picked
// on one design and the gate countdown survive every morph: each variant reads the same stores.

export const FLIGHT = {
  airline: "Northwind",
  number: "NW 482",
  date: "14 Nov 2026",
  day: "Sat 14 Nov",
  from: { code: "LIS", city: "Lisbon", time: "10:15", terminal: "1" },
  to: { code: "CPH", city: "Copenhagen", time: "15:05", terminal: "3" },
  duration: "3h 50m",
  boarding: "09:40",
  gate: "B12",
  passenger: "Morgan / Alex",
  cabin: "Economy",
  ref: "K7QF2M",
  sequence: "042",
} as const

export type SeatId = "14A" | "14C" | "6D"

export interface Seat {
  readonly id: SeatId
  readonly row: number
  readonly letter: string
  readonly kind: string
  /** Boarding group: window seats board before aisles, extra legroom first. */
  readonly group: number
}

/** The seats this passenger may switch between, in the order the switch offers them. */
export const SEATS: readonly Seat[] = [
  { id: "14A", row: 14, letter: "A", kind: "Window", group: 2 },
  { id: "14C", row: 14, letter: "C", kind: "Aisle", group: 3 },
  { id: "6D", row: 6, letter: "D", kind: "Legroom", group: 1 },
]

export const LETTERS = ["A", "B", "C", "D", "E", "F"] as const

/** Seats someone else holds, for the seat maps. Deterministic, so every design agrees. */
export const isTaken = (row: number, letter: string) =>
  !SEATS.some((seat) => seat.row === row && seat.letter === letter) &&
  (row * 7 + letter.charCodeAt(0) * 3) % 5 < 3

export const seatOf = (id: SeatId) => SEATS.find((seat) => seat.id === id) ?? SEATS[0]!

let seatId: SeatId = "14A"
const seatListeners = new Set<() => void>()
const subscribeSeat = (listener: () => void) => {
  seatListeners.add(listener)
  return () => seatListeners.delete(listener)
}
const setSeatId = (next: SeatId) => {
  seatId = next
  for (const listener of seatListeners) listener()
}

export function useSeat(): readonly [Seat, (id: SeatId) => void] {
  const id = useSyncExternalStore(subscribeSeat, () => seatId)
  return [seatOf(id), setSeatId]
}

/** Puts the seat back as it was on a fresh visit. */
export const resetPass = () => setSeatId("14A")

/**
 * The gate closes 23:40 after the page opens, then the next window of `GATE_WINDOW` starts, so a
 * visitor never meets a dead countdown. One clock ticks for every board on the page.
 */
const GATE_WINDOW = 25 * 60
let closesAt = Date.now() + (23 * 60 + 40) * 1000
let remaining = 23 * 60 + 40
const clockListeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined
const tick = () => {
  const now = Date.now()
  while (closesAt <= now) closesAt += GATE_WINDOW * 1000
  const next = Math.ceil((closesAt - now) / 1000)
  if (next === remaining) return
  remaining = next
  for (const listener of clockListeners) listener()
}
const subscribeClock = (listener: () => void) => {
  clockListeners.add(listener)
  if (timer === undefined) {
    tick()
    timer = setInterval(tick, 250)
  }
  return () => {
    clockListeners.delete(listener)
    if (clockListeners.size === 0) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

/** Seconds until the gate closes. */
export const useGate = () => useSyncExternalStore(subscribeClock, () => remaining)

/** Under five minutes the gate calls the last passengers. */
export const statusOf = (seconds: number) => (seconds <= 5 * 60 ? "Final call" : "Boarding")

/** How much of the boarding window has gone, from 0 to 1. */
export const elapsedOf = (seconds: number) => 1 - seconds / GATE_WINDOW

export const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`

const FLAPS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:·/-"
const flapAt = (char: string) => Math.max(0, FLAPS.indexOf(char.toUpperCase()))
const settled = (text: string) => [...text.toUpperCase()].map((char) => FLAPS[flapAt(char)]!)

/**
 * Split-flap text: each letter rolls through the flaps in order until it lands on `text`, the
 * letters to the right starting a beat later. It rolls on mount and whenever `text` changes.
 */
export function useFlap(text: string): string {
  const [shown, setShown] = useState(() =>
    settled(text).map(
      (char, at) => FLAPS[(flapAt(char) - 7 - (at % 4) + FLAPS.length) % FLAPS.length]!,
    ),
  )
  useEffect(() => {
    const target = settled(text)
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target)
      return undefined
    }
    let step = 0
    const roll = setInterval(() => {
      step += 1
      setShown((current) => {
        const next = target.map((char, at) => {
          const from = current[at] ?? " "
          if (from === char || step < at * 1.5) return from
          return FLAPS[(flapAt(from) + 1) % FLAPS.length]!
        })
        if (next.every((char, at) => char === target[at])) clearInterval(roll)
        return next
      })
    }, 45)
    return () => clearInterval(roll)
  }, [text])
  return shown.join("")
}

/** The pass's barcode: each bar's left edge and width, in a box `BARCODE_WIDTH` wide. */
export const BARCODE: readonly { readonly x: number; readonly width: number }[] = (() => {
  let x = 0
  return Array.from({ length: 64 }, (_, at) => {
    const width = 1 + (((at * 5 + 2) % 7) % 3)
    const bar = { x, width }
    x += width + (at % 6 === 5 ? 3 : 1)
    return bar
  })
})()
export const BARCODE_WIDTH = BARCODE.at(-1)!.x + BARCODE.at(-1)!.width

/** A 24-unit plane pointing right, and the airline's mark: a wind vane in a ring. */
export const PLANE =
  "M22 12c0 .8-.9 1.3-2 1.3h-5.5l-4 7.2h-2l2.5-7.2H6l-1.5 2.2H3l1-3.5-1-3.5h1.5L6 10.7h5L8.5 3.5h2l4 7.2H20c1.1 0 2 .5 2 1.3Z"
export const MARK = "M12 3.5 15.2 15 12 12.9 8.8 15Z"
