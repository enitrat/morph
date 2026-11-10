import { type KeyboardEvent, type PointerEvent, useSyncExternalStore } from "react"

// The player's track, its live playback and its sound. They live outside the component files, so
// the song keeps playing through every morph: each variant reads the same clock.

export const TRACK = {
  title: "Paper Satellites",
  artist: "Halden Vale",
  album: "Low Orbit Songs",
  year: 2026,
  number: 4,
  of: 11,
  /** In seconds. */
  duration: 204,
} as const

/** What the second deck cues up. */
export const NEXT_TRACK = { title: "Static Bloom", artist: "Halden Vale", duration: 187 } as const

export interface Lyric {
  /** When the line starts, in seconds. */
  readonly at: number
  readonly line: string
}

/** The song's lines. The words repeat after `LYRIC_LOOP` seconds; the lines in brackets are breaks. */
export const LYRICS: readonly Lyric[] = [
  { at: 0, line: "(intro)" },
  { at: 9, line: "We folded the forecast into a paper plane" },
  { at: 18, line: "and threw it past the edge of the weather" },
  { at: 27, line: "Somewhere a satellite is reading our names" },
  { at: 36, line: "in a language made of light and later" },
  { at: 45, line: "(hum)" },
  { at: 53, line: "Low orbit, low orbit" },
  { at: 61, line: "keep me where the signal holds" },
  { at: 69, line: "Low orbit, low orbit" },
  { at: 77, line: "paper wings and borrowed gold" },
  { at: 86, line: "(bridge)" },
  { at: 98, line: "We will land where the static turns to snow" },
]
const LYRIC_LOOP = 108

/** The line sung at `seconds`, the one after it, and how far through the line the singer is, 0 to 1. */
export function lyricAt(seconds: number): { line: string; next: string; progress: number } {
  const t = seconds % LYRIC_LOOP
  const index = LYRICS.findLastIndex((lyric) => lyric.at <= t)
  const current = LYRICS[index] as Lyric
  const following = LYRICS[index + 1]
  const end = following?.at ?? LYRIC_LOOP
  return {
    line: current.line,
    next: (following ?? (LYRICS[0] as Lyric)).line,
    progress: (t - current.at) / (end - current.at),
  }
}

/** The waveform's peaks, 0 to 1, one per bar. Deterministic, so every variant draws the same song. */
export const PEAKS: readonly number[] = Array.from({ length: 56 }, (_, at) => {
  const grain = Math.sin(at * 12.9898) * 43758.5453
  const noise = grain - Math.floor(grain)
  const swell = Math.abs(Math.sin((at / 56) * Math.PI * 2.4 + 0.6))
  return 0.28 + 0.72 * swell * (0.55 + 0.45 * noise)
})

/** `m:ss`. */
export const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}
/** `mm:ss`, for displays that keep a fixed width. */
export const clockFixed = (seconds: number) => clock(seconds).padStart(5, "0")

/** Transport glyphs as path data on a 24 px grid, filled with `currentColor`, unless noted. */
export const GLYPH = {
  play: "M8 5.6v12.8a1 1 0 0 0 1.53.85l10.2-6.4a1 1 0 0 0 0-1.7L9.53 4.75A1 1 0 0 0 8 5.6z",
  pause:
    "M7.7 5h1.6a1.2 1.2 0 0 1 1.2 1.2v11.6a1.2 1.2 0 0 1-1.2 1.2H7.7a1.2 1.2 0 0 1-1.2-1.2V6.2A1.2 1.2 0 0 1 7.7 5zm7 0h1.6a1.2 1.2 0 0 1 1.2 1.2v11.6a1.2 1.2 0 0 1-1.2 1.2h-1.6a1.2 1.2 0 0 1-1.2-1.2V6.2A1.2 1.2 0 0 1 14.7 5z",
  restart:
    "M18.5 6.4v11.2a.8.8 0 0 1-1.25.66L10 13.1v4.4a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v4.4l7.25-5.16a.8.8 0 0 1 1.25.66z",
  skip: "M5.5 6.4v11.2a.8.8 0 0 0 1.25.66L14 13.1v4.4a.5.5 0 0 0 .5.5h2a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-2a.5.5 0 0 0-.5.5v4.4L6.75 5.74a.8.8 0 0 0-1.25.66z",
  /** Stroked, 1.8. */
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  /** Stroked, 1.7. */
  loop: "M5 11V9.5A2.5 2.5 0 0 1 7.5 7H19m0 0-2.5-2.5M19 7l-2.5 2.5M19 13v1.5a2.5 2.5 0 0 1-2.5 2.5H5m0 0 2.5 2.5M5 17l2.5-2.5",
} as const

/* Sound: a soft loop, synthesised, that starts only when the visitor presses play. */

const CHORDS = [
  [53, 57, 60, 64],
  [57, 60, 64, 67],
  [50, 53, 57, 64],
  [46, 53, 57, 62],
] as const
const ARPEGGIO = [0, 1, 2, 3, 2, 1, 2, 3] as const
/** One eighth note at 84 bpm, in seconds. */
const EIGHTH = 60 / 84 / 2
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

interface Voice {
  readonly context: AudioContext
  readonly out: GainNode
}

const sound = (() => {
  let voice: Voice | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  let nextAt = 0
  let step = 0

  const open = (): Voice => {
    const context = new AudioContext()
    const out = context.createGain()
    out.gain.value = 0
    const lowpass = context.createBiquadFilter()
    lowpass.type = "lowpass"
    lowpass.frequency.value = 2600
    const compressor = context.createDynamicsCompressor()
    out.connect(lowpass).connect(compressor).connect(context.destination)
    const delay = context.createDelay()
    delay.delayTime.value = 0.357
    const feedback = context.createGain()
    feedback.gain.value = 0.3
    const wet = context.createGain()
    wet.gain.value = 0.22
    out.connect(delay).connect(feedback).connect(delay)
    delay.connect(wet).connect(lowpass)
    return { context, out }
  }

  const envelope = (gain: GainNode, at: number, attack: number, peak: number, length: number) => {
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  }

  const tone = (
    { context, out }: Voice,
    type: OscillatorType,
    midi: number,
    at: number,
    shape: { attack: number; peak: number; length: number; detune?: number },
  ) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.value = hz(midi)
    oscillator.detune.value = shape.detune ?? 0
    envelope(gain, at, shape.attack, shape.peak, shape.length)
    oscillator.connect(gain).connect(out)
    oscillator.start(at)
    oscillator.stop(at + shape.length + 0.1)
  }

  const kick = ({ context, out }: Voice, at: number) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.setValueAtTime(110, at)
    oscillator.frequency.exponentialRampToValueAtTime(42, at + 0.16)
    envelope(gain, at, 0.004, 0.32, 0.3)
    oscillator.connect(gain).connect(out)
    oscillator.start(at)
    oscillator.stop(at + 0.32)
  }

  const note = (live: Voice, at: number) => {
    const bar = Math.floor(step / 8) % 8
    const chord = CHORDS[Math.floor(bar / 2)] as (typeof CHORDS)[number]
    const beat = step % 8
    if (beat === 0 && bar % 2 === 0)
      chord.forEach((midi, voiceAt) => {
        tone(live, "triangle", midi, at, {
          attack: 0.9,
          peak: 0.045,
          length: EIGHTH * 16 + 1,
          detune: (voiceAt - 1.5) * 5,
        })
      })
    const lift = bar % 4 === 3 && beat > 4 ? 12 : 0
    tone(live, "sine", (chord[ARPEGGIO[beat] as number] as number) + 12 + lift, at, {
      attack: 0.008,
      peak: 0.06,
      length: 0.55,
    })
    if (beat === 0 || beat === 4) kick(live, at)
  }

  const schedule = () => {
    if (voice === null) return
    while (nextAt < voice.context.currentTime + 0.3) {
      note(voice, nextAt)
      nextAt += EIGHTH
      step += 1
    }
  }

  return {
    start() {
      if (typeof AudioContext === "undefined") return
      voice ??= open()
      const { context, out } = voice
      void context.resume()
      const now = context.currentTime
      out.gain.cancelScheduledValues(now)
      out.gain.setTargetAtTime(0.55, now, 0.3)
      nextAt = Math.max(nextAt, now + 0.06)
      timer ??= setInterval(schedule, 90)
    },
    stop() {
      if (voice === null) return
      const now = voice.context.currentTime
      voice.out.gain.cancelScheduledValues(now)
      voice.out.gain.setTargetAtTime(0, now, 0.12)
      clearInterval(timer)
      timer = undefined
    },
  }
})()

/* Playback: a clock that runs while the song plays, read the same way by every design. */

interface Live {
  readonly playing: boolean
  /** The position, in seconds, at `since`. */
  readonly at: number
  /** `performance.now()` when `at` was set. */
  readonly since: number
  readonly loop: boolean
  readonly liked: boolean
}

const START: Live = { playing: false, at: 41, since: 0, loop: true, liked: false }
let live: Live = START
/** The position the last frame read, so a snapshot stays the same between frames. */
let position = START.at

const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const positionAt = (now: number) => {
  if (!live.playing) return live.at
  const t = live.at + (now - live.since) / 1000
  return live.loop ? t % TRACK.duration : Math.min(t, TRACK.duration)
}

let frame = 0
const tick = (now: number) => {
  position = positionAt(now)
  if (live.playing && !live.loop && position >= TRACK.duration) {
    set({ playing: false, at: 0 })
    return
  }
  notify()
  frame = live.playing ? requestAnimationFrame(tick) : 0
}

function set(next: Partial<Live>) {
  const now = performance.now()
  const wasPlaying = live.playing
  live = { ...live, at: positionAt(now), since: now, ...next }
  position = live.at
  if (live.playing && !wasPlaying) {
    sound.start()
    frame ||= requestAnimationFrame(tick)
  }
  if (!live.playing && wasPlaying) {
    sound.stop()
    cancelAnimationFrame(frame)
    frame = 0
  }
  notify()
}

const seconds = (value: number) => Math.max(0, Math.min(TRACK.duration - 0.5, value))

export interface Playback {
  readonly playing: boolean
  readonly loop: boolean
  readonly liked: boolean
  toggle(): void
  /** Jumps to `value` seconds. */
  seek(value: number): void
  /** Back to the top of the track. */
  restart(): void
  /** Ahead by `SKIP` seconds. */
  skip(): void
  toggleLoop(): void
  toggleLike(): void
}

export const SKIP = 15

const playback = (state: Live): Playback => ({
  playing: state.playing,
  loop: state.loop,
  liked: state.liked,
  toggle: () => set({ playing: !live.playing }),
  seek: (value) => set({ at: seconds(value) }),
  restart: () => set({ at: 0 }),
  skip: () => set({ at: seconds(positionAt(performance.now()) + SKIP) }),
  toggleLoop: () => set({ loop: !live.loop }),
  toggleLike: () => set({ liked: !live.liked }),
})

let snapshot: Playback = playback(live)
const getPlayback = () => {
  if (
    snapshot.playing !== live.playing ||
    snapshot.loop !== live.loop ||
    snapshot.liked !== live.liked
  )
    snapshot = playback(live)
  return snapshot
}

/** Whether the song plays, and the transport. Re-renders only when one of the flags changes. */
export function usePlayback(): Playback {
  return useSyncExternalStore(subscribe, getPlayback)
}

/** Where the song is, in seconds. Re-renders every frame while it plays. */
export function usePosition(): number {
  return useSyncExternalStore(subscribe, () => position)
}

/**
 * Props for the element a visitor drags or arrows along to seek: the whole width is the track.
 * Spread them on any shape, a bar, a waveform or a line of type.
 */
export function useSeek(label = "Seek") {
  const at = usePosition()
  const { seek } = usePlayback()
  const from = (event: PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    seek(((event.clientX - box.left) / box.width) * TRACK.duration)
  }
  return {
    role: "slider",
    tabIndex: 0,
    "aria-label": label,
    "aria-valuemin": 0,
    "aria-valuemax": TRACK.duration,
    "aria-valuenow": Math.floor(at),
    "aria-valuetext": `${clock(at)} of ${clock(TRACK.duration)}`,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      from(event)
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) from(event)
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const step = { ArrowLeft: -5, ArrowRight: 5, Home: -TRACK.duration, End: TRACK.duration }[
        event.key
      ]
      if (step === undefined) return
      event.preventDefault()
      seek(at + step)
    },
  } as const
}

/** Puts the song back where a fresh visit finds it, paused. */
export const resetPlayer = () => set(START)
