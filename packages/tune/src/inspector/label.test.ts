import { describe, expect, it } from "vitest"

import { arrowCaption, boxCaption, catalogOf, labelOf, shortOf } from "./label"

const catalog = catalogOf([
  { title: "SalesOverview", naming: "container", exports: ["SalesOverview", "SalesStat"] },
  { title: "Card", naming: "nearest", exports: ["Card", "CardContent"] },
  { title: "Button", naming: "own", exports: ["Button"] },
  { title: "Figure", naming: "own", exports: ["Figure"] },
])

describe("target labels", () => {
  it("names a part of a block by the block, with the text that tells it apart", () => {
    const seen = {
      own: ["CardContent"],
      owners: ["CardContent", "SalesOverview"],
      tag: "div",
      look: null,
      text: "Your orders",
    }
    expect(labelOf(seen, catalog)).toBe("SalesOverview · ‘Your orders’")
  })

  it("names a block's own exported part in words", () => {
    const seen = {
      own: ["SalesStat"],
      owners: ["SalesStat", "SalesOverview"],
      tag: "div",
      look: null,
      text: "Top region",
    }
    expect(labelOf(seen, catalog)).toBe("Sales stat · ‘Top region’")
  })

  it("names an atom by itself, inside a block too", () => {
    const seen = {
      own: ["Figure"],
      owners: ["Figure", "SalesStat", "SalesOverview"],
      tag: "span",
      look: null,
      text: "8.30%",
    }
    expect(labelOf(seen, catalog)).toBe("Figure · ‘8.30%’")
  })

  it("names a ds component outside any block by its title", () => {
    const seen = {
      own: ["Button"],
      owners: ["Button", "CheckoutPage"],
      tag: "button",
      look: null,
      text: "Pay",
    }
    expect(labelOf(seen, catalog)).toBe("Button · ‘Pay’")
  })

  it("skips layout shells and names the nearest meaningful component instead", () => {
    const shells = catalogOf([
      ...catalog.values(),
      { title: "AppShell", naming: "container", exports: ["AppShell"] },
    ])
    const seen = {
      own: [],
      owners: ["PricingPreview", "PageContainer", "LandingView", "AppShell"],
      tag: "figure",
      look: null,
      text: "Pricing",
    }
    expect(labelOf(seen, shells)).toBe("Pricing preview · ‘Pricing’")
    expect(
      labelOf({ ...seen, owners: ["Card", "PageContainer", "AppShell"], text: null }, shells),
    ).toBe("Card")
  })

  it("names a plain element outside the catalog by what it shows, not by the view rendering it", () => {
    const owners = ["PricingPreview", "PageContainer", "LandingView"]
    const plain = { own: [], owners, tag: "div", text: null }
    expect(labelOf({ ...plain, look: "box", text: "Pricing" }, catalog)).toBe("Pricing card")
    expect(
      labelOf(
        { ...plain, tag: "h1", look: "headline", text: "The easiest way to use it." },
        catalog,
      ),
    ).toBe("Headline · ‘The easiest way to use it.’")
    expect(labelOf({ ...plain, tag: "p", look: "text", text: "Ship it faster" }, catalog)).toBe(
      "Text · ‘Ship it faster’",
    )
    expect(
      labelOf(
        { ...plain, tag: "section", look: "box", text: "A headline far too long to title" },
        catalog,
      ),
    ).toBe("Card · ‘A headline far too long to…’")
  })

  it("falls back to the nearest component, then the tag, and cuts long text", () => {
    expect(
      labelOf({ own: [], owners: ["ReportsPage"], tag: "div", look: null, text: null }, catalog),
    ).toBe("Reports page")
    expect(
      labelOf(
        {
          own: [],
          owners: [],
          tag: "section",
          look: null,
          text: "A very long sentence that keeps going",
        },
        catalog,
      ),
    ).toBe("section · ‘A very long sentence that k…’")
  })
})

describe("mark captions", () => {
  const orders = {
    own: [],
    owners: ["HeroFigure", "SalesOverview"],
    tag: "div",
    look: null,
    text: "Your orders",
  }
  const region = {
    own: ["SalesStat"],
    owners: ["SalesStat", "SalesOverview"],
    tag: "div",
    look: null,
    text: "Top region",
  }

  it("reads an arrow as a move between the texts a designer sees", () => {
    expect(arrowCaption(shortOf(orders, catalog), "after", shortOf(region, catalog))).toBe(
      "Move ‘Your orders’ below ‘Top region’",
    )
  })

  /** The grid holding both stat tiles: its first text is the first tile's label. */
  const tiles = { own: [], owners: ["SalesOverview"], tag: "div", look: null, text: "Top region" }

  it("names a pick spanning several look-alike blocks by what they are, and how many", () => {
    const row = { first: region, count: 2 }
    expect(labelOf(tiles, catalog, row)).toBe("Sales stats (2)")
    expect(arrowCaption(shortOf(orders, catalog), "after", shortOf(tiles, catalog, row))).toBe(
      "Move ‘Your orders’ below Sales stats (2)",
    )
  })

  it("names a row of unnamed blocks by its first block's text and how many more", () => {
    const row = { first: { ...region, own: [] }, count: 3 }
    expect(labelOf(tiles, catalog, row)).toBe("SalesOverview · ‘Top region’ and 2 more")
    expect(shortOf(tiles, catalog, row)).toBe("‘Top region’ and 2 more")
  })

  it("reads a box as what goes where, before and after it has words", () => {
    expect(boxCaption("", "before", "‘Top region’")).toBe("Something new above ‘Top region’")
    expect(boxCaption("Notice", "inside", "SalesOverview")).toBe(
      "New ‘Notice’ inside SalesOverview",
    )
  })

  it("reads a box drawn over content as around that content", () => {
    expect(boxCaption("", "around", "‘Pricing’")).toBe("Around ‘Pricing’")
    expect(boxCaption("lifted", "around", "‘Pricing’")).toBe("Around ‘Pricing’: ‘lifted’")
  })
})
