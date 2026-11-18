# Argent artwork

The silver A folds a single ribbon over an open counter. The crossbar rises
toward the right leg. The wide ARGENT wordmark repeats the polished edges
and satin faces across the six letters.

| Source                                                    | Uses                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| [Transparent A](argent-icon-source.png)                   | Website and desktop marks, browser icons, native foreground    |
| [Transparent wordmark](argent-wordmark-source.png)        | Navigation, footer and desktop welcome screen                  |
| [Native icon document](../../../ui/Argent.icon/icon.json) | Light and dark tile materials, tint mask and clear appearances |

The website uses 96 and 192 px WebP marks and 800 and 1600 px WebP wordmarks.
The desktop renderer uses the same small WebPs. The browser ICO includes
16, 32 and 48 px images. The touch icon uses the full-bleed graphite tile.

## Regenerate the artwork

With the website dependencies installed and Xcode with Icon Composer selected,
run the following from the repository root after editing either master or the
native document.

```sh
node website/scripts/render-brand.mjs
```

The native document uses one transparent foreground over a pearl or graphite
tile. Tinted appearances use its silhouette and the system tint. Clear
appearances use the native material. The compiled catalog is checked in so
packaging can use it on build hosts without Icon Composer. The development
Dock exports and classic ICNS include an inset around the tile. At 16 and
32 physical pixels the classic icon uses darker silver faces to keep the A
legible in a Finder list. See the
[native icon contract](../../../docs/specs/0004-desktop-prototype.md#native-application-icon-in-development).
