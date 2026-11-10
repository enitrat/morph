type Cell = string | boolean

interface Row {
  label: string
  cells: [Cell, Cell, Cell]
}

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Usage",
    rows: [
      { label: "Projects", cells: ["3", "Unlimited", "Unlimited"] },
      { label: "Seats", cells: ["1", "Up to 50", "Unlimited"] },
      { label: "Analytics", cells: ["Basic", "Advanced", "Advanced + export"] },
    ],
  },
  {
    title: "Support",
    rows: [
      { label: "Response time", cells: ["Community", "4 hours", "1 hour, 24/7"] },
      { label: "Uptime SLA", cells: [false, "99.9%", "99.99%"] },
    ],
  },
  {
    title: "Security",
    rows: [
      { label: "Custom domains", cells: [false, true, true] },
      { label: "SSO and audit log", cells: [false, true, true] },
      { label: "SAML and SCIM", cells: [false, false, true] },
    ],
  },
]

function Value({ cell }: { cell: Cell }) {
  if (cell === true)
    return (
      <svg viewBox="0 0 16 16" aria-label="Included" className="mx-auto size-4 text-indigo-600">
        <path
          d="M3.5 8.5 6.5 11.5 12.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  if (cell === false)
    return <span aria-label="Not included" className="mx-auto block h-px w-3 bg-zinc-300" />
  return <span className="tabular-nums">{cell}</span>
}

/** Pro's column sits on a tinted band, so the eye reads down the plan most teams pick. */
const band = (column: number) => (column === 1 ? "bg-indigo-50/70" : "")

export function PlanTable() {
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
      <colgroup>
        <col className="w-44" />
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr className="align-bottom">
          <th className="pb-4 text-left text-xs font-medium text-zinc-500">Compare plans</th>
          <th className="px-4 pb-4 text-left font-normal">
            <span className="text-sm font-semibold text-zinc-950">Starter</span>
            <span className="mt-1 block text-2xl font-semibold tracking-tight tabular-nums">
              $0
            </span>
            <button
              type="button"
              className="mt-3 h-8 w-full rounded-md text-xs font-medium text-zinc-950 ring-1 ring-zinc-300 transition-colors hover:bg-zinc-50"
            >
              Start building
            </button>
          </th>
          <th className="rounded-t-xl bg-indigo-50/70 px-4 pt-4 pb-4 text-left font-normal">
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-950 [view-transition-name:pro-name]">
                Pro
              </span>
              <span className="rounded-full bg-indigo-600 px-1.5 py-px text-[10px] font-semibold tracking-wide text-white uppercase">
                Popular
              </span>
            </span>
            <span className="mt-1 flex items-baseline gap-1 [view-transition-name:pro-price]">
              <span className="text-2xl font-semibold tracking-tight tabular-nums">$24</span>
              <span className="text-xs text-zinc-500">/ seat / mo</span>
            </span>
            <button
              type="button"
              className="mt-3 h-8 w-full rounded-md bg-zinc-950 text-xs font-medium text-white transition-colors hover:bg-zinc-800 [view-transition-name:pro-cta]"
            >
              Start free trial
            </button>
          </th>
          <th className="px-4 pb-4 text-left font-normal">
            <span className="text-sm font-semibold text-zinc-950">Enterprise</span>
            <span className="mt-1 block text-2xl font-semibold tracking-tight">Custom</span>
            <button
              type="button"
              className="mt-3 h-8 w-full rounded-md text-xs font-medium text-zinc-950 ring-1 ring-zinc-300 transition-colors hover:bg-zinc-50"
            >
              Talk to sales
            </button>
          </th>
        </tr>
      </thead>
      {GROUPS.map((group, at) => (
        <tbody key={group.title}>
          <tr>
            <th
              colSpan={1}
              className="border-t border-zinc-200 pt-3 pb-1.5 text-left text-[11px] font-semibold tracking-wider text-zinc-400 uppercase"
            >
              {group.title}
            </th>
            {[0, 1, 2].map((column) => (
              <td key={column} className={`border-t border-zinc-200 ${band(column)}`} />
            ))}
          </tr>
          {group.rows.map((row, index) => {
            const last = at === GROUPS.length - 1 && index === group.rows.length - 1
            return (
              <tr key={row.label}>
                <th className="py-1.5 text-left font-normal text-zinc-600">{row.label}</th>
                {row.cells.map((cell, column) => (
                  <td
                    key={column}
                    className={`px-4 py-1.5 text-center text-zinc-800 ${band(column)} ${last && column === 1 ? "rounded-b-xl pb-3" : ""}`}
                  >
                    <Value cell={cell} />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      ))}
    </table>
  )
}
