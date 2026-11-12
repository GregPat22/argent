import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { siteStructuredData } from "@/lib/seo";
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

// Page-specific: future pages must declare their own canonical URL.
export const metadata: Metadata = { alternates: { canonical: SITE_URL } };

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(siteStructuredData).replace(/</g, "\\u003c"),
        }}
      />
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
