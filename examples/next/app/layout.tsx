import "./globals.css"

import { type ReactNode } from "react"

import { MorphMount } from "./morph-mount"

export const metadata = { title: "Morph — explore ideas in your live app" }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <MorphMount />
      </body>
    </html>
  )
}
