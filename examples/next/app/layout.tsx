import "./globals.css"

import { type ReactNode } from "react"

import { TuneMount } from "./tune-mount"

export const metadata = { title: "Tune — explore ideas in your live app" }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <TuneMount />
      </body>
    </html>
  )
}
