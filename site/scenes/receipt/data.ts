import { useSyncExternalStore } from "react"

// The receipt's data and live state. It lives outside the component files, so a tip set on one
// design survives every morph: each variant reads and writes the same store.

export const SHOP = {
  name: "Atelier Moka",
  street: "12 Rue des Lilas",
  city: "Paris",
  table: 4,
  date: "14 Nov 2026",
  time: "08:52",
  number: "0418",
  card: "4021",
} as const

export type Course = "drinks" | "food"

export interface Item {
  readonly name: string
  readonly qty: number
  readonly price: number
  readonly course: Course
}

export const ITEMS: readonly Item[] = [
  { name: "Flat white", qty: 1, price: 4.2, course: "drinks" },
  { name: "Oat cortado", qty: 1, price: 3.8, course: "drinks" },
  { name: "Sparkling water", qty: 1, price: 2.5, course: "drinks" },
  { name: "Cardamom bun", qty: 2, price: 3.5, course: "food" },
  { name: "Sourdough, butter", qty: 1, price: 6.9, course: "food" },
]

export const COURSES: readonly { readonly id: Course; readonly name: string }[] = [
  { id: "drinks", name: "Drinks" },
  { id: "food", name: "Food" },
]

/** The tips the buttons offer, in percent. A slider may set any whole percent up to `MAX_TIP`. */
export const TIPS = [0, 10, 15, 20] as const
export const MAX_TIP = 25

export const lineTotal = (item: Item) => item.qty * item.price
export const SUBTOTAL = ITEMS.reduce((sum, item) => sum + lineTotal(item), 0)
export const tipOf = (percent: number) => (SUBTOTAL * percent) / 100
export const totalOf = (percent: number) => SUBTOTAL + tipOf(percent)
export const courseTotal = (course: Course) =>
  ITEMS.filter((item) => item.course === course).reduce((sum, item) => sum + lineTotal(item), 0)

export const money = (amount: number) => amount.toFixed(2)

/** The receipt's barcode: each bar's left edge and width, in a box `BARCODE_WIDTH` wide. */
export const BARCODE: readonly { readonly x: number; readonly width: number }[] = (() => {
  let x = 0
  return Array.from({ length: 58 }, (_, at) => {
    const width = 1 + (((at * 7 + 3) % 5) % 3)
    const bar = { x, width }
    x += width + (at % 5 === 4 ? 3 : 1)
    return bar
  })
})()
export const BARCODE_WIDTH = 184

interface Live {
  readonly tip: number
  /** How many people split the bill. */
  readonly people: number
}

let live: Live = { tip: 15, people: 2 }
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const update = (next: Partial<Live>) => {
  live = { ...live, ...next }
  for (const listener of listeners) listener()
}

export function useTip(): readonly [number, (percent: number) => void] {
  const tip = useSyncExternalStore(subscribe, () => live.tip)
  return [tip, (percent) => update({ tip: Math.max(0, Math.min(MAX_TIP, Math.round(percent))) })]
}

export function usePeople(): readonly [number, (people: number) => void] {
  const people = useSyncExternalStore(subscribe, () => live.people)
  return [people, (count) => update({ people: Math.max(1, Math.min(6, count)) })]
}

/** Puts the tip and the split back as they were on a fresh visit. */
export const reset = () => update({ tip: 15, people: 2 })
