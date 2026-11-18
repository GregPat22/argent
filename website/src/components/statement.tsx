import { SilverAtom } from "@/components/silver-atom";

export function Statement() {
  return (
    <section
      id="statement"
      aria-labelledby="statement-title"
      className="mx-auto max-w-[1320px] px-6 py-24 md:px-10 md:py-36"
    >
      <div className="grid items-center gap-10 md:grid-cols-12 md:gap-12">
        <div className="min-w-0 md:col-span-7">
          <h2
            id="statement-title"
            className="display max-w-[17ch] text-[clamp(2.5rem,5.5vw,5rem)]"
          >
            Silver conducts better than any metal.
          </h2>
          <p className="mt-8 max-w-[36rem] text-lg leading-[1.75] text-sterling md:text-xl">
            A conductor also turns a room full of players into one piece of
            music. Argent does both for your coding agents: every task flows
            through one place, each workspace has its own branch, and you hold
            the baton when it’s time to merge.
          </p>
        </div>
        <div className="statement-atom min-w-0 md:col-span-5">
          <SilverAtom />
        </div>
      </div>
    </section>
  );
}
