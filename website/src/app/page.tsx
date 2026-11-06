import { Commitments } from "@/components/commitments";
import { Footer } from "@/components/footer";
import { FAQ } from "@/components/faq";
import { Hallmark } from "@/components/hallmark";
import { Hero } from "@/components/hero";
import { Lifecycle } from "@/components/lifecycle";
import { Nav } from "@/components/nav";
import { ReconnectDemo } from "@/components/reconnect-demo";
import { Roadmap } from "@/components/roadmap";
import { RunIt } from "@/components/run-it";
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
        <ReconnectDemo />
        <Lifecycle />
        <Hallmark />
        <Commitments />
        <Roadmap />
        <FAQ />
        <RunIt />
      </main>
      <Footer />
    </>
  );
}
