import type { Plugin } from "vite"

import { type MorphConfigInput } from "../core/config"

export interface MorphViteOptions {
  /** The path the bridge answers on. Defaults to `/__morph`. */
  base?: string
  /**
   * Adds the widget to `index.html`, for a single-page app. Defaults to `true`. Turn it off for a
   * framework that renders its own HTML, and render `<MorphWidget base={base} />` instead.
   */
  inject?: boolean
}

/**
 * Morph for Vite's dev server: mounts the bridge at `base` and adds the widget to the page. It
 * applies only to `vite serve`, so `vite build` never runs it.
 */
export function morph(config: MorphConfigInput, options?: MorphViteOptions): Plugin
