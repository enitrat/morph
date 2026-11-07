import "./globals.css"

import { type ReactNode } from "react"

import { TuneMount } from "./tune-mount"

export const metadata = { title: "Acme with Tune" }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <TuneMount base="/api/tune" />
      </body>
    </html>
  )
}
