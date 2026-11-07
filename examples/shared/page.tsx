import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"

export function Page() {
  return (
    <main className="landing">
      <header className="nav wrap">
        <a className="wordmark" href="#top">
          <span className="mark">t</span> tune
        </a>
        <nav aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="https://github.com/enitrat/tune">GitHub ↗</a>
        </nav>
      </header>
      <section className="hero wrap" id="top">
        <div className="hero-copy">
          <Badge variant="outline">For React developers</Badge>
          <h1>
            Make the interface
            <br />
            <em>feel right.</em>
          </h1>
          <p>
            Point at what you want to change. Describe an idea. Explore real code variants on your
            live page.
          </p>
          <div className="actions">
            <Button asChild size="lg">
              <a href="#try">Try Tune ↗</a>
            </Button>
            <a className="text-link" href="#how">
              See how it works ↓
            </a>
          </div>
          <p className="hero-note">Your app. Your components. Your call.</p>
        </div>
        <div className="stage" aria-label="Illustration of exploring design variants with Tune">
          <div className="stage-window">
            <div className="window-bar">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              <span>localhost:3000</span>
            </div>
            <div className="mock-page">
              <div className="mock-nav">
                <strong>FORMA</strong>
                <span>Collection &nbsp;&nbsp; About</span>
              </div>
              <div className="mock-body">
                <div>
                  <span className="mock-label">OBJECTS FOR LIVING</span>
                  <h2>
                    Room to
                    <br />
                    breathe.
                  </h2>
                  <p>Thoughtful pieces for the spaces you inhabit.</p>
                  <span className="mock-button">Explore collection ↗</span>
                </div>
                <div className="mock-art">
                  <div className="mock-shape" />
                </div>
              </div>
            </div>
          </div>
          <div className="tune-panel">
            <div className="panel-head">
              <strong>
                <span className="panel-logo">t</span> Tune
              </strong>
              <span>×</span>
            </div>
            <div className="panel-content">
              <span className="panel-label">SELECTED ELEMENT</span>
              <div className="selection">
                ↗ &nbsp; Button <span>Hero.tsx</span>
              </div>
              <p>What would you like to change?</p>
              <div className="prompt">
                Make this feel more inviting<span>↗</span>
              </div>
              <div className="variant-row">
                <span>VARIANTS</span>
                <span>1 / 3</span>
              </div>
              <div className="variants">
                <span className="active">Original</span>
                <span>Variation 1</span>
                <span>Variation 2</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="how wrap" id="how">
        <div className="section-intro">
          <h2>
            From “what if”
            <br />
            to <em>right there.</em>
          </h2>
          <p>
            Stay in the context of your app while you explore. Tune does the setup so you can focus
            on the details.
          </p>
        </div>
        <div className="steps">
          <Card>
            <CardHeader>
              <span className="step-number">01 / SELECT</span>
              <CardTitle>Point to a possibility.</CardTitle>
              <CardDescription>
                Pick an element on your running page and describe the change you have in mind.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <span className="step-number">02 / EXPLORE</span>
              <CardTitle>See ideas in place.</CardTitle>
              <CardDescription>
                Tune builds variants in separate git worktrees. Switch between them on the live
                page.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <span className="step-number">03 / REFINE</span>
              <CardTitle>Make it yours.</CardTitle>
              <CardDescription>
                Fine-tune tokens, Tailwind utilities, and component props. Keep the version you
                like.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>
      <section className="closing" id="try">
        <div className="wrap closing-inner">
          <div>
            <Badge variant="outline">Built for your workflow</Badge>
            <h2>
              Good ideas deserve
              <br />
              <em>a closer look.</em>
            </h2>
            <p>Open the overlay in development and start exploring.</p>
            <div className="shortcut">
              <kbd>Alt</kbd>
              <span>+</span>
              <kbd>Shift</kbd>
              <span>+</span>
              <kbd>R</kbd>
            </div>
          </div>
          <Card className="install-card">
            <CardHeader>
              <CardTitle>Get started</CardTitle>
              <CardDescription>Install Tune in your React project.</CardDescription>
            </CardHeader>
            <CardContent>
              <code>pnpm add -D github:enitrat/tune#path:/packages/tune</code>
              <a href="https://github.com/enitrat/tune#install">Read the setup guide ↗</a>
            </CardContent>
          </Card>
        </div>
      </section>
      <footer className="wrap footer">
        <span className="wordmark">
          <span className="mark">t</span> tune
        </span>
        <span>A little more room to explore.</span>
        <a href="https://github.com/enitrat/tune">GitHub ↗</a>
      </footer>
    </main>
  )
}
