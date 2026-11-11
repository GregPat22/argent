# Liquid silver stills

`drop-large.webp`, `drop-medium.webp`, `drop-small.webp` and `drop-pair.webp`
are still frames of the hero's liquid silver. They are rendered by
`scripts/render-liquid-drops.cjs`, which reads the shader out of
`src/components/liquid-silver.tsx` and draws a few small scenes with it, so the
metal below the hero is the same material as the metal in it. They are original
to this project; no third-party image is involved.

The closing band (`#join`) and the hero's fallback without WebGL use them.

To regenerate them after changing the shader's look, run from `website/`:

```sh
node scripts/render-liquid-drops.cjs
```

The script needs a GPU. The files are transparent WebP at quality 90.
