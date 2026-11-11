(async () => {
  const originalNow = Object.getOwnPropertyDescriptor(performance, "now")
  const requestFrame = window.requestAnimationFrame
  const cancelFrame = window.cancelAnimationFrame
  let now = performance.now()
  let sequence = 0
  const frames = new Map()
  const checks = []
  const flush = () => new Promise((resolve) => setTimeout(resolve, 20))
  const button = (name) => document.querySelector(`button[aria-label="${name}"]`)
  const seek = () => document.querySelector('[role="slider"][aria-label="Seek"]')
  const assert = (condition, message) => {
    if (!condition) throw new Error(message)
    checks.push(message)
  }
  const click = async (name) => {
    const target = button(name)
    if (!target) throw new Error(`Missing control ${name}`)
    target.click()
    await flush()
  }
  const key = async (value) => {
    seek().dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true }))
    await flush()
  }
  const advance = async (seconds) => {
    now += seconds * 1000
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(now)
    await flush()
  }
  const position = () => Number(seek().getAttribute("aria-valuenow"))

  Object.defineProperty(performance, "now", { configurable: true, value: () => now })
  window.requestAnimationFrame = (callback) => {
    frames.set(++sequence, callback)
    return sequence
  }
  window.cancelAnimationFrame = (id) => frames.delete(id)
  try {
    assert(position() === 41 && button("Play"), "Fresh player is paused at 41 seconds")
    assert(button("Loop").getAttribute("aria-pressed") === "true", "Loop starts enabled")
    await click("Play")
    await advance(2)
    assert(position() === 43 && button("Pause"), "Playing advances with elapsed time")
    await click("Like")
    await advance(1)
    assert(position() === 44, "Liking preserves the running clock")
    await click("Pause")
    await advance(5)
    assert(position() === 44, "Pause freezes the current position")
    await key("Home")
    assert(position() === 0, "Seeking clamps at the beginning")
    await click("Skip 15 seconds")
    assert(position() === 15 && button("Play"), "Skip preserves paused state")
    await key("End")
    assert(position() === 203, "Seeking clamps below the track end")
    await click("Play")
    await advance(1)
    assert(position() === 0 && button("Pause"), "Loop wraps without pausing")
    await click("Back to the start")
    await advance(2)
    assert(position() === 2 && button("Pause"), "Restart preserves playing state")
    await click("Loop")
    await key("End")
    await advance(1)
    assert(position() === 0 && button("Play"), "Non-looping end pauses and returns to zero")
    assert(button("Like").getAttribute("aria-pressed") === "true", "Transport changes preserve liked")
    await click("Play")
    const startedAt = now
    for (let frame = 1; frame <= 60 * 204; frame++) {
      now = startedAt + (frame * 1000) / 60
      const pending = [...frames.values()]
      frames.clear()
      for (const callback of pending) callback(now)
      if (frame === 60) {
        await flush()
        assert(position() === 1, "Sixty consecutive frames display one second")
      }
    }
    await flush()
    assert(position() === 0 && button("Play"), "A full track at 60 Hz stops exactly at its end")
    return checks
  } finally {
    if (button("Pause")) await click("Pause")
    if (originalNow) Object.defineProperty(performance, "now", originalNow)
    else delete performance.now
    window.requestAnimationFrame = requestFrame
    window.cancelAnimationFrame = cancelFrame
  }
})()
