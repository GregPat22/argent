import { Agents } from "@/components/agents";
import { Entrance } from "@/components/entrance";
import { Footer } from "@/components/footer";
import { FAQ } from "@/components/faq";
import { Hallmark } from "@/components/hallmark";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Journey } from "@/components/journey";
import { Manifesto } from "@/components/manifesto";
import { Nav } from "@/components/nav";
import { PointerLight } from "@/components/pointer-light";
import { Roadmap } from "@/components/roadmap";
import { RunIt } from "@/components/run-it";
import { SectionActivity } from "@/components/section-activity";
import { Statement } from "@/components/statement";

export default function Home() {
  return (
    <>
      <a
        href="#top"
        className="fixed top-3 left-3 z-[60] -translate-y-24 rounded-full bg-polished px-5 py-3 text-sm text-oxide focus:translate-y-0"
      >
        Skip to content
      </a>
      <Nav />
      <main id="top" tabIndex={-1}>
        <Hero />
        <Statement />
        <Hallmark />
        <HowItWorks />
        <Agents />
        <Manifesto />
        <Journey />
        <Roadmap />
        <FAQ />
        <RunIt />
      </main>
      <Footer />
      <Entrance />
      <SectionActivity />
      <PointerLight />
    </>
  );
}
