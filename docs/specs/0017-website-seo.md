# Website search and sharing metadata

Status: implementation integrated in main `864188a`; live publication is a
separate validation step. Baseline: main `8027d0b`, inspected on 12 November 2026.
The public landing page is served at <https://argent.build/>. Desktop downloads
and trusted checks remain planned; this work changes no product positioning or
milestone scope.

## Acceptance

1. The initial HTML contains one title, a concise factual description, an English
   language declaration and one absolute canonical URL, `https://argent.build`.
   Query parameters do not change the canonical URL. The approved title and hero
   headline remain unchanged.
2. Open Graph and X cards use the same title, description and production URL,
   and a locally generated 1200 × 630 PNG with descriptive alternative text.
   The image identifies the prototype and planned checks without a download claim.
3. `/robots.txt` allows crawling of content and assets and points to
   `/sitemap.xml`. The sitemap contains only the canonical home page, without
   fragment links, invented pages or a fabricated modification date.
4. Server-rendered JSON-LD identifies the website, page and desktop application
   using stable production identities and existing official links. It must not
   invent ratings, reviews, offers, downloads or supported platforms. This is
   descriptive markup, not a claim of eligibility for software rich results.
5. Preview builds carry `noindex`; crawlers can still read that directive.
   Production remains indexable. Canonicals never derive from a request host
   or preview URL. Document the build-time preview setting.
6. With JavaScript disabled, one H1, section headings, real navigation links,
   product limitations and all FAQ answers remain readable. Missing pages
   return HTTP 404 and `noindex`.
7. The header wordmark uses responsive image delivery at its displayed size,
   preserving the source artwork and navigation geometry.
8. Automated checks inspect served metadata, crawl files, schema, social image
   bytes and dimensions, no-script content and preview configuration. Run the
   repository check and website typecheck, production build and browser suite.

## Baseline observations

The live home page returns HTTP 200 and prerendered HTML. HTTP redirects to HTTPS
with 308 and a missing page returns 404. The description is long; canonical,
social images and JSON-LD are absent. Both crawl files return 404. The `www`
hostname fails TLS certificate validation and needs a hosting/domain correction
before a redirect from that hostname can work.

## Validation evidence

On 12 November 2026, against main `8027d0b`:

- The canonical assertion fails on an isolated unchanged-main production build:
  the initial HTML has no canonical link. The implementation initially exposed
  Next.js's root-URL normalization; the shared URL now matches that output in
  the canonical, Open Graph, sitemap and schema.
- The served SEO regressions pass, including metadata before hydration,
  campaign-URL canonicalization, schema identities, social PNG dimensions,
  no-script FAQ/navigation, image delivery and HTTP 404 behavior.
- The original navigation wordmark is 125,560 bytes. The optimized 384-pixel
  WebP response is 24,178 bytes with the existing artwork and unchanged layout.
  This is a response-size comparison, not a measured Core Web Vitals gain.
- The social PNG was rendered and visually inspected at 1200 × 630.
- A single mobile Lighthouse 13.6.0 audit of the existing live site reports SEO 100,
  performance 54, accessibility 97 and best practices 100. LCP is 3.8 s and
  total blocking time 6.33 s in that lab run (simulated mobile throttling, 4× CPU
  slowdown). The basic SEO score does not test
  every requirement here: the live site still lacks a canonical and crawl files.
  Heavy animation JavaScript and inactive journey-step contrast remain follow-up
  issues. No field performance or ranking improvement is established.

Website type checking and production builds pass. All eight focused SEO checks
pass against both a production build and a separate `VERCEL_ENV=preview` build;
the latter serves `noindex` and an empty sitemap. The full browser run passes
54 checks (all 47 existing landing-page regressions and seven SEO checks); the
additional responsive-image regression passes in the eight-check focused suites.
`npm run check` passes all 541 repository tests, type checking and formatting.
The final diff and changed-document relative links were reviewed. No live
publication, Search Console verification or hosted post-deployment check ran.

## Limits and release follow-up

The initial implementation validation did not deploy the site. After publication, verify
production responses and social previews again, validate the JSON-LD with the
Schema Markup Validator, then submit the sitemap in a verified Search Console
property and inspect the home page. Search Console ownership, actual indexing,
search traffic and field Core Web Vitals cannot be inferred from a local build
or a lab score. No ranking or rich-result guarantee is made.

The `www` certificate and redirect require hosting access. Use an HTTPS
redirect to the apex domain while preserving paths and query strings. Search
Console verification is independent of hosting and remains a separate step.

### Deployment contract

Build the Next.js package under `website`, not the desktop engine at the
repository root or the static local download preview. The hosting project uses
the Next.js preset, Node.js 22.x, `npm ci`, `npm run build` and the framework's
default output directory. A deployment must identify its source commit and use
the production indexing environment for production. Verify the resulting HTML,
crawl files, image and redirects on the live hostname; a successful local build
does not establish any of those production results.

## References

- [Google: JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google: software application structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app)

## Landing-page sharing image (in development)

Based on main `6ba963b`, 12 November 2026. Replace the generated text card with
an unmodified capture of the landing-page hero, preserving its approved copy,
brand artwork and visible availability limits.

Acceptance: both Open Graph and X reference the same fetchable 1200 × 630 PNG
under 1 MB at `/opengraph-image.png`, with matching descriptive alternative text
in the initial HTML. Keep `summary_large_image`. The image includes the full
headline and status line; no new capability or download claim is introduced.
The static image URL carries Next.js's content version query. Recapture when
the hero changes; the capture procedure is in the website README.

Local validation and live publication are separate: no X preview or production
deployment is established by the local browser checks.

Validation on 12 November 2026 against baseline main `6ba963b`: website
`typecheck`, production `build` and all 62 browser checks pass, including
no-JavaScript Open Graph/X image delivery, PNG dimensions and matching alt text.
The 228,637-byte screenshot was visually inspected at 1200 × 630. Live
publication and an actual X preview were not checked.

Repository `npm run check` passed type checking, formatting and 567 tests, but
the public-content scanner failed while the removed image generator remained
in Git's unstaged file list. The unchanged-main scanner passes; after staging
the replacement, all 12 scanner checks pass too. No assertion was changed.
Revalidation on 13 November 2026 at `3782ef4`, including main `69028d9`,
passes the complete `npm run check` (589 tests), website type checking,
production build and all 62 browser checks. Independent diff and coverage
review found no issues. Live publication and actual platform previews remain
unverified.
