import { Demo } from "./demo"

export function Page() {
  return (
    <main className="site">
      <header className="site-header">
        <a className="site-name" href="#top">
          Tune
        </a>
        <a href="https://github.com/enitrat/tune" aria-label="Tune on GitHub">
          GitHub ↗
        </a>
      </header>
      <section className="intro" id="top">
        <h1>Explore ideas in your React app.</h1>
        <p>
          Point at an element, describe a change, and see variants on your live page. Fine-tune the
          details and keep the one you like.
        </p>
        <p className="install-label">Install Tune in your project:</p>
        <div className="command">
          <span>$</span>
          <code>pnpm add -D &quot;github:enitrat/tune#path:/packages/tune&quot;</code>
        </div>
      </section>
      <div
        className="demo-wrap"
        role="img"
        aria-label="Illustration of selecting an element, requesting a change, and previewing a variant in Tune."
      >
        <Demo />
      </div>
      <div className="below">
        <p>
          Built for the way you already work. Tune uses your components, your design tokens, and
          real code.
        </p>
        <a href="https://github.com/enitrat/tune#install">Read the setup guide ↗</a>
      </div>
      <footer>
        <a href="https://github.com/enitrat/tune">GitHub</a>
        <a href="https://github.com/enitrat/tune#install">Docs</a>
        <span>React · Next.js · Vite</span>
      </footer>
    </main>
  )
}
