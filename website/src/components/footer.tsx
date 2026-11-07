import {
  ARCHITECTURE_URL,
  CONTRIBUTING_URL,
  DOCS_URL,
  LICENSE_URL,
  REPO_URL,
  ROADMAP_URL,
  X_URL,
} from "@/lib/site";

const GROUPS = [
  {
    title: "Project",
    links: [
      { href: DOCS_URL, label: "Docs" },
      { href: ROADMAP_URL, label: "Roadmap" },
      { href: ARCHITECTURE_URL, label: "Architecture" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: REPO_URL, label: "GitHub" },
      { href: CONTRIBUTING_URL, label: "Contributing" },
      { href: X_URL, label: "X" },
    ],
  },
  {
    title: "Open source",
    links: [{ href: LICENSE_URL, label: "MIT license" }],
  },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="mx-auto max-w-[1320px] px-6 pt-16 pb-8 md:px-10 md:pt-24">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <p className="display text-[1.75rem] tracking-[-0.04em] text-polished">
              Argent is a good conductor.
            </p>
            <p className="mt-3 max-w-[24rem] text-base leading-relaxed text-sterling">
              The open-source home for your coding agents. Early, and built in
              the open.
            </p>
          </div>
          <nav aria-label="Footer" className="md:col-span-7">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              {GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="text-sm text-sterling-dim">{group.title}</p>
                  <ul className="mt-2">
                    {group.links.map((link) => (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="footer-link"
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        </div>
        <a
          href="#top"
          aria-label="Argent — back to top"
          className="footer-wordmark mx-auto mt-16 block w-full max-w-[640px] rounded-xl md:mt-20"
        >
          <img
            src="/brand/argent-wordmark-1600.webp"
            srcSet="/brand/argent-wordmark-800.webp 800w, /brand/argent-wordmark-1600.webp 1600w"
            sizes="(max-width: 688px) calc(100vw - 48px), 640px"
            width={2172}
            height={724}
            alt="Argent"
            className="h-auto w-full"
            loading="lazy"
            decoding="async"
          />
        </a>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-2 text-sm text-sterling-dim">
          <p>© 2026 Argent contributors · Pre-launch software.</p>
          <a href="#top" className="footer-link">
            Back to top <span aria-hidden>↑</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
