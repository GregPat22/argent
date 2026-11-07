# Desktop fonts

The desktop app uses the website's typefaces, bundled locally so the renderer
makes no network request. Each file is the unmodified Latin variable-weight
subset from the official npm registry, downloaded 7 November 2026, with the
registry integrity verified before extraction:

| File                                     | Package                                     | Integrity                                                                                         |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `inter-latin-wght-normal.woff2`          | `@fontsource-variable/inter@5.3.0`          | `sha512-OupL48va4JNofb97w6NYeF9S7W/kHNKM0Er8Dem5nqi4jeOLrVJDoE8tZEpnMJmtkvNbB1EIPPwHcdkF6b1oUA==` |
| `manrope-latin-wght-normal.woff2`        | `@fontsource-variable/manrope@5.3.0`        | `sha512-6D5dgokHsWDDMtmXHznKa0hK229NN+1a4BLPmUCLqcO1Pw5EEhWY5RFt0AcXnVRAljFFPfRtLkJePQj6LSsV6g==` |
| `jetbrains-mono-latin-wght-normal.woff2` | `@fontsource-variable/jetbrains-mono@5.3.0` | `sha512-F32xpS2NsGYoQi2ADSkKTgpJj7ozajsGgDJ8woTnqjmIB+dxDIqImjl4pXZVEExu8UFZ2ndhmX18EBS/hdz3Lw==` |

All three are licensed under the SIL Open Font License 1.1; the license texts
are kept beside them (`LICENSE-*.txt`) and ship in desktop builds.
