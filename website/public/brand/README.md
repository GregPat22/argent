# Official Argent icon

The founder selected the supplied silver A as Argent’s official icon on
6 November 2026, superseding the periodic-table Ag mark for product branding.

`argent-icon-source.png` preserves the supplied 1254 × 1254 RGBA image byte for
byte. Source attachment: `ChatGPT Image Nov 6, 2026, 08_14_09 PM.png`.
SHA-256: `dfa3af25f5688e0053f8364a07ea4e5ee1dc10a9783d8db1951c343eb7f3ef49`.

Faithful size/format derivatives were generated with Sharp 0.35.5 from the
existing website toolchain, preserving transparency without redrawing or cropping:

- `argent-icon-96.webp` and `argent-icon-192.webp`: website marks, WebP quality 95,
  alpha quality 100.
- `src/app/icon.png`: 64px PNG favicon.
- `src/app/apple-icon.png`: 180px PNG touch icon.
- `src/app/favicon.ico`: a 32px PNG wrapped in a single-image ICO container.

The source is the authority for future derivatives. Navbar, illustrated
app marks and atom illustration use the same shared `ArgentMark` component.
Desktop packaging remains separate; this landing-page change does not rebuild
native application icons or release artifacts.

## Footer wordmark

During W0.6 the founder supplied the wide silver ARGENT artwork to replace the
typed footer wordmark. `argent-wordmark-source.png` preserves the supplied
2172 × 724 RGBA image byte for byte. Source attachment:
`ChatGPT Image Nov 6, 2026, 11_10_47 PM.png` (replaced the 08_27_44 PM
version).
SHA-256: `c34b759a729ac3751575b3b9ad9275dd09ed67ed325b4994d6e8f0ed48b3c139`.

`argent-wordmark-800.webp` and `argent-wordmark-1600.webp` are faithful width
derivatives, generated with Sharp 0.35.5, WebP quality 95 and alpha quality 100.
The source's black matte is converted to transparency (alpha from the brightest
channel, colour un-premultiplied) so the wordmark sits on any dark background.
No redrawing or cropping was applied. The rendered footer image links to the
page top; it is separate from the official A icon.
