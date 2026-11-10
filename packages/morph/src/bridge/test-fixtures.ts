import { join } from "node:path"

import { ThemeName, MorphConfig } from "../core/config"
import { readDesignSystem } from "./design-system"
import acme from "./fixtures/acme/morph.config"
import { type Host, openRepo } from "./git"

/** A small synthetic monorepo: an `@acme/ui` design system under `packages/ui`, used by `apps/site`. */
export const REPO = join(import.meta.dirname, "fixtures/acme")

/** This package's own install, which provides the formatter the fixture's config runs. */
export const MODULES = join(import.meta.dirname, "../../node_modules")

/**
 * The budget of a test that drives git, oxfmt or tsx. Each spawns dozens of processes, whose wall
 * time grows with whatever else the machine runs: a test that takes under a second alone passes
 * 5 s on a machine busy with dev servers.
 */
export const SPAWNING_TEST_MS = 30_000

export const CONFIG = MorphConfig.parse(acme)
export const LIGHT = ThemeName.parse("light")
export const DARK = ThemeName.parse("dark")

export const repoCatalog = () => readDesignSystem(REPO, CONFIG)

/** The checkout at `root`, served with the fixture's config. */
export const openHost = async (root: string): Promise<Host> => ({
  ...(await openRepo(root)),
  config: CONFIG,
})
