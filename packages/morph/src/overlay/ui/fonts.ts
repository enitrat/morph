declare const __MORPH_UI_FONTS__: { sans: string; mono: string }

const FACES = [
  ["Morph Geist", __MORPH_UI_FONTS__.sans],
  ["Morph Geist Mono", __MORPH_UI_FONTS__.mono],
] as const

/**
 * Shadow trees ignore `@font-face`, so the overlay's fonts go on the document's FontFaceSet, under
 * family names no host page uses. Safe to call on every mount.
 */
export function registerFonts() {
  const present = new Set([...document.fonts].map((face) => face.family.replaceAll('"', "")))
  for (const [family, url] of FACES) {
    if (present.has(family)) continue
    const face = new FontFace(family, `url(${url}) format("woff2")`, { weight: "100 900" })
    document.fonts.add(face)
    void face.load()
  }
}
