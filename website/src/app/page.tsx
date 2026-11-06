import { Commitments } from "@/components/commitments";
import { Footer } from "@/components/footer";
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
      <Nav />
      <main id="top">
        <Hero />
        <Statement />
        <ReconnectDemo />
        <Lifecycle />
        <Hallmark />
        <Commitments />
        <Roadmap />
        <RunIt />
      </main>
      <Footer />
    </>
  );
}
