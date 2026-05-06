# Changelog


### check point

## [4.50] - 2026-05-06 15:45:00

### Changed
- **Enrichr gene source gating**: gene-source radios now auto-enable only when source data exists: **Input Data Matrix** requires a loaded matrix, **Differential results table** requires a non-empty Differential result list, and **SAINT result** requires non-empty SAINT scores. If a selected source becomes unavailable, selection falls back to **Paste genes** automatically ([index.html](index.html), [js/saint_embed.js](js/saint_embed.js)).
- **Enrichr source default**: default selected source is now **Paste genes**. Source availability is refreshed when opening Enrichr, after Differential runs/mode-reset, and after SAINT run/restore.

## [4.49] - 2026-05-06 15:35:05

### Added
- **Enrichr gene source option**: new source **Differential results table (after Differential run)** in Enrichr sidebar. Enrichment now can consume current Differential table labels directly (respecting Differential table order and the sig-only table toggle when enabled) ([index.html](index.html), [js/saint_embed.js](js/saint_embed.js)).

### Changed
- Enrichr run status messages now clearly state which source was sent (Pasted / Matrix row labels / Differential results table / SAINT preys) and gene/label count, so users can verify input provenance before interpreting enrichment output.

## [4.48] - 2026-05-06 15:01:45

### Changed
- **Table viewport height increased**: raised shared DataTables scroll-shell defaults (from 460px to 560px) and reduced matrix-preview overhead in dynamic height calculation, so table panels display more rows by default (roughly +20% vertical room in typical layouts) ([js/table_display.js](js/table_display.js)).

## [4.47] - 2026-05-06 14:57:57

### Changed
- **Differential results-table toolbar**: right-aligned the **Export CSV** button while keeping the significant-only checkbox on the left (`margin-left: auto` on the button) ([index.html](index.html)).

## [4.46] - 2026-05-06 14:55:02

### Added
- **Differential → Results table**: added checkbox **Showing only Significant Changed** (left of Export CSV). When checked, table view shows only rows whose `sig` is not `NS` (two-group: `Up`/`Down`; ANOVA: `Strong`/`Sig only`) ([index.html](index.html)).

### Changed
- Session UI state now includes `diffShowSigOnly` so this table filter toggle is restored on session import.

## [4.45] - 2026-05-06 14:46:44

### Added
- **Data PreProcess → Row Filter (Passed) table**: ID cells now support UniProt links (same token logic as Differential/Annotations), via new `TableDisplay.renderMatrixPreview` option `getIdLink` ([index.html](index.html), [js/table_display.js](js/table_display.js)).

## [4.44] - 2026-05-06 14:44:36

### Added
- **Data PreProcess → Annotations table**: first column (`Row ID (plot)`) now links to UniProt when row annotations contain `Protein.Names` or `Protein.Group` tokens (same token rule as Differential). Applied to both **Passed** and **Filtered** annotation panels ([index.html](index.html)).

## [4.43] - 2026-05-06 13:33:58

### Added
- **Differential results table**: first column (**Feature**) now opens UniProt in a new tab when URL is resolvable (same key logic as volcano: `Protein.Names` first token, fallback first `Protein.Group` token). Link text remains the current feature label selected by user ([index.html](index.html)).

## [4.42] - 2026-05-06 13:30:55

### Fixed
- **UniProt URL key extraction (Differential volcano)**: URL now uses the exact **first `;`-separated token** from `Protein.Names`, with fallback to first token from `Protein.Group`, and appends trailing slash (`/`). This matches expected examples like `.../1433B_HUMAN/` or `.../P31946/` ([index.html](index.html)).

## [4.41] - 2026-05-06 13:25:43

### Fixed
- **Volcano UniProt interaction**: replaced hover-label `<a>` clicks (hard to click because Plotly hover follows mouse) with reliable **point-click to open UniProt** behavior via `plotly_click` and per-point `customdata` URL. Hover now shows URL + hint text instead of a moving hyperlink ([index.html](index.html)).

## [4.40] - 2026-05-06 13:22:17

### Added
- **Differential volcano hover**: added clickable **UniProt** link (`Open UniProt`) per feature, using `Protein.Names` first and falling back to the first element of `Protein.Group` to build `https://www.uniprot.org/uniprotkb/<accession>` ([index.html](index.html)).

## [4.39] - 2026-05-06 13:03:02

### Changed
- **Document tab (Differential section)**: added explicit in-app explanation for two-group results-table columns **`t`** and **`df`** (definition, interpretation, and Student vs Welch df behavior) ([index.html](index.html)).

## [4.38] - 2026-05-06 12:56:28

### Fixed
- **Differential volcano Y-axis mode switching**: `onDiffMtcMethodChange()` now syncs both directions — **BH ⇒ −log10(FDR)** and **None/Bonferroni ⇒ −log10(p)**. This fixes the bug where the volcano stayed on FDR scale regardless of selected multiple-testing mode ([index.html](index.html)).

## [4.37] - 2026-05-06 12:50:05

### Changed
- **Differential fold-change UI simplified**: removed the redundant checkbox **Use fold change cutoff instead**. `|log2FC| cutoff` and `Fold change cutoff (linear)` now stay synchronized and always represent the same threshold; no override mode is required ([index.html](index.html)).
- **Session UI state cleanup**: dropped deprecated `diffUseFoldChangeCutoff` snapshot field.

## [4.36] - 2026-05-06 12:46:34

### Changed
- **Differential fold-change controls**: `Fold change cutoff (linear)` is now disabled unless **Use fold change cutoff instead** is checked. Added two-way sync between `|log2FC| cutoff` and linear FC value: editing either updates the other immediately (`FC = 2^|log2FC|`, `|log2FC| = log2(FC)`), while override still decides which value is active for classification ([index.html](index.html)).

## [4.35] - 2026-05-06 12:36:28

### Added
- **Differential cutoff UX**: added optional **Fold change cutoff (linear)** directly below `|log2FC| cutoff` with checkbox override. When checked, FC (default **1.5**) is transformed by `log2(FC)` and used as the active effect threshold, replacing manual `|log2FC| cutoff`; the log2 field is disabled while override is active ([index.html](index.html)).

### Changed
- **Differential summary text** now reports fold-change mode explicitly (e.g., `Fold change ≥ 1.5 (|log2FC| ≥ 0.5850)`) when FC override is enabled.
- **Session snapshot UI state** now persists `diffUseFoldChangeCutoff` and `diffFoldChangeThreshold` so imports restore this new cutoff mode.

## [4.34] - 2026-05-06 12:27:02

### Changed
- **Differential cutoff card position**: pinned the cutoff control card (`.diff-cutoff-column`) to the **top-right grid slot** (`grid-column: 2; grid-row: 3`) so it occupies the exact empty area beside the comparison/group section highlighted in your screenshot ([css/main.css](css/main.css)).

## [4.33] - 2026-05-06 12:24:54

### Changed
- **Differential sidebar control placement**: moved **|log2FC| cutoff**, **p-value cutoff**, and **FDR cutoff** into a dedicated right-column card (`.diff-cutoff-column`) so those threshold controls sit in the previously empty right side of the widened two-column layout ([index.html](index.html), [css/main.css](css/main.css)).

## [4.32] - 2026-05-06 12:10:12

### Changed
- **Differential sidebar layout**: widened to approximately **2×** default width and rearranged into a **two-column option grid**. Key blocks (overview text, comparison/group setup, run/status section) stay full-width for readability; other controls flow in two columns. Added responsive fallback to single-column on narrower screens ([index.html](index.html), [css/main.css](css/main.css)).

## [4.31] - 2026-05-06 12:08:04

### Changed
- **Differential cutoff UI**: when **Multiple testing = Benjamini–Hochberg FDR**, the **p-value cutoff** control is now hidden (FDR cutoff remains visible). For non-BH modes, p-value cutoff is shown as before ([index.html](index.html)).

## [4.30] - 2026-05-06 12:05:58

### Fixed
- **Differential Y-axis default/sync with BH**: Volcano Y-axis now defaults to **−log10(FDR)**, and `onDiffAnalysisModeChange()` also enforces BH→FDR synchronization. This covers cases where BH was already selected (no dropdown change event), which previously left the plot on **−log10(p)** ([index.html](index.html)).

## [4.29] - 2026-05-06 12:02:41

### Changed
- **Differential UX (multiple testing)**: selecting **Benjamini–Hochberg FDR** now auto-switches Volcano Y-axis to **−log10(FDR)** and re-renders current outputs immediately, so FDR controls and display stay aligned by default ([index.html](index.html)).

## [4.28] - 2026-05-06 11:59:31

### Fixed
- **Differential significance coloring with BH**: when **Multiple testing = Benjamini–Hochberg FDR**, color classification now uses the **FDR cutoff** (`diffQThreshold`) across volcano/MA/results-table/summary (including fudge-volcano mode), instead of silently following raw-p mode unless Y-axis was manually switched to FDR ([index.html](index.html)).

## [4.27] - 2026-05-06 11:49:49

### Changed
- **Bundled report startup (`data/qc_session.js`)**: after successful auto-restore, landing view is now **Clustering → PCA → 2D Plot** (instead of opening Heatmap), so session-based report opens directly in PCA 2D mode ([index.html](index.html)).

## [4.26] - 2026-05-05 21:20:09

### Changed
- **Branding**: application display name is **Nebula** (document overview, page `<title>`, bundled-session export banner comment). Top bar shows **Nebula** with icon from **`image/Nebula_icon.png`**; favicon / Apple touch icon use the same asset ([index.html](index.html), [css/main.css](css/main.css)).

## [4.25] - 2026-05-05 21:08:21

### Fixed
- **Differential → Fudge factor volcano**: point colors (volcano, MA, results table) now use the **same median-based boundary** as the green curve (−log10(p/FDR) on or above the curve at each |log2FC|), instead of mixing a median curve with **per-feature** SE/df for coloring, which left many grey points visually above the curve ([index.html](index.html)).

## [4.24] - 2026-05-05 20:52:52

### Changed
- **Differential** sidebar: **Run differential analysis** (and run status / summary) moved directly under **Comparison mode** / group controls so the primary action is visible without scrolling past downstream options ([index.html](index.html)). Light separator styling on the run block ([css/main.css](css/main.css)).

## [4.23] - 2026-05-05 20:49:47

### Changed
- **Differential → Results table**: numeric **Bar scale** now defaults to **Column** (per-column maxima) instead of inheriting the generic-table **Row** default ([index.html](index.html)).

## [4.22] - 2026-05-04 14:48:43

### Added
- **Column correlation → Overall correlations**: new mixed matrix plot (`colCorrScatterMatrixMixed`) with **lower-triangle pairwise scatter plots** and **upper-triangle color-coded correlation cells** (single shared colorbar), rendered from the same subset and transform/missing rules as the heatmaps ([index.html](index.html)).

### Changed
- Matrix status line now notes that the mixed matrix view shows the first 10 columns when the selected subset is larger.
- Document section for **Column correlation** updated to describe the new mixed matrix plot.

## [4.21] - 2026-05-04 11:32:43

### Changed
- **Column correlation** inner tabs use existing **`data-filter-inner-tabs-row`** / **`data-filter-inner-tab`** classes (same hierarchy styling as **Data PreProcess → Data Filter** nested tabs), not separate `col-profile-*` tab classes ([index.html](index.html), [css/main.css](css/main.css)).

## [4.20] - 2026-05-04 11:21:24

### Changed
- **Column correlation** inner tabs use the same **`col-profile-subtabs-row` / `col-profile-sub-tab`** markup and shared angled-tab CSS as **Column profile** sample tabs ([index.html](index.html), [css/main.css](css/main.css)); removed bespoke `col-corr-inner-*` rules.

## [4.19] - 2026-05-04 10:35:47

### Added
- **Data QC → Column correlation**: third-level tabs **Overall correlations** (subset correlation + distance heatmaps only) and **Paired correlation** (scatter, QQ, Bland–Altman, r vs column X). **Shared scale** sidebar block (transform, treat 0 as missing, refresh) always visible; pair-only vs matrix-only controls toggle with the inner tab ([index.html](index.html), [css/main.css](css/main.css)).
- **Plotly per-column summary** on **Data QC → Overall** for **all** sample columns (`dataQcOverallSummaryPlot`), with metric select moved to the Overall sidebar (`colCorrSummaryWhat`). `renderDataQcOverallSummaryPlotly` + `colCorrComputePerColumnSummaryValues` in [index.html](index.html); changing shared scale calls `scheduleDataQcOverallDashboardRefresh` via `onColCorrSharedScaleChanged`.

### Changed
- **Data QC → Overall** D3 dashboard ([js/data_qc_overall_dashboard.js](js/data_qc_overall_dashboard.js)): removed redundant **quantified IDs** and **mean vs median** charts (covered by the Plotly summary); kept **box plot** and **total Σ log10(1+I)**. Empty state purges the summary Plotly surface.
- **Document** Overview + §9 Column correlation updated for the new layout.

## [4.18] - 2026-05-03 12:06:14

### Added
- **Data QC → Overall** (first sub-tab, default landing): matrix-wide **D3 v7** dashboard ([js/data_qc_overall_dashboard.js](js/data_qc_overall_dashboard.js), [index.html](index.html), [css/main.css](css/main.css)):
  - Bar chart: **quantified IDs** per sample (finite intensity **> 0**).
  - **Mean vs median** of log10(1 + I) among quantified cells (mean uses all rows; median/box use stratified rows when **> 5000** features).
  - **Box plots** of log10(1 + I) per sample (whiskers from sampled min/max; Q1–Q3 box; median line).
  - **Total Σ log10(1 + I)** per sample as a simple load summary.
  - **Refresh** control; auto-refresh when **Data Filter** UI refreshes while Overall is active (`refreshDataFilterUi` → `scheduleDataQcOverallDashboardRefresh`).
- In-app **Document → Overview** notes the Overall dashboard.

### Note (superseded in v4.19)
- v4.19 replaces the two D3 “ID count” / “mean vs median” panels with the Plotly per-column summary and splits Column correlation into inner tabs as above.

## [4.17] - 2026-05-03 09:58:36

### Added
- **PCA D3 toolbar: reset view** ([index.html](index.html)): third icon (Plotly **home** glyph) resets **2D** zoom/pan to the initial transform and **3D** rotation/zoom to defaults plus the same auto-fit zoom used on first draw (`title` / `aria-label` describe the action).

## [4.16] - 2026-05-03 09:53:23

### Changed
- **PCA D3 export toolbar**: removed the grouped **rectangle** (background, border, shadow) around the PNG/SVG icon buttons; icons sit directly on the plot with per-button hover only ([css/main.css](css/main.css)).

## [4.15] - 2026-05-03 09:51:29

### Changed
- **PCA D3 export controls: icon toolbar** ([index.html](index.html), [css/main.css](css/main.css)): replaced text “Export PNG / Export SVG” with compact **Plotly-style** icon buttons (camera = PNG, download-to-tray = SVG; paths aligned with Plotly.js `ploticon`). Toolbar uses a light modebar-like cluster; `title` / `aria-label` preserve accessibility.

## [4.14] - 2026-05-03 09:43:09

### Changed
- **Default group-annotation palette is Set2** ([index.html](index.html)): added `DEFAULT_DISCRETE_GROUP_COLOR_SCHEME_INDEX` (index **1** = **Set2** in `DISCRETE_GROUP_COLOR_SCHEME_NAMES`). New heatmap group-annotation dropdowns default to Set2 for every meta column; PCA/t-SNE first-column color scheme defaults to Set2 when rebuilding controls; getters and Plotly fallbacks use Set2 when the select is missing. Meta table categorical cell colors now use the Set2 discrete palette (removed per-header hash rotation) so the table matches the clustering plots.

## [4.13] - 2026-05-03 09:35:29

### Fixed
- **PCA 2D (D3): clip plot content to the inner axis area** ([index.html](index.html)): added an SVG `clipPath` matching `innerW` × `innerH` and applied it to the grid, confidence ellipses, markers, leader lines, and labels so zoom/pan no longer draws those elements outside the rectangle bounded by the axes (axis tick labels remain outside the clip in the margins).

## [4.12] - 2026-05-02 15:00:00

### Changed
- **PCA 2D (D3): label placement now uses `ScatterLabelOptimize`** ([index.html](index.html), existing [js/scatter_label_optimize.js](js/scatter_label_optimize.js)):
  - Replaced fixed pixel nudge labels with `repelLabels` / `repelLabelsCompat` so label–label and label–marker overlap is minimized (same engine as Plotly PCA/t-SNE).
  - View-aware bounds from the current zoom transform; label budget uses `computeMaxLabelCount` + `subsampleLabelPoints` like the legacy scatter path.
  - Leader lines (when enabled) now connect marker anchors to the optimized label centers; neutral grey stroke for readability on the warm UI.

## [4.11] - 2026-05-02 14:00:00

### Changed
- **Button hierarchy + accent polish (warm flat theme)** ([css/main.css](css/main.css)):
  - Applied frontend-design guidance: sidebars and Data Filter toolbars use **outlined secondary** buttons; primary taupe remains for main-pane defaults.
  - Heatmap **Generate** uses muted **sage** success tones instead of bright Material green so it matches the shell.
  - Example-load and delete-column actions use **warm amber** and **muted terracotta** danger tokens.
  - Pagination controls: explicit text color and no extra vertical margin vs global `button`.
  - Added `--md-btn-*` tokens for secondary, success, warn, and danger.

## [4.10] - 2026-05-02 12:30:00

### Changed
- **App-wide UI aligned with flat warm “Material-style” top tabs** ([css/main.css](css/main.css)):
  - Added `--md-*` design tokens (surfaces, borders, text, accent taupe, radii, subtle elevation).
  - Replaced purple gradient page background with neutral warm shell; main panel, sidebars, and sub-tab rows use the same surface language.
  - Flat primary buttons (no lift transform / heavy glow); focus and hover use accent and light rings.
  - Table sticky headers, matrix previews, DataTables headers, and related accents use `--md-accent` instead of indigo.
  - Info boxes, pagination strip, plot cards, loading overlay, and Enrichr plot hosts restyled to flat cards with light borders.
  - Document outline chips (`--chrome-tab-*`) retuned to the same warm palette (behavior unchanged).

## [4.09] - 2026-05-02 12:00:00

### Changed
- **Top-level tabs: slightly smaller height and smaller top-left wedge** ([css/main.css](css/main.css)):
  - Reduced `--top-tab-min-h` (48px) and tab padding; lowered `.tabs-row` and `.tabs` vertical padding to save header space.
  - Tightened diagonal fill by moving gradient stops to `27%` / `29%` so the transparent wedge is a bit smaller while labels stay mostly over solid fill.

## [4.08] - 2026-05-01 15:28:00

### Changed
- **Top-level tab fill covers labels (css_test style)** ([css/main.css](css/main.css)):
  - Increased minimum tab height and asymmetric padding (extra left + bottom) so uppercase labels sit inside the solid gradient instead of the transparent wedge.
  - Moved gradient color stops earlier (`22%` / `24%`) so more of the tab face is filled.
  - Synced wedge pseudo-element height with `--top-tab-min-h`; raised `.tabs-row` min-height slightly for the taller tabs.

## [4.07] - 2026-05-01 15:25:00

### Changed
- **Migrated css_test top-tab style to top-level tabs only** ([css/main.css](css/main.css)):
  - Replaced `.tabs .tab` top-level styling with the `css_test.html` style logic (diagonal fill, warm active/inactive palette, and right-edge wedge shadow accent).
  - Scoped changes to top-level tab selectors only; sub-tab levels (L2/L3/L4) are unchanged.
  - Preserved existing app behavior and tab hierarchy; this is a visual-only migration for top-level tabs.

## [4.06] - 2026-05-01 13:24:00

### Changed
- **Active-tab hover now lightens text across all levels** ([css/main.css](css/main.css)):
  - Added shared token `--angled-tab-text-active-hover` for consistent active-hover text behavior.
  - Top-level and all sub-tab levels now shift active text to a slightly lighter tone on hover.
  - Kept existing sizing, gradients, and tab geometry unchanged.

## [4.05] - 2026-05-01 13:20:00

### Changed
- **Removed remaining L3 legacy color override so all sub-tabs match top-level scheme** ([css/main.css](css/main.css)):
  - Updated the late `data-filter-inner-tab` style block to stop reintroducing `thirdtab` blue/purple colors.
  - Kept only compact level-3 sizing in that late block, while color/shape now consistently follows the shared angled-tab palette.
  - This also aligns nested Row/Column and Passed/Filtered/Summary tabs with the same visual theme used by top and level-2 tabs.

## [4.04] - 2026-05-01 13:17:00

### Changed
- **Unified all sub-tab levels to top-level color scheme** ([css/main.css](css/main.css)):
  - Level-2, level-3, and level-4 tabs now use the same top-level angled-tab text and gradient tokens.
  - Level-2 sub-tab row underline now uses the same neutral active-border tone already used by level-3/4.
  - Kept the existing per-level size hierarchy (smaller tabs at deeper levels) unchanged.

## [4.03] - 2026-05-01 12:39:00

### Changed
- **Improved 3rd/4th tab readability and color consistency** ([css/main.css](css/main.css)):
  - Softened level-3 and level-4 inactive tab text color to reduce glare and improve readability.
  - Replaced level-3 and level-4 tab-row underline colors with the shared angled-tab border tone to remove remaining blue mismatch.
  - Kept the same angled geometry/shadow system while aligning text/line colors with the unified neutral theme.

## [4.02] - 2026-05-01 12:35:00

### Changed
- **Unified tab color theme and gradients across all levels** ([css/main.css](css/main.css)):
  - Introduced shared angled-tab palette tokens and applied them to top-, second-, third-, and fourth-level tabs.
  - All levels now use the same neutral gradient family for inactive/active states with consistent border tones.
  - Kept level-specific layout/hierarchy while standardizing color language.

## [4.01] - 2026-05-01 12:33:00

### Changed
- **Improved second-level tab text contrast** ([css/main.css](css/main.css)):
  - Updated level-2 tab font colors to use darker `subtab` text tokens for inactive/hover states.
  - Kept active level-2 tabs white text for strong contrast on active background.

## [4.00] - 2026-05-01 12:29:00

### Changed
- **Applied angled/shadowed tab style across all tab levels** ([css/main.css](css/main.css)):
  - Extended the top-level parallelogram/seam-shadow look to second-, third-, and fourth-level tab buttons.
  - Preserved each level's existing color tokens (`subtab`, `thirdtab`, `fourthtab`) while unifying geometry and depth treatment.
  - Kept scope to tab chrome only (behavior/wiring unchanged).

## [3.99] - 2026-05-01 12:27:00

### Changed
- **Top-level angled tabs now include stronger seam shadows and active-depth emphasis** ([css/main.css](css/main.css)):
  - Added inter-tab shadow seams (`::after`) to mimic the layered overlap look in the reference.
  - Increased active tab depth with a larger drop shadow and stronger seam shadow than inactive tabs.
  - Kept the current top-level geometry while improving the visual 3D separation between tabs.

## [3.98] - 2026-05-01 12:22:00

### Changed
- **Top-level angled tab style tuned closer to reference appearance** ([css/main.css](css/main.css)):
  - Increased skew angle and spacing rhythm for stronger parallelogram geometry.
  - Refined neutral palette, hover contrast, and active-tab emphasis to better match the target style.
  - Kept this scoped to top-level tabs only for iterative visual review.

## [3.97] - 2026-05-01 12:19:00

### Changed
- **Top-level tabs restyled to angled/parallelogram theme** ([css/main.css](css/main.css)):
  - Applied skewed tab geometry and overlapping tab rhythm inspired by the provided CodePen reference.
  - Updated inactive/active palette to a warm neutral scheme (`taupe` inactive, `light ivory` active).
  - Kept scope limited to top-level tabs only so sub-tab hierarchy remains unchanged for evaluation.

## [3.96] - 2026-05-01 12:11:00

### Changed
- **PCA plot width input now correctly honors explicit values** ([index.html](index.html)):
  - Fixed width sizing logic so manual `Plot Width (px)` is applied directly.
  - Kept auto-fill behavior when width input is left empty.

## [3.95] - 2026-05-01 12:07:00

### Changed
- **Restored PCA sidebar label/arrow controls for D3 plots** ([index.html](index.html)):
  - Rewired `Label color` and `Auto label font/color` to D3 label rendering (2D + 3D).
  - Rewired `Auto show arrows` and `Show arrows (manual)` to D3 leader-line rendering from points to labels.
  - Label styling now adapts to label count in auto mode and obeys manual values when auto is off.

## [3.94] - 2026-05-01 11:58:00

### Changed
- **Added PCA export controls (PNG + SVG) for both 2D and 3D views** ([index.html](index.html)):
  - Added `Export PNG` and `Export SVG` buttons overlayed in each PCA plot container.
  - SVG export uses direct serialized SVG output.
  - PNG export rasterizes the current SVG view onto a white canvas and downloads a PNG.

## [3.93] - 2026-05-01 11:33:00

### Changed
- **Removed PCA 3D zoom-in upper limit** ([index.html](index.html)):
  - Mouse-wheel zoom for PCA 3D no longer has a hard maximum cap.
  - Kept the minimum zoom guard to prevent collapsing too far out.

## [3.92] - 2026-05-01 11:31:00

### Changed
- **Rolled back PCA legend spacing to last known-good layout** ([index.html](index.html)):
  - Restored legend list start and first-row baseline offsets to the prior working values.
  - This reverts recent experimental spacing logic that reintroduced overlap in your environment.

## [3.91] - 2026-05-01 11:27:00

### Changed
- **PCA legend now uses a fixed hard header band to prevent overlap** ([index.html](index.html)):
  - Replaced adaptive title-based list-start with a fixed legend-list start (`listTop = 64`).
  - Ensures first legend row always renders below the header zone across browser/font/DPI variations.

## [3.90] - 2026-05-01 11:25:00

### Changed
- **PCA legend overlap guard now accounts for marker glyph height** ([index.html](index.html)):
  - Updated dynamic list-top calculation to include marker-radius padding, not just title text bounds.
  - Added a stronger minimum top offset so first legend marker/text cannot intrude into the `Groups` header line.

## [3.89] - 2026-05-01 11:22:00

### Changed
- **PCA legend top spacing now uses measured SVG title bounds** ([index.html](index.html)):
  - Replaced fixed `listTop` spacing with dynamic calculation from `Groups` title `getBBox()` plus padding.
  - Keeps spacing tight while guaranteeing no overlap across browser/DPI/font rendering differences.
  - Reduced extra first-row offset after moving to measured top spacing.

## [3.88] - 2026-05-01 11:18:00

### Changed
- **PCA legend top padding increased aggressively to remove title overlap** ([index.html](index.html)):
  - Raised legend-list start offset substantially.
  - Pushed first legend-row baseline further downward.
  - Ensures title and first legend item remain visually separated across rendering differences.

## [3.87] - 2026-05-01 11:14:00

### Changed
- **PCA legend title/item spacing increased to eliminate residual overlap** ([index.html](index.html)):
  - Increased fixed top offset before legend items start.
  - Slightly lowered first legend-row baseline.
  - Keeps control-row layout (horizontal buttons below list) unchanged.

## [3.86] - 2026-05-01 10:52:00

### Changed
- **PCA legend controls moved below legend list (horizontal layout)** ([index.html](index.html)):
  - Repositioned `Collapse` and `Reset` buttons beneath the legend items area.
  - Arranged controls horizontally on one row to avoid title/item overlap.
  - Recomputed legend viewport height so list and controls have separate dedicated regions.

## [3.85] - 2026-05-01 10:45:00

### Changed
- **PCA legend header spacing refined for cleaner layout** ([index.html](index.html)):
  - Moved `Collapse` / `Reset` controls to a dedicated row beneath the `Groups` title.
  - Increased spacing before legend entries to reduce visual crowding.
  - Applies consistently to both PCA 2D and 3D legends.

## [3.84] - 2026-05-01 10:39:00

### Changed
- **PCA legend header/list layout hard-separated to eliminate overlap** ([index.html](index.html)):
  - Repositioned `Groups`, `Collapse`, and `Reset` into a dedicated header band.
  - Moved legend list viewport start lower (`listTop`) and reduced overlap risk with header controls.
  - Applies to both PCA 2D and 3D legends.

## [3.83] - 2026-05-01 10:26:00

### Changed
- **PCA legend vertical offset adjusted to avoid overlap with header controls** ([index.html](index.html)):
  - Moved PCA legend block slightly downward in both 2D and 3D views.
  - Prevents visual collision between `Groups` title / buttons and top-edge plot text.

## [3.82] - 2026-05-01 10:20:00

### Changed
- **PCA 3D initial view now auto-fits to avoid tiny startup cloud** ([index.html](index.html)):
  - Added first-render auto-fit zoom based on projected 3D point extents and panel dimensions.
  - Added PCA 3D view signature reset (PC axis selection / point set changes) to recompute a sensible initial camera.
  - Manual drag/zoom interaction now locks the camera (`userAdjusted`) so subsequent redraws preserve user view instead of re-autofitting.

## [3.81] - 2026-05-01 10:15:00

### Changed
- **PCA legend hover-highlighting added (2D + 3D)** ([index.html](index.html)):
  - Hovering a legend entry now temporarily emphasizes that group in the plot and de-emphasizes others.
  - Highlighting adjusts marker opacity/size and focuses labels on the hovered group for easier visual tracing.
  - Works alongside existing click-hide/show, double-click isolate, reset, collapse, and scrolling legend behaviors.

## [3.80] - 2026-05-01 10:08:00

### Changed
- **PCA legend now supports interactive group filtering** ([index.html](index.html)):
  - Click legend rows to hide/show groups directly in PCA 2D and 3D D3 plots.
  - Double-click a legend row to isolate that group (double-click again to restore all).
  - Added a legend **Reset** control to quickly restore all groups.
  - Hidden groups are visually marked (dimmed + strike-through), and filtering state persists per PCA view until changed.

## [3.79] - 2026-05-01 09:43:00

### Changed
- **PCA legends now support collapse/expand and scrolling** ([index.html](index.html)):
  - Added a legend toggle button (**Collapse/Expand**) in both PCA 2D and PCA 3D D3 plots.
  - Large legends now render in a clipped scrollable viewport with mouse-wheel scrolling and a scrollbar thumb.
  - Keeps all legend entries accessible while preserving maximum usable plot width.

## [3.78] - 2026-05-01 09:40:00

### Changed
- **PCA legend lane now auto-sizes by legend text width** ([index.html](index.html)):
  - Added dynamic right-lane sizing for both D3 PCA 2D and 3D legends.
  - Legend width now adapts to the longest visible legend label with bounded min/max limits.
  - Plot area expands when labels are short, while long labels get enough room without clipping.

## [3.77] - 2026-05-01 09:37:00

### Changed
- **PCA 2D/3D plots now use full right-panel width by default** ([index.html](index.html), [css/main.css](css/main.css)):
  - PCA width control now defaults to **Auto (fill panel width)**.
  - D3 canvas sizing now prioritizes the visible panel width so the plot expands to the full available area.
  - Explicit `width: 100%` applied to PCA plot containers, while keeping the right-side legend lane intact.

## [3.76] - 2026-05-01 09:19:00

### Changed
- **PCA upgraded to D3 with nested 2D/3D visualization tabs** ([index.html](index.html), [css/main.css](css/main.css)):
  - Added a third-level tab row inside **Clustering → PCA** with **2D Plot** and **3D Plot** views.
  - Replaced PCA Plotly rendering with D3-based interactive rendering for both views.
  - **2D D3 PCA** now includes zoom/pan, group-aware symbols/colors, optional confidence ellipses, labels, tooltips, and legends.
  - **3D D3 PCA** adds drag-to-rotate and wheel-to-zoom camera controls, projected axis guides, group styling, labels, and metadata tooltips.
  - Added `PC Z-axis` selector for 3D mapping and PCA re-render wiring for nested-tab and clustering-tab switches.

## [3.75] - 2026-04-30 16:19:00

### Changed
- **Meta table grouping colors now use heatmap-style discrete palettes** ([index.html](index.html)):
  - Replaced light pastel HSL fills with the same stronger categorical palette family used for heatmap group legends.
  - Group values are mapped consistently per metadata column and value set, producing clearer visual separation.
  - Added adaptive dark/light text color on colored cells to keep labels readable on high-saturation backgrounds.

## [3.74] - 2026-04-30 16:13:00

### Changed
- **Meta table cells now auto-color by grouping value** ([index.html](index.html)):
  - In **Data PreProcess → Meta Table**, non-`Sample_ID` cells now receive consistent pastel colors based on each column/value group.
  - Coloring is stable (same value keeps the same color), updates after full table render (sync/async), and refreshes when cell edits are applied.
  - Empty cells keep default styling; multi-cell selection highlighting still takes priority.

## [3.73] - 2026-04-30 16:01:48

### Changed
- **Moved `UpSet / Venn / K-map` under `Data QC`** ([index.html](index.html)):
  - Removed top-level **UpSet / Venn / K-map** tab button.
  - Added **UpSet / Venn / K-map** as a second-level sub-tab under **Data QC**.
  - Extended `Data QC` panel mounting/sub-tab logic to include `#upsetTab`.
  - Kept backward compatibility: existing internal `switchTab('upset')` routes now open **Data QC** → **UpSet / Venn / K-map**.

## [3.72] - 2026-04-30 15:55:37

### Changed
- **New top-level `Clustering` tab with migrated clustering sub-tabs** ([index.html](index.html), [css/main.css](css/main.css)):
  - Added top-level **Clustering** tab.
  - Moved **Heatmap**, **Clustergrammer**, **PCA**, and **t-SNE** under **Clustering** as second-level tabs.
  - Added `switchClusteringSubTab()` and `ensureClusteringPanelsMounted()` to reuse existing panel implementations without duplication.
  - Kept backward compatibility: existing internal calls to `switchTab('heatmap'|'clustergrammer'|'pca'|'tsne')` now route to **Clustering** and open the matching sub-tab.

## [3.71] - 2026-04-30 15:44:21

### Changed
- **New top-level `Data QC` tab with migrated QC sub-tabs** ([index.html](index.html), [css/main.css](css/main.css)):
  - Added top-level **Data QC** tab.
  - Moved **Row Profile**, **Column profile**, and **Column Correlation** from **Data PreProcess** sub-tabs into **Data QC** sub-tabs.
  - Added `switchDataQcSubTab()` and panel host mounting logic (`ensureDataQcPanelsMounted()`) to reuse existing panel implementations without duplicating content.
  - Updated navigation helpers so row-profile auto-open flows route to **Data QC**.

## [3.70] - 2026-04-30 15:33:28

### Changed
- **Data PreProcess sub-tab label simplified** ([index.html](index.html)):
  - Renamed the sub-tab title from **DIANN annotations** to **Annotations**.
  - Internal tab id/action (`diannAnnotations`) remains unchanged.

## [3.69] - 2026-04-30 15:18:31

### Changed
- **Unified tab-level color gradient (L1→L4, same hue family)** ([css/main.css](css/main.css)):
  - Reworked tab color tokens so top-level, second-level, third-level, and fourth-level tabs follow one indigo gradient system.
  - Added dedicated `--fourthtab-*` tokens and applied them to the deepest nested tab set (Enrichr plot-type tabs).
  - Kept the rounded geometry across all levels; only color progression/hierarchy was adjusted.

## [3.68] - 2026-04-30 15:14:35

### Changed
- **Third-level tab bars now match rounded tab style** ([css/main.css](css/main.css)):
  - Applied the same rounded raised tab geometry to third-level tabs used in Data Filter inner panels and Enrichr plot-type selector tabs.
  - Added a distinct purple third-level palette (`--thirdtab-*` variables) to preserve visual hierarchy from top-level and second-level tabs.
  - Updated active/hover borders, gradients, and shadows for the third-level tab rows.

## [3.67] - 2026-04-30 15:11:02

### Changed
- **Sub-tab bars now use rounded top-tab style (with distinct colors)** ([css/main.css](css/main.css)):
  - Applied the same rounded, raised geometry used by top-level tabs to sub-tabs (`heatmap/table/diff/saint/enrichr/column-profile`).
  - Added a separate teal-based sub-tab palette (`--subtab-*` variables) so sub-tabs match style but remain visually distinct from top-level navigation.
  - Updated sub-tab row baseline/borders and hover/active shadows to the new style.

## [3.66] - 2026-04-30 15:07:25

### Changed
- **Moved inline CSS out of index.html** ([index.html](index.html), [css/main.css](css/main.css)):
  - Extracted the full <style> block from index.html into new stylesheet file css/main.css.
  - Added stylesheet link in <head> to load css/main.css.
  - Keeps existing UI behavior while separating structure and styling for maintainability.

## [3.65] - 2026-04-30 13:53:54

### Changed
- **Main top tabs restyled (rounded CodePen-like look)** ([index.html](index.html)):
  - Updated .tabs-row and .tabs .tab to a rounded raised style (white inactive tabs, dark active tab, stronger bottom rule).
  - Kept behavior and tab wiring unchanged; this is a visual style update for the top navigation only.

## [3.64] - 2026-04-30 13:46:37

### Changed
- **Column Filter right column is a true vertical stack** ([index.html](index.html)):
  - Wrapped **Pattern select**, **Choose by groups**, **Valid values**, and status into `.column-filter-right-column` with `display:flex; flex-direction:column; gap:12px`.
  - Outer sidebar remains a two-column grid: **Column Select** left; the wrapper occupies the entire right column so sections follow **Pattern select** downward.
  - Updated section accent selectors to target cards inside the wrapper.

## [3.63] - 2026-04-30 13:43:00

### Changed
- **Column Filter card height in two-column grid** ([index.html](index.html)):
  - Set `align-items: start` on `#dataFilterColumnSidebar` so shorter sections (for example **Pattern select**) no longer stretch vertically to match the tall **Column Select** row.

## [3.62] - 2026-04-30 13:34:12

### Changed
- **Column Filter grid display fix in tab switch logic** ([index.html](index.html)):
  - `switchDataFilterPanel` now shows `#dataFilterColumnSidebar` with `display: grid` (instead of `flex`) in both function definitions.
  - This prevents JS from overriding the intended two-column CSS grid layout when opening the Column Filter panel.

## [3.61] - 2026-04-30 13:31:08

### Changed
- **Column Filter responsive breakpoint adjusted** ([index.html](index.html)):
  - Reduced the single-column fallback breakpoint from `1650px` to `1200px` so normal desktop widths keep the intended two-column Column Filter sidebar layout.

## [3.60] - 2026-04-30 13:28:37

### Changed
- **Column Filter fixed two-column placement** ([index.html](index.html)):
  - Pinned `Column Select` to the left column.
  - Pinned all remaining Column Filter sections (Pattern select, Choose by groups, Valid values, Status) to the right column in vertical order.
  - Kept responsive fallback to single-column on narrower workspace widths.

## [3.59] - 2026-04-30 13:25:06

### Changed
- **Column Filter card sizing in two-column sidebar** ([index.html](index.html)):
  - Kept the two-column sidebar layout, but removed the full-width spanning behavior from `Column Select`.
  - All Column Filter sections now render as single-column-width cards within the two-column grid.

## [3.58] - 2026-04-30 13:21:56

### Changed
- **Column Filter sidebar wider + two-column layout** ([index.html](index.html)):
  - Column Filter sidebar width increased to roughly 2x (`620px`, with `520–760px` bounds).
  - Sidebar cards now render in a two-column grid for denser controls.
  - `Column Select` card spans both columns to preserve a readable full column checklist area.
  - Added responsive fallback: at narrower workspace widths, Column Filter returns to a single-column sidebar layout.

## [3.57] - 2026-04-30 13:19:26

### Changed
- **Column Select keeps unchecked items visible** ([index.html](index.html)):
  - Column checkbox list now renders from the full original filter baseline column header set (not only currently kept columns), so unchecked/removed samples remain listed for manual re-check.
  - Checkbox checked state mirrors the currently active matrix columns; list membership remains stable.
  - Column subset apply now reads checked column names from checkbox metadata, keeping name-based subset operations aligned with the stable full list.
  - Group selection mapping now uses the same full header set, so group toggles can re-check columns that are currently unchecked.

## [3.56] - 2026-04-30 12:12:04

### Changed
- **Column Filter → Column Select always prominent** ([index.html](index.html)):
  - **Pattern select** moved out of the Column Select card into its own framed sidebar section.
  - Column Select card now contains only the manual checkbox list (plus Select all / Clear all), short hint text, and tooltips clarifying that pattern, groups, and valid-values tools update the same checkboxes.
  - Checkbox list container uses a larger scroll region (`min-height` + `max-height: min(58vh, 620px)`) so sample columns stay easy to reach.
  - Section accent colors for the Column Filter sidebar now use `nth-child(2)…(6)` so the extra Pattern card keeps correct styling.

## [3.55] - 2026-04-30 12:05:02

### Changed
- **Row Filter sidebar visual grouping** ([index.html](index.html)):
  - Applied the same framed/circled section-card style to **Data Filter → Row Filter** sidebar blocks, matching the new Column Filter section styling.

## [3.54] - 2026-04-30 12:02:40

### Changed
- **Column Filter sidebar visual grouping** ([index.html](index.html)):
  - Added framed, color-accented section cards for each functional block in the Column Filter sidebar, matching the “circled functional sections” style used in Data Preparation upload cards.

## [3.53] - 2026-04-30 11:52:50

### Changed
- **Choose by groups uses checkboxes** ([index.html](index.html)):
  - Replaced per-group **Check / Uncheck** buttons with a single checkbox in each group row.
  - Group checkbox reflects current all-selected state for that group and still triggers instant column-filter apply on change.

## [3.52] - 2026-04-30 11:49:48

### Changed
- **Column Filter now applies selection instantly** ([index.html](index.html)):
  - Removed manual action buttons **Apply: keep selected columns** and **Remove all-zero columns** from Column Filter sidebar.
  - Column selection operations now auto-apply to results panel immediately (checkbox change, select all/clear all, pattern select/unselect, group check/uncheck), with a short debounce.
  - Column subset operation now tracks selected columns by **name** (not transient index), ensuring consistent instant-apply behavior against the original baseline matrix.

## [3.51] - 2026-04-30 11:42:40

### Changed
- **Column Filter Summary list columns now stretch full panel height** ([index.html](index.html)):
  - Kept/filtered column list columns are now flex-stretched to occupy available Summary panel height.
  - Each list has independent vertical scrolling within its full-height column.

## [3.50] - 2026-04-30 11:39:27

### Changed
- **Column Filter Summary streamlined further** ([index.html](index.html)):
  - Removed the Column Filter summary figure entirely.
  - Kept/filtered column names are now shown in a two-column list layout for easier side-by-side review.

## [3.49] - 2026-04-30 11:36:08

### Changed
- **Column Filter result view simplified to summary-only** ([index.html](index.html)):
  - Removed Column Filter result sub-tabs (**Passed** / **Filtered out**).
  - Summary now lists **passed (kept)** and **filtered-out** column names directly as plain scrollable lists (instead of table panels).
  - Column count summary chart remains in the same Summary panel.

## [3.48] - 2026-04-30 11:29:26

### Fixed
- **Column Filter column list visibility** ([index.html](index.html)):
  - Restored the manual column checkbox table under **Column Select** (`#columnFilterCheckboxList`) so all available columns are visible for per-column select/deselect.
  - Keeps the previous removal of the old **Filter by column name** search input.

## [3.47] - 2026-04-30 11:25:51

### Changed
- **Column Filter sidebar cleanup** ([index.html](index.html)):
  - Removed the **“Filter by column name”** search option from **Data PreProcess → Data Filter → Column Filter**.
  - Column selection now starts directly with **Select all / Clear all** and the column checkbox list.

## [3.46] - 2026-04-30 10:57:16

### Changed
- **Row Filter annotation keyword tool is now Row ID-only** ([index.html](index.html)):
  - Renamed UI block to **Row ID filter**.
  - Removed annotation source selector from Row Filter sidebar.
  - Row keyword filter action now always targets row IDs; status/summary labels updated accordingly.
  - Dedicated annotation-based filtering remains in **DIANN annotations** sub-tab.

## [3.45] - 2026-04-30 10:51:31

### Changed
- **CV-only variability filter** ([index.html](index.html)):
  - Removed the SD option from Row Filter variability settings; filter now uses **CV (SD/mean)** only.
  - Updated default CV threshold from `1` to **`0.2`** (20% relative variability).
  - Added concise tooltips on CV filter controls (section title, threshold label/input, apply button).
  - Summary variability histogram is now explicitly documented/labeled as CV-based.

## [3.44] - 2026-04-30 10:44:59

### Changed
- **Row variability filter adds CV mode** ([index.html](index.html)):
  - Added metric selector in Row Filter sidebar: **CV (SD/mean)** or **SD** (CV default).
  - Variability filter execution now respects selected metric and threshold.
  - Row variability summary histogram now follows the selected metric and updates axis/title labels accordingly.

## [3.43] - 2026-04-30 10:37:42

### Changed
- **Row SD comparison chart type** ([index.html](index.html)): switched Row Filter Summary SD distribution from **violin** to **overlay histogram** (Before/After) with shared bin count and right-side legend.

## [3.42] - 2026-04-30 10:34:43

### Added
- **Row SD distribution comparison in Row Filter Summary** ([index.html](index.html)):
  - New dedicated figure: **before vs after row SD distribution** (violin + box + meanline).
  - Uses the same SD convention as SD filter execution (finite positive values only, `>0`).
  - Included right-side legend and fluid-width sizing behavior consistent with other summary figures.

## [3.41] - 2026-04-30 10:30:27

### Fixed
- **SD row filter reliability** ([index.html](index.html)):
  - Fixed threshold parsing so user-entered `0` is respected (removed `|| 1` fallback bug in both UI and operation execution paths).
  - SD now computes on finite **positive** values only (`>0`), treating `0` as missing/placeholder consistent with row-quality filtering semantics.

## [3.40] - 2026-04-30 10:28:07

### Changed
- **Row Filter Summary legend placement** ([index.html](index.html)): moved the **counts+sparsity** figure legend to the **right side** (vertical) with expanded right margin, matching the completeness/intensity figures.

## [3.39] - 2026-04-30 10:26:08

### Fixed
- **Row Filter Summary width when opening Summary tab** ([index.html](index.html)):
  - Plot width measurement now prefers the visible parent container width (not only the plot div’s stale width).
  - Switching to **Summary** now triggers an immediate and delayed re-render + Plotly resize so charts fill the available panel width after tab visibility changes.

## [3.38] - 2026-04-30 10:23:50

### Fixed
- **Row Filter summary charts fluid width + right-side legend** ([index.html](index.html)):
  - Completeness and intensity charts now compute width directly from their container on each render (true tab-fluid behavior).
  - Legends moved to the **right side** (`orientation: 'v'`) with expanded right margins to avoid overlap.

## [3.37] - 2026-04-30 10:20:47

### Fixed
- **Row Filter summary figure layout** ([index.html](index.html)):
  - Per-column completeness and intensity figures now use **full available tab width** (`width:100%`, `autosize`, responsive Plotly rendering).
  - Legends are anchored above the plotting area with extra top/bottom margins, preventing overlap with x-axis labels.

## [3.36] - 2026-04-30 10:12:18

### Changed
- **Row Filter summary now compares each column explicitly** ([index.html](index.html)):
  - **Per-column completeness** is now plotted as grouped bars for **every column** (`Before` vs `After`), instead of combined distribution.
  - **Per-column intensity distribution** is now shown in a **separate figure** using grouped box plots per column (`log10` non-zero intensity values), instead of combined pooled distributions.
  - The existing count/sparsity panel remains separate as the top summary figure.

## [3.35] - 2026-04-30 10:06:19

### Changed
- **Data Filter → Row Filter → Summary** ([index.html](index.html)): upgraded from a simple row-count bar to a richer before/after quality dashboard.
  - Added **row sparsity comparison** (violin + box + meanline; sparsity = `1 - nonzero_fraction` per row).
  - Added **column completeness distribution** (box; per-column non-missing percent before/after).
  - Added **column intensity distribution** (box; sampled per-column `log10(intensity>0)` values before/after).
  - Added summary-card statistics for **mean/median row sparsity** and number of filtered rows.

## [3.34] - 2026-04-30 09:49:19

### Fixed
- **Row filters now always start from original loaded table** ([index.html](index.html)): both **Data PreProcess → Data Filter** and **Data PreProcess → DIANN annotations** use a captured immutable snapshot from data load/session restore, so repeated parameter changes are re-evaluated from the full original matrix instead of cumulatively filtering the previous **Passed** result.
- **Data Filter apply behavior** now runs the latest operation as a fresh single-step evaluation from the original snapshot (history still records the current step), matching exploratory tuning workflows.

## [3.33] - 2026-04-29 17:01:52

### Added
- **Data PreProcess → DIANN annotations**: **sidebar filters** (numeric bounds for **N.Sequences** / **N.Proteotypic.Sequences** via header matching; **keyword** on other annotation columns with **Contains** or **Regex**), **Apply to matrix** / **Clear criteria**, inner tabs **Passed** / **Filtered out** (local snapshot of dropped annotation rows), and integration with **`commitRowFilterToState`** (`source: diannAnnotationSidebar`) so only passing rows remain in **`currentData`** / **`currentDataMatrix`**. **Data Filter → Filtered out** summary labels now cover DIANN sidebar, global min-valid, and row-ID include sources.

## [3.32] - 2026-04-29 15:45:00

### Changed
- **DIANN annotations tab** ([index.html](index.html)): removed the explanatory note above the preview table. **Bar scale** for the annotation preview table now defaults to **Column** (`barScaleMode: 'column'`).

## [3.31] - 2026-04-29 15:35:00

### Fixed
- **TableDisplay.destroy clears empty-state markup** ([js/table_display.js](js/table_display.js)): after tearing down DataTables and known roots, remaining children (e.g. plain **No filtered-out rows…** `<p>`) are removed so a later render does not leave the old message stacked above the new table (Row Filter **Filtered out** tab).

## [3.30] - 2026-04-29 15:22:00

### Fixed
- **Filtered-out generic tables now hard-enforce sticky header cells at render/draw time** ([js/table_display.js](js/table_display.js)): beyond class-based sticky CSS, generic `TableDisplay` now applies sticky header positioning/colors directly on `thead th` after DataTables layout and on redraw, preventing non-frozen headers in some panel/container combinations.
- **Inline JS entity typo in Differential control** ([index.html](index.html)): replaced `&amp;&amp;` with `&&` in `diffMultiTestType` `onchange` handler to avoid script parsing/lint errors.

## [3.29] - 2026-04-29 15:22:00

### Fixed
- **Generic tables now expose Bar scale control** ([js/table_display.js](js/table_display.js)): added shared **Bar scale** selector (`Column / Row / Table`) to `renderGenericTable` when numeric bars are enabled, with immediate redraw on mode switch.
- **Frozen headers enforced for non-Passed tables using matrix shell classes** ([js/table_display.js](js/table_display.js), [index.html](index.html)): generic DataTables now install the same scroll-shell class pattern as Passed (`.qc-dt-matrix-scrollbox`/row class), and global sticky-header selectors apply this style outside `#tablePreview` too.

## [3.28] - 2026-04-29 15:11:00

### Fixed
- **Passed-style sticky header/scroll shell now applied to generic tables** ([js/table_display.js](js/table_display.js), [index.html](index.html)): Generic `TableDisplay` tables now install a unified DataTables layout scroll shell (`.qc-dt-unified-scrollbox`) with sticky header styling matching the Row Filter **Passed** matrix (`.qc-dt-matrix-scrollbox`). This fixes cases where some tabs (e.g., **Filtered out**) did not keep the header frozen.

## [3.27] - 2026-04-29 15:04:00

### Changed
- **Unified default table baseline features** ([js/table_display.js](js/table_display.js), [index.html](index.html), [js/saint_embed.js](js/saint_embed.js)): `TableDisplay.renderGenericTable` now defaults to sticky-header table UX with **sorting**, **search**, **pagination**, and **both-axis scrolling** (`overflow:auto` + bounded max-height). Numeric values render as **in-cell color bars** by default (column-wise scaling) unless disabled per column/table.
- **Enrichr results table uses shared baseline controls**: Enrichr tab table rendering now routes through `TableDisplay` with built-in search/sort/paging and numeric bar cells for numeric columns.

## [3.26] - 2026-04-29 13:38:00

### Changed
- **Unified table rendering onto `TableDisplay`** ([js/table_display.js](js/table_display.js), [index.html](index.html), [js/saint_embed.js](js/saint_embed.js)): expanded `TableDisplay` with reusable `renderGenericTable` and `renderStaticTable`, then migrated Name mapping preview, DIANN annotation preview, Data Filter filtered-list previews, Differential results table, SAINT results table, and Enrichr paged results-table rendering to use the shared module.
- **Retired legacy generic sorter module**: removed script include and deleted [js/app_tables.js](js/app_tables.js). Table destroy lifecycle now handles generic/module-rendered DataTables instances in addition to the matrix preview table.

## [3.25] - 2026-04-29 12:50:00

### Changed
- **Default matrix bar scale mode is now Row** ([js/table_display.js](js/table_display.js)): if no explicit `barScaleMode` is provided, the Data Filter → Row Filter → Passed preview initializes the **Bar scale** selector to **Row** (instead of Column). Explicit `column` and `table` values remain supported.

## [3.24] - 2026-04-29 12:46:00

### Fixed
- **Bar scale mode now redraws correctly** ([js/table_display.js](js/table_display.js)): switching **Column / Row / Table** now invalidates DataTables row display cache before redraw, so scale-mode changes immediately affect bar lengths.

### Changed
- **Matrix bar cell layout switched to overlay style** ([js/table_display.js](js/table_display.js), [index.html](index.html)): bar fill is rendered as a background layer and numeric value is drawn on top of the same area, reducing horizontal space usage versus side-by-side bar+label layout.

## [3.23] - 2026-04-29 10:04:00

### Added
- **Matrix bar scaling mode selector** ([js/table_display.js](js/table_display.js)): Added **Bar scale** control beside **entries per page** in Data Filter → Row Filter → Passed matrix preview. Supports **Column** (existing behavior), **Row**, and **Table** scaling. Bars redraw immediately on mode change without rebuilding the table; tooltips now describe the selected baseline.

## [3.22] - 2026-04-28 22:24:10

### Changed
- **Data Filter matrix: single-table scroll instead of DataTables scrollX/scrollY** ([js/table_display.js](js/table_display.js), [index.html](index.html)): Split **`.dt-scroll-head` / `.dt-scroll-body`** tables reliably misaligned column widths across Chrome/Edge/Firefox/Opera. The matrix now uses **one** DataTable DOM, a **`max-height`** scroll shell on the layout cell (`.qc-dt-matrix-scrollbox`), and **`position: sticky`** on `thead th` inside that shell for a frozen header with **perfect header/body column alignment**. Search, sort, paging, and bar cells unchanged. Removed scrollbar-gutter / head-padding workarounds tied to split-scroll mode.

## [3.21] - 2026-04-28 22:17:29

### Fixed
- **DataTables scroll header vs body column alignment** ([js/table_display.js](js/table_display.js), [index.html](index.html)): With `scrollX` + `scrollY`, the body table sits in **`.dt-scroll-body`** and gains a **vertical scrollbar**, so its content width was narrower than **`.dt-scroll-head`** until layout settled. Added **`scrollbar-gutter: stable`** on the scroll body, **`alignScrollHeadWithBody()`** (`columns.adjust()` + **`padding-right`** on **`.dt-scroll-headInner`** equal to scrollbar gutter), runs after init (rAF + delayed) and on **`draw`** (debounced) so header cells line up with data cells.

## [3.20] - 2026-04-28 22:12:59

### Fixed
- **DataTables matrix preview height jitter** ([js/table_display.js](js/table_display.js)): `scrollY` no longer subtracts live-summed **`.dt-layout-row`** heights (pagination line-wrap changed overhead each pass). Uses a **stable fixed chrome** value plus the search notice when visible. **ResizeObserver** watches only the outer **`.table-data-matrix-preview`** panel (not the inner host/container that our own height edits resize). **Hysteresis** (~8px) skips redundant DOM updates; **`columns.adjust()`** runs only when the scroll height actually changes (init / first layout), not on every resize tick.

## [3.19] - 2026-04-28 22:09:14

### Fixed
- **Data Filter DataTables header frozen / split scroll** ([js/table_display.js](js/table_display.js), [index.html](index.html)): `scrollY` height is derived from the **matrix panel** (`.table-data-matrix-preview`) so the scroll body gets a real pixel height; `initComplete` + resize re-apply height. **CSS** disables the legacy **`position: sticky`** rule on `.data-check-matrix-table thead th` under `#tablePreview` (it conflicted with DataTables’ `.dt-scroll-head` / `.dt-scroll-body` split). Flex layout on `.dt-scroll` / `.dt-scroll-body` keeps the header strip fixed while values scroll.

## [3.18] - 2026-04-28 21:18:03

### Added
- **DataTables matrix preview** ([js/table_display.js](js/table_display.js), [index.html](index.html)): **Data PreProcess → Data Filter → Row Filter → Passed** (`#tablePreview`) now uses [DataTables 2](https://datatables.net/) (jQuery loaded from CDN on first use) with **global search**, **column sort**, **pagination**, **horizontal and vertical scroll** (`scrollX` / `scrollY`), and **numeric cells as mini bar charts** (width = |value| / column max). Tooltips on length/search/paging controls; scoped purple header styling. **`TableDisplay.destroy`** runs when the matrix is cleared.
- **Search vs DIANN / Name mapping**: while the matrix search box is non-empty, a notice explains that **DIANN** and **Name mapping** tabs still follow **full-dataset** order; after clearing search, row order syncs again from the table.

### Changed
- **Legacy matrix preview path** (`renderNormalTable` / `renderPaginatedTable`) remains in [index.html](index.html) as fallback if `TableDisplay` is unavailable or initialization throws.

## [3.17] - 2026-04-28 15:09:33

### Added
- **Data Filter v2 redesign** ([index.html](index.html), [README.md](README.md)): Data Filter now has two workspace tabs (**Row Filter**, **Column Filter**) and each workspace has local result tabs (**Passed**, **Filtered out**, **Summary**). Added a unified ordered filter pipeline (`filterPipelineState.operations`, `filterPipelineHistory`, `recomputeFilteredDataByPipeline`) so mixed row/column filtering follows user execution order.
- **Row filter sections**: hybrid valid-values filtering (global/grouped, count/percent), random N row sampling, SD threshold filter, annotation keyword filter.
- **Column filter sections**: column checkbox/pattern selection, existing group-based selection integration, and valid-values column filtering (global/grouped, count/percent).
- **Summary panels**: before/after matrix dimensions, operation history, and row/column summary plots.

### Changed
- **Removed top-level Data PreProcess → Filtered out sub-tab**: filtered-out views now live inside Row/Column workspaces.

## [3.16] - 2026-04-27 20:50:40

### Added
- **Data PreProcess → Data Filter → Column Filter — Choose by group** ([index.html](index.html), [README.md](README.md)): **Group by** and optional **Then by** metadata columns (same keying as **Row Filter → Group completeness**: `resolveMetaRowForMatrixColumn`, `metaCellOrReplicateFallbackForGrouping`). Scrollable table lists each group with sample count and **Check** / **Uncheck** to toggle all matrix columns in that group. Selects refresh with the meta table; Document tab updated. Functions: `refreshColumnFilterGroupMetaSelects`, `refreshColumnFilterGroupCol2Options`, `buildColumnFilterGroupKeyToIndices`, `refreshColumnFilterGroupListUi`, `columnFilterSetGroupByIndex`.

## [3.15] - 2026-04-27 20:41:09

### Added
- **Data PreProcess → Data Filter** ([index.html](index.html), [README.md](README.md)): First sub-tab renamed from **Data Table** to **Data Filter** with nested **Row Filter** | **Column Filter** tabs sharing one matrix preview. **Row Filter**: existing **group completeness** plus **global min-valid** (drop rows with fewer than *N* finite **>0** values across all samples) and **row ID include** (substring or case-insensitive RegExp). **Column Filter**: sticky-header checklist of sample columns, search, select all / clear visible, **Apply** to keep selected columns (metadata rows filtered by `Sample_ID`; aborts if that would empty meta), **remove all-zero columns**. Helpers: `switchDataFilterPanel`, `materializeRowIndexSplit` / `commitRowFilterToState`, `filterMetaRowsToMatchColumnHeaders`, `clearDownstreamPlotsAfterMatrixMutation`. Internal sub-tab id remains **`tableData`**.

## [3.14] - 2026-04-27 20:22:49

### Changed
- **Top-level tab label** ([index.html](index.html), [README.md](README.md), [CHANGELOG.md](CHANGELOG.md)): the second main tab is now **Data PreProcess** (formerly **Data Check**). Internal ids (`switchTab('table')`, `#tableTab`) are unchanged.

## [3.13] - 2026-04-27 19:18:55

### Added
- **Group completeness — “Ignore groups with fewer than 2 samples”** ([index.html](index.html)): Short inline hint under the checkbox in **Data PreProcess → Data Table**; **Document** §5 adds a detailed subsection (on vs off, percent edge case for singletons, and when all groups are singletons).

## [3.12] - 2026-04-27 18:43:27

### Changed
- **Data PreProcess → Filtered out** ([index.html](index.html)): The **Filtered out** sub-tab button stays **hidden** until a filter records at least one dropped row; it is hidden again when the snapshot is cleared. If that sub-tab was open when the list is cleared, the UI switches back to **Data Table**.

## [3.11] - 2026-04-27 18:38:15

### Added
- **Data PreProcess → Filtered out** ([index.html](index.html)): Sub-tab beside **Data Table** lists rows removed because every sample intensity became non-positive **after group completeness filtering** or **`applyTechnicalReplicateFiltering()`**, with intensities/DIANN/feature-mapping columns captured at removal time and pagination (sticky matrix table styling). Snapshot clears when loading new matrix data, paste, JSON session import, when no matrix is loaded, or when a filter completes with zero dropped rows.

## [3.06] - 2026-04-27 15:01:26

### Added
- **Data PreProcess → Data Table — Group completeness filter** ([index.html](index.html)): Metadata-driven sample groups (one or two columns), threshold by **minimum count** or **minimum percentage** of valid (finite, **> 0**) intensities per group per row, optional exclusion of single-sample groups; failing groups zeroed for that row; all-zero rows dropped; plot caches cleared. **`refreshGroupCompletenessFilterUi`** keeps selects aligned with the meta table.

### Changed
- **Technical replicate sidebar control removed**: the strict **T1..TN** path remains as **`applyTechnicalReplicateFiltering()`** in script (status messages use **`groupCompletenessFilterStatus`** if invoked from the console); it is no longer shown as a separate **Legacy** block in the Data Table sidebar.

## [3.07] - 2026-04-27 15:19:07

### Fixed
- **Group completeness + technical replicate grouping** ([index.html](index.html)): Auto-metadata only filled **Biological_Replicate** / **Technical_Replicate** when the global R/T axis passed the “complete 1..N” check; otherwise cells stayed empty and grouping by those columns lumped **all** samples into one bucket, so a “min count 3” rule only required three positives **across the whole matrix** instead of per triplet. **Per-sample** `R#` / `T#` are now backfilled from column ids when cells are empty (`generateMetaDataFromColumns`, **`metaCellOrReplicateFallbackForGrouping`** in **`applyGroupCompletenessFilter`**, and legacy **`applyTechnicalReplicateFiltering`** bio/tech labels).

## [3.08] - 2026-04-27 15:27:50

### Fixed
- **Placeholder replicate metadata** ([index.html](index.html)): **`isBlankMetaReplicatePlaceholder`** treats common sentinels (**`NA`**, **`n/a`**, **`-`**, **`.`**, **`null`**, **`none`**, **`n.d.`**, etc.) as empty so **`parseReplicateTagsFromSampleId`** can supply **`R#` / `T#`** from the matrix column id for grouping and meta backfill (avoids a single literal **`NA`** bucket for all samples).

### Changed
- **Group completeness debug** ([index.html](index.html)): Each **`QCDBG`** payload is also appended to the **Analysis** log (truncated) when **`appendAnalysisLog`** is available, so evidence is visible when the NDJSON ingest file is not written (e.g. **`file://`**).

## [3.09] - 2026-04-27 15:32:26

### Fixed
- **Meta ↔ matrix column join for grouping** ([index.html](index.html)): **`resolveMetaRowForMatrixColumn`** resolves **`Sample_ID`** with **exact** header match, then **basename** match when headers are **full DIANN paths** but meta stores only the **file name** (or vice versa), then **column-order** fallback. Applied in **`applyGroupCompletenessFilter`** and **`applyTechnicalReplicateFiltering`** so groups use the intended metadata instead of empty rows / **`GroupNA`** buckets.

## [3.10] - 2026-04-27 18:29:36

### Changed
- **Group completeness filter** ([index.html](index.html)): Removed temporary debug instrumentation (**NDJSON ingest `fetch`**, **`QCDBG`** mirror logs, ASURF probe helpers). **`resolveMetaRowForMatrixColumn`** and related fixes (**v3.07–v3.09**) are unchanged.

## [3.05] - 2026-04-22 22:15:25

### Changed
- **Enrichr → Heatmap** ([index.html](index.html), [js/enrichr_plots.js](js/enrichr_plots.js)): Matrix is again **ontology / library terms × per-sample intensities** from the **Enrichr Results** table (`_enrichrMatrixColSums`), with the **same clustering pipeline** as the top-level Heatmap tab. **`window.buildEnrichrTermIntensityMatrixForClustering`** replaces **v3.04**’s gene-union protein subset; **`buildEnrichrIntensityMatrixForClustering`** aliases the term matrix builder.

## [3.04] - 2026-04-22 22:07:31

### Changed
- **Enrichr → Heatmap**: **v3.05** reverts the **v3.04** matrix source (gene-union protein rows). **v3.04** briefly used **`buildEnrichrOverlapFeatureMatrixForClustering`** (removed).

## [3.03] - 2026-04-22 21:07:19

### Changed
- **Enrichr → Heatmap** ([index.html](index.html), [js/enrichr_plots.js](js/enrichr_plots.js)): The sub-tab uses the **same hierarchical clustering pipeline** as the top-level **Heatmap** tab (log10, optional z-score per row, row/column clustering, workers, dendrograms, colorscale, margins, **Cancel**, in-tab progress). Matrix = **filtered/ranked terms × per-sample intensity columns** from the Enrichr table. **`window.buildEnrichrIntensityMatrixForClustering`** builds the matrix; **`generateEnrichrClusteredHeatmap`** / **`refreshEnrichrHeatmapLayoutOnly`** live in **`index.html`**. The old quick Plotly-only **`enrichrRefreshResultsDataHeatmap`** is removed; **`enrichrRefreshResultsDataHeatmapWhenVisible`** only **resizes** the Enrichr plot when that sub-tab opens.

## [3.02] - 2026-04-22 20:46:50

### Changed
- **Enrichr → Heatmap** ([index.html](index.html)): **Max adj. P-value** row filter defaults to **0.05** (terms with adjusted P &gt; 0.05 are excluded unless the user clears the field to disable the filter).

## [3.01] - 2026-04-22 20:43:41

### Changed
- **Enrichr → Heatmap** (`js/enrichr_plots.js`, [index.html](index.html)): Heatmap **z** matrix uses **only per-sample matrix intensity columns** from the Enrichr results. **Adjusted P, P-value, combined score, and odds ratio** (with **min overlap**) are **row filter** inputs (empty = no threshold); after filtering, terms are **sorted** by adj.P / P / combined (same choices as before) and **capped** by max rows. Hover still shows those statistics for context.

## [3.00] - 2026-04-22 20:36:16

### Changed
- **Enrichr → Heatmap** sub-tab ([index.html](index.html), [js/enrichr_plots.js](js/enrichr_plots.js), [js/heatmap_core.js](js/heatmap_core.js), [js/saint_embed.js](js/saint_embed.js)): Replaces the **mirror of the main intensity heatmap** with a **dedicated Plotly heatmap** of the **Enrichr result table**: rows = top terms (Top N, min overlap, rank by adj.P / P / combined score), columns = **−log10(adj.P)**, **−log10(P)**, **odds ratio**, **combined score**, **overlap count**, plus **per-sample matrix intensity sums** when present. Options: **log10** matrix columns (missing/≤0 → 1), **z-score per column** for color. **`enrichrRefreshResultsDataHeatmap`** / **`window.enrichrRefreshResultsDataHeatmapWhenVisible`**; auto-refresh when enrichment completes if this sub-tab is active. **`HeatmapCore`** is reduced to **`MAIN_PLOT_DIV_ID`** only (mirror API removed).

## [2.99] - 2026-04-22 16:51:11

### Fixed
- **Enrichr library list** (`js/saint_embed.js`): Removed the **v2.98** early return that skipped **`fetch`** on **`file://`**. Enrichr’s **`datasetStatistics`** responses normally include **`Access-Control-Allow-Origin`** matching the request **`Origin`** (including **`null`** for local files) on success; **v2.98** was wrong to claim **`file://` always fails**. The post-retry hint now explains that **504 / proxy errors** often omit CORS headers, which Chrome reports as a **CORS** failure even when the underlying issue is server timeout.

## [2.98] - 2026-04-22 16:38:49

### Fixed
- **Enrichr library list** (`js/saint_embed.js`): **`loadEnrichrStatsIfNeeded`** checks **`response.ok`**, retries up to **10** times with backoff on failures (including **504**), and shows a **Retry loading libraries** button after exhausting retries. Exposes **`window.enrichrRetryLoadLibraryStats`** to clear cache and reload. (**Superseded by v2.99** for the incorrect **`file://`** blanket block.)

## [2.97] - 2026-04-22 16:34:16

### Added
- **Enrichr → Heatmap** sub-tab ([index.html](index.html), [js/heatmap_core.js](js/heatmap_core.js)): Third Enrichr sub-tab mirrors the **same** cached intensity heatmap as the top-level **Heatmap** tab via `plotHeatmapFromClusteringResult` with **`plotDivId: enrichrHeatmapPlot`**. [js/heatmap_core.js](js/heatmap_core.js) exposes **`HeatmapCore.syncMirrorFromCacheIfPossible`**; **`syncEnrichrHeatmapMirrorIfNeeded`** runs when the sub-tab opens or after a primary heatmap completes. **Generate/Cancel** remain on the Heatmap tab only (**single** `activeHeatmapAbortController`). Session export still uses **`analysis.lastHeatmapResult`** only (no separate Enrichr heatmap snapshot).

### Changed
- **`plotHeatmapFromClusteringResult`** ([index.html](index.html)): Accepts optional **`bundle.plotDivId`** (default `heatmapPlot`); secondary target skips main-tab placeholder/panel/popout wiring and uses **`ensureEnrichrHeatmapCardResizeObserver`** / **`resizeEnrichrHeatmapPlotNow`**.

## [2.96] - 2026-04-21 17:48:23

### Changed
- **Enrichr matrix columns** (`js/saint_embed.js`, `js/enrichr_results_parse.js`, `js/enrichr_plots.js`): Replaced the single **Matrix intensity sum** with **one table column per data-matrix column**, using **`currentData.columnHeaders`** as names. Each cell is the **sum of that sample’s intensities** over matrix rows matched to the term’s overlapping genes (same row-at-most-once rule). Synthetic keys **`__matc__0`…** in **`displayOrder`**; **`enrichrStripAttachedMatrixColumns`** removes prior matrix columns (including legacy **`-42`**) before re-attach. **Export results TSV** appends the same matrix columns.

## [2.95] - 2026-04-21 13:09:11

### Added
- **Enrichr results table** (`js/enrichr_matrix_context.js`, `js/saint_embed.js`, `js/enrichr_results_parse.js`, `js/enrichr_plots.js`): When a data matrix is loaded and row count matches **`currentDataMatrix`**, a **Matrix intensity sum** column is appended: for each term, overlapping genes are matched to matrix rows (normalized row label, **gene_symbol** from Name mapping, and **DIANN Genes** tokens), then **all intensities in those rows (all samples) are summed** (each row at most once per term). Sortable with in-cell bar styling; **Export results TSV** includes **`matrix_intensity_sum`** when present.

### Note
- Superseded by **v2.96** (per-sample matrix columns instead of one total sum).

## [2.94] - 2026-04-21 12:58:03

### Changed
- **Enrichr → Enrichment plots** (`index.html`, `js/enrichr_plots.js`): The bar, bubble, and Jaccard figures are organized as **tabs** in the right-hand panel (chrome-style row + one visible plot at a time). **`switchEnrichrPlotVizTab`** / **`currentEnrichrPlotVizTab`** toggle panels and resize the active Plotly div; **`onEnrichrPlotsLayoutRefresh`** resizes all three after **Redraw** / sub-tab open / post-render.

## [2.93] - 2026-04-21 12:54:17

### Fixed
- **Enrichr** (`index.html`): On the **Enrichment plots** sub-tab, the main **Enrichr** configuration sidebar (species / library / **Run enrichment**) is hidden so only **Plot options** remains beside the figures; switching back to **Results table** restores it.

## [2.92] - 2026-04-18 21:05:18

### Fixed
- **Heatmap** (`index.html`): **Sample group overlay** legend is now drawn with Plotly **`layout.shapes`** + **`layout.annotations`** in **paper** coordinates (same colors/labels as before) so **PNG / SVG / WEBP** exports from the Plotly mode bar include the legend. The old HTML overlay (`#groupLegendContainer`) sat outside `#heatmapPlot` and was omitted from snapshots; it stays hidden. **`updateHeatmapGroupAnnotationsOnly`** merges the same legend into the layout passed to **`Plotly.react`**.

## [2.91] - 2026-04-18 20:52:10

### Changed
- **Heatmap** (`index.html`): Large-matrix path now matches the **Clustergrammer** tab’s responsiveness model. **Log10**, **Z-score**, and **transpose-for-column-clustering** run in **time-sliced** chunks with `requestAnimationFrame` yields so the browser stays interactive (avoids “page unresponsive” / tab-wide freezes). Worker **progress** updates are **coalesced** to one DOM write per frame. **`AbortController`** + in-banner **Cancel** (next to the progress message) stops clustering and restores a fresh worker, mirroring **Clustergrammer**’s cancel control. **`hierarchicalClusteringAsync`** now pins the **`Worker` instance** for cleanup so overlapping runs cannot detach the wrong worker’s listeners. **`Plotly.newPlot`** is **awaited** when the library returns a Promise.

## [2.90] - 2026-04-18 12:05:21

### Added
- **t-SNE** (`index.html`): **Row-wise Z-score Normalization** checkbox (**`tsneApplyZScoreRow`**, off by default), same order and logic as **PCA** (after log10 and column Z-score). Included in **t-SNE** cache hash and session UI state.

## [2.89] - 2026-04-18 12:01:35

### Fixed
- **t-SNE** (`index.html`): The embedding **cache key** (`tsneDataHash`) did not include **log10** or **column-wise Z-score** flags. Toggling those checkboxes still matched the previous run, so the plot could look unchanged. The hash now includes both options so preprocessing changes force a new t-SNE run (aligned with **PCA**, which already hashes its preprocessing options).

## [2.88] - 2026-04-18 11:44:24

### Changed
- **Data Preparation** (`index.html`, `js/`): **Load SAINT analysis example data** now lazy-loads **`js/example_saint_protein.js`** (content moved from **`Saint/js/example_protein.js`**). The entire **`Saint/`** directory (standalone `saint_analysis.html`, SAINTq sources, duplicate Clustergrammer, DIANN samples, etc.) was **not** referenced by the main **index.html** app and has been **removed** from the project to reduce size and avoid confusion. Runtime SAINT code remains **`js/saint_embed.js`** + **`js/saint_algorithm.js`**. **README** / **index** comment updated; Enrichr styling note no longer points at a removed HTML path.

## [2.87] - 2026-04-18 09:50:34

### Fixed
- **Data Preparation → Load SAINT analysis example data** (`index.html`): Lazy-load target **`Saint/js/example_protein.js`** was missing from the repo (404 / script **onerror**), so the example never ran. Restored **`Saint/js/example_protein.js`** defining **`window.EXAMPLE_DATA_PARTS.protein`** in the layout expected by **`loadSaintExampleData`** (Status / Bait / column-id rows + intensity matrix).

## [2.86] - 2026-04-18 09:47:58

### Changed
- **UpSet / Venn / K-map** (`index.html`): The three **Pop out** buttons use the same inline **SVG** external-window glyph as the heatmap tab. Shared icon class **`.viz-popout-icon`** (heatmap **Pop out** updated from **`.heatmap-popout-icon`**). **`#upsetTab .upset-viz-popout-btn`** uses **`inline-flex`**, **`gap`**, **`margin-top: 0`** for alignment with **`.example-btn`**.

## [2.85] - 2026-04-18 09:45:40

### Changed
- **Heatmap** (`index.html`): **Pop out** uses an inline **SVG** “open in new window” glyph (square + arrow top-right, **`stroke-linecap: round`**) before the label; **`updateHeatmapPopoutButtonState`** now uses **`display: inline-flex`** when visible. **`margin-top: 0`** overrides **`.example-btn`** in the sidebar row.

## [2.84] - 2026-04-18 09:37:13

### Changed
- **Heatmap** (`index.html`): **Pop out** moved to the **left sidebar** on the same row as **Generate heatmap** (flex row). The control is **`display: none`** until a heatmap exists (**`updateHeatmapPopoutButtonState`** toggles visibility). Removed the old bar above the plot panel. **`updateHeatmapPopoutButtonState`** is also called wherever the app resets **`heatmapGenerated`** (new matrix/metadata loads, row deletions, etc.) so the button does not stay visible after a clear. **Document** tab heatmap pop-out paragraph updated; **`popout/heatmap_popout.html`** wait/error text points at the sidebar control.

## [2.83] - 2026-04-18 09:34:23

### Changed
- **Heatmap** (`index.html`): Removed the inline hint text to the right of **Pop out** (UpSet/Venn `postMessage` / `sessionStorage` / pop-ups). Behavior unchanged; **Document** tab and **UpSet** sidebar still describe the mechanism.

## [2.82] - 2026-04-18 09:31:52

### Added
- **Heatmap pop-out** (`popout/heatmap_popout.html`, `index.html`): **Pop out** bar above the framed plot (enabled after a heatmap exists). Serializes current **`heatmapPlot`** `data` / `layout` (clears fixed width/height for **autosize** in the new window), **`sessionStorage` key `qc_heatmap_popout`**, **`postMessage`** retries like **`upsetOpenPopoutForShare`**. **`updateHeatmapPopoutButtonState`** after draw, tab switch, and session restore. Document / UpSet sidebar note updated.

## [2.80] - 2026-04-18 09:25:20

### Changed
- **Heatmap → Figure & margins** (`index.html`): **`<summary>`** row is **flex** with a **CSS chevron** (`::after`): points **right** when collapsed, **up** when open, with a short **transition**; **`title`** on **`<details>`** for a native tooltip (“show or hide…”).

## [2.79] - 2026-04-18 09:18:25

### Changed
- **Heatmap sidebar** (`index.html`): **Figure & margins** is wrapped in **`<details>`** (no `open` attribute) so it starts **collapsed** on load; **`<summary>`** reuses **`.heatmap-side-heading`** styling with hover/cursor rules.

## [2.78] - 2026-04-18 09:15:43

### Changed
- **Heatmap** (`index.html`): **Margin bottom (px)** default **48 → 100** (sidebar `value`, `plotHeatmapFromClusteringResult` / **`updateHeatmapLayoutOnly`** fallbacks when the field is empty).

## [2.77] - 2026-04-18 09:13:06

### Changed
- **Heatmap Plotly host** (`index.html`): **`#heatmapPlot.plot-container`** uses **`overflow: hidden`** (no scrollbars). **`resizeHeatmapPlotNow`**, staged **`setTimeout`** resizes after **`newPlot`**, **`ResizeObserver`** on **`.heatmap-plot-card`** for panel size changes, extra resizes when switching to the **Heatmap** tab and after **`Plotly.react`** / **`relayout`**, so the figure tracks the flex layout instead of overflowing.

## [2.76] - 2026-04-18 09:04:14

### Fixed
- **Heatmap framed panel** (`index.html` CSS): **v2.75** shrank **`.heatmap-plot-card`** to content height (`flex: 0 1 auto`), which left a **large gray gap under the white frame** in the right panel. The card again uses **`flex: 1`** with **`min-height: 0`** so it **fills the panel**; **`#heatmapPlot.plot-container`** uses **`flex: 1`**, **`min-height: 0`**, and **`overflow: auto`** so the Plotly host fills the card and scrolls when needed, without inheriting the global **`.plot-container` min-height: 600px** rule.

## [2.75] - 2026-04-18 08:59:31

### Fixed
- **Heatmap framed panel** (`index.html` CSS): Extra space **below the heatmap figure** (outside Plotly `margin.b`) was mainly from **`.heatmap-plot-card { flex: 1 }`**, which stretched the card to the full right-panel height while the plot only occupied the top—large blank band inside the box. The card now uses **`flex: 0 1 auto`**, **`max-height: 100%`**, and slightly **tighter outer margin / padding**; **`#heatmapPlot.plot-container`** uses **reduced padding** (especially bottom) instead of the default **10px** all around.

## [2.74] - 2026-04-18 08:22:26

### Fixed
- **Heatmap** (`index.html`): Large empty band under x-axis labels when **margin bottom** looked “ignored” was caused by (1) **`Math.max(20, …)`** so **0** could not apply, (2) **Plotly `automargin: true`** on sample x-axes adding extra bottom space, and (3) global **`.plot-container { min-height: 600px; flex: 1 }`** stretching the heatmap host to the full card height. **Margin bottom** now allows **0–320**; sample axes no longer use **automargin**; **`#heatmapTab .heatmap-plot-card #heatmapPlot`** overrides sizing so the plot height follows the figure; **`updateHeatmapLayoutOnly`** forces **`automargin: false`** on the active sample x-axis for plots drawn under older code.

## [2.73] - 2026-04-18 07:54:58

### Changed
- **Heatmap** (`index.html`): **Figure & margins** sidebar adds **Margin bottom (px)** (`heatmapMarginBottom`, default **52**, range **20–320**). Initial Plotly **`layout.margin.b`** uses this value instead of a fixed **120**; **`updateHeatmapLayoutOnly`** and session **`getSessionUiState`** include it. Short hint notes that **automargin** can still add space for long sample-axis labels.

## [2.72] - 2026-04-18 07:47:07

### Changed
- **Heatmap tab** (`index.html`): Right-hand **Plotly** area is wrapped in a **card** (border, radius, light shadow) with **scroll** so oversized figures or tick labels remain reachable. Sample-axis (`xaxis` / `xaxis2` / `xaxis4`) **`automargin: true`** lets Plotly grow margins for long **−45°** column labels; **`Plotly.Plots.resize`** runs shortly after **`newPlot`** so sizing matches the card.

## [2.71] - 2026-04-17 21:17:08

### Changed
- **Enrichr** (`index.html`): Sub-tab label **Downstream plots** → **Enrichment plots**. **Plot options** (Top N, rank, overlap, bubble settings, Redraw, Export TSV) moved into a **`tab-sidebar`** column; main area keeps the description and Plotly hosts.

## [2.70] - 2026-04-17 21:10:31

### Changed
- **Enrichr tab** (`index.html`): **Downstream plots** (bar, bubble, Jaccard heatmap, controls, TSV export) moved from a collapsible block under the results table into a **sub-tab** next to **Results table**, with **`switchEnrichrSubTab`** / **`currentEnrichrSubTab`** mirroring the SAINT sub-tab pattern; **Plotly** resize runs when switching to the plots sub-tab or re-opening the Enrichr tab while that sub-tab is selected.

## [2.69] - 2026-04-17 21:03:47

### Added
- **Enrichr downstream plots** (`js/enrichr_results_parse.js`, `js/enrichr_plots.js`): After enrichment, **Downstream plots** under the results table renders **Plotly** figures from the **full** term list (not just the current page): horizontal **bar** (rank by adjusted P, P-value, or combined score), **bubble** scatter (overlap count or odds ratio; color −log10(adjusted P) or adjusted P), **term–term Jaccard heatmap** on overlapping genes, and **Export results TSV**. **`enrichrSetupResultsDisplay`** (`js/saint_embed.js`) calls **`enrichrRefreshDownstreamPlots`** after the table is built (including session restore).

## [2.68] - 2026-04-17 20:27:51

### Changed
- **UpSet pop-out page** moved from repo root to **`popout/upset_popout.html`**. **`upsetOpenPopoutForShare`** in **`index.html`** opens **`popout/upset_popout.html`** (same `postMessage` / `sessionStorage` behavior). The page still loads UpSet.js from the CDN only, so no extra assets are required in the subfolder.

## [2.67] - 2026-04-17 20:23:20

### Changed
- **Bundled report (`data/qc_session.js`)**: After a **successful** **`applySessionSnapshot`**, the app switches to the **Heatmap** tab so the restored plot-first workflow opens immediately.

## [2.66] - 2026-04-17 20:16:22

### Added
- **Bundled session loading overlay** (`index.html`): Full-screen panel with spinner and status lines during bundled report load/restore. Message **“Loading data/qc_session.js…”** appears only if the script request takes longer than **200 ms** (avoids a flash when the file is missing). **“Restoring matrix, plots…”** shows while **`applySessionSnapshot`** runs, then the overlay dismisses on success or failure.

## [2.65] - 2026-04-17 20:04:51

### Added
- **Report-style bundled session (`data/qc_session.js`)**: After **`js/saint_embed.js`** loads, the app injects a script tag for **`data/qc_session.js`**. If present, it must assign **`window.__QC_SESSION_SNAPSHOT__`** to a session object (use **Export session as report JS**). On load, **`applySessionSnapshot`** runs so matrix, plots, **Differential**, **Enrichr**, and **SAINT** caches restore without recomputation. Skip auto-load with URL **`?noSession=1`**. Only use `.js` files exported by this app; untrusted script is executable code.
- **Session snapshot formatVersion 3** (`index.html`): **`analysis.diffAnalysisLastResult`**, **`diffTableSortCol` / `diffTableSortAsc`**, **`analysis.enrichrSession`**, **`analysis.saintSession`**. **`js/saint_embed.js`**: **`window.enrichrSetupResultsDisplay`** (shared by live Enrichr runs and restore), **`collectEnrichrSessionSnapshot` / `restoreEnrichrSessionSnapshot`**, **`collectSaintSessionSnapshot` / `restoreSaintSessionSnapshot`**.

### Changed
- **Data Preparation → Session snapshot**: New button **Export session as report JS (qc_session.js)**; JSON export description updated for v3 scope.

## [2.64] - 2026-04-17 19:43:48

### Fixed
- **Enrichr species not auto-selecting Mouse**: species guessing previously ran mainly when starting enrichment with **Matrix row labels**; it now runs when you open the **Enrichr** tab (`window.applyEnrichrSpeciesGuessToDom` from **`index.html`** `switchTab`, logs via **`enrichrAppendLog`** when available) **before** loading library stats so the library list filters on the updated species.
- **`guessEnrichrSpeciesFromMatrix`** (`js/enrichr_matrix_context.js`): DIANN annotation scan uses **`min(annotationRows, rowIds)`** when lengths differ; **decisive** return when **≥5** sampled protein-name cells show **`_MOUSE`** and at least **2×+1** more than **`_HUMAN`** (and symmetric for Human). **Genes-column** Enrichr list (`buildGeneListFromDiannPgGeneColumn`) tolerates the same row-count alignment edge cases.

## [2.63] - 2026-04-17 19:37:22

### Changed
- **Enrichr species inference** (`js/enrichr_matrix_context.js` **`guessEnrichrSpeciesFromMatrix`**): when DIANN pg **`diannPgAnnotationRows`** / headers are present (aligned with **`rowIds`**), the guesser now samples the **`Protein.Names`** column (or the first header matching “protein” + “name”) and **counts per-row `_HUMAN` / `_HSAPIENS` vs `_MOUSE`** suffixes (case-insensitive) across the sampled rows, adding weighted hits so Enrichr **Human/Mouse** auto-selection tracks UniProt-style protein names. If no dedicated protein-names column is found, a light sample of all annotation cells is still merged into the text haystack; rationales note when DIANN annotation was used.

## [2.62] - 2026-04-17 19:33:22

### Changed
- **Enrichr → Matrix row labels** (`js/enrichr_matrix_context.js`, `js/saint_embed.js`): when a DIANN protein-group matrix includes a usable **`Genes`** column (parsed as **`diannPgGenesByRow`** or a **`Genes` / gene-names** header in **`diannPgAnnotationHeaders`**), **`prepareEnrichrRowLabelGeneList`** now **prefers that column** for the gene list (split on `;` `|` `,`, dedupe, UniProt **`_SPECIES`** strip per token) if enough rows have values and unique symbols pass the same coverage check as before; otherwise the pipeline falls back to row labels / MyGene as before.

## [2.61] - 2026-04-17 15:23:08

### Fixed
- **Enrichr → Matrix row labels** (`js/enrichr_matrix_context.js`, `js/saint_embed.js`): DIANN / UniProt-style protein row IDs such as **`UBA6_HUMAN`** or **`Gene_mouse`** are normalized to **`UBA6`** / **`Gene`** before building the gene list (suffix after the **last** `_` matched case-insensitively against common organism mnemonics). **`rowIdsLikelyNeedGeneMapping`** now uses these normalized tokens so heuristics align with symbols sent to Enrichr.

## [2.60] - 2026-04-16 22:05:18

### Changed
- **Data PreProcess → Row Profile**: the first time you open the **Row Profile** sub-tab after the current matrix is loaded (or after the matrix identity changes), the app **selects the top 5 rows by total intensity**, sets **plot type** to **bar**, and **renders the chart** automatically. **Plot selected rows** still switches to Row Profile without re-running that auto step (`skipRowProfileAuto` on `switchTableSubTab`).

## [2.59] - 2026-04-16 17:04:54

### Added
- **`js/app_tables.js`**: generic **`AppTableSort.attach(table)`** for tables with class **`app-generic-sort-table`** (click header to sort; skips **`data-no-sort`**, **`onclick`**, **`data-action`**, **`th-sortable`**). Loaded from **`index.html`** before **`feature_name_mapping.js`**.

### Changed
- **App-wide table UX**: **`app-table-scroll`** wrapper + CSS so **`thead th`** uses **`position: sticky`** with **`border-collapse: separate`** on wrapped tables. Applied to **Differential** results, **SAINT** results (scroll region + existing column sorts), **Enrichr** results (combined **`enrichr-table-wrap app-table-scroll`**, **`border-collapse: separate`**), **Data PreProcess → Meta Table** (scroll wrapper), **DIANN annotations**, **Name mapping** preview (plus **`app-generic-sort-table`** + **`AppTableSort.attach`** for client-side column sort on the preview page).

## [2.58] - 2026-04-16 16:55:34

### Changed
- **Enrichr** tab: default **category** is **Ontologies** (`#enrichrCategory` value `3`). After library statistics load, the library list prefers **`GO_Cellular_Component_2025`**, then **`GO_Cellular_Component_2023`**, then **`GO_Cellular_Component_2021`** if present (canonical names for the usual “GO cellular component” default).

## [2.57] - 2026-04-16 16:52:17

### Changed
- **Enrichr** tab: default **gene list source** is **Matrix row labels** (paste textarea hidden until **Paste genes** is selected).

## [2.56] - 2026-04-16 16:47:54

### Fixed
- **Data PreProcess → Name mapping** (`js/feature_name_mapping.js`): **`runFeatureNameMappingAsync`** now wraps synchronous setup (job lists + promise chain wiring) in **`try/catch`**. If anything threw before the async MyGene phase (e.g. edge-case row data), **`featureNameMapRunning` stayed `true`**, blocking all later runs. **Run mapping** also alerts when a job is already in progress instead of doing nothing; rejected promises are logged to the console.

## [2.55] - 2026-04-16 16:40:09

### Added
- **Enrichr → Matrix row labels**: smart pipeline — **`guessEnrichrSpeciesFromMatrix`** (row IDs, column headers, meta text) sets **Human/Mouse** when confident; logs when species cannot be inferred (user sets **Enrichr** and **Name mapping** manually). Heuristic **`rowIdsLikelyNeedGeneMapping`** decides UniProt / long-description style IDs vs gene-like tokens; if mapping is needed, runs **`runFeatureNameMappingAsync`** (same MyGene pipeline as Data PreProcess → Name mapping), syncs session **`featureNameMap*`** for the Name mapping tab, then builds a deduped **`gene_symbol`** list for Enrichr. Reuses existing mapping when ≥55% rows already have symbols. New **`js/enrichr_matrix_context.js`**; **`runFeatureNameMappingAsync`** in **`js/feature_name_mapping.js`**.

## [2.54] - 2026-04-16 16:17:19

### Changed
- **Data PreProcess → DIANN annotations**: table header styling now matches **Data Table** and **Meta Table** — **`#667eea`** background, **white** text, same **shadow** and **hover** (`#5568d3`) as the matrix preview headers; cell **borders/padding** aligned with `.table-preview`.

## [2.53] - 2026-04-16 16:15:48

### Fixed
- **Data PreProcess → DIANN annotations**: frozen header now follows the same DOM pattern as **Meta Table** — `<table>` is a **direct child** of `#diannAnnotationPreview` (the scrolling `.table-preview`). The removed inner **`overflow-x: auto`** wrapper was an extra scrollport so `position: sticky` on `<th>` applied to that wrapper (no vertical overflow), not the panel scroll, so headers scrolled away. CSS for `.diann-ann-table` is scoped with **`#diannAnnotationPreview`** so it overrides later global `.table-preview table` / `.table-preview th` rules.

## [2.52] - 2026-04-16 16:13:41

### Fixed
- **Data PreProcess → DIANN annotations**: restored a **frozen** header row (`position: sticky` on `thead th`). Sticky was unreliable with `border-collapse: collapse`, so the table uses **`border-collapse: separate`** with **`border-spacing: 0`** and light **cell borders** so the header stays visible when scrolling inside the preview panel.

## [2.51] - 2026-04-16 16:11:09

### Changed
- **Data PreProcess → DIANN annotations**: removed **sticky** column headers so the header row **scrolls with the table** (no pinned header line). Headers can **wrap** (`white-space: normal`) for long column names.

## [2.50] - 2026-04-16 15:58:04

### Changed
- **t-SNE worker** (`js/tsne.worker.js`): after optimization, the 2D embedding is **centered** and each axis is **divided by its standard deviation** (`normalizeEmbedding2DForDisplay`) so plot axes show **~O(1)** values (similar in spirit to typical sklearn / tutorial figures). Relative layout is unchanged up to **independent scaling per axis**; distances are not isometric after this affine step.

## [2.49] - 2026-04-16 15:47:36

### Changed
- **PCA / t-SNE sample column labels**: text is no longer a scatter trace; it uses **`layout.annotations`** with **`layer: 'above'`** (see `buildSampleColumnLabelAnnotations`) so labels reliably draw **above** markers. **v2.48** (`markers+text`) was still sometimes obscured by markers on t-SNE.

## [2.48] - 2026-04-16 15:42:25

### Fixed
- **PCA / t-SNE sample labels**: Plotly draws **`mode: 'text'`** scatter traces **under** marker traces, so labels could look hidden behind points (e.g. t-SNE for **example data 3**). Label traces now use **`markers+text`** with **fully transparent** markers (`buildScatterLabelTextTrace`) so label text sits above prior traces.

## [2.47] - 2026-04-16 15:36:22

### Changed
- **Meta table → Group annotations**: `updateMetaTablePreview()` now refreshes **heatmap, PCA, and t-SNE** group-annotation checkboxes whenever metadata changes (or is cleared), so auto-selection of the first meta group column also applies after loading **Example data 1**.

## [2.46] - 2026-04-16 15:19:52

### Changed
- **PCA / t-SNE group annotation labels**: when the group checkbox list is first built and nothing is selected, the **first** meta column is now auto-selected (fixes cases like example data where meta columns exist but PCA plotting stayed ungrouped).

## [2.45] - 2026-04-16 15:14:54

### Changed
- **PCA / t-SNE → Group Annotation Labels**: on the **first** time the group list is built (meta present, no prior checkboxes), the **first** metadata column (after `Sample_ID`) is **checked by default**. If the user has already unchecked all boxes, a later refresh does not re-check (only initial empty state).

## [2.44] - 2026-04-16 15:12:34

### Changed
- **PCA / t-SNE**: **Show Column Labels** is **checked by default** for both tabs.
- **Label leader lines**: Plotly annotations use **`layer: 'below'`** so connector lines render **under** scatter markers.

## [2.43] - 2026-04-16 15:09:15

### Changed
- **PCA / t-SNE label leader lines**: stroke is a fixed **light grey** (`rgba(200, 200, 202, 0.45)`) instead of matching label color.

## [2.42] - 2026-04-16 15:04:52

### Changed
- **PCA / t-SNE label leader lines**: **no arrowhead** (`arrowhead: 0`); stroke uses the label color at **50% opacity** (`rgba` alpha `0.5`) via `labelConnectorLineColor`.

## [2.41] - 2026-04-16 14:25:47

### Changed
- **PCA / t-SNE scatter labels**: added reusable **`js/scatter_label_optimize.js`** (`window.ScatterLabelOptimize`) — canvas-measured text boxes, smooth overlap penalties (label–label, label–marker), and **Adam + finite-difference** optimization instead of the old iterative push/pull heuristic. Placement uses the actual **Plotly label font size** from **Auto label style**.
- **Label count on zoom**: baseline remains about **40** labels at full view; after **zooming in**, up to **150** labels can be shown when the view span shrinks relative to the full embedding (stored `fullSpanProduct` on the plot div). Unlabeled points in view can appear as capacity increases.

## [2.40] - 2026-04-16 11:15:57

### Changed
- **Data PreProcess → DIANN annotations**: added clickable column-header sorting (including Row ID), ensured horizontal scrolling for wide auto-generated tables, and wrapped long cell text with per-cell max width for readability.

## [2.39] - 2026-04-16 11:08:57

### Changed
- **Data Preparation → Data matrix**: color-coded input method cards (example, paste, clean file, DIANN PG, DIANN GG) to make loader type easier to identify visually.

## [2.38] - 2026-04-16 11:03:21

### Changed
- **Heatmap** calculation progress: replaced the global fixed-center progress overlay (which appeared above all tabs) with an **in-tab progress banner** (same style as the **Clustergrammer** tab progress bar).

## [2.37] - 2026-04-16 10:56:59

### Added
- **Data PreProcess → Meta Table**: **Export meta table (TSV)** button to download the current meta table for editing and re-importing via **Data Preparation**.

## [2.36] - 2026-04-14 16:44:40

### Fixed
- **Enrichr** results table: styling from **`Saint/saint_analysis.html`** was never added to the main app, so inline **P-value / Adjusted P-value** (green) and **Odds ratio / Combined score** (blue) bar backgrounds did not appear. Added **`#enrichrResultsContainer`** / **`#enrichrTab`** rules (sticky header, tooltips, sortable headers, zebra rows, bar layers). **`saint_embed.js`**: coerce numeric strings to numbers before **`fmt`** / bars so API string values still render bars.

## [2.35] - 2026-04-14 16:37:55

### Fixed
- **SAINT** analysis: the fixed-center progress overlay (`saintProgressContainer`) stayed visible after **Analysis complete!** because only `saintUpdateProgress` added the `.active` class and nothing removed it. Added **`saintHideAnalysisProgress()`** to clear the overlay; auto-hide ~1.6s after success, immediate hide on error, delayed hide after **Stop**.

## [2.34] - 2026-04-14 16:25:23

### Fixed
- **Name mapping (MyGene batch):** batch `q` must use **comma-separated** terms (not newlines per MyGene POST docs). **Response** is a **JSON array** of hits with a `query` field, not `{ hits: [...] }` — the client previously read `json.hits`, so every symbol showed **no hit**. Also read **dotfield** flat UniProt keys (`uniprot.Swiss-Prot`) when extracting accessions.

## [2.33] - 2026-04-14 16:15:07

### Added
- **Data PreProcess** → **Name mapping** sub-tab: map matrix row IDs to gene symbol, protein name, and UniProt accession using the free **MyGene.info** API (`js/feature_name_mapping.js`). Species (human / mouse / rat / custom NCBI taxid), mode **gene symbol** / **UniProt accession** / **auto**, **Run** / **Stop** (partial save), **Clear**. Stored as **`featureNameMapHeaders`** / **`featureNameMapRows`** (and optional **`featureNameMapMeta`**) in **`currentData`**; included in session JSON. **Feature label** dropdowns (heatmap, Clustergrammer, Differential, column profile, column correlation, Row Profile) and Row Profile search/tooltips merge these columns with DIANN annotations. Technical replicate filter keeps name-map rows aligned with matrix rows. In-app **Document** §3b.

## [2.32] - 2026-04-14 15:52:58

### Fixed
- **SAINT** Bait / group dropdowns were always empty: the main app keeps **`metaData`**, **`currentData`**, and **`currentDataMatrix`** as **`let`** bindings (not on **`window`**), while **`js/saint_embed.js`** reads **`window.metaData`** etc. Added **`window`** getters/setters that alias those variables so SAINT sees loaded metadata and can populate **Bait column** and **group** selects.

## [2.31] - 2026-04-14 15:48:14

### Fixed
- **SAINT** tab: **`saint_embed.js`** keeps **`currentDataMatrix`** and **`currentData.dataMatrix`** in sync, derives **`metaData.headers`** from the first meta row when missing, and uses that for **Run SAINT analysis** / integrated data — fixes cases where data was loaded but SAINT could not start.
- **`switchTab`**: guard when a tab panel id is missing (avoids a hard error breaking navigation).

## [2.30] - 2026-04-14 15:40:32

### Fixed
- **Load SAINT analysis example data** now sets **`currentData.dataMatrix`** (same array as **`currentDataMatrix`**), so **Heatmap**, **PCA**, and **t-SNE** match the rest of the app; previously only Clustergrammer / UpSet paths saw the matrix.

## [2.29] - 2026-04-14 14:58:46

### Added
- Top-level **SAINT** tab (sub-tabs: SAINT analysis, Network, Scatter plot) using **Data Preparation** matrix + meta only: optional **Status T/C as-is**, or map a meta **group** column with control/treatment strings to **C**/**T**, plus **Bait** column; runs **SAINTq** from `js/saint_algorithm.js` with UI in `js/saint_embed.js`. **D3 v7** loads lazily as `window.d3Saint` so **Clustergrammer** keeps **D3 v3**.
- Top-level **Enrichr** tab: gene sources — **paste**, **matrix row labels**, **SAINT preys** (after a run).
- **Data Preparation**: **Load SAINT analysis example data** (lazy-loads `Saint/js/example_protein.js` into main `currentData` / `metaData`).
- **jsPDF** (CDN) for optional SAINT network PDF export.

## [2.28] - 2026-04-13 20:22:17

### Changed
- **Differential** fudge volcano green guide: **hyperbolic** height between inner clip and **need** via **(need/|x|−1)/(need/x_clip−1)** (flat **y₀** for |log2FC| ≥ need); **t²**-biased sampling along each branch for smoother wings. **Document §10** text updated.

## [2.27] - 2026-04-13 20:12:38

### Changed
- **Differential** fudge volcano: green guide redrawn as **two line traces** (negative and positive log2FC) with a small gap at 0, using a **rational** height **(need²−|x|²)/(need²+|x|²)** instead of a single quadratic sweep — avoids a misleading “bell” dome; **Document §10** formula text aligned.

## [2.26] - 2026-04-13 20:05:31

### Added
- **Differential** (two-group): optional **fudge factor volcano** — SAM-style joint rule with user **s₀**, **SE ≈ |log2FC/t|**, coloring by **p** or **FDR** plus **|log2FC|/(SE+s₀) ≥ t★**; **green** median-SE/df boundary curve; MA plot colors match when enabled; tooltips show **p_mod** (t-approx). **Session JSON** keys **`diffVolcanoFudgeFactor`**, **`diffFudgeS0`**. In-app **Document §10** updated (Giai Gianetto *et al.*, *Proteomics* 2016).

## [2.25] - 2026-04-13 15:16:55

### Added
- **Data PreProcess** → **Column profile**: full-width **log10(1 + intensity)** **histogram** (probability density) plus **Gaussian KDE** overlay for **all** features in the selected sample column (Silverman bandwidth; KDE subsamples beyond 25k points for responsiveness).

## [2.24] - 2026-04-13 15:07:20

### Added
- **Data PreProcess** sub-tab **Column Correlation**: sample–sample QC with **Plotly** pair scatter (identity line), QQ, Bland–Altman (difference or log-ratio), **Pearson** / **Spearman** correlation and distance heatmaps (first **N** columns, cap 80), **r vs all j** bars for chosen column X, and per-column summary bars; transforms **none** / **log10(1+x)** / **log2(1+x)**; **treat 0 as missing** and pairwise-complete rows; session JSON fields for **`colCorr*`** controls.
- In-app **Document** section **9. Column correlation**; **Differential** moved to section **10** in the outline.

## [2.23] - 2026-04-12 16:54:52

### Added
- **Differential** tab: **multiple-group** mode with **one-way ANOVA** (equal-variance **F**-test, partial η²) and **Kruskal–Wallis** (rank-based **H**, χ² **p**-approximation), checklist of meta levels, per-group **n** validation, chunked per-row loop, and cached **`mode: 'anova'`** results (`fStat`, `dfBetween`/`dfWithin`, `etaSq`, `groupMeansByGroup`, `maxMeanGroupIdx`).
- Multi-group **volcano** (η² or **F**/**H** vs −log10 **p**/FDR with cutoffs), **grand mean vs group-mean range** view, **group heatmap** (top **N** by **p**, optional row z-score), dynamic **results table** / **CSV**, and **session JSON** fields (`diffAnalysisMode`, `diffMultiTestType`, `diffVolcanoXAxisAnova`, `diffEtaSqThreshold`, `diffStatThreshold`, `diffHeatmapTopN`, `diffHeatmapZscoreRows`, `diffAnovaIncludedLevels`).

### Changed
- Two-group runs set **`mode: 'two_group'`**; **Document §9** rewritten (multi-group + explicit **DESeq2**/count-model **out of scope** for this in-browser app).

## [2.22] - 2026-04-12 12:31:59

### Changed
- **Heatmap** tab sidebar: **640px** width (2× the default 320px). Controls use a **two-column CSS grid** with grouped sections (**Clustering**, **Colors**, **Sampling**, **Preprocessing**, **Row labels**, **Figure &amp; margins**) plus full-width **Generate** and **Sample group overlays**. Pair inputs (plot size, dendro %, margins) sit side-by-side for quicker scanning.

## [2.21] - 2026-04-12 12:24:59

### Changed
- **Feature label (rows)** defaults to **Genes** on new data loads when gene labels are available: **DIANN gene-group** matrix (`diannMeta.idColumnName`), **Genes** in DIANN pg **annotation slice**, or non-empty **`diannPgGenesByRow`**. Applies to **Heatmap**, **Clustergrammer**, and **Differential** dropdowns (`applyDefaultFeatureLabelsToGenesIfAvailable`). Session import still restores saved UI; generic matrices keep **Matrix row ID**.

## [2.20] - 2026-04-12 12:19:11

### Fixed
- **Top-level tab labels** (and other **rem**-based UI) shrank after **Cluster and visualize** because **Bootstrap 3** (loaded with Clustergrammer) sets **`html { font-size: 10px }`**. The app now pins **`html { font-size: 16px !important }`** so root **rem** stays stable after Bootstrap loads.

## [2.19] - 2026-04-12 11:41:21

### Fixed
- **Clustergrammer tab** **Feature label (rows)** was ignored: **`buildMatrixFromCurrentData()`** always used **matrix row IDs**, so **Enrichr** saw protein/accession-style IDs instead of **Genes**. Row names for the tab now come from **`getFeatureLabelForRow(..., 'clustergrammerFeatureLabelSelect')`** (same helper as heatmap / differential).
- Changing the dropdown **re-clusters the Clustergrammer tab** when a visualization is already open (`onClustergrammerFeatureLabelChanged`), not only when a Plotly heatmap exists.
- **DIANN protein-group** import stores **`diannPgGenesByRow`** (full-file **`Genes` / `Gene` / `Gene.Names`** column) so **Genes** labels work even if that column is not among the first six annotation fields. **`getDiffAnnotationColumnIndex`** matches common **Genes** header spellings; **`getRowProfileDisplayLabel`** delegates to **`getFeatureLabelForRow`** for consistency.

## [2.18] - 2026-04-12 11:33:41

### Fixed
- **Clustergrammer** **Feature label (rows)**: Labels were ignored whenever **`finalRowOriginalIndices`** was missing or length-mismatched (older heatmap cache, imports, edge cases) — the code fell back to matrix row IDs only. Clustergrammer conversion now **always** resolves indices with **`inferRowOriginalIndicesFromRowIds`** when needed, then applies **`getFeatureLabelForRow`** for the Clustergrammer select.
- After **`buildNetworkDataWithViews`**, row node **`name`** fields are **forced** from the chosen display names so **`parseRowName()`** (tuple-style names) and Clustergrammer’s **“super”** split on **`': '`** cannot replace DIANN/gene labels. Patched **all** `views[].nodes.row_nodes` using **`node.clust`** so top-*N* filtered views stay aligned.

## [2.17] - 2026-04-12 11:20:00

### Added
- **Heatmap** and **Clustergrammer** sidebars: **Feature label (rows)** dropdown (same choices as **Differential** / Row Profile: matrix row ID vs DIANN columns). Heatmap redraws row axis and labels **without re-clustering** when the selection changes. Clustergrammer uses the choice when building the network from the cached heatmap result (changing it re-runs **Cluster and visualize** if a heatmap exists).
- **`getFeatureLabelForRow`** shared helper; heatmap pipeline stores **`finalRowOriginalIndices`** so labels stay correct after sampling and row clustering. Session **`ui.inputs`** includes **`heatmapFeatureLabelSelect`** and **`clustergrammerFeatureLabelSelect`**.

## [2.16] - 2026-04-12 11:07:35

### Changed
- **Unified chrome tab theme** across the app: **CSS variables** (`--chrome-tab-*`) drive the same **blue active / cool grey inactive** look with **bold** labels, **gaps** between items, **rounded top** on horizontal bars, and a shared **bottom rule**. Applied to **main top tabs**, **Data PreProcess** sub-tabs, **Differential** sub-tabs, **heatmap** sub-tab row (if used), **Column profile** sample chooser, and **Document** outline buttons (full **rounded** chips in the vertical list). Cancels global `button` lift/shadow on these controls via `!important` where needed.

## [2.15] - 2026-04-12 11:03:38

### Fixed
- **Differential** tab sub-tabs (**Volcano**, **MA plot**, etc.): inactive tabs inherited global `button { color: white }`, producing unreadable labels on a light background. Inactive tabs now use **dark slate text** (`#1e293b`), slightly stronger borders, and hover/active overrides so **transform/box-shadow** from the global button style does not fight the tab chrome.

## [2.14] - 2026-04-11 21:58:11

### Added
- Top-level **Differential** tab: two-group **Welch** or **Student** **t-test** per feature; meta column grouping; optional **Log2(x+1)**, zero-as-missing, min values per group; **Benjamini–Hochberg**, **Bonferroni**, or no multiple-testing correction; **Plotly** volcano, MA, and **p-value histogram**; sortable **results table** with **CSV export**; chunked analysis with in-memory cache for threshold-only redraws. **Document** §9 describes behavior and limits (no paired/limma/ANOVA in v1).
- Session **JSON** `ui.inputs` includes differential sidebar control ids.

## [2.13] - 2026-04-11 17:41:28

### Added
- **Data PreProcess** → **Row Profile**: **Row label (list & plot legend)** dropdown — `Protein.Group`, `Protein.Names`, `Genes`, `First.Protein.Description`. Values come from DIANN protein-group annotation columns when present (case-insensitive header match); otherwise labels fall back to **matrix row IDs**. Changing the dropdown refreshes the checklist and replots if rows are selected.
- Session **JSON** `ui.inputs` now includes **`rowProfileLabelColumnSelect`** so the choice is saved/restored with **Export/Import session**.

### Changed
- Row Profile **sidebar width** increased by **40%** (220px → **308px**). Plot width offset updated (`panelW - 328`).

## [2.12] - 2026-04-11 17:32:39

### Changed
- **Row Profile** chart **fills the plot column** again: shell uses **`flex: 1`** with **no max-width / max-height cap**; Plotly **width/height** follow the shell’s measured box (fallback from panel size). Keeps framed card, **x-axis** margin / `automargin` / tick scaling from v2.11. Draw runs after **`requestAnimationFrame`** so flex layout is settled before measuring.

## [2.11] - 2026-04-11 17:30:14

### Changed
- **Data PreProcess** → **Row Profile**: chart is inside a **card** (border, radius, max-height ≈ `min(52vh, 460px)`, horizontal max-width 880px, scroll if needed). Plot size uses the card’s box (**~260–440px** tall) instead of filling the whole sub-tab—avoids the previous **600px** minimum from the global `.plot-container` rule (overridden for `#rowProfileEmbeddedPlot` inside the card).
- **Row Profile** Plotly layout: **larger bottom margin** scaled with sample count, **`xaxis.automargin`**, **`title.standoff`**, and **smaller tick fonts** when there are many samples so angled **sample names** fit more reliably.

## [2.10] - 2026-04-11 17:25:31

### Added
- **Data PreProcess** → **Row Profile** sidebar: **Quick selection** — **Select all rows**, **Select top N** (default `5`, editable) ranked by **sum of finite intensities** across samples, and **Clear selection** (duplicate clear button below Plot removed). Document § DIANN updated.

### Changed
- **Row Profile** plot: when more than 30 rows are selected, the first 30 traces follow **selection order** (e.g. top-by-sum order from quick select) instead of sorting by row index.

## [2.09] - 2026-04-11 17:19:47

### Added
- **Data PreProcess** → **Data Table**: intensity matrix is wrapped in a **scroll region** so **header row stays fixed** while scrolling vertically (`position: sticky` on the table header inside the scrollport). Pagination controls stay **below** the scroll area on large tables.
- **ID** column cells: when **DIANN protein group** annotations exist, hovering shows a **tooltip** (`title`) with the same **header: value** text as the DIANN annotations tab / Row Profile (long IDs use ellipsis; full text in the tooltip).

## [2.08] - 2026-04-11 17:15:02

### Changed
- **DIANN row annotations** moved from under **Data PreProcess** → **Data Table** to its own sub-tab **DIANN annotations** (tab is shown only after loading a DIANN protein group matrix). Sort order and pagination still follow the **Data Table** sub-tab; content refreshes when the matrix table updates.

## [2.07] - 2026-04-11 17:10:37

### Added
- **Data PreProcess** → **Data Table**: when data was loaded from a **DIANN protein group matrix**, a second read-only table **DIANN row annotations** appears **below** the intensity matrix. It lists the stored **first-column block** (typically six DIANN fields) plus a **Row ID (plot)** column. **Sort order** and **pagination** match the matrix table above.

## [2.06] - 2026-04-11 14:24:45

### Changed
- **Data PreProcess** → **Column profile**: ranked **bar + line** panel uses **scientific notation** on the linear **intensity** y-axis (`tickformat` `.2e`). With **log10(1 + intensity)**, y-axis ticks stay **fixed decimals** (`.2f`) since the scale is already compressed. Left margin widened slightly for tick labels.
- **Data PreProcess** → **Row Profile**: **bar** and **line** plots use scientific y-ticks for **linear** raw values; **log Y** and **Z-score** modes keep their previous tick styles (log default; z-score `.3f`).

## [2.05] - 2026-04-10 22:33:29

### Changed
- **DIANN protein group matrix** (`results.pg*_matrix.tsv`): default **row ID** for plots and tables is **`Protein.Names`** (dropdown default updated). The **first six columns** are stored as **`diannPgAnnotationHeaders`** / **`diannPgAnnotationRows`** on **`currentData`**.
- **Data PreProcess → Row Profile**: search matches the primary row ID **and** all stored DIANN annotation cells (gene, protein names, descriptions, etc.). Checklist items show a **tooltip** with the annotation summary when DIANN pg annotations are present.
- **ID column fallback** (when the selected header is missing): **`Protein.Names`** → **`Genes`** → **`First.Protein.Description`** → **`Protein.Group`** → first column.
- **Technical replicate filter**: when rows are dropped, **DIANN pg annotation rows** stay aligned with **`rowIds`** / **`dataMatrix`**.

## [2.04] - 2026-04-10 21:08:42

### Added
- **Data PreProcess** → **Row Profile**: optional **Z-score per row (across samples)** — each plotted row is normalized to mean 0 and sample SD 1 over finite values in that row, so **line/bar trends are comparable across rows**. Mutually exclusive with **log Y**; status note explains gaps and edge cases (fewer than 2 finite values, zero SD).

## [2.03] - 2026-04-10 21:00:53

### Changed
- **Column profile** is no longer a top-level tab; it lives under **Data PreProcess** as the fourth sub-tab (**Data Table** | **Meta Table** | **Row Profile** | **Column profile**), with the same plots and options. Document §8 and overview text updated.

## [2.02] - 2026-04-10 20:51:32

### Added
- **Column profile** top-level tab: **sub-tab buttons per sample column**; for each column, **Plotly** charts (interactive zoom/pan/hover, mode bar): ranked **bar + line** (high→low), **cumulative % of total** along that order, **treemap**, and **pie** (top *N* + **Other**). Sidebar: max features, optional **log10(1+I)** for the bar panel. Document §8 and `updateTablePreview` refresh when matrix columns/row count change.

## [2.01] - 2026-04-10 20:28:06

### Added
- **UpSet tab**: Collapsible sidebar **Set combinations (UpSet plot)** controls aligned with the [UpSet.js App](https://upset.js.org/app/) — **ordering** (multi-key, e.g. cardinality then name), **mode** (set intersections / unions / distinct intersections), **min** and **max** set members (degree), **max # combinations** after sort, and **include empty combinations**. The **UpSet** bar chart uses `UpSetJS.generateCombinations(sets, { … })` per [UpSet.js data docs](https://upset.js.org/docs/data/); **Venn** / **Karnaugh** unchanged. **Pop out** payloads include `combOptions` so `upset_popout.html` matches the main view.

## [2.00] - 2026-04-10 20:18:01

### Changed
- **UpSet tab**: The three **Pop out** controls moved from the left sidebar to the **main panel**, each on the same row as **UpSet**, **Venn diagram**, and **Karnaugh map** (compact **Pop out** label per section).

## [1.99] - 2026-04-10 20:04:47

### Changed
- **`upset_popout.html`**: Pop-out plots now use the same **`onHover`** + **`selection`** pattern as **`index.html`**, so hovering highlights intersections and the view stays responsive; **window resize** re-renders with updated width/height.

## [1.98] - 2026-04-10 19:48:19

### Fixed
- **UpSet pop-out** (`upset_popout.html`): Under **`file://`**, `sessionStorage` is usually **not shared** between `index.html` and `upset_popout.html`, so the pop-out showed “No plot data”. The main app now sends the payload with **`postMessage`** after `window.open` (without `noopener`/`noreferrer` so delivery works). The pop-out listens for that message and still uses `sessionStorage` when it is shared (e.g. **http://localhost**). Error text updated for the sidebar **Pop out** flow.

## [1.97] - 2026-04-10 11:59:44

### Fixed
- **UpSet / Venn / K-map**: Removed the **capture-phase** click listener on the whole UpSet tab (v1.96) that blocked UpSet.js from handling plot **toolbar** clicks—PNG, SVG, dump, VEGA, and Venn controls work again. The built-in **share** icon is disabled via `exportButtons: { share: false }`; use the sidebar **Pop out UpSet / Venn / K-map** buttons to open **`upset_popout.html`** with the same `sessionStorage` flow as before.

## [1.96] - 2026-04-10 11:54:45

### Fixed
- **UpSet / Venn / Karnaugh** in-plot **share** control: UpSet.js default opens <code>upset.js.org/app/embed.html</code> with a compressed URL that often **exceeds browser limits** for large proteomics sets, or **postMessage** fallback fails from <code>file://</code>. The app now **captures** share clicks and opens local <code>upset_popout.html</code> (same directory as <code>index.html</code>), passing membership via <code>sessionStorage</code>, so the matching plot renders full-size in a new window. Pop-out page disables share again to avoid a loop.

## [1.95] - 2026-04-10 11:44:45

### Changed
- **UpSet tab**: plot heights increased by **another 10%** (now **×1.21** vs original viewport-based caps). Host **min-height** 290px / 339px (Venn·K-map / UpSet).

## [1.94] - 2026-04-10 11:42:54

### Changed
- **UpSet tab**: heights passed to **UpSet**, **Venn**, and **Karnaugh** renders increased by **10%** (`hTop` / `hBottom`). Matching **min-height** on plot host containers (264px / 308px for UpSet).

## [1.93] - 2026-04-10 11:40:34

### Changed
- **UpSet tab layout**: **UpSet** remains full width on top; **Venn** and **Karnaugh map** sit in a **two-column row** below (left / right), with **~900px** breakpoint stacking them vertically. Render sizes use full main width for UpSet and half-width (minus gap) for the bottom pair.

## [1.92] - 2026-04-10 11:37:26

### Changed
- **UpSet tab** (bar label **UpSet / Venn / K-map**): **UpSet**, **Venn**, and **Karnaugh map** are shown in one scrollable column (no sub-tabs), similar to the linked [UpSet.js components](https://upset.js.org/docs/components) demo. **Hover** in any view drives shared `onHover` / `selection` so the same intersection (by **name**) highlights across all three. Lazy-load now requires `renderKarnaughMap`. Plot height per view is slightly reduced to fit three stacked charts.

## [1.91] - 2026-04-10 11:29:33

### Changed
- **UpSet / Venn** presence rule: the second mode is now **intensity &gt; threshold** with a numeric **Threshold** field (default **0**, same as previous “&gt;0”). Use a higher cutoff when low intensities should count as absent. **0** remains missing in both modes. Threshold input is enabled only when that mode is selected.

## [1.90] - 2026-04-09 22:20:18

### Changed
- **UpSet** plot: intersection / combination columns on the x-axis are ordered by **cardinality (count) from high to low**, with ties broken by degree then name.

## [1.89] - 2026-04-09 22:17:01

### Changed
- **UpSet / Venn**: **0** is always treated as **missing/NA** for set membership (both presence modes). The default rule label is now “finite **non-zero** number (0 counts as missing)”; the strict rule remains “value &gt; 0”.

## [1.88] - 2026-04-09 21:41:57

### Added
- **UpSet / Venn** top-level tab: lazy-loads [@upsetjs/bundle](https://www.jsdelivr.com/package/npm/@upsetjs/bundle) v1.11.0 (UMD global `UpSetJS`) from jsDelivr. **Set chooser**: filter box, checkboxes per sample column (default first five selected), Select all / Clear, presence rule (finite non-missing vs value &gt; 0), Refresh plots. Main area sub-tabs **UpSet** and **Venn** (Euler/Venn from the same membership data). Warning when more than six sets are selected. **License:** UpSet.js is **AGPL-3.0**—noted in sidebar, README, Document §7.

## [1.87] - 2026-04-09 14:15:44

### Added
- **Data PreProcess** → **Data Table** sub-tab: **clickable column headers** to sort the preview by **ID** (natural / numeric-aware string order) or by **numeric sample columns** (ascending/descending; missing values sort last). Sort applies to the full matrix before pagination; changing sort resets to page 1. Indicator: ⇅ (unsorted column), ▲/▼ (active column).

## [1.86] - 2026-03-23 20:37:34

### Changed
- **Meta Table** is no longer a top-level tab. It is a **third sub-tab** under **Data PreProcess** (order: **Data Table** | **Meta Table** | **Row Profile**). The former `metaTab` panel (sidebar + `metaTablePreview`) is now `#tableMetaPanel` inside `#tableTab`. Top-level tab bar: removed **Meta Table** button; `switchTab` `tabNames` no longer includes `meta`. Added **`switchToDataCheckSubTab(subTab)`** helper (`switchTab('table')` + `switchTableSubTab`). Data Preparation hint text updated for editing metadata.

## [1.85] - 2026-03-23 20:35:41

### Changed
- **Data PreProcess** tab: removed the single outer sidebar. **Data Table** and **Row Profile** sub-tabs each have their own sidebar: **Technical replicate based filtering** moved into **`.table-data-sidebar`** beside the table preview (`.table-data-workspace` = sidebar + `.table-data-main`). **Row Profile** layout unchanged (existing row-profile sidebar + plot). In-app Document updated. Narrow viewports (~720px): Data Table sidebar stacks above the preview.

## [1.84] - 2026-03-23 20:31:53

### Changed
- **Tab label**: The tab previously named **Data Matrix** is now **Data PreProcess** (internal id `switchTab('table')` / `#tableTab` unchanged). Sidebar heading and in-app Document text for technical replicate filtering updated accordingly.

## [1.83] - 2026-03-23 20:28:22

### Changed
- **Technical replicate based filtering** moved from **Data Preparation** to the **Data Matrix** tab **sidebar** (same button and `techReplicateFilterStatus` as before). **Data Matrix** sidebar no longer shows **Open Data Preparation** (that shortcut remains on the **Meta Table** tab for metadata uploads). In-app Document (technical replicate section) updated to point to the Data Matrix sidebar.

## [1.82] - 2026-03-23 20:25:02

### Changed
- **Data Preparation** tab: **three-column layout** — **Data matrix** (left), **Meta table** (middle), **Session snapshot (JSON)** (right). Export/import controls and Clustergrammer include checkbox moved to the third column; a short tip box notes file-size tradeoffs. Responsive stack breakpoint set to **1100px** width (columns stack vertically below that).

## [1.81] - 2026-03-23 20:22:58

### Changed
- **Data Preparation** tab: **two-column layout** — **Data matrix** upload UI in the **left** column, **Meta table** upload UI in the **right** column (`.data-prep-columns` / `.data-prep-col`). Below **960px** width the columns **stack** vertically. Sections expand to equal column height via flex.

## [1.80] - 2026-03-23 20:13:19

### Changed
- **UI**: New first tab **Data Preparation** (working title). All **data matrix** upload controls (examples, paste, clean file, DIANN pg/gg, technical replicate filter, session JSON) and **meta table** upload (example, paste, file) moved here from the **Data Matrix** and **Meta Table** sidebars. **Data Matrix** tab sidebar now links to Data Preparation; **Meta Table** tab keeps column/batch editing and links to Data Preparation for uploads. Default tab on load is **Data Preparation**. `switchTab` tab order updated (`dataPrep` first). In-app Document text for technical replicate filter and Clustergrammer “load data first” message updated accordingly.

## [1.79] - 2026-03-23 19:56:58

### Fixed
- **Session JSON export**: **`analysis.lastClustergrammerNetworkData`** now includes the Clustergrammer network when the graph was produced from the **Clustergrammer** tab (`cgmLastRenderedNetwork` / instance), not only from the legacy heatmap-panel path (`lastClustergrammerNetworkData`). **`clustergrammerHadInstance`** is true if either the heatmap-panel or tab Clustergrammer instance exists.
- **Session import**: If **`#clustergrammerContainer`** is absent (heatmap sub-panel removed), restored network data is applied with **`runClustergrammerCgmTab`** so the Clustergrammer tab shows the imported graph.

## [1.78] - 2026-03-23 19:51:15

### Added
- **Session JSON (`formatVersion: 2`)**: Top-level **`plotting`** object with **`heatmapGroupAnnotations`**, **`pcaGroupAnnotations`**, and **`tsneGroupAnnotations`**. Each records **`selections`** (per metadata column: checkbox on/off), **`selectedOrder`** (column order used for PCA/t-SNE), and **`firstColorScheme`** (dropdown value `0`–`7` for the first selected column’s discrete palette on PCA/t-SNE). The same data is still under **`ui.pcaGroups`** / **`ui.tsneGroups`** for compatibility. Import restores PCA/t-SNE group UI after rebuilding checkbox DOM; fixed import to call **`updateTsneGroupAnnotationCheckboxes`** (correct casing).

## [1.77] - 2026-03-23 15:56:30

### Added
- **Session snapshot (JSON)** (Data Matrix sidebar): **Export session to JSON** saves the loaded **data matrix**, **meta table**, sidebar **UI** (heatmap / PCA / t-SNE controls and heatmap group annotation selections), and analysis caches: **heatmap** clustered result (`lastHeatmapResult`, restored without re-clustering via refactored `plotHeatmapFromClusteringResult`), **PCA** (`pcaResult` + `pcaDataHash`), **t-SNE** (`tsneResult` + `tsneDataHash`). Optionally includes **Clustergrammer** `lastClustergrammerNetworkData` (checkbox “Include Clustergrammer network”; larger files). **Import session from JSON** restores state and redraws heatmap/PCA/t-SNE/Clustergrammer when snapshots exist. Format: `qc-session-snapshot`, `formatVersion: 1`.

### Changed
- **Heatmap**: Plotly rendering from clustered results is now in **`plotHeatmapFromClusteringResult(bundle)`** so the same path is used for live clustering and for session reload.

## [1.76] - 2026-03-23 15:40:39

### Added
- **PCA plot tooltips**: Hovering a sample point now shows **all metadata columns** for that sample (matched by `Sample_ID` to the column header), plus **scores and variance %** for the two plotted PCs. Values are HTML-escaped for safety. Floating labels and ellipse traces do not show a hover box. Layout uses a wider tooltip (`namelength: -1`, left-aligned).

## [1.75] - 2026-03-23 15:35:26

### Changed
- **PCA**: **Show group confidence ellipses (95%)** is explicitly **on by default** (`checked="checked"` plus startup `defaultChecked` / `checked` on the control so the option stays enabled after load).

## [1.74] - 2026-03-23 15:29:39

### Added
- **PCA tab**: Optional **Show group confidence ellipses (95%)** checkbox (on by default). When metadata group annotations are used to color the PCA scatter, each group with at least three points gets a semi-transparent ellipse (95% χ² concentration ellipse from the sample covariance on the plotted PCs). Ellipses are drawn under the markers. Uncheck the option to hide them.

## [1.73] - 2026-03-21 15:00:45

### Changed
- **Clustergrammer** (`js/clustergrammer.js`): Default **Column Order** is **Alphabetically** (library `inst_order.row = 'alpha'`, `inst_order.col = 'clust'` — row/col naming is swapped in the viz). The **Column Order** sidebar buttons reflect this on first render; column clustering is still computed in the worker; users can switch to **Cluster** or other orders in the sidebar. Removed the earlier index.html workaround that pre-sorted the matrix and overrode worker column order.

## [1.72] - 2026-03-21 14:56:21

### Changed
- **Clustergrammer tab**: **Column order** is **alphabetical** by sample/column name by default (using `localeCompare` with numeric sorting). The matrix is reordered accordingly before clustering; **row** clustering is unchanged. After the worker runs, column **hierarchical** order is not used for display—columns stay alphabetical and the column dendrogram is a synthetic tree matching that left-to-right order.

## [1.71] - 2026-03-21 14:52:55

### Changed
- **Clustergrammer tab**: **Log10 transform matrix** is checked by default; **Z-score per row** is unchecked by default.

## [1.70] - 2026-03-21 14:49:22

### Added
- **Clustergrammer tab**: Optional **Log10 transform matrix** checkbox in the sidebar (above **Z-score per row**). When enabled, the data matrix is log10-transformed before hierarchical clustering and network build; non-positive or invalid values are replaced with `1` before `log10` (so missing/low values map to 0 on the log scale), then the usual downstream steps (z-score if enabled, etc.) apply.

## [1.69] - 2026-03-20 12:15:15

### Fixed
- DIANN sample header simplification now trims the common prefix only up to the last separator boundary (e.g. `_`/`-`/`.`/space), preventing accidental removal of the first character of the next token (example: `..._pituitary_DKO_R1.raw` now becomes `pituitary_DKO_R1`).

## [1.68] - 2026-03-16 11:10:00

### Added
- **Row Profile color themes**: The Row Profile sidebar now includes a **Color theme** selector instead of a single trace color picker. Users can choose between:
  - **Default (Plotly)** — use Plotly’s built-in color cycle,
  - **Distinct (Category10)** — high-contrast colors for multiple rows,
  - **Warm**, **Cool**, **Pastel**, **Dark**, and **High contrast** palettes.
- When a non-default theme is selected, each plotted row is assigned a distinct color from the chosen palette in both bar and line modes.

## [1.67] - 2026-03-16 11:00:00

### Added
- **DIANN gene-group upload support**: New "DIANN Gene Group Matrix" uploader in the Data Matrix sidebar accepts DIANN `results.gg*_matrix.tsv` files. The parser:
  - assumes the first three columns are `Genes`, `N.Sequences`, and `N.Proteotypic.Sequences`,
  - treats the first column (`Genes`) as the fixed row ID for all downstream plots/analyses,
  - reads intensity values from column 4 onward,
  - simplifies raw-file path headers to concise, informative sample names using the existing DIANN header rules,
  - replaces missing/invalid intensity values with `0` and drops rows where the `Genes` ID is blank.

## [1.66] - 2025-02-24

### Removed
- **Clustergrammer tab: "Load small example"**: The Examples section, the "Load small example (6×8)" button, the embedded SMALL_EXAMPLE_CGM data, and its click handler have been removed. The tab now only supports "Use current data" for clustering.

## [1.65] - 2025-02-24

### Changed
- **Clustergrammer scripts moved to `js/`**: The six Clustergrammer-related scripts are now loaded from `js/` (clustergrammer.js, clustergrammer_network.js, clustergrammer_cluster_worker.js, send_to_Enrichr.js, Enrichrgram.js, hzome_functions.js) instead of `clustergrammer/js/`. This allows the temporary `clustergrammer/` folder to be removed later without breaking the Clustergrammer tab.

## [1.64] - 2025-02-24

### Added
- **Top-level Clustergrammer tab**: A new tab "Clustergrammer" appears after Heatmap. Data is taken from the Data Matrix and Meta Table tabs: the matrix (rows × samples) and metadata (e.g. sample-to-group) are passed into the Clustergrammer tab for hierarchical clustering and interactive heatmap visualization.
- **Clustergrammer tab features**: "Use current data" builds the matrix from `currentDataMatrix` and `currentData` (row/column IDs) and optional `metaData` (column categories for annotations); "Load small example" runs the demo’s 6×8 example; clustering options (distance, linkage, prefilter N, z-score) and label scale inputs in the sidebar; progress bar and cancel during clustering; container sized from the tab’s main content area; resize on tab switch and window resize.
- **Demo integration**: `clustergrammer_cluster_worker.js` is loaded with other Clustergrammer deps so `_clusterWorkerSrc` is set; `clusterAndVisualizeCgmTab`, `buildNetworkFromMatrixCgmTab`, `buildSyntheticDendrogram`, and `runClustergrammerCgmTab` port the demo’s clustering and rendering flow into the new tab.

## [1.63] - 2025-02-24

### Changed
- **Clustergrammer removed from Heatmap tab**: The Clustergrammer sub-tab and panel have been removed from the Heatmap tab. The Heatmap tab now shows only the Plotly heatmap (no Plotly | Clustergrammer sub-tabs). Sub-tab row and Clustergrammer panel were removed from the DOM; `generateClustergrammer()` is no longer called after heatmap generation; `switchHeatmapSubTab` was removed; `clearClustergrammerViz` no longer references the removed elements.

## [1.62] - 2025-02-24

### Fixed
- **Clustergrammer main graph disappearing when sidebar is shown**: Matched demo behavior — do not call `resize_viz()` after creation (demo only calls it on window resize). Removed the 100ms and 500ms post-creation `resize_viz` and root re-sizing. Root container gets dimensions only from JS (no `flex: 1` / `width: 100%` / `height: 100%`). Defer the build callback by one `requestAnimationFrame` after setting root size so the browser applies styles before the library reads them; re-assert root width/height immediately before `Clustergrammer()` so the library always gets valid dimensions.

## [1.61] - 2025-02-24

### Changed
- **Clustergrammer uses full space and shows by default**: After generating the heatmap, the Clustergrammer view is shown by default (instead of Plotly). The Clustergrammer panel and container use flex layout to fill the available tab content area. Container dimensions are measured after layout (requestAnimationFrame) so the widget uses the full space.
- **Clustergrammer sidebar menu visible by default**: The Clustergrammer sidebar (Row Order, Column Order, Find & Highlight, sliders, Matrix Values legend) is no longer hidden on load or when switching to the Clustergrammer tab; it is shown by default so the full menu is available immediately.

## [1.60] - 2025-02-24

### Fixed
- **Clustergrammer trapezoid sliders (dendrogram threshold) only had two states**: Group information from clustering was not passed into Clustergrammer `network_data` in the same way as in `clustergrammer_demo.html`. When row/column dendrograms exist, `convertHeatmapToClustergrammerNetwork()` now uses `ClustergrammerNetwork.buildNetworkDataWithViews()` (same as the demo) to build the network so row/column nodes get correct multi-level `group` arrays and the trapezoid sliders show all 11 threshold levels. Top-level `row_nodes`/`col_nodes` are set from the first view’s nodes (shallow copy) to match the demo; metadata (col_cat, cat-0, etc.) is merged after the build. (2) Network data was built before Clustergrammer scripts loaded, so `ClustergrammerNetwork` was always undefined; `generateClustergrammer()` now builds network data inside the `loadClustergrammerDependencies` callback so `buildNetworkDataWithViews` runs after the script is available.

## [1.59] - 2026-03-13 15:30:33

### Added
- **Clustergrammer demo integration**: Replaced CDN Clustergrammer with the local demo stack and wired Enrichr + Find & Highlight.
  - **Scripts**: Load `clustergrammer/js/clustergrammer.js`, `clustergrammer_network.js`, `send_to_Enrichr.js`, `Enrichrgram.js`, `hzome_functions.js`; set `window.enrich` for Enrichr export.
  - **Grouping fix**: `convertHeatmapToClustergrammerNetwork()` uses `ClustergrammerNetwork.dendrogramToGroupArrays()` when available (demo’s corrected dendrogram → group arrays for threshold sliders).
  - **Enrichr**: After Clustergrammer is created, `check_setup_enrichr(clustergrammerInstance)` is called so the Enrichr logo and “Export gene list” appear when the row dendrogram is selected.
  - **Find & Highlight**: Row/column search inputs (from Clustergrammer sidebar), label and heatmap overlay highlights, Clear all, Filter (show matched only), and Restore full view. Helpers and document-level event delegation added; `applyAllHighlights` runs after each render when not in filter mode.
  - **Callbacks**: `dendro_callback` (show/hide Enrichr section by row/col) and `matrix_update_callback` (clear Enrichr results on matrix update) added to Clustergrammer config.

## [1.58] - 2026-03-10 11:20:00

### Changed
- **Full S/R/T naming convention support**: `extractReplicateInfoRT()` now also extracts a `Group` by tokenising each sample name and removing all `S#`, `R#`, `T#` tokens — whatever remains (e.g. `vector`, `bait`) is the group label. `generateMetaDataFromColumns()` uses a new two-path logic:
  - **S/R/T detected** → `Group` = extracted remainder; `Sample` (S#), `Biological_Replicate` (R#), `Technical_Replicate` (T#) added as available.
  - **No S/R/T** → original auto-inference (prefix extraction, treatment/batch keywords, position fallback).
- Supports naming patterns like `vector_S1_R1_T1`, `bait_S1_R2_T3`, `S1_T1`, etc.

## [1.57] - 2026-03-10 11:05:00

### Fixed
- **DIANN sample names starting with digits**: `simplifyDIANNSampleNames()` now detects when every simplified name starts with a digit (e.g. `1_T1`, `2_T3` after path/common-prefix removal) and prepends `S` to each, producing `S1_T1`, `S2_T3`, etc. This feeds cleanly into the existing `S#` pattern detection so the meta table gets a `Sample` column (`S1`, `S2`, …) instead of a numeric `Group`.

## [1.56] - 2026-03-10 10:50:00

### Fixed
- **S# grouping in metadata**: When all sample names carry a complete `S1..SN` pattern (e.g. `S1_T1`, `S1_T2`, `S2_T1`…), the auto-generated meta table now shows a `Sample` column (values `S1`, `S2`, …) **instead of** a `Group` column. Previously both columns were generated with the same values, causing redundancy.
- **Technical replicate filter with Sample column**: `applyTechnicalReplicateFiltering()` now recognises `Sample` as an alias for `Group` so it correctly partitions samples by `Sample` value when that column is used.

## [1.55] - 2026-03-10 10:38:41

### Changed
- **Sample name parsing — S# pattern support**: `extractReplicateInfoRT()` now also detects `S1, S2, ...` token patterns (same boundary rules as `R#`/`T#`). When all sample names carry a complete `S1..SN` sequence, a `Sample` column is added to the auto-generated metadata table with the full `S`-prefixed labels (e.g. `S1`, `S2`). The `S` character is preserved in both the `Sample_ID` and the new `Sample` column.

## [1.54] - 2026-03-09 16:20:00

### Fixed
- **Web Workers broken on Chrome + file://** after v1.53 moved them to `new Worker('js/file.js')`. Chrome blocks `new Worker()` for `file://` URLs.

### Changed
- Each worker JS file (`js/clustering.worker.js`, `js/pca.worker.js`, `js/tsne.worker.js`) now wraps its source in a `window._*WorkerSrc` string variable instead of being a bare worker script.
- The three files are loaded via `<script src="...">` tags in `<head>` (which Chrome allows on `file://`), then `initWorkers()` creates Blob URLs from the string globals — same technique as before but with code cleanly separated into dedicated files.

## [1.53] - 2026-03-09 16:07:39

### Changed
- **Web Workers extracted to separate files**: The three inline Blob-based workers have been moved out of `index.html` into dedicated files:
  - `js/clustering.worker.js` — hierarchical clustering (Lance-Williams, euclidean/manhattan/correlation)
  - `js/pca.worker.js` — PCA via typed-array power iteration
  - `js/tsne.worker.js` — exact t-SNE (O(n²))
- `initWorkers()` in `index.html` now uses simple `new Worker('js/*.worker.js')` calls instead of Blob URLs. This requires an HTTP server (or Firefox) when opening via `file:///`; Chrome on `file://` will need a local server.
- `index.html` is now ~800 lines shorter.

## [1.52] - 2026-03-09 12:55:00

### Fixed
- **Duplicate example buttons removed**: The "Load Example Data" and "Load DIANN pg matrix" buttons appeared twice in the Data Matrix sidebar (once in an unlabelled top section and again inside "Example Workflows"). The redundant top section — along with its duplicate `exampleStatus` / `exampleDiannStatus` element IDs — has been removed. Only the "Example Workflows" section remains.

## [1.51] - 2026-03-09 12:47:00

### Changed
- **LFQ example data now fully static**: Replaced the on-the-fly `generateLFQProteomicsData()` generator in `js/example_matrix_data.js` with a pre-generated, fixed-seed (42) static JSON object (600 proteins × 30 samples). `window.exampleData` is exposed as a lazy getter that reconstructs the TSV string on first access; `window.exampleSampleNameToIndex` is also embedded statically. `index.html` required no changes.

## [1.50] - 2026-03-09 12:39:17

### Changed
- **DIANN example data fully embedded**: Converted `results.pg_matrix.tsv` (2000 rows × 42 columns) to a JSON object embedded directly in `js/example_diann_pg_matrix.js`. Clicking "Load DIANN pg matrix" now reads the data entirely from this JS file — no XHR fetch of `results.pg_matrix.tsv` is needed. `window.exampleDiannPgMatrixText` is exposed as a lazy getter that rebuilds the TSV string from the JSON on first access. `index.html` required no changes (existing conditional logic already handles both paths).

## [1.49] - 2026-03-09 12:30:13

### Added
- **Example data JS extraction**: Moved the large simulated LFQ example matrix into `js/example_matrix_data.js` and load it lazily when example data/metadata are requested.
- **DIANN example pg-matrix loader**:
  - New script `js/example_diann_pg_matrix.js` that provides access to the bundled `results.pg_matrix.tsv` via a helper.
  - New Data Matrix sidebar button `Load DIANN pg matrix` that loads the DIANN example through the existing `parseDIANNProteinGroupMatrix` + `finishFileLoading` pipeline.

### Improved
- `loadExampleData` / `loadExampleMetaData` now use lazy script loading and the global `window.exampleData`, keeping `index.html` smaller and avoiding upfront example-generation cost.

## [1.48] - 2026-03-05 14:56:18

### Fixed
- **Document tab blank issue**: Corrected tab markup nesting (the `t-SNE` tab is now properly closed before `Document` tab), so the Document tab content renders normally.

### Changed
- **Document tab UX**: Reworked to outline-navigation style:
  - left sidebar shows clickable section outline,
  - right panel shows only the selected section content.

## [1.47] - 2026-03-05 14:53:21

### Added
- **Document tab**: Added a new top-level `Document` tab in the main UI.

### Documented
- In-app workflow notes now cover:
  - input data expectations,
  - DIANN upload/ID-column behavior,
  - replicate metadata parsing rules (`R#`, `T#`),
  - hard-coded technical replicate based filtering algorithm,
  - post-filter cache/state refresh behavior.

## [1.46] - 2026-03-05 14:48:22

### Added
- **Data Matrix sidebar action**: Added a new button `Technical replicate based filtering` in the Data Matrix tab.

### Implemented
- **Technical-replicate consistency filter (hard-coded)**:
  - Runs only when metadata contains valid technical replicate groups (`Technical_Replicate` with complete `T1..TN` pattern).
  - Filtering is applied within each valid technical-replicate group (group key uses `Group`, and `Biological_Replicate` when available).
  - For each row and each valid technical group: if any replicate value is missing/invalid/`0` (or `<= 0`), all values in that row for that technical group are set to `0`.
  - After filtering, rows with all values missing/invalid/`0` across all samples are removed.

### Updated
- Data and plot caches are reset after filtering (heatmap/PCA/t-SNE/Clustergrammer) and table/row-profile selectors are refreshed to match the filtered matrix.

## [1.45] - 2026-03-05 14:24:58

### Improved
- **DIANN replicate parsing is more flexible**: Metadata extraction now detects replicate tags independently for biological (`R#`) and technical (`T#`) replicates.

### Added
- **Partial replicate-axis support**: If sample names contain a complete `R1..RN` pattern (even without `T#`), `Biological_Replicate` is populated.
- If sample names contain a complete `T1..TN` pattern (even without `R#`), `Technical_Replicate` is populated.

### Notes
- A replicate axis is accepted only when all samples contain that axis and observed indices form a complete contiguous sequence from `1` to `N`.

## [1.43] - 2026-02-24

### Fixed
- **Row Profile plot overflow after adding settings sidebar**: Plot width now uses the actual plot-area container width (excluding the left Row Profile settings sidebar) instead of the full panel width. This prevents the chart from extending outside the browser viewport.

## [1.42] - 2026-02-24

### Added
- **Row Profile settings sidebar**: Added a compact settings panel inside `Data Matrix -> Row Profile` with:
  - plot type selector (`Bar plot` / `Line plot`)
  - `Use log scale (Y axis)` toggle

### Improved
- Changing Row Profile plot settings now re-renders the current selection immediately (when rows are already selected).
- Added a note in the settings panel when log scale is enabled and non-positive values are hidden.

## [1.41] - 2026-02-24

### Fixed
- **Row profile plot height increasing after repeated "Plot selected rows" clicks**: Switched row-profile rendering from autosize `Plotly.newPlot` to explicit panel-based width/height with `Plotly.react`, and set a fixed target div height before render. This prevents cumulative growth in flex layout.

## [1.40] - 2026-02-24

### Changed
- **Row Profile moved under Data Matrix as sub-tab**: Removed top-level `Row Profile` tab and introduced Data Matrix sub-tabs (`Data Table`, `Row Profile`) within the Data Matrix main panel. This creates a scalable structure for adding more Data Matrix sub-tools in the future.

### Updated
- `Plot selected rows` now switches to `Data Matrix -> Row Profile` sub-tab and renders there.
- Data Matrix tab remembers the current sub-tab and resizes the row-profile plot appropriately when re-entering the tab.

## [1.39] - 2026-02-24

### Changed
- **Row profile visualization now opens in dedicated tab**: Added a new top-level `Row Profile` tab immediately after `Data Matrix`. The "Plot selected rows" action now renders directly in this tab (`rowProfileEmbeddedPlot`) instead of relying on popup modal display.

### Improved
- Added an in-tab placeholder with usage guidance before first row-profile render.
- Row-profile tab now resizes the Plotly chart correctly on tab switch.

## [1.38] - 2026-02-24

### Fixed
- **Row profile modal not reliably opening**: Made row-profile plot actions robust by (1) adding direct `onclick` handlers for "Plot selected rows" and "Clear selection", (2) improving the generic `data-action` click dispatcher to use `closest('[data-action]')` instead of only `event.target`, and (3) raising modal overlay z-index to ensure visibility above all tab content.

## [1.37] - 2026-02-24

### Fixed
- **Row profile modal showed on other tabs**: The Data Matrix row-profile popup modal is now automatically closed when switching away from the Data Matrix tab, preventing it from overlaying t-SNE/PCA/Heatmap views.

## [1.36] - 2026-02-24

### Added
- **Data Matrix row profile bar chart explorer**: Added searchable row-ID selection in the Data Matrix tab with multi-select checkboxes and a Plotly popup modal to compare selected row profiles across all samples.

### Features
- Search IDs from the Data Matrix `ID` column.
- Multi-select rows (supports comparing many rows; chart shows up to first 30 traces for readability).
- One-click plotting in a modal (`Row Profile Across Samples`) using grouped bars.
- Clear selection button and automatic cleanup of stale selections after loading a new dataset.

## [1.35] - 2026-02-24

### Added
- **Automatic replicate metadata parsing from DIANN-like sample names**: During metadata auto-generation, sample names with postfix pattern `R<number>_T<number>` (also supports separators `-` or `.`) are now detected and parsed into two new meta columns: `Biological_Replicate` and `Technical_Replicate` (e.g., `R12_T1` -> `Biological_Replicate=R12`, `Technical_Replicate=T1`).

### Behavior
- Replicate columns are added only when the full sample set matches the `R#_T#` postfix pattern, to avoid partial/noisy metadata inference.

## [1.34] - 2026-02-24

### Changed
- **Plotly heatmap default size now auto-fills usable space**: `heatmapWidth` and `heatmapHeight` inputs now default to blank (`Auto`) and the Plotly heatmap uses `autosize: true`, so initial render occupies 100% of the available plot area. Users can still enter explicit width/height values afterward to override.

## [1.33] - 2026-02-24

### Added
- **DIANN row-ID column selection**: Added a selector in the DIANN uploader to choose which column is used as row IDs for plots and downstream analysis. Options include `Genes` (default), `First.Protein.Description`, `Protein.Group`, and `Protein.Names`.

### Changed
- **DIANN default ID behavior**: DIANN import now defaults to using `Genes` as row IDs instead of always using the first column.

### Fixed
- **Blank DIANN ID rows when not using `Protein.Group`**: If selected ID column values are blank (common for some rows in `Genes` or `First.Protein.Description`), those rows are now removed during import. A summary of removed blank-ID rows is shown in the upload success message.

## [1.32] - 2026-02-24

### Fixed
- **Clustergrammer sliders still only two states**: Use unique merge heights only when building cut levels so we get up to 11 distinct cut heights (instead of many duplicate heights giving the same cluster count). Added defensive null checks in collect/cut and a console log of unique heights and cluster counts at L=0 and L=10 for debugging. If you still see only two states, check the browser console for "Clustergrammer group arrays: unique heights=…" to confirm the dendrogram is being read.

## [1.31] - 2026-02-24

### Fixed
- **Clustergrammer threshold sliders: only two states (1 vs n clusters)**. Cut heights were in a narrow band above maxHeight (so L=0..9 never merged) and only L=10 used maxHeight. We now collect all internal node heights, sort them descending, and use them for cut heights: L=0 uses maxHeight+ε (no merge, n clusters), L=1 uses maxHeight (2 clusters), L=2..9 use interpolated heights from the tree, L=10 uses minHeight (merge everywhere, 1 cluster). Slider now has multiple distinct middle levels.

## [1.30] - 2026-02-24

### Fixed
- **Clustergrammer threshold sliders: click-and-drag now works**: We were stopping propagation for mousedown, mousemove, mouseup, and click on the slider groups. D3's drag behavior attaches mousemove/mouseup listeners on document, so stopping those on the slider group prevented them from reaching document and the drag never updated. Now we only stop mousedown and click (so the SVG zoom doesn't capture the initial click); mousemove and mouseup are allowed to bubble so the blue circle can be dragged.

## [1.29] - 2026-02-24

### Fixed
- **Clustergrammer threshold sliders always showing one cluster**: Corrected dendrogram-to-group logic. (1) When merging a subtree into one cluster we now pass the same `nextId` to both children and return `nextId + 1` (was passing `leftRes.nextId` to the right and returning `rightRes.nextId`, so the merge branch was wrong). (2) Cut heights: level 0 must give many clusters (slider down) and level 10 one cluster (slider up); we were using cut at 0 at level 10 so every node had height >= 0 and always merged. Now cut height is `maxHeight * (1 + (1 - L/10)*0.001)` so L=0 cuts above the tree (always split), L=10 cuts at root (one cluster).

## [1.28] - 2026-02-24

### Fixed
- **Clustergrammer dendro threshold sliders (triangle bars) not working**: The sliders control clustering granularity via each node's `group` array (levels 0–10). We were passing a flat `[1,1,...,1]` for every row/column, so there was no hierarchy for the sliders to change. Now we build proper group arrays from the heatmap's dendrograms: added `dendrogramToGroupArrays(dendrogram, numLevels)` to cut the tree at 11 heights and assign cluster ids per level, and use these in `convertHeatmapToClustergrammerNetwork` for both row and column nodes when `rowDendrogram`/`colDendrogram` and clustering are present. The two triangle slider bars should now change the visible clusters as in the [Clustergrammer examples](https://maayanlab.cloud/clustergrammer/).

## [1.27] - 2026-02-24

### Fixed
- **Clustergrammer dendrogram threshold sliders not responding**: (1) Added CSS so `.super_background` and `.borders` use `pointer-events: none` and `.row_slider_group` / `.col_slider_group` use `pointer-events: all`. (2) Zoom is attached to the whole `.viz_svg`, so it was capturing slider mousedown/click; added `attachClustergrammerSliderEventFix()` to stop propagation for mousedown, mousemove, mouseup, and click on the slider groups so the sliders receive the events. The fix runs after viz creation, after resize, and when switching to the Clustergrammer tab.

## [1.26] - 2026-02-24

### Changed
- **Clustergrammer sidebar hidden by default**: When switching to the Clustergrammer tab (or when the Clustergrammer viz is first created), the sidebar is now hidden by default so the heatmap uses the full width with no overlap. Users can show the sidebar anytime using the built-in show/hide sidebar button.

## [1.25] - 2026-02-24

### Fixed
- **Clustergrammer plot showing then disappearing on tab switch**: Caused by multiple rapid `resize_viz()` calls and using `width`/`height` 100% (which can compute to 0 when the panel was hidden). Now the container uses explicit pixel dimensions (1200×650 when hidden, or measured size when visible). On switching to the Clustergrammer tab we set the container to the current layout size and call `resize_viz()` only once after 200ms, then re-apply the gradient after 150ms, so the plot stays visible.

## [1.24] - 2026-02-24

### Changed
- **Clustergrammer width & plot size**: Increased the default minimum size of the Clustergrammer container to 900×550 and made it use `width: 100%` and `height: 100%` so it can expand to the full available panel width. This makes the actual heatmap plot area significantly wider and better utilizes screen space, especially on first render.

## [1.23] - 2026-02-24

### Fixed
- **Clustergrammer heatmap blank on first view**: Heatmap was not drawing when opening the Clustergrammer tab because the viz was created while the panel was hidden (Plotly active), so it had wrong/zero dimensions. Now the container is given explicit size when hidden (800×500), and when switching to the Clustergrammer tab we run `resize_viz()` multiple times (0, 100, 300, 600 ms) so the heatmap redraws correctly with the visible size.

## [1.22] - 2026-02-24

### Changed
- **Clustergrammer sidebar behavior**: Sidebar now shows by default on initial Clustergrammer render, but can still be hidden by the built-in maximize/fullscreen button and re-shown via the show/sidebar button. Removed hard CSS forcing it always visible and replaced with a one-time initialization adjustment that respects subsequent user toggles.

## [1.21] - 2026-02-24

### Enhanced
- **Automatic example data & metadata loading**: "Load Example Data" button now automatically loads both example data and metadata. "Load Example Meta Data" button also loads example data if not already present. Includes smart loop prevention and updated status messages to show combined loading progress.

## [1.20] - 2026-02-24

### Enhanced
- **Group annotation default selection**: All group annotation checkboxes for heatmap are now checked by default instead of only the "Group" column. Users no longer need to manually check each metadata column they want to display as group bars on the heatmap.

## [1.19] - 2026-02-24

### Enhanced
- **Plotly heatmap group bar thickness**: Reduced group annotation bar thickness from 5% to 2.5% of plot height per bar (50% thinner) for cleaner appearance and better space utilization. Updated all layout calculation functions to maintain consistent bar proportions.

## [1.18] - 2026-02-24

### Enhanced
- **Clustergrammer metadata independence**: Modified Clustergrammer to display ALL available metadata columns regardless of group annotation checkbox selection. Users no longer need to check group annotation options before generating heatmap - all metadata columns are automatically available in Clustergrammer while Plotly heatmap still respects checkbox selection.

### Added
- **getAllAvailableGroupColumns()**: New function to retrieve all metadata columns (excluding Sample_ID) for Clustergrammer visualization. Added comprehensive console logging to show which columns are available vs. selected.

## [1.17] - 2026-02-24

### Fixed
- **Clustergrammer column grouping display**: Fixed issue where metadata/grouping information wasn't visually displayed as colored bars on top of the Clustergrammer heatmap. Added comprehensive Clustergrammer initialization parameters including `show_categories`, `col_categories`, category colors, and post-initialization category display forcing.

### Enhanced  
- **Clustergrammer category support**: Added multiple network data formats (`col_cat`, `group_info`, `col_cat_colors`) to ensure compatibility with different Clustergrammer versions. Implemented automatic category color assignment using discrete color schemes.

## [1.16] - 2026-02-24

### Fixed
- **Metadata/grouping information in Clustergrammer**: Fixed issue where only the first selected group column was passed to Clustergrammer JSON data. Now ALL selected group columns are properly included as categories (cat-0, cat-1, cat-2, etc.) with comprehensive group information for proper visualization of sample annotations.

### Enhanced
- **Clustergrammer metadata support**: Added complete group_info structure to network data including category titles, group names, and indices. Added debug logging to verify metadata transmission to Clustergrammer.

## [1.15] - 2026-02-24

### Fixed
- **Missing values display in Clustergrammer**: Fixed issue where missing values (replaced by 1 → log-transformed to 0) showed as blank/white in Clustergrammer visualization. Added small epsilon (1e-12) to zero values after log transformation to ensure they receive visible colors in the gradient scale.

### Enhanced
- **Data processing consistency**: Applied epsilon fix to both heatmap and PCA log transformation pipelines for consistent visualization behavior.

## [1.14] - 2026-02-24

### Fixed
- **Clustergrammer color persistence during zoom**: Fixed issue where Clustergrammer color theme reverted to monocolor during zoom/pan operations. Added comprehensive monitoring system with MutationObserver, event listeners, and periodic refresh to maintain color scheme. Added `forceRefreshClustergrammerColors()` function for manual color recovery.

### Enhanced
- **Color scheme monitoring**: Implemented multi-layered color monitoring including DOM mutation observation, zoom/pan event detection, and periodic background refresh to ensure colors persist during all user interactions.

## [1.13] - 2026-02-24

### Fixed
- **Clustergrammer D3.js NaN errors**: Enhanced error handling for Clustergrammer visualization to prevent D3.js SVG attribute errors. Added comprehensive validation for container dimensions, network data, and tile color calculations. Implemented error suppression for D3.js NaN warnings and graceful fallback messaging when rendering fails.

## [1.12] - 2026-02-24

### Fixed
- **D3.js NaN errors**: Fixed multiple D3.js SVG attribute errors caused by NaN values reaching the visualization. Added comprehensive data validation throughout the heatmap generation pipeline to prevent NaN values from log transformation, z-score normalization, and domain calculations.

## [1.11] - 2026-02-24

### Fixed
- **Generate Heatmap button**: Fixed missing event handler for buttons with `data-action` attributes. The "Generate Heatmap" button now properly triggers heatmap generation with clustering analysis and visualizations.

## [1.10] - 2026-02-24

### Fixed
- **JavaScript syntax error**: Fixed "Identifier 'b' has already been declared" error in `interpolateHex` function by renaming the local blue component variable to avoid conflict with the function parameter `b`.

## [1.09] - 2026-02-24

### Fixed
- **Clustergrammer heatmap tiles**: Clustergrammer uses only 2 colors (positive=red, negative=green). Centered the matrix by median before passing so low values map to green and high values to red, producing a proper diverging green-black-red appearance.

## [1.08] - 2026-02-24

### Fixed
- **Clustergrammer Matrix Values color scale**: Patched the gradient after render so it matches the heatmap sidebar (RdBlkGn green-black-red, RdYlBu, Viridis, etc.). Clustergrammer hardcodes white at the low end for all-positive data; the patch replaces the gradient stops with the selected heatmap colorscale.

## [1.07] - 2026-02-24

### Changed
- **Clustergrammer Matrix Values color scale**: Now matches the Heatmap Color Scale setting in the sidebar (RdBlkGn, RdYlBu, Viridis, etc.) and the Reverse scale checkbox. Changing the heatmap colorscale updates both Plotly and Clustergrammer views.

## [1.06] - 2026-02-24

### Changed
- **Heatmap sub-tabs**: Clustergrammer moved under Heatmap tab. After heatmap is generated, sub-tabs "Plotly" and "Clustergrammer" appear to switch between Plotly heatmap and Clustergrammer visualization. Sub-tabs hidden when heatmap is cleared.

## [1.05] - 2026-02-24

### Changed
- **Clustergrammer panel layout**: Added Clustergrammer custom.css, hid about text to prevent overlap with icon bar, and scoped font/spacing so the panel matches the official clean layout.

## [1.04] - 2026-02-24

### Fixed
- **Clustergrammer toolbar icons**: Added Font Awesome CSS so Share, Camera, Download, Crop, and Expand icons display correctly in the Clustergrammer control panel.

## [1.03] - 2026-02-24

### Changed
- **Clustergrammer tab**: Removed app sidebar; Clustergrammer loads automatically when heatmap is generated. The built-in Clustergrammer tool panel (Row Order, Column Order, Search, etc.) serves as the sidebar. Full-width visualization.

## [1.02] - 2026-02-24

### Changed
- **Clustergrammer sidebar styling**: Added Bootstrap CSS so the Clustergrammer control panel matches the official look (blue flat buttons for Row Order, Column Order, Search, etc.). App button overrides are excluded from the Clustergrammer container.

## [1.01] - 2026-02-24

### Added
- **Group inference by even division**: When sample names lack clear group identifiers (e.g. Sample_1..Sample_15), groups are inferred by position: N samples → G groups × R replicates. Prefers R=3,2,4,5 (e.g. 15 samples → 5 groups × 3 replicates).

## [0.94] - 2026-02-04

### Added
- **PCA Row-wise Z-score Normalization**: New option to normalize each sample (row) across features. Applied after column-wise z-score when both are enabled.

### Changed
- **PCA Z-score defaults**: Both Column-wise and Row-wise Z-score Normalization are unchecked by default.

## [1.00] - 2026-02-04

### Added
- **Group inference for numeric pattern**: Sample IDs like 1_1, 1_2, 1_3, 2_1, 2_2, 2_3 are now parsed as groups 1, 2, 3, etc. (GroupNumber_ReplicateNumber).

## [0.99] - 2026-02-04

### Changed
- **Distance metric default**: Manhattan is now the default clustering distance metric.

## [0.98] - 2026-02-04

### Changed
- **Distance metric defaults**: Correlation is now the default; option order is Correlation, Manhattan, Euclidean.

## [0.97] - 2026-02-04

### Changed
- **Heatmap colorbar position**: Moved horizontal colorbar to top-right corner above the plot area, avoiding overlap with column dendrogram. Increased top margin to 80px.

## [0.96] - 2026-02-04

### Changed
- **Heatmap colorbar orientation**: Switched to horizontal layout at top center to minimize overlap with row labels.

## [0.95] - 2026-02-04

### Changed
- **Smarter group inference from sample names**: Extracts group prefix from patterns like A_1, A_2, A3, B_1, B_2, B_3 → groups A and B. Handles underscore/dash/dot separators and leading-letters (e.g. A3, WT1).

## [0.94] - 2026-02-04

### Changed
- **Heatmap colorbar position**: Moved to top-right corner and shifted further right to reduce overlap with long row labels. Default margin right increased to 180px.

## [0.93] - 2026-02-04

### Changed
- **Heatmap Row-wise Z-score Normalization**: Unchecked by default (was checked).

## [0.92] - 2026-02-04

### Fixed
- **Heatmap RdBlkGn colorscale orientation**: "Reverse scale" checkbox was checked by default, causing red=low and green=high. Unchecked by default so RdBlkGn shows red=high, black=middle, green=low.

## [0.91] - 2026-02-04

### Added
- **Custom heatmap colorscale RdBlkGn**: New red-black-green diverging scale (green=low, black=middle, red=high).

### Changed
- **Default heatmap colorscale**: RdBlkGn is now the default heatmap color theme.

## [0.90] - 2026-02-04

### Changed
- **Analysis status toggle labels**: Renamed the collapsed-state button text to `Show more analysis status` and open-state text to `Collapse analysis status panel`.

## [0.89] - 2026-02-04

### Fixed
- **Analysis status panel persistence**: Removed click-outside auto-collapse behavior. The panel now stays open/closed until the Analysis Status toggle button is clicked.

## [0.88] - 2026-02-04

### Added
- **Meta batch selection shortcut**: Added `Select All Visible (Same Column)` in Meta Table batch edit tools. It selects all currently visible editable cells in the active/selected metadata column.

### Changed
- **Batch edit help text**: Updated Meta tab guidance to include the new visible-column selection shortcut.

## [0.87] - 2026-02-04

### Added
- **Meta table multi-cell batch edit**: Added multi-select editing in the Meta Table for updating several samples at once in the same metadata column.
  - Ctrl/Cmd+click to add/remove cells
  - Shift+click for range selection
  - "Apply To Selection" writes one value to all selected cells

### Changed
- **Meta edit UX**: Added selection highlight, selection status text, and a clear-selection action in the Meta tab sidebar.

## [0.86] - 2026-02-04

### Fixed
- **Column/row dendrogram visibility when order unchanged**: Heatmap now keeps and renders dendrograms whenever clustering succeeds, even if the computed order matches the original order (`0,1,2,...`). This fixes cases where column dendrogram was missing despite clustering being enabled.

## [0.85] - 2026-02-04

### Fixed
- **Large-matrix dendrogram alignment (heatmap)**: Fixed row/column dendrogram misalignment with the heatmap body for large datasets by matching displayed heatmap subset size to the exact number of clustered dendrogram leaves (instead of a fixed hard cap slice).

### Changed
- **Large-data clustering subset handling**: In worker-subset mode, heatmap now uses dendrogram leaf-count-based subset selection for both rows and columns, preserving exact tree-to-heatmap index alignment.

## [0.84] - 2026-02-04

### Changed
- **Analysis status panel moved to far right**: Moved the analysis status output UI to the far-right header area.
- **Analysis status panel is collapsible**: Added a toggle button to expand/collapse the panel, with click-outside auto-collapse behavior.

## [0.83] - 2026-02-04

### Fixed
- **Heatmap progress stuck around ~84%**: Fixed an uncaught render-path error in heatmap group annotation fallback colors (`colors` -> `colorScheme`) that could stop execution before progress completion.
- **Heatmap error handling**: Wrapped heatmap generation in explicit `try/catch` so failures are reported and progress UI is closed instead of appearing stuck.

### Added
- **Detailed analysis status panel**: Added a visible rolling "Analysis Status" log in the UI that records stage-by-stage progress messages for data processing and analyses.

### Changed
- **More informative heatmap progress messages**: Heatmap now reports additional details (input matrix size, clustering settings, trace preparation) before rendering.

## [0.82] - 2026-02-04

### Changed
- **DIANN missing-value handling**: In DIANN protein-group import mode, missing/invalid intensity values are now replaced with `0` (previously `1`).

## [0.81] - 2026-02-04

### Changed
- **Heatmap Plotly edit mode disabled**: Set `editable: false` for heatmap initial render and heatmap-only refresh paths, so heatmap titles/labels are no longer directly editable on-plot.

## [0.80] - 2026-02-04

### Fixed
- **Metadata edit no longer triggers heatmap reclustering**: Editing group/metadata values, renaming metadata headers, adding/deleting metadata columns now refreshes only heatmap group-annotation bars/legend and does not call the full clustering pipeline.

### Changed
- **Heatmap refresh path for metadata edits**: Added a lightweight metadata-refresh path for heatmap updates (`refreshHeatmapAfterMetaEdit`) so clustering runs only when users explicitly generate/regenerate the heatmap.
- **Heatmap width/height controls use layout-only update**: Changing heatmap plot width/height now updates layout only (no clustering rerun).

## [0.79] - 2026-02-04

### Added
- **Dedicated DIANN protein-group uploader**: Added a new upload module in the Data Upload sidebar for DIANN `results.pg*_matrix.tsv` files.

### Changed
- **DIANN parser behavior**: For DIANN upload mode, the first column is used as protein-group row IDs, and quantification/intensity values are read from column 7 onward.
- **Sample-name simplification for DIANN raw-file columns**: Full raw-file paths are automatically reduced to minimal unique sample names by removing path/common prefixes and filename extensions, with uniqueness safeguards.
- **Intensity cleanup in DIANN mode**: Missing, invalid, and non-positive intensity values are replaced with `1` during DIANN import to support downstream log-based workflows.

## [0.78] - 2026-02-09

### Added
- **Arrow visibility controls (PCA/t-SNE)**: Added new label-arrow options in both PCA and t-SNE sidebars:
  - `Auto show arrows` (default ON)
  - `Show arrows (manual)`

### Changed
- **Automatic arrow decision during render + zoom**: In auto mode, arrows are now shown only when label density is high enough (visible labels >= 10), reducing clutter when only a few labels are visible.

## [0.77] - 2026-02-09

### Fixed
- **Scatter border frame no longer scales with zoom**: Changed PCA/t-SNE border shapes from axis-referenced (`xref: x`, `yref: y`) to paper-referenced (`xref: paper`, `yref: paper`) so the frame remains fixed while zooming/panning. Also stopped replacing shapes during relayout updates.

## [0.76] - 2026-02-09

### Changed
- **Dynamic border update on zoom/pan (PCA/t-SNE)**: The scatter border rectangle is now updated during relayout to match the current visible axis range, so the border frame stays consistent when zooming or panning.

## [0.75] - 2026-02-09

### Added
- **Main app label style controls (PCA/t-SNE)**: Added new sidebar options for scatter labels in both PCA and t-SNE tabs:
  - `Auto label font/color` (default ON)
  - `Label font size (manual)`
  - `Label color (manual)`

### Changed
- **Automatic label styling during render + zoom**: Label text style now updates dynamically in both initial plot generation and `plotly_relayout` updates (zoom/pan), using density-aware automatic font sizing and auto color by default.
- **Arrow styling matches label style**: Arrow annotations now use the computed/manual label color for visual consistency.

## [0.74] - 2026-02-09

### Added
- **Smart label font sizing in sandbox**: Added density-aware automatic font-size calculation in `test_label_repel.html` (`font.size auto`) so label size adapts to visible label count and plot area.
- **Manual label font controls in sandbox**: Added user controls for `font.size manual`, `auto min`, and `auto max` so font size can be explicitly set or bounded.

### Changed
- **Preset tuning now includes font behavior**: Presets (`balanced`, `rightward`, `symmetric`) now also set sensible default auto-font ranges.

## [0.73] - 2026-02-09

### Added
- **Label-repel presets in sandbox**: Added one-click presets in `test_label_repel.html` to switch between `balanced (ggrepel-like)`, `rightward / aligned`, and `symmetric cloud` styles.

### Changed
- **Tuned default sandbox parameters**: Updated default repel settings (`force`, paddings, overlaps, iterations) to better mimic typical ggrepel behavior and reduce manual tuning.

## [0.72] - 2026-02-09

### Added
- **New standalone label-repel sandbox**: Added `test_label_repel.html` to prototype and tune ggrepel-like behavior on a synthetic scatter plot (100 random points; labels `sample-001` to `sample-100`).
- **ggrepel-style controls in test page**: Added interactive controls for `force`, `force_pull`, `direction`, `box.padding`, `point.padding`, `max.iter`, `max.overlaps`, and `max.labels`.
- **Dynamic relayout on zoom/pan in test page**: Labels and arrow annotations are re-computed for the current visible range after `plotly_relayout` to mimic dynamic label placement behavior.

### Changed
- **Test-page repel algorithm upgraded**: Replaced the simple overlap push with a more ggrepel-like iterative force model (repel labels from labels/points + pull toward anchor) and overlap-based label dropping.


## check point-------------------

## [0.71] - 2026-02-09

### Changed
- **Plotly logo hidden**: The Plotly logo is now hidden on the modebar for all plots (heatmap, PCA, t-SNE, dendrograms) by setting `displaylogo: false` in all Plotly configurations.

## [0.70] - 2026-02-09

### Changed
- **Download buttons integrated into Plotly modebar**: Custom SVG and WEBP download buttons are now added directly to Plotly's modebar (toolbar) for all plots (heatmap, PCA, t-SNE, dendrograms) instead of separate buttons above the plots. This provides a cleaner, more integrated user experience with download options accessible directly from the plot toolbar.

## [0.69] - 2026-02-09

### Changed
- **Reduced padding in Data Upload UI**: Decreased padding in the "Copy & Paste" section and related elements (sidebar-section, upload-option, textarea, buttons) for a more compact layout.

## [0.68] - 2026-02-09

### Changed
- **Download buttons: SVG and WEBP**: Replaced PDF button with WEBP (PDF requires subscription). Custom download buttons now show SVG (vector) and WEBP (raster) options. PNG is available via the built-in Plotly download button.

## [0.67] - 2026-02-09

### Changed
- **Download buttons: SVG and PDF only**: Removed PNG and JPEG buttons (built-in Plotly download button handles PNG). Custom download buttons now show only SVG and PDF options. PDF uses `Plotly.downloadImage()` and may require a Plotly subscription.

## [0.66] - 2026-02-09

### Added
- **Custom download buttons with format selection**: Added custom download buttons (PNG, SVG, JPEG) above each plot (heatmap, PCA, t-SNE) so users can choose their preferred format. The built-in Plotly download button only supports one format at a time, so these custom buttons provide format choice. Each button uses `Plotly.toImage()` to download the plot in the selected format.

## [0.65] - 2026-02-09

### Added
- **Plotly editable mode**: All Plotly plots (heatmap, PCA, t-SNE, dendrograms) now have editable mode enabled. Users can double-click on chart titles, axis labels, and legend entries to edit them directly in the plot.

## [0.64] - 2026-02-09

### Added
- **t-SNE tab**: New tab "t-SNE" for t-distributed Stochastic Neighbor Embedding, aimed at large numbers of samples. Workflow mirrors PCA: Generate button, perplexity (5–50), max iterations, optional sample labels with repel and leader lines, plot size and main title, max samples/features, log and z-score preprocessing. Group annotations: first column = color (with color theme dropdown), second = shape only. Embedding runs in a Web Worker; scatter plot supports the same label repel and leader lines as PCA.

## [0.63] - 2026-02-09

### Added
- **PCA plot tab: main title customization**: Optional "Main title" text field in the PCA sidebar (like the heatmap tab). When set, it is used as the plot title; when empty, the default "PCA Plot: PCx vs PCy" is used.

## [0.62] - 2026-02-09

### Changed
- **PCA tab: no color theme for second group annotation**: In the PCA plot tab, the color scheme dropdown is shown only for the first selected group annotation column; the second (and any further) column shows "(shape only)" and has no color theme selector. When the selection changes, the dropdown moves to the first selected column and checkbox state is preserved.

## [0.61] - 2026-02-09

### Changed
- **PCA two group columns: one trace per (color, shape) combination**: When both a first and second group annotation are selected, points are drawn once per combination: color from the first column and marker shape from the second. No separate overlapping traces; each point shows first dimension by color and second by shape, so the two dimensions stay visually distinct.

## [0.60] - 2026-02-09

### Changed
- **PCA group annotations: first = color only, second = shape only**: The first group annotation column uses only colors (all markers are circles); the second (and any further) column uses only marker shapes (circle, square, diamond, etc.) with a single neutral color (#444). The two dimensions stay visually distinct.

## [0.58] - 2026-02-09

### Changed
- **PCA group annotations use shapes and color**: On the PCA scatter plot, each group is now shown with both a color and a marker shape (circle, square, diamond, triangle-up, triangle-down, star, cross, x, pentagon, hexagon). This makes groups easier to tell apart when multiple group columns are used, and works better than color alone on scatter plots.

## [0.57] - 2026-02-09

### Added
- **PCA label leader lines**: When sample/column labels are shown, a thin connection line is drawn from each data point to its label. Lines use a light gray (rgba(0,0,0,0.35)) and are drawn behind markers and text, so labels placed far from points remain clearly linked.

## [0.56] - 2026-02-09

### Fixed
- **PCA labels sitting on dots**: Label–dot repulsion now runs first each iteration and pushes labels by the full overlap plus a 4px gap (instead of half overlap), so labels reliably move off their points and stay clearly separated from dots.

## [0.55] - 2026-02-09

### Changed
- **PCA label vs dot repel**: The label repel algorithm now also avoids overlap between labels and marker dots; each dot is treated as a small box (marker size in data units) and labels are pushed away from all dots so labels do not cover points, especially when the scatter is not too crowded.

## [0.54] - 2026-02-09

### Added
- **PCA scatter label repel**: When "Show sample/column labels" is on, labels are repelled to avoid overlap and kept inside the plot border. An iterative algorithm adjusts label positions in data coordinates; labels are drawn on a separate text trace at the repelled positions.

## [0.53] - 2026-02-09

### Changed
- **Heatmap layout options only replot**: Changing main title, row/column dendrogram size, or margin left/right now calls `updateHeatmapLayoutOnly()` so only the layout is updated (no clustering or data recalculation).

## [0.52] - 2026-02-09

### Added
- **Heatmap layout & appearance options** (sidebar): Custom main title (optional; leave empty for auto-generated title), row dendrogram size (% of width, 5–40%, when row clustering is on), column dendrogram size (% of height, 5–40%, when column clustering is on), margin left (px), and margin right (px).

## [0.51] - 2026-02-09

### Changed
- **Label repel: pull toward point (ggrepel-style)**: Scatter plot label repel now includes an attraction step so each label stays as close to its data point as possible while still avoiding overlap with other labels and dots. Per iteration: repel from dots, repel from labels, clamp to bounds, then pull each label toward its anchor by a small factor (`pullStrength`), and clamp again. Max iterations increased to 250. This mirrors [ggrepel](https://ggrepel.slowkow.com/articles/examples#hide-some-of-the-labels) `force_pull` behavior.

## [0.50] - 2026-02-09

### Fixed
- **Row dendrogram vertical alignment with heatmap**: The row dendrogram now uses the same linear y-scale (0 to n-1) as the heatmap, with a fixed range and tick labels, so it no longer appears shifted or extending above/below the heatmap.

## [0.49] - 2026-02-09

### Changed
- **Row/column dendrograms always match displayed heatmap**: When clustering uses sampling (>2000 features or samples), the heatmap now shows only the clustered subset (2000 rows or 2000 columns) so the row and column dendrograms are always displayed and align with the data. Title shows "(subset shown for dendrogram)" when a subset was used.

## [0.48] - 2026-02-09

### Fixed
- **Column clustering "Expected order length: 240 Got: 1000" when Max features = 1000**: With concurrent heatmap updates (e.g. Generate then change "Max features"), the worker could process row then column from different runs so the column request sometimes received the other run's row result. Added a **request ID** to each clustering request; the worker echoes it back and the main thread only accepts a result when `requestId` matches, so row and column results are no longer mixed.

## [0.47] - 2026-02-09

### Fixed
- **Row (and column) dendrogram position/count mismatch**: When clustering used sampling (>2000 rows or columns), the dendrogram had fewer leaves than the heatmap rows/columns, so the row dendrogram appeared as a small strip in the wrong place. Row and column dendrograms are now shown only when full clustering was performed (≤2000 rows or columns); otherwise they are hidden so the heatmap still shows the full clustered order without a misleading dendrogram.

## [0.46] - 2026-02-09

### Changed
- **Faster heatmap clustering for large datasets**:
  - Clustering always runs in a Web Worker (no size threshold) so the UI stays responsive.
  - Worker uses **Lance-Williams** recurrence to update cluster distances on merge (O(n²) per merge step instead of recomputing from point indices), greatly speeding the merge phase.
  - Point distance matrix is stored as a **Float32Array** (condensed upper triangle) for less memory and better cache use.
  - For very large feature counts (>2000), clustering uses a **sample of 2000** features for speed, then maps the rest into order (unchanged from previous 5000 cap, now 2000 for quicker runs).
  - Hint added: "Set to 2000–3000 for faster clustering" on Max Features.

## [0.45] - 2026-02-09

### Changed
- **Heatmap colorscale/reverse change no longer re-runs calculation**: Changing the heatmap color scale (e.g. RdYlBu, Viridis) or the "Reverse scale" checkbox now only updates the heatmap trace colors; no clustering or data processing is performed.

## [0.44] - 2026-02-09

### Changed
- **Checking/unchecking group annotations no longer re-runs clustering**: When the heatmap is already generated, toggling a group annotation checkbox (add or remove an annotation column) now only updates the group bars and legend; clustering and full heatmap regeneration are skipped. Uses the existing column order from the current plot.

## [0.43] - 2026-02-09

### Changed
- **Heatmap group annotation color change no longer re-runs clustering**: Changing the discrete color theme for a group annotation only updates the annotation bar colors and the legend; the heatmap and dendrograms are not recomputed or redrawn.

## [0.42] - 2026-02-09

### Changed
- **Group annotation color themes are now discrete (categorical) only**: Replaced previous palettes with eight discrete color schemes (Set1, Set2, Set3, Paired, Dark2, Accent, Pastel, Bold) so each category gets a distinct color—no continuous/gradient interpretation. Heatmap and PCA group annotation dropdowns use these; heatmap main colorscale remains continuous.
- Sidebar copy updated to "discrete (categorical) color theme per legend" for both Heatmap and PCA group annotations.

## [0.41] - 2026-02-09

### Added
- **PCA group annotation color theme**: Same color theme setting as heatmap – for each group annotation column in the PCA tab sidebar, a dropdown to choose the legend color theme (Warm, Cool, Purple, Earth, Bright, Pastel, Dark, Vibrant). PCA plot uses the selected scheme per column.

### Changed
- PCA "Group Annotation Labels" section now includes one color-scheme dropdown per metadata column (next to each checkbox).

## [0.40] - 2026-02-09

### Added
- **Heatmap tab sidebar – color options**:
  - **Heatmap color scale**: Dropdown to choose the heatmap colorscale (RdYlBu, Viridis, Plasma, Inferno, Blues, Reds, Greens, YlOrRd, Turbo, Cividis)
  - **Reverse scale**: Checkbox to reverse the heatmap scale (high = cold, low = hot)
  - **Group annotation color theme**: For each group annotation column, a dropdown to choose the color theme for that legend (Warm, Cool, Purple, Earth, Bright, Pastel, Dark, Vibrant)

### Changed
- Group annotation section now shows one color-scheme dropdown per metadata column (next to each checkbox)
- Heatmap trace uses the selected colorscale and reversescale from the sidebar

## [0.39] - 2026-02-03

### Added
- **User-selectable group annotations**: Added checkboxes in Heatmap sidebar to choose which metadata columns to visualize
- Users can select multiple metadata columns (Group, Treatment, Batch, etc.) to display as annotation bars
- Multiple group bars can be displayed simultaneously, stacked vertically between dendrogram and heatmap
- Checkboxes automatically update when metadata is loaded or modified
- "Group" column is checked by default if it exists

### Changed
- Group visualization now uses user-selected columns instead of auto-detection
- Multiple group bars are supported with individual colorbars

## [0.38] - 2026-02-03

### Changed
- **Repositioned group visualization bar**: Moved from above dendrogram to between dendrogram and heatmap
- Group annotation bar now appears directly above the heatmap, below the column dendrogram (if present)
- Improved visual hierarchy: Dendrogram (top) → Group bar (middle) → Heatmap (bottom)

## [0.37] - 2026-02-03

### Added
- **Example metadata button in Meta Table tab**: Added "Load Example Meta Data" button
- Example metadata automatically matches the 4 groups from example data matrix:
  - Group_A: Sample_A to Sample_X (24 samples)
  - Group_B: Sample_Y to Sample_BM (24 samples)
  - Group_C: Sample_BN to Sample_CG (24 samples)
  - Group_D: Sample_CH to Sample_CR (24 samples)
- Example metadata includes Group, Treatment, and Batch columns
- Automatically updates heatmap visualization when example metadata is loaded

## [0.36] - 2026-02-03

### Added
- **Group visualization in heatmap**: If metadata table contains group/column information, it's now visualized as colored bars above the heatmap
- Automatically detects group columns (Group, Treatment, Batch, Condition, or first non-Sample_ID column)
- Color-coded group annotation bar appears above column dendrogram (if present) or above heatmap
- Group colorbar legend shows group names and colors
- Works with all clustering configurations (row-only, column-only, both, or none)

## [0.35] - 2026-02-03

### Changed
- **Meta Table is now fully editable**: Users can directly edit cell values inline
- **Editable cells**: All cells except Sample_ID can be edited by clicking on them
- **Editable headers**: Column headers can be renamed by clicking on them (except Sample_ID)
- **Add new columns**: Added "+ Add New Column" button to dynamically add new metadata columns
- Sample_ID column is protected (read-only) and cannot be renamed or deleted
- Improved visual feedback for editable cells with focus highlighting

## [0.34] - 2026-02-03

### Added
- **New Meta Table Tab**: Added as second tab (between Table Preview and Heatmap)
- Automatic metadata generation from column names when data is loaded
- Metadata parsing attempts to extract:
  - Group information (from patterns like Sample_A, Sample_Group1_A)
  - Treatment information (Control/Treatment keywords)
  - Batch information (batch patterns)
- Meta Table sidebar allows users to upload/override metadata via copy-paste or file upload
- Meta Table displays metadata in a scrollable table format similar to Table Preview

### Changed
- Tab order: Table Preview → Meta Table → Heatmap → PCA Plot

## [0.33] - 2026-02-03

### Changed
- **Major layout restructure**: Each tab now has its own sidebar
- Removed global left sidebar
- **Table Preview Tab**: Sidebar contains data upload controls (example data, copy-paste, file browse)
- **Heatmap Tab**: Sidebar contains heatmap controls (clustering options, distance metrics, linkage methods)
- **PCA Tab**: Sidebar contains PCA controls (PC selection)
- Each tab is now a self-contained unit with sidebar (controls) + main content (visualization)
- Improved organization and context-specific controls

## [0.32] - 2026-02-03

### Changed
- Moved Heatmap Controls to the Heatmap tab (previously in sidebar)
- Moved PCA Controls to the PCA Plot tab (previously in sidebar)
- Controls are now contextually placed with their respective visualizations
- Sidebar now only contains data upload controls and example data button

## [0.31] - 2026-02-03

### Changed
- **Major layout redesign**: Full-page layout with left sidebar and right panel with tabs
- Left sidebar contains all controls: data upload, heatmap controls, PCA controls
- Right panel organized into three tabs:
  - **Table Preview**: Shows data matrix in a scrollable table format (first 1000 rows)
  - **Heatmap**: Interactive heatmap visualization with clustering options
  - **PCA Plot**: Principal component analysis scatter plot
- Improved space utilization and user experience
- All visualizations now use full available space in their respective tabs

## [0.30] - 2026-02-03

### Changed
- Increased bottom margin for heatmap x-axis labels from 50px to 120px
- Added -45 degree rotation to x-axis labels (sample names) for better readability
- Improved visibility of sample labels, especially with many samples

## [0.29] - 2026-02-03

### Changed
- Replaced random example data with patterned data structure
- Example data now has clear patterns: 4 sample groups (A, B, C, D) and 4 gene clusters
- Each gene cluster (40 genes) is highly expressed in one sample group (24 samples) and low in others
- Patterns are visible in heatmap clustering and PCA visualization
- Makes it easier to validate clustering algorithms and visualization tools

## [0.28] - 2026-02-03

### Changed
- Hidden the example data matrix text display, showing only the "Load Example Data" button
- Cleaner UI with less visual clutter

## [0.27] - 2026-02-03

### Fixed
- Fixed syntax error in exampleData constant: added missing backticks for template literal
- Example data now loads and displays correctly on page load

## [0.26] - 2026-02-03

### Changed
- Expanded example data matrix to 4x larger: now 160 genes (was 40) and 96 samples (was 24)
- Added Gene41-Gene160 and Sample_Y-Sample_CR
- Provides comprehensive test data for large-scale visualization and clustering analysis

All notable changes to this project will be documented in this file.

## [0.25] - 2026-02-03

### Changed
- Removed axis titles "Samples" and "Features" to prevent overlap with column/row labels
- Cleaner visualization without redundant axis titles

## [0.24] - 2026-02-03

### Changed
- Doubled the example data matrix again: now 40 genes (was 20) and 24 samples (was 12)
- Added Gene21-Gene40 and Sample_M-Sample_X
- Provides even more comprehensive test data for visualization and clustering

## [0.23] - 2026-02-03

### Changed
- Doubled the example data matrix: now 20 genes (was 10) and 12 samples (was 6)
- Added Gene11-Gene20 and Sample_G-Sample_L
- Provides more comprehensive test data for visualization

## [0.22] - 2026-02-03

### Changed
- Disabled background grid for all heatmap axes
- Added showgrid: false and zeroline: false to all heatmap x and y axes
- Cleaner visualization without grid lines

## [0.21] - 2026-02-03

### Fixed
- Adjusted colorbar position to avoid overlap with row labels on the right
- Moved colorbar further right (x: 1.15) and added right margin to layout
- Colorbar and row labels now have proper spacing

## [0.20] - 2026-02-03

### Changed
- Moved row labels (Features) to the right side of the heatmap to avoid overlap with row dendrogram
- Row labels now display on the right side in all clustering configurations

## [0.19] - 2026-02-03

### Fixed
- Fixed dendrogram-heatmap alignment: dendrograms now use categorical labels instead of numeric indices
- Converted dendrogram coordinates to match heatmap's categorical axis values
- This ensures perfect alignment between dendrogram leaves and heatmap rows/columns
- No more gaps or misalignment between components

## [0.16] - 2026-02-03

### Fixed
- Fixed heatmap not displaying: configured axes as categorical type with proper category arrays
- Heatmap now correctly renders with dendrograms in subplot layout
- Proper axis configuration for categorical data (sample/feature labels)

## [0.15] - 2026-02-03

### Changed
- Implemented Plotly subplots to combine heatmap and dendrograms into a single interactive plot
- Automatic synchronization: all plots zoom/pan together automatically (no manual event listeners needed)
- Cleaner implementation using Plotly's native subplot functionality
- Better alignment and spacing between components

## [0.14] - 2026-02-03

### Fixed
- Corrected row dendrogram flip: leaves now properly start at right side (x=0 with reversed range)
- Tree structure now correctly displays flipped left-right
- Fixed coordinate system for flipped dendrogram visualization

## [0.12] - 2026-02-03

### Fixed
- Fixed axis synchronization between heatmap and dendrograms
- Moved data storage to after clustering to ensure correct label mapping
- Added flag to prevent recursive updates during synchronization
- Fixed y-axis range mapping to handle reversed axes correctly
- Improved event listener management to avoid duplicates

## [0.11] - 2026-02-03

### Fixed
- Enabled zoom/pan interactivity for dendrograms (was set to staticPlot: true)
- Dendrograms are now fully interactive and zoomable

## [0.10] - 2026-02-03

### Added
- Interactive axis linking between heatmap and dendrograms
- Zoom and pan synchronization: when you zoom/pan the heatmap, dendrograms automatically zoom/pan accordingly
- When you zoom/pan dendrograms, the heatmap also updates
- Bidirectional synchronization for seamless exploration

## [0.09] - 2026-02-03

### Fixed
- Corrected row dendrogram orientation: now vertical on left side with branches extending rightward
- Corrected column dendrogram orientation: horizontal at top with branches extending downward
- Dendrograms now match standard heatmap visualization layout
- Row dendrogram: leaves at left edge, branches grow rightward
- Column dendrogram: leaves at top, branches grow downward

## [0.06] - 2026-02-03

### Fixed
- Fixed dendrogram visualization - completely rewrote coordinate calculation and line drawing
- Fixed horizontal (column) dendrogram rendering - now correctly displays tree structure
- Improved coordinate system handling for both vertical and horizontal dendrograms
- Dendrograms now properly align with heatmap rows and columns

## [0.05] - 2026-02-03

### Added
- Dendrogram (tree) visualization for hierarchical clustering
- Row dendrogram displayed on the left side of heatmap when row clustering is enabled
- Column dendrogram displayed on top of heatmap when column clustering is enabled
- Dendrograms automatically show/hide based on clustering checkbox states

## [0.04] - 2026-02-03

### Added
- Hierarchical clustering for heatmap visualization
- Clustering controls: enable/disable clustering for rows (features) and columns (samples)
- Distance metric options: Euclidean, Correlation, Manhattan
- Linkage method options: Average, Complete, Single
- Automatic reordering of heatmap based on clustering results

## [0.03] - 2026-02-03

### Changed
- Transposed heatmap visualization: Features are now displayed as rows, Samples as columns
- Updated axis labels to reflect the new orientation

## [0.02] - 2026-02-03

### Fixed
- Fixed PCA error: "ML is not defined" by implementing custom PCA algorithm
- Removed dependency on ml-pca library that wasn't loading correctly
- Implemented PCA using covariance matrix and eigenvalue decomposition

## [0.01] - 2026-02-03

### Added
- Initial release of Data Matrix Visualization Tool
- Data upload module with two options:
  - Copy and paste functionality
  - File browse and load functionality
- Heatmap visualization with z-score normalization
- PCA visualization with interactive PC selection (PC1, PC2, PC3)
- Example data for testing
- Responsive design with modern UI
- Error handling and status messages
- Explained variance display for PCA components

### Technical Details
- Built as a single HTML file using JavaScript
- Uses Plotly.js for visualizations
- Uses ml-pca library for PCA calculations
- No backend required - runs entirely in the browser
