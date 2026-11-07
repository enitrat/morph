"use client"

import dynamic from "next/dynamic"

export const TuneMount =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("@enitrat/tune/widget").then(({ TuneWidget }) => () => (
            <TuneWidget base="/api/tune" />
          )),
        { ssr: false },
      )
    : () => null
