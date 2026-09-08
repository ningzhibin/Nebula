# popout/ — full-window figure pages

**Parent covers:** `postMessage` + `sessionStorage` handoff. This file covers per-page roles and registration.

## OVERVIEW
4 standalone pages that render one figure outside the tab layout: `plot_popout.html` (Plotly), `svg_popout.html` (vector), `image_popout.html` (raster), `upset_popout.html` (UpSet/Venn/K-map bundle).

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Open a popout | `openPlotlyPopout` / `openSvgPopout` / `openImagePopout` / `openAutoPopout` in `index.html` | Parent serializes payload → `postMessage`, fallback `sessionStorage` (needed for `file://`) |
| Per-figure button | `js/figure_popout_buttons.js` `FIGURES` | `{id, type, title, report?}`; injector adds "Pop out" to the figure's headrow automatically |
| Modebar icon | `installPlotlyPopoutButton` in `index.html` | Small icon inside every Plotly modebar; the labeled button is the visible affordance |

## CONVENTIONS
- Registry entry's `type` selects the opener (`plotly`/`svg`/`image`/`auto`); `report` wires the adjacent Add to Report button for figures that lack one.
- Popout pages must stay dependency-light and self-rendering from the passed payload — no access to parent globals.
- Browsers block the new window unless the open call comes from a user gesture; allow pop-ups for the app origin.

## ANTI-PATTERNS
- Hand-adding Pop out buttons in panel HTML — use the `FIGURES` registry, it deduplicates via `data-qc-popout-injected`.
