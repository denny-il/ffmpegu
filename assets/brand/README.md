# ffmpegu brand assets

The approved Ember identity uses the joined `ff` and `u` monogram above the
lowercase `ffmpegu` wordmark. These are the production assets; earlier design
explorations are not part of this set.

| Asset | Background | Intended surface |
| --- | --- | --- |
| `logo-light.svg` / `logo-light.png` | Transparent | Light |
| `logo-dark.svg` / `logo-dark.png` | Transparent | Dark |
| `logo-light-square.svg` / `logo-light-square.png` | Paper | Any |
| `logo-dark-square.svg` / `logo-dark-square.png` | Dark | Any |

SVG files scale to any resolution. PNG files are 1024 × 1024; the `-512.png`
siblings are 512 × 512. All variants preserve the same layout and clear space.
Use the transparent files when a surrounding surface should show through;
use the square files to reproduce the approved light and dark presentations.
These full logos include lettering and are not intended as tiny favicons.

## Colors

| Role | Hex |
| --- | --- |
| Ember `ff` | `#D5522B` |
| Light-mode `u` and wordmark | `#2B2124` |
| Light square background | `#FBF8F4` |
| Dark square background | `#1D1719` |
| Dark-mode `u` and wordmark | `#F5EFE9` |

Colors are solid fills. The gap between `ff` and `u` is negative space, not an
outline. Do not use the ink-colored logo on a dark surface.

## Editing and exporting

`logo-light.svg` is the editable master. The monogram uses clean geometric
paths; the approved custom wordmark is preserved as outlined paths. There
are no embedded bitmaps, external fonts, or network dependencies in any SVG.

The other SVGs and every PNG are exports of the master. After editing it,
re-export them and commit them together with the master so consumers do not
need rendering tools.

## Attribution and license

These ffmpegu assets are distributed under the repository's [MIT License](../../LICENSE).
They identify this independent project and are not official FFmpeg logos.
The MIT license does not grant rights to FFmpeg's trademarks or branding;
see [third-party notices](../../NOTICE.md).
