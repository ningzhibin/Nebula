# js/ — plain-script modules (no bundler, no imports)

**Parent covers:** serving, version bumps (`?v=`), workers-as-Blob concept, report sizing. This file covers module taxonomy and cross-file contracts.

## OVERVIEW
42 scripts in 5 roles, all loaded via ordered `<script src>` in `index.html` — order matters, later files use earlier globals.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Report capture/export | `nebula_report.js` (~2.4k lines) | `REPORT_SECTIONS` registry; `collectPlotlyEmbedForReport`; full-width/fill section lists |
| Result tables | `table_display.js` | `window.TableDisplay.renderGenericTable/renderMatrixPreview`; DataTables-based |
| New analysis module | `kmeans_analysis.js` + `kmeans.worker.js` | Canonical template: IIFE, `generate(context)` — `currentData`/`metaData` are lexical lets in `index.html`, so they must be **passed in**, never read off `window` |
| Heavy compute | `*.worker.js` | Each exposes `window._<name>WorkerSrc` template string; `index.html:initWorkers()` builds Blob URLs |
| Example matrices | `example_*.js` | Lazy getters rebuilding TSV/JSON on first access; loaded only on demand |
| Vendored third-party | `clustergrammer.js`, `Enrichrgram.js`, `hzome_functions.js`, `send_to_Enrichr.js` | Upstream copies — do not refactor; patch around them (see `clustergrammer_bootstrap_restore.css`) |

## CONVENTIONS
- Feature modules are IIFEs attaching one global (`window.KMeansAnalysis`, `window.TableDisplay`, `NebulaReport`); workers expose `window._<name>WorkerSrc`.
- Shared-plot helpers live in `index.html`, not here: `getScatterLabelStyle`/`getScatterArrowVisibility` branch on `plotId` — a new Plotly scatter must add its branch or it silently inherits t-SNE controls.
- Downstream invalidation is manual: new cached result state needs resets in every data-load/mutation block (grep `tsneResult = null` to find them all).
- `hybrid-core.js` + `hybrid_core.js` are duplicate-named copies — check both before editing either.

## ANTI-PATTERNS
- `new Worker('js/...')` — Chrome blocks it on `file://`; always Blob from `window._*WorkerSrc`.
- Reading `window.currentData` from a module — lexical scope, must come via context arg.
- Editing vendored Clustergrammer/Enrichr files for app styling — use the restore CSS / wrapper instead.
