// oxlint-disable-next-line import/no-nodejs-modules -- house prompts are keyed by the component a file defines.
import { readFile } from "node:fs/promises"
// oxlint-disable-next-line import/no-nodejs-modules -- see above.
import { join } from "node:path"

import { MAX_SUGGESTIONS } from "../protocol"
import { componentsAround } from "../syntax/source"
import { type SourceLoc, Suggestion } from "../variant/model"
import { absent, type Host } from "./git"
import { plannedSessions } from "./session"

const ANY_COMPONENT = "*"

/** The first few distinct candidates that fit on a chip. */
function offered(candidates: readonly Suggestion[]): Suggestion[] {
  const seen = new Set<string>()
  return candidates
    .flatMap((candidate) => {
      // Ask words have no length cap, and one too long for a chip would fail the whole answer.
      const parsed = Suggestion.safeParse(candidate)
      if (!parsed.success || seen.has(parsed.data.words)) return []
      seen.add(parsed.data.words)
      return [parsed.data]
    })
    .slice(0, MAX_SUGGESTIONS)
}

const house = (repo: Host, component: string): Suggestion[] =>
  (repo.config.prompts[component] ?? []).map((words) => ({ words, kind: "house" }))

/**
 * What the composer offers for the element written at `site`: house prompts of the components
 * around it, the asks open on its file with the rounds they refined, then the prompts for every
 * component.
 */
export async function siteSuggestions(repo: Host, site: SourceLoc): Promise<Suggestion[]> {
  const text = await readFile(join(repo.root, site.path), "utf8").catch(absent)
  const components = text === null ? [] : componentsAround(text, site.line, site.col)
  const recent = (await plannedSessions(repo))
    .toReversed()
    // An ask that leans on sketch marks reads as nonsense without them.
    .filter(({ ask }) => ask.marks.length === 0)
    .filter(({ ask }) => ask.targets.some((target) => target.source.path === site.path))
    .flatMap((session) => {
      const words = [session.ask.words]
      for (let parent = session.parent; parent !== null; parent = parent.parent)
        words.push(parent.words)
      return words.map((entry): Suggestion => ({ words: entry, kind: "recent" }))
    })
  return offered([
    ...components.flatMap((component) => house(repo, component)),
    ...recent,
    ...house(repo, ANY_COMPONENT),
  ])
}

/** What a refine field offers: the bridge plans no refinements, so the prompts for every component. */
export const refineSuggestions = (repo: Host): Suggestion[] => offered(house(repo, ANY_COMPONENT))
