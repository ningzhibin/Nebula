# AGENTS.md

Single-page vanilla-JS app **Nebula** (intensity-matrix QC/visualization: Data QC, Clustering, Differential, SAINT, Enrichr, Report export). No build step, no package manager, no test suite, no lint — everything runs from static files served over HTTP.

## Run & verify

- Serve the folder: `python -m http.server 8123` → open `http://127.0.0.1:8123/index.html`. `file://` breaks `fetch()`-based features (doc pages, MyGene, Enrichr); the app itself mostly still boots. Browsers cache aggressively — append `?v=2` to the URL while iterating on `index.html`.
- No LSP for the giant inline script; syntax-check it with `node --check` per extracted block, e.g.:
  ```js
  node -e "const fs=require('fs');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;const h=fs.readFileSync('index.html','utf8');let m;while((m=re.exec(h))!==null){try{new Function(m[1])}catch(e){console.error(e.message)}}"
  ```
- Playwright (or manual) browser verification is the only test path. Most app functions are callable from console: `switchTab('dataQc')`, `switchDataQcSubTab('rowProfile', {skipRowProfileAuto:true})`, `updateRowProfileIdChecklist()`, `plotSelectedRowProfiles(true, true)`.
- **Saved-report layout check (headless browser, no npm deps)**: `node scripts/report_browser_check.mjs <report.html|url> --width=1440 --width=1920` drives the installed Chrome/Edge over the DevTools Protocol (global `fetch`/`WebSocket`), activates every figure tab, and fails when a figure spills past its content column, the page scrolls horizontally, a Plotly section did not mount, or a fill section (heatmap / row profile / per-column summary) is short. PNGs land in `--out` (default `<temp>/nebula-report-check`). It needs a browser that can actually spawn — in DSH that means full access; the confined shell cannot start Chrome.
- **Synthetic report fixture**: `node scripts/report_test_fixture.cjs out.html` builds a 3-figure report (fill summary, 1558px volcano, 900px PCA) by calling the real `buildHtmlDocument()` sliced out of `js/nebula_report.js`, so report layout can be iterated without loading a matrix in the app.
- `data/qc_session.js` 404 in console is benign (no bundled session present).

## Architecture

- **`index.html` (~27k lines) is the app**: HTML + markup + **3 inline scripts** (head PCA3D-snippet; **main app script**; session-snapshot loader at the end). Most feature logic lives in the main inline script, not in `js/`. `js/` files are plain scripts (no modules) wired in dependency order via `<script src>` tags; all carry cache-busting `?v=5.74` (see version note below).
- **Web Workers are Blob workers**: `js/*.worker.js` each expose `window._<name>WorkerSrc` as a template-string source; `index.html` builds Blob URLs from them (file://-compatible) in `initWorkers()`. Do not add `new Worker('js/...')` directly.
- **CDN deps**: Plotly 2.27.0, PapaParse, ml-matrix, marked, DOMPurify, jsPDF (plus lazy-loaded Clustergrammer/Bootstrap and UpSet.js). No offline vendoring except doc bundle.
- **`popout/`** pages (`heatmap_popout.html`, `upset_popout.html`, etc.) receive live figure data via `postMessage` + `sessionStorage` — parent passes payload, popout renders.
- **`doc/`** = in-app Document tab (Markdown). `doc/manifest.json` lists sections; `doc/docs_bundle.js` is **generated** — after editing any `doc/*.md` or the manifest, run `python doc/build_doc_bundle.py` or the app won't show your change offline.
- **Example data** is embedded JS: `js/example_matrix_data.js` (main 600×30 matrix), `js/example_diann_pg_matrix.js`, `js/example_saint_protein.js`, `js/example_maxquant_*.js`. `scripts/build_maxquant_examples.py` regenerates the MaxQuant examples from source. `loadExampleData()` (console) loads the main matrix; the "Load Built-in Example Data (Both)" button loads **phospho, not the main matrix**.
- **Session snapshot**: Data Preparation → “Export session as report JS” produces `data/qc_session.js` (`window.__QC_SESSION_SNAPSHOT__`); auto-loads on page load unless `?noSession=1`. Treat as executable code.

## Conventions (repo-specific)

- **Versioning**: `CHANGELOG.md` is the single source of truth for history — user-visible changes get an entry there (newest first, dated). `README.md` is a **GitHub landing page** (features / advantages / how to use) and does not carry version bullets. **Any notable update bumps the version in the same pass**: set the `#appVersion` span in `index.html` (the top-right header version) to the new `v5.7x`, AND replace every `?v=5.xx` cache-buster on local script/link tags in `index.html` with the new version (single project-wide replace, e.g. `?v=5.73` -> `?v=5.74`; the comment at index.html L14–16 documents this). Never leave `#appVersion` behind the latest CHANGELOG entry after a notable update. Trivial fixes may go to CHANGELOG only without a version bump.
- **Tab naming**: internal ids differ from labels — Data PreProcess = `switchTab('table')`, Data QC sub-tabs use `switchDataQcSubTab('overall'|'rowProfile'|'columnProfile'|'columnCorrelation'|'upset')`. Data PreProcess sub-tabs use `switchTableSubTab('tableData'|'outliers'|...)`; clustering uses `switchClusteringSubTab('heatmap'|...|'umap'|...)`. Legacy `switchTab('tsne'|'umap'|...)` names still route into the clustering tab.
- Styling lives in [css/main.css](css/main.css) (v1: all inline CSS moved here); follow visual conventions from surrounding rules, don't create new palettes/tab styles.

## Hard lessons (do not relearn)

- **Always close `/*` banners.** One unclosed block comment in the giant inline script silently disables thousands of following lines with zero parse errors (only missing-function ReferenceErrors at runtime). After any edit near a banner, grep that `/*` and `*/` counts still balance.
- **Feature wiring checklist** (t-SNE → UMAP/Outliers pattern): sub-tab button + panel HTML + switch function (`showPanel` + allowed-set + resize branch) + state vars + data-load cache clears + meta-refresh hooks + session snapshot (collect/apply/restore) + report validation lists (`knownFigures`, `primaryFigures`, `REPORT_SECTIONS`) + popout registry + doc page + version bump. Miss one and the failure surfaces far from the cause (e.g. "Unknown report figure section" warning).
- **Flex-filled panels must be viewport-capped.** `flex:1` inside an unconstrained ancestor chain lets self-measuring content (DataTables scroll-max, Plotly explicit heights) grow the page past the fold — phospho panels overshot 285–665px with paginator/plot bottoms cut off. Pattern: cap the scrolling region with `max-height:calc(100vh - <offset>)` where offset is measured live (region top → viewport bottom minus margin); tables measure the capped space ONCE into fixed `maxHeightPx` (the module's init/rAF/timeout/draw re-measures otherwise show as a large-to-small settle); plots take container height at draw. Verify live: region bottom ≤ viewport height on every new flex-fill panel, not just the first.

## Plotly sizing gotcha (learned the hard way)

Panel sub-tabs hide inactive panels with `display:none`. Plotly figures are drawn with `autosize:false` + **explicit pixel width/height measured at draw time**. If a figure is (re)drawn while its panel is hidden, measurement is 0 → fallback size (~520×420) is **locked in**; `Plotly.Plots.resize()` is a **no-op** for `autosize:false` figures, so opening the tab later does NOT fix it. Fix pattern: re-measure the visible container and `Plotly.relayout(targetDiv, {width, height})` on tab activation (see `resizeRowProfilePlotToShell`, wired in `switchDataQcSubTab`).

**Report preview ≠ tab**: the report host (nebula_report.js `__NR_PLOT_MNT__` boot script) **deletes locked width/height and sets `autosize:true`** for full-width sections + runs `Plots.resize` after mount — so row-profile/heatmap/clustering figures always look correctly stretched in the report even when the tab figure was drawn small/backgrounded. Check the actual tab, not the preview, for size bugs.

## Related files

- [js/nebula_report.js](js/nebula_report.js) — report capture/export/embed pipeline (~2.5k lines): `collectPlotlyEmbedForReport`, `stabilizeExportPlotlyLayout`, `isReportFullWidthSection`/`isExportFillSection` (row_profile, heatmap, clustering).
- [js/data_qc_overall_dashboard.js](js/data_qc_overall_dashboard.js) — Data QC → Overall 3 figures (recently converted to Plotly with sub-tabs).
- [js/table_display.js](js/table_display.js) — shared DataTables-based table rendering; use `window.TableDisplay` for result tables.
- [prom.txt](prom.txt) — scratch product-idea notes, not documentation; don't treat as requirements.

## ToolUniverse

For any scientific research question (drugs, genes, proteins, diseases, literature, clinical trials, etc.), invoke the `tooluniverse` skill — it routes to specialized research skills and 1,200+ database tools (PubMed, UniProt, ChEMBL, FAERS, ClinicalTrials.gov, RCSB PDB, ...). Available via the `tooluniverse` MCP server in OpenCode (global config) and the `tu` CLI (`uvx --from tooluniverse tu find/info/run ...`). ~167 skills installed under `~/.agents/skills`. No API keys configured yet; most tools work without them.

## Playwright Browser Lifecycle

When using Playwright browser tools:

1. Always close the browser when the task is finished.
2. Before finishing a task, make sure all Playwright pages/contexts/browsers created during the task are closed.
3. If you created a browser context, close the context before closing the browser.
4. Do not leave Chromium/Chrome processes running after completing the task.
5. If an error occurs, still attempt to clean up the browser in a finally/cleanup step.

## Playwright Cleanup

After completing browser automation, always perform cleanup:
- close the current page if applicable
- close the browser context
- close the browser

Never consider a browser automation task complete until the browser resources have been released.