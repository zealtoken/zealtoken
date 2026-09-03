import { useReveal } from './useReveal'
import { Nav } from './sections/Nav'
import { Hero } from './sections/Hero'
import { Mechanism } from './sections/Mechanism'
import { Furnace } from './sections/Furnace'
import { FurnaceCalc } from './sections/Calculators'
import { Proof } from './sections/Proof'
import { Lore } from './sections/Lore'
import { Close } from './sections/Close'

export default function App() {
  useReveal()
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Mechanism />
        <Furnace />
        <section className="band band-tight" id="burn-math">
          <div className="wrap-narrow">
            <FurnaceCalc />
          </div>
        </section>
        <Proof />
        <Lore />
        <Close />
      </main>
    </>
  )
}
