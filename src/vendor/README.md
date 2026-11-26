# Third-party code

Code written outside this project, kept as its authors wrote it so it can be
compared with (and updated from) the original. Changes made here are marked
`[ytaf]` in the files. Lint, Prettier and the code map's description check
skip this folder (`eslint.config.ts`, `.prettierignore`, `tools/codemap.mjs`);
the code that uses it lives under `src/features/`.

| Folder | What | From | License |
| --- | --- | --- | --- |
| `dearrow/` | DeArrow's title formatter (Title Case, Sentence case, emoji and fancy-text cleanup) | [ajayyy/DeArrow](https://github.com/ajayyy/DeArrow) `src/titles/titleFormatter.ts` @ 482cf997, types stripped; vendored by @magicsk in NicholasBly/youtube-webos#200 | GPL-3.0 |
| `playback-speed/` | Playback speed engine: the MSE timeline rescale (`mse-hook.js`), the MP4 and WebM parsers (`containers.js`), the WebCodecs audio path (`audio-engine.js`) and the WSOLA time stretch (`wsola.js`) | @GiacomoCa in webosbrew/youtube-webos#484, ported by @Schmiddisen in NicholasBly/youtube-webos#194 | GPL-3.0 (contributed to this GPL-3.0 project) |

Used by `src/features/dearrow/` and `src/features/playback-speed/`.
