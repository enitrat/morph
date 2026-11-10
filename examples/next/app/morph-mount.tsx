"use client"

import dynamic from "next/dynamic"

export const MorphMount =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("@enitrat/morph/widget").then(({ MorphWidget }) => () => (
            <MorphWidget base="/api/morph" />
          )),
        { ssr: false },
      )
    : () => null
