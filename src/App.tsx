import { useReveal } from './useReveal'
import { Nav } from './sections/Nav'
import { Hero } from './sections/Hero'
import { Mechanism } from './sections/Mechanism'
import { Furnace } from './sections/Furnace'
import { Proof } from './sections/Proof'
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
        <Proof />
        <Close />
      </main>
    </>
  )
}
