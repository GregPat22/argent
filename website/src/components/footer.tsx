import { DOCS_URL, LICENSE_URL, REPO_URL, ROADMAP_URL } from "@/lib/site";

const LINKS = [
  { href: REPO_URL, label: "GitHub" },
  { href: DOCS_URL, label: "Project context" },
  { href: ROADMAP_URL, label: "Roadmap" },
  { href: LICENSE_URL, label: "MIT license" },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="mx-auto max-w-[1320px] px-6 pt-16 pb-8 md:px-10 md:pt-24">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <p className="max-w-[24rem] text-base leading-relaxed text-sterling">
            Open-source tools for delegating coding tasks and reviewing the
            results.
          </p>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-7 gap-y-1">
              {LINKS.map((link) => (
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
          </nav>
        </div>
        <a
          href="#top"
          aria-label="Argent — back to top"
          className="footer-wordmark mt-10 block rounded-xl md:mt-12"
        >
          <img
            src="/brand/argent-wordmark-1600.webp"
            srcSet="/brand/argent-wordmark-800.webp 800w, /brand/argent-wordmark-1600.webp 1600w"
            sizes="(max-width: 1320px) calc(100vw - 48px), 1240px"
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
