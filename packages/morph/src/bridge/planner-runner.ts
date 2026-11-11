import { SessionId } from "../variant/model"
import { runClaude } from "./agent"
import { openRepo } from "./git"
import { AttemptId } from "./job"
import { claimPlan, finishPlan, ownsPlan, readPlan } from "./planner"
import { Directions, plannerPrompt } from "./prompt"

const [root = "", id = "", attempt = ""] = process.argv.slice(2)
const repo = await openRepo(root)
const owner = await claimPlan(repo, SessionId.parse(id), AttemptId.parse(attempt), process.pid)
if (owner !== null) {
  const stop = new AbortController()
  process.once("SIGTERM", () => stop.abort("discarded"))
  const revoke = () => stop.abort("execution ownership revoked")
  const monitor = setInterval(() => {
    void ownsPlan(repo, owner).then((owned) => {
      if (!owned) revoke()
    }, revoke)
  }, 250)
  try {
    const { ask, parent, recipe } = owner.input
    const result = await runClaude(
      plannerPrompt(ask, parent),
      Directions(ask.count),
      stop.signal,
      recipe,
    )
    await finishPlan(
      repo,
      owner,
      result.ok
        ? { ok: true, directions: result.value.directions }
        : { ok: false, reason: result.detail },
    )
    await readPlan(repo, ask.id)
  } finally {
    clearInterval(monitor)
  }
}
