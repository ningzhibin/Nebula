## Nebula — notes

**Nebula** is the product name for this single-page intensity-matrix QC and visualization app (formerly described as “Data Matrix QC”). Place the app icon at **`image/Nebula_icon.png`** (favicon, touch icon, and header logo).

If you find Nebula useful, there is a **Buy me a coffee** button in the top-right header that links to PayPal (`ningzhibin@gmail.com`). Donations are entirely optional.

### Help / Document tab (`doc/`) (v4.78+)

- **v5.20**: **Clustering → PCA** adds a **Details** sub-tab (right of 2D / 3D Plot) with a KPI summary, an interactive **scree plot**, and sortable tables for **variance explained**, **per-sample PC scores**, and **top feature loadings** (each with **Download CSV**). Documented under **Document → Clustering**.
- **v5.18–v5.19**: **Data QC → Row Profile** adds a **Stacked bar (composition)** plot type — now the **default** (selected rows stacked per sample; optional **% composition** normalization to 100%). Documented under **Document → Column profile**.
- **v5.17**: added **Document → 10. Clustering (Heatmap · PCA · PCoA · t-SNE)** covering all Clustering sub-tabs (Heatmap clustering/linkage/colors, Clustergrammer, PCA, the new PCoA with distance metrics + classical MDS, and t-SNE) plus a "Choosing a view" guide. Differential → **11**, Report export → **12**.
- **Report** tab (MVP): **Matrix and meta summary** is always a sidebar option; **figure rows** are added when you use **Add to Report**. **Plotly** figures export as **interactive** HTML (zoom, pan, ranges) with **locked pixel width and height** (`_fullLayout` when available) and light-theme defaults when missing. **Data QC → Overall** charts are **D3** on screen and export as **PNG** at the **same layout size** as the SVG (**v4.88+** figure chrome; **v4.89+** `min-width` + figure shell; **v4.90+** redraw uses stored/workspace width when Overall is hidden so PNG width matches the main view). Preview auto-refreshes when you open the tab or change sections. See **Document** → *12. Report export (MVP)*.
- In-app **Document** tab loads Markdown from the **`doc/`** folder. **`doc/manifest.json`** lists sections (`id`, `title`, `file`). To add a page: create a new `.md` file and append an entry to the manifest.
- Offline mode now works via **`doc/docs_bundle.js`** (auto-generated bundle loaded by `index.html`). After editing any `doc/*.md` file, rebuild with: `python doc/build_doc_bundle.py`.
- If you do not use the bundle, serve the project over **`http://localhost`** (or any static HTTP server). Opening **`index.html` as `file://`** usually blocks `fetch()` for local `doc/*.md` files; the same HTTP requirement applies to other `fetch`-based features (e.g. MyGene name mapping).

### Bundled report session (`data/qc_session.js`) (v2.65–v2.67)

- Export **Session snapshot → Export session as report JS** to download **`qc_session.js`**. Save it as **`data/qc_session.js`** next to **`index.html`**. On the next page load (after **`js/saint_embed.js`**), the app loads that script; it should only contain **`window.__QC_SESSION_SNAPSHOT__ = …`** (JSON) as produced by the exporter. **Do not** replace it with untrusted JavaScript (same-origin script execution). Add **`?noSession=1`** to the URL to skip auto-load while debugging.
- Snapshot **formatVersion 3** includes full **Differential** statistics, **Enrichr** table state, and **SAINT** results when those analyses were run before export.
- **v2.66**: A **loading overlay** (spinner + status text) covers the UI while **`data/qc_session.js`** loads (only after **200 ms** if the request is slow) and during **`applySessionSnapshot`**. If the bundle file is absent, there is usually no flash.
- **v2.67**: After the bundle restores successfully, the UI switches to the **Heatmap** tab automatically.

### Tab naming (v3.14–v4.78)

- **v5.15**: **Clustering → PCoA** sub-tab (Principal Coordinates Analysis / classical MDS) with the same layout as PCA — interactive **D3 2D + 3D**, group coloring, ellipses, labels, legend. Distance metrics: **Bray-Curtis** (default), **Euclidean**, **Manhattan**, **Cosine**, **Correlation** (double-centering + Jacobi eigensolver). **Add to Report** for PCoA 2D/3D.
- **v5.13**: **Report preview** — in-app preview mounts figures **directly in the page** (`#reportPreviewRoot`); PCA 3D uses the same **`NebulaPca3dReportEmbed.mount()`** as Clustering (rotate/zoom in preview). **Save Report** still exports self-contained HTML.
- **v5.01**: **Report — PCA 3D** embeds an **interactive D3 replica** (rotate, zoom, legend, tooltips) in the saved HTML; SVG/PNG fallback if needed.
- **v5.00**: **Report — PCA 3D** **clones the D3 SVG** into the HTML (exact visual copy; PNG fallback if too large).
- **v4.99**: **Report — PCA 3D** matches the **D3 view** (rotation, zoom, per-axis normalization, cube axis range) in the Plotly embed.
- **v4.98**: **Report — PCA 3D** — **Add to Report** on the **3D Plot** sub-tab; exported HTML includes **interactive Plotly scatter3d** (groups, legend-hidden state, camera) with PNG fallback.
- **v4.95**: **Report — PCA 2D** is an **interactive Plotly** chart in the exported HTML (like heatmap), with axis range and groups matching the Clustering tab at export time.
- **v4.94**: **Report — PCA 2D** keeps the **current zoom/pan view** from Clustering (no redraw before capture).
- **v4.93**: **Report** — **PCA 2D** exports as **PNG from the D3 SVG** (fixes blank Plotly embed after PCA moved to D3).
- **v4.92**: **SAINT** — **Bait column** defaults to **Group by** and follows it until you pick a different bait column.
- **v4.91**: **SAINT → Sample grouping** — control and treatment levels are **dropdowns** from the chosen meta column (like **Differential** two-group); mapping UI hides when **Use Status as-is** is on; session JSON includes SAINT grouping settings.
- **v4.90**: **Data QC → Overall** D3 charts keep **full width** when refreshed while the panel is hidden (report capture); shared **`data-nebula-overall-plot-width`** remembers last layout.
- **v4.89**: **Report** — **width** preserved for Plotly + PNG figures (layout/`_fullLayout` sizing, `min-width`, figure shell).
- **v4.88**: **Report** — figures keep **on-screen width/height** (explicit PNG dimensions; Plotly PNG fallback uses live layout size; light theme defaults; white figure chrome for charts).
- **v4.87**: **Data QC → Overall** — all three figures (**per-column summary**, **total log**, **box**) are **D3**; **Report** embeds **PNG** from the same SVG (no Plotly re-render for those sections).
- **v4.86**: **Report** — Plotly embeds **preserve pixel height/width** (locked layout + host div sizing; no forced 380px min-height).
- **v4.85**: **Report** — fix **syntax error** in `nebula_report.js` (missing `captureSvgHost` wrapper) that prevented the report module from loading.
- **v4.84**: **Report** — **Data QC → Overall** **total log** and **box plot** export as **interactive Plotly** (synthetic traces from `computeColumnStats`; no D3 raster).
- **v4.83**: **Report** — **Plotly** sections export as **interactive** charts (serialized `data`/`layout`/`config` + CDN); large/failed serializations fall back to PNG.
- **v4.82**: **Report** — **Overall D3** (total log + box plot) export: refresh dashboard before capture + off-screen SVG clone when hidden; **PNG canvas sizing** fix for `getBBox`.
- **v4.81**: **Report** sidebar — only **Matrix and meta summary** by default; **figure checkboxes** are created when you **Add to Report** (session restore rebuilds rows from saved `reportSec_*` inputs).
- **v4.80**: **Report** — caption textareas **under each figure inside the preview**; export HTML stays in sync via cached blocks + debounced rebuild; iframe **`allow-scripts`** for preview-only wiring.
- **v4.79**: **Report** — figure **captions** editor moved to a **column beside the preview** (not the sidebar); layout stacks on small screens.
- **v4.78**: **Report** — **Add to Report** modal (caption + stay vs open Report); **Figure captions** sidebar; HTML export **figcaption** from `nebulaReportFigureCaptions`.
- **v4.77**: **Add to Report** on all **Report-export** figure cards (Overall, Column profile bar/treemap, Column correlation matrices, Heatmap, PCA 2D; **v4.98+** also PCA 3D) via `addFigureToReport`.
- **v4.76**: **Data QC → Overall** — **Add to Report** for the per-column summary Plotly chart (enables Report section + opens Report).
- **v4.75**: **Data QC → Overall** Plotly per-column summary — **full column header** y-axis labels; duplicate headers disambiguated with ` [n]`.
- **v4.74**: **Data QC → Overall** — **horizontal** Plotly + D3 charts; **height scales** with sample count.
- **v4.73**: **Data QC → Overall** Plotly per-column summary — **unique x ticks** when truncated DIANN path headers collide (Plotly duplicate categories); hover shows full column id.
- **v4.72**: **Report** parallel collectors — fix **“No data.”** false empty from `runPool` closure bug.
- **v4.71**: **Report** matrix summary reads **`currentData.dataMatrix`** fallback; iframe sandbox tweak.
- **v4.70**: **Report** — removed Overall QC summary strip section.
- **v4.69**: **Report** Overall summary strip fallback when DOM not refreshed.
- **v4.68**: **Report** matrix/meta summary uses **Data QC → Overall** `computeColumnStats` + richer **meta** summary.
- **v4.67**: **Report** tab — **Save Report** + **auto preview** (no separate generate step).
- **v4.66**: **Report** tab — sidebar **Generate** + main-panel **HTML preview** iframe.
- **v4.65**: **Report** tab — selectable sections + single-file HTML export (MVP).
- **v4.64**: Row Filter **Technical Reproducibility** tool (technical-replicate bundles; zero inconsistent; drop all-zero rows).
- **v4.63**: Data PreProcess Row Filter sidebar **two-column** layout (like Column Filter).
- **v4.62**: After Clustergrammer loads Bootstrap, **`clustergrammer_bootstrap_restore.css`** reapplies Nebula `html`/`body`; `#cgm-container` gets same viz isolation as heatmap Clustergrammer.
- **v4.61**: Differential sidebar layout tightened (two-column rows, aligned cards).
- **v4.60**: Volcano sig labels (two-group): **split budget** between up- and down-regulation so the smaller wing still gets names.
- **v4.59**: Volcano sig labels: **priority by significance / effect** when label count is capped (was even subsample by row order).
- **v4.58**: Differential volcano optional **labels for significantly changed** features (ScatterLabelOptimize); session saves `diffVolcanoSigLabels`.
- **v4.57**: Differential two-group volcano / MA axis titles use **selected Group A / Group B** names instead of generic “A/B”.
- **v4.56**: Data QC → Overall **Bar metric** defaults to **Feature count (intensity > 0)**.
- **v4.55**: Data QC → Overall adds **Feature count (intensity > 0)** bar metric (non-zero feature count per column); docs updated.
- **v4.54**: Document tab — Overview expands **Data QC → Overall** bar-metric definitions; Overall Plotly y-axis labels include **intensity** for mean raw / mean transformed metrics.
- **v4.53**: Document tab now supports offline `file://` use through bundled docs (`doc/docs_bundle.js`), generated from markdown by `python doc/build_doc_bundle.py`.
- **v4.52**: Document tab help is externalized to **`doc/*.md`** + **`doc/manifest.json`**, rendered in-app with Marked + DOMPurify (`js/doc_viewer.js`); serve over HTTP so documentation can load.
- **v4.51**: Enrichr now also auto-switches from **Paste genes** to **SAINT result** when SAINT outputs become newly available (same transition rule as Differential).
- **v4.50**: Enrichr gene-source radios now gate by data availability (matrix / Differential / SAINT), default source is **Paste genes**, and invalid selections auto-fallback to Paste.
- **v4.49**: Enrichr adds **Differential results table** as a gene-list source; status text now reports exact source and count sent.
- **v4.48**: Increased default table viewport height (~20% more row space) across shared DataTables renderers.
- **v4.47**: Differential Results table toolbar — **Export CSV** button is right-aligned.
- **v4.46**: Differential Results table adds **Showing only Significant Changed** checkbox (filters out `NS` rows in table view).
- **v4.45**: Data PreProcess → Row Filter (Passed) table now makes ID cells clickable to UniProt when resolvable.
- **v4.44**: Data PreProcess → Annotations table enhancement — first column now opens UniProt when row annotations include `Protein.Names`/`Protein.Group`.
- **v4.43**: Differential results table enhancement — Feature column labels are now clickable UniProt links (when resolvable), while preserving user-selected feature-label text.
- **v4.42**: Differential UniProt URL fix — use first `;` token from `Protein.Names` (fallback first `Protein.Group` token) with trailing slash.
- **v4.41**: Differential volcano UniProt UX — click the plotted point to open UniProt (replaces hard-to-click moving hover hyperlink).
- **v4.40**: Differential volcano hover now includes a clickable **UniProt** link per feature (from `Protein.Names`, fallback to first `Protein.Group` element).
- **v4.39**: Document tab update — Differential section now explains results-table columns **t** and **df** (including Student vs Welch meaning of df).
- **v4.38**: Differential bug fix — volcano Y-axis now switches back to **−log10(p)** for None/Bonferroni and to **−log10(FDR)** for BH.
- **v4.37**: Differential cutoff simplification — removed **Use fold change cutoff instead**; `|log2FC|` and linear FC remain bidirectionally synced as one shared threshold.
- **v4.36**: Differential cutoff UX — linear **Fold change cutoff** is disabled unless override is checked; `|log2FC|` and linear FC fields now sync bidirectionally when edited.
- **v4.35**: Differential cutoff enhancement — added **Fold change cutoff (linear)** with checkbox override; when enabled, `log2(FC)` replaces manual `|log2FC|` cutoff (default FC = 1.5).
- **v4.34**: Differential sidebar refinement — cutoff card is now pinned to the **top-right** slot next to comparison/group controls (the previously empty rectangle area).
- **v4.33**: Differential sidebar refinement — moved **|log2FC|**, **p-value**, and **FDR** cutoff controls into the right column of the two-column sidebar layout.
- **v4.32**: Differential sidebar is now ~2× wider and organized in a two-column control layout (with responsive single-column fallback on narrow screens).
- **v4.31**: Differential tab UX — hide **p-value cutoff** whenever **BH FDR** is selected (show again for None/Bonferroni).
- **v4.30**: Differential tab fix — Volcano Y-axis default is now **FDR**, and BH→FDR sync also runs during mode refresh so it no longer gets stuck on p-scale when BH is already selected.
- **v4.29**: Differential tab UX — choosing **BH FDR** now auto-switches Volcano Y-axis to **FDR** and refreshes plots/tables.
- **v4.28**: Differential tab fix — when **BH FDR** is selected, **FDR cutoff** now truly controls significance coloring (volcano, MA, and result table), including fudge-volcano mode.
- **v4.27**: When **`data/qc_session.js`** is present and auto-restores successfully, landing view is now **Clustering → PCA → 2D Plot**.
- **v4.26**: **Nebula** branding — page title, header logo + name, favicon / `apple-touch-icon` from **`image/Nebula_icon.png`**; Document overview updated.
- **v4.25**: **Differential** fudge-factor volcano: red/blue coloring matches the green median curve (no more grey points sitting above the curve).
- **v4.24**: **Differential** sidebar: **Run differential analysis** sits under group / comparison settings (no long scroll to reach it).
- **v4.23**: **Differential → Results table** sub-tab: **Bar scale** for numeric in-cell bars defaults to **Column** (per-column scaling).
- **v4.22**: **Data QC → Column correlation → Overall correlations** adds a mixed matrix plot (**lower triangle scatter plots, upper triangle correlation heat cells**) in addition to the existing correlation and distance heatmaps; matrix plot uses the first columns from the current subset (up to 10 for readability).
- **v4.21**: **Column correlation** inner tabs use **`data-filter-inner-tabs-row` / `data-filter-inner-tab`** (same as **Data PreProcess → Data Filter** nested levels), with redundant `col-profile-*` tab overrides removed from CSS ([index.html](index.html), [css/main.css](css/main.css)).
- **v4.20**: **Column correlation** inner sub-tabs briefly reused **Column profile** sub-tab classes (superseded by v4.21).
- **v4.19**: **Data QC → Overall** adds **Plotly** per-column summary (all samples; metric in Overall sidebar; transform/zero from **Column correlation** shared controls). Overall D3 drops duplicate ID/mean–median charts (box + total log remain). **Column correlation** gains inner tabs **Overall correlations** (subset corr + distance heatmaps) vs **Paired correlation** (scatter, QQ, Bland–Altman, r vs X); shared scale block at top of sidebar.
- **v4.18**: **Data QC → Overall** (new first sub-tab): D3 dashboard in **`js/data_qc_overall_dashboard.js`** — quantified feature counts per sample (&gt;0), mean vs median log10(1+I), box plots, total log signal; default landing sub-tab for **Data QC**; refreshes when Data Filter UI updates if Overall is open.
- **v4.17**: PCA **2D/3D** D3 toolbar adds a **reset to initial view** icon (home): 2D clears zoom/pan; 3D restores default angles and refits zoom.
- **v4.16**: PCA D3 export icons no longer sit inside a **boxed** toolbar strip (no bar background/border/shadow).
- **v4.15**: PCA **2D/3D** D3 plot **PNG/SVG** export uses small **icon** buttons (Plotly-like modebar styling) instead of full text labels.
- **v4.14**: **Group annotation** color theme defaults to **Set2** (heatmap per-column selects, PCA/t-SNE first-column scheme, fallbacks, and meta-table categorical cell colors) for alignment with the warm app palette.
- **v4.13**: PCA **2D** D3 plot clips grid, ellipses, points, arrows, and labels to the **inner plot** (`innerW` × `innerH`) so zoom/pan does not paint past the axis frame.
- **v4.12**: PCA **2D** D3 plot now runs column labels through **`js/scatter_label_optimize.js`** (`repelLabelsCompat`) with zoom-aware bounds and the same max-label logic as the Plotly-era PCA/t-SNE path, reducing overlapping labels.
- **v4.11**: button styling pass — sidebar / filter toolbars use flat outlined secondary buttons; heatmap Generate uses muted sage; example and delete actions use warm amber / terracotta; aligns with frontend-design hierarchy guidance.
- **v4.10**: global UI (backgrounds, sidebars, buttons, tables, cards, pagination, loading overlay, Enrichr hosts) restyled to a flat warm palette consistent with the top-level tab look; no functional or wiring changes.
- **v4.09**: top-level tabs made a bit shorter (less vertical chrome); top-left transparent wedge slightly smaller via gradient stops; padding and tab-row height reduced to save space.
- **v4.08**: top-level `css_test`-style tabs adjusted so label text sits fully inside the colored fill (taller tab, padding, earlier gradient stops); wedge accent height matches tab height.
- **v4.07**: migrated the working `css_test.html` tab look to **top-level tabs only** (diagonal fill + wedge shadow accent); sub-tab styles remain unchanged.
- **v4.06**: active tabs now switch to a slightly lighter text tone on hover across top-level and all sub-tab levels, while keeping the same color scheme and size hierarchy.
- **v4.05**: removed the remaining level-3 legacy blue/purple override block so nested Data Filter tabs (Row/Column and Passed/Filtered/Summary) now fully follow the same top-level angled color scheme; compact per-level sizing is preserved.
- **v4.04**: all sub-tab levels now follow the same top-level angled-tab color scheme (text/gradient/border line), while keeping the current progressively smaller sizing by depth.
- **v4.03**: improved 3rd/4th-level tab label readability (less-bright inactive text) and aligned those tab-row underlines with the neutral angled-tab theme (removed blue mismatch).

- The second top-level tab is **Data PreProcess** (internal id remains **`switchTab('table')`** / **`#tableTab`**). **v3.15**: first sub-tab is **Data Filter** (formerly **Data Table**). **v3.17**: Data Filter is a two-level workspace: **Row Filter** and **Column Filter**, each with local result panels; Row Filter keeps **Passed / Filtered out / Summary**, while Column Filter is summary-focused. The old top-level **Filtered out** sub-tab was removed. **v3.18**: **Row Filter → Passed** matrix preview (`#tablePreview`) uses **`js/table_display.js`** with **DataTables.net** (DataTables 2 + jQuery from CDN on first open): search, sort, paging, frozen header via scroll layout, dual-axis scroll, and bar-style numeric cells. **v3.19**: fixes header freeze by panel-based **`scrollY`**, layout passes, and CSS that turns off legacy **sticky** `thead` rules under the DataTables host. **v3.20**: stops table-height oscillation by stable **`scrollY`** math, observing only the outer panel, hysteresis, and avoiding **`columns.adjust()`** on every resize. **v3.21**: aligns frozen header columns with the body via **`scrollbar-gutter`**, **`columns.adjust()`** after layout, and header **scrollbar gutter** padding. **v3.22**: drops DataTables **split scroll** (`scrollX`/`scrollY`) for the matrix; uses **one table** + **scroll shell** + **sticky `thead`** so header and body columns always share the same layout. **v3.23**: adds a **Bar scale** selector next to **entries per page** with **Column / Row / Table** modes for matrix cell bars. **v3.24**: fixes mode switching redraw and changes bars to a compact **background-fill with value overlay** style. **v3.25**: default **Bar scale** is now **Row**. **v3.26**: non-matrix tables are routed through shared `TableDisplay` APIs (`renderGenericTable`/`renderStaticTable`) and legacy `js/app_tables.js` is retired. **v3.27**: generic tables now default to the same baseline features (sticky header, sorting, search, pagination, vertical/horizontal scrolling, and numeric color-bar cells). **v3.28**: generic tables now use the same sticky-header scroll-shell style as **Passed**, so tabs like **Filtered out** keep frozen headers consistently. **v3.29**: generic tables also include the same **Bar scale** option (`Column / Row / Table`) as Passed. **v3.30**: sticky header is also enforced directly on generic table header cells at render/draw time for robust freezing in all panel contexts. **v3.31**: `TableDisplay.destroy` removes leftover empty-state text so **Filtered out** does not show both the old “no rows” message and the data table. **v3.32**: **DIANN annotations** tab drops the long intro note; annotation preview **Bar scale** defaults to **Column**. **v3.33**: **DIANN annotations** adds a **sidebar** (numeric **N.Sequences** / **N.Proteotypic.Sequences** bounds, keyword on other annotation columns), **Passed** / **Filtered out** inner tabs, **Apply to matrix** (updates **`currentData`** / **`currentDataMatrix`**), and **Data Filter → Filtered out** labeling for this source. **v3.34**: row filter apply actions in **Data Filter** and **DIANN annotations** always re-run from the original loaded/session-restored data snapshot so users can tune criteria non-cumulatively. **v3.35**: Row Filter **Summary** adds richer before/after QC visuals: row-sparsity violin comparison, per-column completeness box comparison, and per-column intensity (`log10`) distribution comparison, plus expanded summary stats. **v3.36**: per-column completeness and intensity are now plotted as **separate figures** with **all columns listed explicitly** (Before/After by column), replacing pooled combined distributions. **v3.37**: per-column summary figures now fill available tab width and place legends above the plotting area (with larger margins) to avoid overlap with x-axis labels. **v3.38**: completeness/intensity summary charts now lock width to measured container width on each render for true tab-fluid sizing, and legends are placed on the **right** with expanded right margins to avoid label collisions. **v3.39**: when opening the Row Filter **Summary** sub-tab, charts now re-render and resize after visibility switch so width uses the live visible panel size. **v3.40**: Row Filter Summary (counts+sparsity) legend is now also placed on the right, aligned with the other summary figures. **v3.41**: SD row filter threshold parsing now correctly preserves `0` values, and SD is computed on finite positive values only (`>0`) for consistency with missing-as-zero handling. **v3.42**: Row Filter Summary now includes a dedicated before/after variability distribution figure. **v3.43**: the variability distribution figure uses an overlaid histogram (Before/After). **v3.44**: variability filter supports CV/SD selection. **v3.45**: variability filter is CV-only with default threshold 0.2. **v3.46**: Row Filter keyword filter is Row ID-only. **v3.47**: Column Filter sidebar removed the “Filter by column name” search field. **v3.48**: restored the full manual column checkbox list under **Column Select**. **v3.49**: Column Filter result area removed the Passed/Filtered sub-tabs and lists kept/filtered columns in Summary. **v3.50**: Column Filter summary figure was removed; kept/filtered lists are side-by-side. **v3.51**: kept/filtered list columns stretch to full summary height. **v3.52**: Column Filter actions apply instantly with debounced auto-apply and name-based subset mapping. **v3.53**: “Choose by groups” uses per-group checkboxes. **v3.54**: Column Filter sections use framed/circled visual grouping cards. **v3.55**: Row Filter sidebar now uses the same framed/circled section-card grouping style. **v3.56**: Column Filter **Column Select** is a dedicated sidebar card with a taller scrollable checkbox list; **Pattern select** is its own card below it (pattern, groups, and valid-values tools can override the same checkboxes). **v3.57**: Column Select list membership is now stable from the original filter baseline, so unchecked columns remain visible and can be re-checked manually. **v3.58**: Column Filter sidebar is widened and arranged in a two-column card grid, with Column Select spanning both columns and responsive fallback to one column on narrower workspaces. **v3.59**: two-column layout remains, but all sidebar sections are single-column-width cards (no full-width spanning section). **v3.60**: Column Filter section placement is fixed: Column Select in the left column; all other sections stacked in the right column. **v3.61**: the Column Filter single-column fallback breakpoint was lowered to `1200px`, so typical desktop widths keep the intended two-column arrangement. **v3.62**: tab-switch JS now uses `display: grid` for the Column Filter sidebar (instead of `flex`), so the two-column grid layout is actually applied when opening that panel. **v3.63**: Column Filter grid uses `align-items: start` so short right-column cards (for example **Pattern select**) do not stretch to the height of the tall **Column Select** card. **v3.64**: Column Filter right column is a dedicated flex column wrapper so **Pattern select**, **Choose by groups**, **Valid values**, and status stack vertically in one column (not separate grid rows). **v3.65**: main top-level tabs were restyled to a rounded, raised CodePen-like visual style (white inactive tabs and dark active tab). **v3.66**: moved inline CSS from index.html into css/main.css and linked it from the document head. **v3.67**: sub-tab bars now use the same rounded raised tab geometry as top-level tabs, with a distinct teal color palette for visual separation. **v3.68**: third-level tabs (Data Filter inner tabs and Enrichr plot tabs) now also use the same rounded raised geometry, with a separate purple palette for hierarchical contrast. **v3.69**: tab levels now use a unified same-hue indigo gradient from level 1 through level 4, including dedicated fourth-level color tokens. **v3.70**: renamed the Data PreProcess sub-tab label from **DIANN annotations** to **Annotations** (internal `diannAnnotations` id unchanged). **v3.71**: added a new top-level **Data QC** tab and moved **Row Profile**, **Column profile**, and **Column Correlation** under it as second-level tabs. **v3.72**: added a new top-level **Clustering** tab and moved **Heatmap**, **Clustergrammer**, **PCA**, and **t-SNE** under it as second-level tabs. **v3.73**: moved **UpSet / Venn / K-map** under **Data QC** as a second-level tab with compatibility routing from `switchTab('upset')`. **v3.74**: **Meta Table** cells are now color-coded by metadata group value (non-`Sample_ID` columns), with stable per-value coloring that refreshes after render and on edits. **v3.75**: Meta Table grouping colors now use the same stronger discrete palette family used by heatmap group legends, with adaptive text color for readability. **v3.76**: **Clustering → PCA** now has third-level **2D Plot / 3D Plot** tabs, both rendered in interactive **D3** with metadata-aware grouping, tooltips, legends, and richer interaction (2D zoom/pan + confidence ellipses, 3D drag-rotate + wheel-zoom). **v3.77**: PCA 2D/3D now defaults to full right-panel width (auto-fill) while preserving right-side legend space. **v3.78**: PCA legend lane width is now dynamic (based on longest legend label, bounded) so plots gain more width when legend text is short, without clipping long legend labels. **v3.79**: PCA legends are now collapsible/expandable and scrollable, so large group sets stay accessible without stealing unnecessary plot width. **v3.80**: PCA legend entries are now interactive for filtering (click hide/show, double-click isolate, reset all), with per-view persistent state and visual hidden markers. **v3.81**: PCA legend hover now temporarily highlights the hovered group in both 2D and 3D (de-emphasizing others, with focused labels), while preserving click/double-click filtering. **v3.82**: PCA 3D now auto-fits initial zoom to the point cloud extent (with camera reset on mapping changes), preventing tiny startup plots while keeping manual camera interaction persistent after user adjustment. **v3.83**: PCA legend block is shifted slightly downward to avoid overlap with top plot/header text. **v3.84**: PCA legend header and legend list are hard-separated (lower list start), eliminating overlap between `Groups`/buttons and legend items. **v3.85**: PCA legend controls are now arranged on a dedicated control row under `Groups` with additional spacing before legend entries for cleaner readability. **v3.86**: PCA legend controls moved below the legend list and arranged horizontally, with list/control regions separated to eliminate any remaining overlap.

### Sticky headers and sorting (v2.59, v3.18)

- Many result grids use a shared **`.app-table-scroll`** wrapper so **column headers stay visible** while scrolling. **v3.18**: Data Filter → Passed intensity matrix is handled by `js/table_display.js`. **v3.26**: Name mapping, DIANN annotation, Differential results, SAINT results, Enrichr results-table page rendering, and Data Filter list-style previews also route through `TableDisplay` generic/static render APIs; `js/app_tables.js` is removed.

### CV variability filter documentation (v3.45)

- **Definition**: For each row, compute **CV = SD / mean** using only finite positive values (`>0`); zeros are treated as missing placeholders.
- **Threshold meaning**: Row is removed when **CV < threshold**. Default `0.2` means remove rows with less than **20% relative variability**.
- **Interpretation**: Lower CV rows are relatively flat across samples; higher CV rows show stronger relative spread.
- **Edge cases**: If a row has fewer than 2 positive values, SD is 0 and CV resolves to 0; such rows are typically removed for thresholds > 0.
- **Recommendation**: Start at `0.2`, then tune with the Summary histogram to balance noise removal vs signal retention.

### Row Profile auto chart (v2.60)

- The first time **Data PreProcess → Row Profile** is opened for a loaded matrix, the app auto-selects **top 5** by row intensity sum, sets **bar** plot, and draws the embedded chart. Re-opening the sub-tab on the same matrix does not repeat; loading a new matrix resets this once-per-matrix behavior.

### PCA / t-SNE label placement (v2.41–v2.42)

- **`js/scatter_label_optimize.js`** defines **`window.ScatterLabelOptimize`** for any 2D scatter: **`optimizeScatterLabels`**, **`repelLabelsCompat`**, **`computeMaxLabelCount`** (more labels when zoomed in vs full data span), and **`computeFullSpanProduct`**. The main app loads it before the inline script in **`index.html`**; PCA and t-SNE pass the current **label font size** so box estimates match **Auto label style**. Default on-plot cap is still ~**40** at full view, up to **150** after zoom when space allows.
- **v2.42**: Leader lines from point to label have **no arrowhead**; **v2.43** uses a fixed **light grey** stroke (not label-colored). **v2.44**: lines are drawn **below** markers (`layer: 'below'`); **Show Column Labels** defaults **on** for PCA and t-SNE. **v2.45**: first **Group Annotation Labels** checkbox is on by default when the list is first populated (meta columns available). **v2.46**: if no group checkboxes are selected at build time (common on example loads), the first meta column is auto-selected for PCA/t-SNE plotting.
- **v2.48**: attempted `markers+text` for z-order. **v2.49**: column labels use **`buildSampleColumnLabelAnnotations`** (`layout.annotations`, `layer: 'above'`) so labels reliably draw **above** markers on PCA and t-SNE.
- **v2.50**: **t-SNE** embeddings from `js/tsne.worker.js` are **mean-centered** and **SD-scaled per axis** after the run so axis ticks look like common examples (roughly order 1); re-run **Generate t-SNE** to refresh.
- **v2.89**: **t-SNE** **Data preprocessing** (log10, column Z-score) is part of the result cache key, so changing those options recomputes the embedding instead of reusing a stale plot.
- **v2.90**: **t-SNE** adds optional **row-wise Z-score** normalization (per sample across features), matching the **PCA** tab; it is part of the cache key and session export.

### Name mapping (Data PreProcess) (v2.33–v2.34)

- **Data PreProcess** → **Name mapping** uses **MyGene.info** (no API key) to annotate row IDs (`js/feature_name_mapping.js`): **`query_id`**, **`gene_symbol`**, **`protein_name`**, **`uniprotkb_ac`**, **`species_taxid`**, **`mapping_note`**. Results feed **feature label** dropdowns and **Row Profile** search like DIANN row annotations; use **http://localhost** if **`file://`** blocks `fetch`. See in-app **Document** section **3b**. **v2.34** fixes batch POST (`q` comma-separated; parse top-level JSON array from MyGene).

### Meta Table export (v2.37)

- **Data PreProcess** → **Meta Table**: **Export meta table (TSV)** downloads the current `metaData` so you can edit it externally and re-import it via **Data Preparation**.

### Heatmap progress banner (v2.38)

- **Heatmap** calculation progress now shows as an **in-tab banner** (same style as the **Clustergrammer** progress bar) instead of the global fixed overlay that appeared above all tabs.

### Heatmap large-matrix responsiveness (v2.91)

- While clustering still uses the same **Web Worker** as before, **preprocessing** (log10, per-row Z-score) and the **transpose** used for **sample clustering** are chunked with yields so other tabs keep responding. Progress text from the worker is **throttled** to one UI update per animation frame. The banner includes **Cancel** (like the **Clustergrammer** tab) to **abort** an in-flight heatmap build without waiting for the browser’s unresponsive dialog.

### Heatmap group legend in exports (v2.92)

- The **sample group** legend (metadata color key) is part of the Plotly figure (**paper**-referenced shapes and annotations), so **camera / download** exports include it. The previous HTML legend lived outside the plot node and was not captured.

### Data Preparation input colors (v2.39)

- **Data Preparation → Data matrix** input methods are color-coded (example / paste / file / DIANN) to make it easier to visually identify loader type.

### DIANN annotations table UX (v2.40, v2.54, v3.33)

- **Data PreProcess → DIANN annotations** now supports column-header sorting, horizontal scroll for wide tables, and wrapped long-cell content with max column width for easier reading. **v2.52–v2.53**: **sticky header** matches **Meta Table** layout (table directly inside the scrollable `.table-preview`; **v2.53** removes an inner horizontal-scroll wrapper that prevented sticky from binding to the panel scroll). **v2.54**: header **colors/hover/shadow** match **Data Filter** / **Meta Table** (purple theme). Headers can **wrap** for long names. **v3.33**: **sidebar filters** (numeric **N.Sequences** / **N.Proteotypic.Sequences**, keyword on other columns) and **Apply to matrix** update the loaded matrix; **Filtered out** shows the last sidebar drop list.

### SAINT and Enrichr (v2.29, v2.30–v2.32, v2.35–v2.36, v2.55–v2.71)

- **v2.99**: **Enrichr** library load (**`js/saint_embed.js`**): dropped the mistaken **v2.98** rule that skipped **`fetch`** on **`file://`**; Enrichr can answer with **`Access-Control-Allow-Origin: null`** when **`Origin: null`**. Failure hints now mention that **504** responses often lack CORS headers, so the console shows a **CORS** message even though the real problem is gateway timeout.
- **v2.98**: **Enrichr** library dropdown: **HTTP status checks**, **retry with backoff** (up to 10 attempts), and **Retry loading libraries** after failures; **`window.enrichrRetryLoadLibraryStats`**. (The **`file://`** skip added in v2.98 was removed in **v2.99**.)
- **v3.02**: **Enrichr → Heatmap** row filter **Max adj. P-value** defaults to **0.05** (clear the field to disable). Other filters stay optional (empty = off).
- **v3.01**: **Enrichr → Heatmap** plots **only sample intensity columns**; **adj.P, P, combined score, odds ratio** (and **min overlap**) are **optional row filters** in the sidebar (empty field = no filter), then rank and max rows.
- **v3.05**: **Enrichr → Heatmap** uses the **same clustering UI and code path** as the main **Heatmap** tab, but the **data matrix is the Enrichr result**: **rows = ontology terms** from the Results table, **columns = per-sample intensities** on those terms. **`buildEnrichrTermIntensityMatrixForClustering`** (alias **`buildEnrichrIntensityMatrixForClustering`**).
- **v3.04**: (Reverted in **v3.05**.) Brief experiment: protein rows from a gene-union subset of the loaded matrix.
- **v3.03**: **Enrichr → Heatmap** first shipped a **shared clustering pipeline** with term × sample intensities.
- **v3.00**: **Enrichr → Heatmap** sub-tab shows a **Plotly heatmap** from Enrichr results (see **v3.01** for intensity-only + filter split). **`js/heatmap_core.js`** only exports **`HeatmapCore.MAIN_PLOT_DIV_ID`**. Clustered **protein × sample** heatmaps remain on the top-level **Heatmap** tab.
- **v2.97**: (Superseded by **v3.00**.) Enrichr Heatmap sub-tab previously mirrored the main-tab intensity heatmap.
- **v2.96**: **Enrichr** results append **one column per data-matrix sample** (headers from **`columnHeaders`**): each value is the sum of that sample’s intensities over rows matched to overlapping genes (same mapping as v2.95). **Export results TSV** includes those columns.
- **v2.95**: **Enrichr** added a single **Matrix intensity sum** column (superseded by **v2.96** per-sample columns).
- **v2.94**: **Enrichment plots** right panel uses **tabs** (bar / bubble / Jaccard) so one figure fills the area; **Redraw** and layout hooks call **`onEnrichrPlotsLayoutRefresh`** to resize Plotly surfaces.
- **v2.93**: **Enrichment plots** sub-tab hides the main **Enrichr** run-config sidebar so the layout is a single **Plot options** column plus charts (results sub-tab still shows both sidebars as before).
- **v2.71**: **Enrichr** sub-tab renamed **Enrichment plots**; plot controls moved into a dedicated **sidebar** beside the figures.
- **v2.70**: **Enrichr** uses sub-tabs **Results table** | **Downstream plots** for the Plotly downstream figures (same scripts as v2.69).
- **v2.69**: **Enrichr** tab adds **Downstream plots** (bar chart, bubble/dot-style plot, Jaccard similarity heatmap, TSV export) driven by **`js/enrichr_results_parse.js`** and **`js/enrichr_plots.js`** after **`Run enrichment`** or session restore.
- **v2.61**: **Matrix row labels** for Enrichr strip a trailing **UniProt-style `_SPECIES`** token when it matches a known organism mnemonic (e.g. **`UBA6_HUMAN` → `UBA6`**, **`Xyz_mouse` → `Xyz`**), then dedupe for the query.
- **v2.62**: If DIANN pg annotation includes a **`Genes`** (or gene-name) column with enough filled rows, **Enrichr** uses that column for the gene list before row-label / MyGene fallback.
- **v2.63**: **Enrichr Human/Mouse** auto-guess also scores **DIANN `Protein.Names`** (or similar) cells by counting **`_HUMAN`** vs **`_MOUSE`**-style suffixes across sampled rows, not only a single regex hit on the whole haystack.
- **v2.64**: Opening the **Enrichr** tab runs **`applyEnrichrSpeciesGuessToDom`** so **Mouse/Human** is set from DIANN **`Protein.Names`** (and other signals) before libraries load; strong **`_MOUSE`** vs **`_HUMAN`** imbalance returns **Mouse** directly.

- After loading a matrix and meta in **Data Preparation**, open **SAINT**: pick a **group** meta column and **control / treatment** levels from dropdowns (or **Use Status as-is** if the meta table has **T**/**C** in `Status`), choose a **Bait** column, then **Run SAINT analysis**. **v4.91**: group levels are listed from the matrix–meta join (same idea as **Differential** two-group). Sub-tabs **Network** (force layout, d3 v7 on demand) and **Scatter Plot** use the same results. **Enrichr** accepts **pasted** genes, **matrix row labels**, or **SAINT preys** after an analysis. **v2.55 (matrix row labels)**: infers **Human/Mouse** from row IDs, column paths/names, and meta strings when possible; otherwise logs a reminder to set species manually. If IDs look like **UniProt** / long descriptions (not gene symbols), the app runs the same **MyGene** pipeline as **Data PreProcess → Name mapping** (`runFeatureNameMappingAsync`), stores results for that sub-tab, and submits deduped **`gene_symbol`** hits to Enrichr (reuses an existing mapping when most rows already have symbols). **v2.56**: fixes a **stuck “running” lock** if synchronous name-mapping setup threw; **Run mapping** now warns when a run is already active. **v2.57**: Enrichr defaults to **Matrix row labels** as gene source. **v2.58**: default **category** is **Ontologies**; default **library** prefers **GO Cellular Component** (e.g. `GO_Cellular_Component_2025` when available). Example: **Load SAINT analysis example data** in Data Preparation (protein-level demo from `js/example_saint_protein.js`) — the loaded session includes **`currentData.dataMatrix`** for **Heatmap / PCA / t-SNE** (v2.30). **v2.31**: SAINT syncs matrix references and fills missing **meta** column headers when needed. **v2.32**: **`window.metaData`** / **`window.currentData`** / **`window.currentDataMatrix`** are bridged to the main app’s data so SAINT dropdowns (e.g. **Bait column**) populate. **v2.35**: SAINT progress overlay auto-dismisses after completion (or on error / Stop). **v2.36**: Enrichr results use the same table + **in-cell bar** styling as the original standalone SAINT report app (green p-value columns, blue score columns). **v2.88**: SAINT example data and the **`Saint/`** tree were consolidated — example matrix now lives as **`js/example_saint_protein.js`**; the old **`Saint/`** folder (standalone SAINTq demo, duplicate Clustergrammer, test inputs) was removed from this project.

### Data Preparation tab (v1.80–v1.96, v2.87–v2.88)

- **v2.87–v2.88**: **Load SAINT analysis example data** lazy-loads **`js/example_saint_protein.js`** (formerly `Saint/js/example_protein.js`). The obsolete **`Saint/`** directory (not used by the main app) was removed; only this script’s content was kept under **`js/`**.
- The first tab is **Data Preparation** (temporary name). It uses **three columns**: **data matrix** uploads (left), **meta table** uploads (center), **session JSON** export/import and options (right). Columns stack below ~1100px width. Uploads include examples, paste, file loaders, and DIANN. **Data PreProcess** → **Data Filter** now runs a unified ordered pipeline (v3.17): row/column filter actions execute in user order and recompute the current matrix for downstream tabs. **Row Filter** includes hybrid valid-values filtering (global/grouped, count/percent), random N sampling, CV threshold filtering, and **Row ID** keyword filtering. **Column Filter** includes name checkboxes, pattern select/unselect, group-based selection, and valid-values filtering for columns. Each workspace has local **Passed / Filtered out / Summary** views. The old top-level **Filtered out** sub-tab has been removed. **Meta table editing** remains under **Data PreProcess** → **Meta Table** (v1.86). Other analysis sub-tabs (**Row Profile**, **Column profile**, **Column correlation**, etc.) are unchanged.
- **DIANN protein group matrix** (v2.05): default row ID is **`Protein.Names`**; first six file columns are kept for Row Profile search and tooltips. Session JSON export/import includes these fields when present. **Data PreProcess** → **DIANN annotations** shows those columns in a read-only table (v2.07–v2.08), aligned with **Data Filter** sort and pagination.

### Column profile (v2.02–v2.03, v2.06, v2.25)

- **Data PreProcess** → **Column profile** (sub-tab after **Row Profile**): one **button per sample column** above the plots. For the selected column, **Plotly** shows (all interactive): **ranked bars + line** (intensity high→low; **linear intensity** y-axis ticks in **scientific notation**, v2.06), **cumulative % of total**, **treemap**, **pie** (top *N* + **Other**), and **v2.25**: **histogram + Gaussian KDE** of **log10(1 + intensity)** over **all** features (not capped by Max features). Left sidebar: **Max features**, optional **log10(1+intensity)** for the bar panel (log-transformed axis uses fixed decimals, not scientific). (Moved from a top-level tab in v2.03.)

### Column correlation (v2.24)

- **Data PreProcess** → **Column Correlation**: pairwise **sample–sample** QC on matrix columns (not DE). **Plotly** scatter, QQ, Bland–Altman, **Pearson**/**Spearman** and distance heatmaps on the **first N** columns (default 40, max 80), bar chart of **r(X, j)** vs other columns in that subset, and column summary bars (mean / detection). Transforms and **treat 0 as missing** match other tabs; **session JSON** stores **`colCorr*`** sidebar values. See in-app **Document** section 9.

### Differential tab (v2.14–v2.16, v2.23 multi-group, v2.26–v2.28 fudge volcano)

- After **UpSet / Venn / K-map**, the **Differential** tab compares samples using a **metadata column** (joined to matrix columns via `Sample_ID`). **Two groups**: **Welch** (default) or **Student** **t-tests**, optional **log2(x+1)** and missing/zero handling, **FDR** (BH) or **Bonferroni**, **Plotly** volcano / MA / **p-value histogram**, sortable table, **CSV export**. **v2.23**: **Multiple groups** mode — checklist of meta levels, **one-way ANOVA** or **Kruskal–Wallis**, volcano on **η²** or **F**/**H**, **mean-range** plot, **group heatmap** (top *N* by *p*), dynamic table/CSV, and matching **session JSON** keys. **v2.26–v2.28**: optional **fudge factor volcano** (two-group): **s₀**, joint **p**/FDR + moderated **d** rule, **two-branch** green median-SE guide (**hyperbolic** 1/|FC| shape between clip and **need**, flat tails), MA colors aligned; session **`diffVolcanoFudgeFactor`** / **`diffFudgeS0`**. See in-app **Document** section 10 (includes **DESeq2**/count-based DE **not** in scope for this browser app). **v2.16**: shared **chrome tab** styling across top-level tabs, Data PreProcess / heatmap / column-profile sub-tabs, and Document outline.

### UpSet / Venn / Karnaugh tab (v1.88–v2.01, v2.68 path, v2.86)

- After **t-SNE**, the **UpSet / Venn / K-map** tab builds set intersections from the loaded matrix: each **set** is a sample column; each **row** (feature) belongs to a set if the cell passes the sidebar **presence rule**. **0 is always treated as missing/NA** (v1.89). Modes: finite **non-zero** number, or **intensity strictly greater than a user-set threshold** (default threshold 0 ⇒ same as &gt;0; v1.91). **UpSet.js** is loaded on demand from jsDelivr; the library is **AGPL-3.0** (see in-app **Document** §7 and the tab sidebar). Layout (v1.93): **UpSet** full width on top; **Venn** and **Karnaugh** in two columns below (stacks on narrow screens). Plot pixel heights **+21%** vs original caps (two **+10%** steps, v1.94–v1.95). **Pop out** next to each chart title opens **`popout/upset_popout.html`** for that view; the parent passes data via **`postMessage`** (and **`combOptions`** for the UpSet view, v2.01) so **`file://`** works (v1.98); **`sessionStorage`** is used when shared (e.g. localhost). Collapsible **Set combinations** in the sidebar mirrors the [UpSet.js App](https://upset.js.org/app/) options for the **UpSet** bars (`generateCombinations`; see [data docs](https://upset.js.org/docs/data/)). The pop-out uses the same **hover / selection** behavior and reflows on **resize** (v1.99). Allow **pop-ups** for the main page. The in-plot **share** control stays hidden (v1.97) so PNG/SVG/dump/VEGA work. Combinations sorted **high to low** (v1.90); **linked hover** (v1.92) as in the [components overview](https://upset.js.org/docs/components). Set chooser: filter, select all/clear, refresh. **v2.86**: each **Pop out** control shows the same **`.viz-popout-icon`** SVG as the heatmap tab.

### Session snapshot JSON (v1.77–v1.86) and report JS (v2.65)

- In **Data Preparation**, **Export session to JSON** writes a single file containing the current matrix, meta table, key sidebar settings, and (if available) heatmap clustering output, PCA/t-SNE results, and optionally the Clustergrammer network. With **Include Clustergrammer network** checked, the snapshot includes the network built on the **Clustergrammer** tab (not only the legacy heatmap-side path). **`plotting`** (v2) stores heatmap / PCA / t-SNE **group annotation** checkbox states and the **color scheme index** for the first selected PCA/t-SNE annotation column. **formatVersion 3** adds cached **Differential**, **Enrichr**, and **SAINT** results so those tabs reopen without rerunning analyses. **Export session as report JS** produces **`qc_session.js`** for **`data/qc_session.js`** auto-load (see **Bundled report session** above). **Import session from JSON** reloads that state for quick review without re-uploading raw files; Clustergrammer data is restored on the **Clustergrammer** tab when the old heatmap container is not present. Use a local HTTP server if your browser blocks file features on `file://`.

### Heatmap tab (v1.63: Clustergrammer removed; v2.17 feature labels; v2.21 Genes default; v2.22 sidebar layout; v2.72 plot card; v2.73–v2.86 margins / frame / resize / pop-out)

- The Heatmap tab shows only the **Plotly heatmap**. The Clustergrammer sub-tab has been removed. Sidebar **Feature label (rows)** (v2.17): same DIANN / matrix row ID options as the **Differential** tab; changing it **redisplays** the heatmap without re-running clustering. **v2.21**: on load, this (and matching Clustergrammer / Differential controls) **defaults to Genes** when the matrix provides gene labels (DIANN gg, pg with Genes, etc.). **v2.22**: wider sidebar (**640px**) and a **two-column** grouped control layout. **v2.72**: the plot sits in a **boxed** panel on the right. **v2.73**: **Figure & margins** adds **Margin bottom (px)** (default **100** as of v2.78); session JSON stores it. **v2.74**: bottom margin can be **0**; sample x-axes no longer use Plotly **automargin**; the plot host overrides the global **600px** min-height. **v2.75–v2.76**: the white **frame** fills the **full height** of the right panel; **`#heatmapPlot`** fills the frame with **`flex: 1`**. **v2.77**: no **scrollbars** on the plot host (**`overflow: hidden`**); **`Plotly.Plots.resize`** is run on a short schedule after draw, when the framed panel is resized (**`ResizeObserver`**), on tab focus, and after heatmap **`react`**/**`relayout`** so the figure stays fitted to the panel. **v2.79**: **Figure & margins** starts **collapsed** (**`<details>`** / **`<summary>`**). **v2.80**: chevron on the summary (**right** when collapsed, **up** when open) plus a **tooltip** on the block. **v2.82**: **Pop out** opens **`popout/heatmap_popout.html`** (Plotly **2.27**), same **`postMessage`** + **`sessionStorage`** pattern as UpSet/Venn. **v2.83**: removed the short hint beside **Pop out** while it still sat above the plot. **v2.84**: **Pop out** is in the sidebar to the right of **Generate heatmap**, visible only after a heatmap exists, and **`updateHeatmapPopoutButtonState`** runs on data/metadata reloads so it hides when the heatmap is cleared. **v2.85–v2.86**: **Pop out** shows a small inline **SVG** external-window icon (class **`viz-popout-icon`**, rounded strokes, **`currentColor`**) beside the text; the same glyph is on the **UpSet** tab’s three **Pop out** buttons (**v2.86**).

### Clustergrammer tab (v1.64; v2.17–v2.19 feature labels)

- A dedicated **Clustergrammer** tab (top-level, after Heatmap) uses the loaded matrix and metadata (from **Data PreProcess** → **Data Filter** / **Meta Table** sub-tabs and **Data Preparation** uploads). Click **Cluster and visualize** to cluster and visualize the loaded matrix; column categories (e.g. group annotations) come from metadata when available. Clustering options (distance, linkage, prefilter, optional **log10** transform of the matrix before clustering, z-score per row) and label scales are in the sidebar; by default **log10** is on and **z-score per row** is off. On first load, the built-in **Column Order** control defaults to **Alphabetically** (Clustergrammer `inst_order`); **Row Order** defaults to **Cluster**. The main area shows the interactive heatmap with dendrograms, trapezoid sliders, and Enrichr/Find & Highlight when dependencies are loaded. **Feature label (rows)** (v2.17) sets row names for **Enrichr** and labels. **v2.19**: the tab’s **Cluster and visualize** path uses that dropdown (not only matrix row IDs); changing the dropdown re-runs clustering when the tab already shows a plot. **v2.18** (heatmap-export path): labels still apply when cached row-index arrays are missing and after Clustergrammer’s internal name parsing. **DIANN pg**: per-row **Genes** is also stored from the file’s Genes column for labeling when needed (v2.19).

- Clustergrammer scripts are loaded from the project `js/` folder (clustergrammer.js, clustergrammer_network.js, clustergrammer_cluster_worker.js, send_to_Enrichr.js, Enrichrgram.js, hzome_functions.js). They were copied from `clustergrammer/js/` so the `clustergrammer/` folder can be removed eventually. **v2.20**: Bootstrap is still loaded for Clustergrammer, but **`html` font-size is pinned** so main app tabs do not shrink.

### PCA tab (v1.74–v1.76)

- When **metadata group columns** are used to color the PCA scatter, the sidebar can show **semi-transparent 95% confidence ellipses** around each group (sample covariance on the two plotted PCs; χ² scale for two dimensions). **Show group confidence ellipses (95%)** is **on by default**; turn it off to hide ellipses. Groups need at least three samples to draw an ellipse.
- **Point hover**: Tooltips list **every metadata column** for that sample (keyed by `Sample_ID`), then the **PC scores** for the axes currently plotted (with explained variance %). If there is no meta table, the tooltip shows the sample/column id and PC scores only.

### Web Workers extracted to separate files (v1.53)

The three previously-inline Web Workers are now standalone files in `js/`:
- `js/clustering.worker.js` — hierarchical clustering
- `js/pca.worker.js` — PCA
- `js/tsne.worker.js` — t-SNE

`index.html` uses `new Worker('js/clustering.worker.js')` etc. directly.
**Note:** this requires a local HTTP server when using Chrome (Chrome blocks `new Worker()` on `file://` URLs). Firefox allows it without a server.

### LFQ example data now static (v1.51)

- `js/example_matrix_data.js` no longer runs a random generator on load. The full 600-protein × 30-sample matrix was pre-generated in Python with `random.seed(42)` and embedded as a JSON object.
- `window.exampleData` is a lazy getter that rebuilds the TSV string from JSON on first access.
- `window.exampleSampleNameToIndex` is also hard-coded (the shuffled name→original-index map).
- `index.html` was not modified.

### DIANN example fully embedded (v1.50)

- `js/example_diann_pg_matrix.js` now embeds the full `results.pg_matrix.tsv` content (2000 rows × 42 columns) as a JSON object (`window.exampleDiannPgMatrixJson`).
- `window.exampleDiannPgMatrixText` is a lazy getter that reconstructs the TSV string from JSON on first access.
- Clicking "Load DIANN pg matrix" no longer makes any network request; all data comes from the pre-built JS file.
- `index.html` was not modified (existing conditional logic already fell through to the getter path).

### Document tab navigation update (v1.48)

- Fixed blank `Document` tab rendering by correcting tab/container nesting in `index.html`.
- Updated `Document` tab layout to:
  - left sidebar outline (clickable sections),
  - right content area that switches to the selected section.

### In-app Document tab (v1.47)

### Example data externalization (v1.49)

- The large LFQ example matrix is now generated in `js/example_matrix_data.js` and only loaded when example data/metadata are requested.
- A DIANN example protein group matrix (`results.pg_matrix.tsv`) is exposed via `js/example_diann_pg_matrix.js` and loaded through the existing DIANN parsing pipeline by clicking `Load DIANN pg matrix` in **Data Preparation**.

- Added a top-level `Document` tab to `index.html` for built-in user-facing documentation.
- It summarizes:
  - data input expectations,
  - DIANN import and row-ID selection behavior,
  - replicate parsing logic (`R#`/`T#`),
  - group completeness filtering and the technical-replicate algorithm in code,
  - what is refreshed/reset after filtering.

### Group completeness filter (v3.06) and technical replicate logic (v1.46)

- **Group completeness filter** (**Data PreProcess** → **Data Filter** → **Row Filter**): choose one or two metadata columns; per row, values are **valid** if finite and **> 0**; require a minimum **count** or **percentage** (⌈groupSize × P / 100⌉) of valid columns within each group or zero the whole group for that row; then remove rows with no positive value anywhere. Optional: skip groups with fewer than two samples. **v3.07**: if replicate columns were blank because the global R/T axis was incomplete, **`R#` / `T#` are parsed from each matrix column id** for grouping and meta backfill so DIANN-style names still form per-replicate groups. **v3.08**: the same per-column **`R#` / `T#`** fallback applies when cells hold placeholder text like **`NA`** instead of being empty. **v3.09**: matrix columns that are **full file paths** join to meta rows when **`Sample_ID`** is the **filename only** (basename match). **v3.10**: temporary debug logging for this filter was removed after verification. **v3.11**: removed rows appear under **Data PreProcess → Filtered out**. **v3.12**: that sub-tab stays hidden until at least one row has been dropped. **v3.13**: inline + **Document** §5 text for **Ignore groups with fewer than 2 samples**. **v3.15**: **Row Filter** / **Column Filter** nested UI; see main **Data Preparation** bullet for new row/column tools.
- **Technical replicate filtering** (`applyTechnicalReplicateFiltering` in `index.html`): unchanged algorithm for complete **T1..TN** sets on **Group** + **Biological_Replicate**; **v3.06** removes the dedicated sidebar button — call from the **browser console** if you still need that exact rule; status text appears in the **group completeness** status line when you do.

### DIANN replicate parsing update (v1.45)

- Replicate metadata detection now supports:
  - full `R#_T#` pattern (both columns),
  - full `R1..RN` pattern only (biological replicate column only),
  - full `T1..TN` pattern only (technical replicate column only).
- Parsing is applied only when the detected axis is complete across all samples and indices are contiguous from `1` to `N`.

### Data PreProcess row profile bar chart (v1.40)

- Added a searchable row-ID selector in the Data PreProcess tab (then “Data Matrix”) to find IDs from the first column.
- Supports multi-selection and comparison plotting across all samples.
- Renders grouped bar charts in the **Data PreProcess** tab sub-tab `Row Profile` (next to `Data Filter`) for reliable display and easier inspection.
- Includes selection clear/reset and automatic stale-selection cleanup after loading new data.
- Plot/open actions are bound both via `onclick` and the global `data-action` dispatcher for reliability across click targets.
- Row profile plot size is now stabilized (explicit panel-based width/height + `Plotly.react`) so repeated plotting does not increase chart height.
- Includes a Row Profile settings sidebar for plot type (`bar`/`line`) and optional log-scale Y axis.
- Row width calculation now respects the plot-area width (excluding the Row Profile settings sidebar) to avoid horizontal overflow.

### Label repel test sandbox

- File: `test_label_repel.html`
- Purpose: quick playground to prototype ggrepel-like label behavior on a random scatter plot.
- Data: 100 random points with labels `sample-001` ... `sample-100`.
- Features:
  - Repel labels from each other and from points
  - Pull labels toward anchor points (`force_pull`)
  - Direction constraints (`both`, `x`, `y`)
  - Presets: `balanced (ggrepel-like)`, `rightward / aligned`, `symmetric cloud`
  - Smart auto font sizing based on label density + manual font override
  - Overlap-based label dropping (`max.overlaps`)
  - Arrow annotations from label to point
  - Dynamic label recomputation on zoom/pan

Open `test_label_repel.html` directly in a browser to test and tune parameters.

### Main application label style options

In the main `index.html` application, both PCA and t-SNE tabs now include label-style controls for scatter labels:

- `Auto label font/color` (default enabled)
- `Label font size (manual)`
- `Label color (manual)`
- `Auto show arrows` (default enabled)
- `Show arrows (manual)`

When auto mode is enabled, label size/color are computed automatically based on current visible label density and plot area, and are re-applied during zoom/pan updates. Arrow visibility can also auto-switch to reduce clutter when few labels are visible.

### DIANN protein-group upload (v1.35)

`index.html` now includes a dedicated uploader for DIANN protein-group matrix output (`results.pg*_matrix.tsv`).

- Lets users choose the DIANN row-ID column for plotting/analysis (`Genes` default, `First.Protein.Description`, `Protein.Group`, `Protein.Names`).
- Reads intensity values from column 7 onward.
- Simplifies raw-file path headers to minimal unique sample names by removing shared path/prefix parts and file extensions.
  - The shared-prefix trimming stops at the last separator boundary (`_`, `-`, `.`, or space) so tokens like `pituitary` in `..._pituitary_DKO_R1.raw` keep their first character.
- Replaces missing/invalid intensity values with `0` during DIANN import.
- When selected ID column is not `Protein.Group`, rows with blank selected IDs are removed automatically.
- Auto-parses sample postfix pattern `R#_T#` (e.g. `R1_T1`, `R12_T2`) into metadata columns `Biological_Replicate` and `Technical_Replicate`.

### DIANN gene-group upload (v1.67)

- Supports DIANN gene-group matrix output (`results.gg*_matrix.tsv`).
- Expects first three columns to be `Genes`, `N.Sequences`, and `N.Proteotypic.Sequences`; intensity columns start at column 4.
- Uses the first column (`Genes`) as the fixed row ID for plotting/analysis.
- Simplifies raw-file path headers to minimal unique sample names using the same DIANN header rules as the protein-group parser (shared-prefix trimmed to last separator boundary).

### Row Profile color themes (v1.68)

- Row Profile sidebar now offers a **Color theme** selector instead of a single trace color.
- Available themes: **Default (Plotly)**, **Distinct (Category10)**, **Warm**, **Cool**, **Pastel**, **Dark**, and **High contrast**.
- When a non-default theme is selected, each plotted row gets a distinct color from the chosen palette in both bar and line modes.

### Clustergrammer heatmap colors (v1.10)

Clustergrammer sub-tab under Heatmap now uses the same colorscale as the Plotly heatmap (RdBlkGn, RdYlBu, Viridis, etc.). Tiles are patched after render to apply continuous color mapping from min to max. The Matrix Values legend gradient matches the heatmap colorscale.

### Clustergrammer layout on tab switch (v1.26)

When you switch to the Clustergrammer tab, the sidebar is hidden by default so the heatmap uses the full width. You can show the sidebar anytime with the built-in show/hide sidebar button in the Clustergrammer toolbar.

### Clustergrammer dendro threshold sliders (v1.27, v1.28)

The two triangle sliders that control row/column clustering threshold are now clickable and draggable (v1.27: pointer-events and event propagation fix). In v1.28, the clustering hierarchy is passed correctly: group arrays are built from the heatmap dendrograms so moving the sliders changes the visible cluster granularity as in the [official Clustergrammer](https://maayanlab.cloud/clustergrammer/) examples.

### Group inference from sample names (v1.01)

Metadata Group column is auto-guessed from sample names using several rules:

- **Numeric pattern**: `1_1, 1_2, 2_1, 2_2` → groups 1, 2
- **Prefix pattern**: `A_1, A_2, B_1, B_2` → groups A, B
- **Even division**: When names lack group info (e.g. `Sample_1..Sample_15`), infers N = G × R (e.g. 15 → 5 groups × 3 replicates). Prefers R = 3, 2, 4, 5.

### Heatmap metadata edits without reclustering (v0.80)

When editing metadata/group information in the Meta Table, the heatmap now performs a lightweight refresh of group annotation bars/legend only.

- No hierarchical clustering rerun on metadata cell edits
- No clustering rerun on metadata header rename/add/delete
- Heatmap width/height changes are handled by layout-only updates
- Full clustering is still run when users explicitly generate/regenerate the heatmap

### Heatmap edit mode disabled (v0.81)

For the heatmap view, Plotly edit mode is now disabled. This prevents direct in-plot editing of title/labels in heatmap render and heatmap-only refresh updates.

### Heatmap progress + detailed status output (v0.83)

- Added a visible **Analysis Status** panel with rolling timestamped messages for processing/analysis stages.
- Heatmap progress now includes more detailed messages (matrix size, clustering settings, trace preparation).
- Fixed a heatmap render-path bug that could leave progress appearing stuck around ~84%.
- Added explicit heatmap `try/catch` handling so failures are reported and progress UI is closed cleanly.

### Analysis status panel layout (v0.84)

- Moved the **Analysis Status** output panel to the far-right side of the header.
- Added a collapsible toggle (`Analysis Status (collapsed/open)`).

### Large-heatmap dendrogram alignment fix (v0.85)

- Fixed dendrogram vs heatmap-body misalignment for large matrices.
- In large-data subset clustering mode, displayed rows/columns now match the exact dendrogram leaf count/order so the tree aligns to the heatmap matrix region.

### Dendrogram shown even when order unchanged (v0.86)

- Heatmap row/column dendrograms are now rendered whenever clustering returns a valid dendrogram, even if clustered order equals original order.

### Meta table batch cell edit (v0.87)

- In the Meta Table view (now **Data PreProcess** → **Meta Table** sub-tab), you can edit multiple cells at once within the same column.
- Use Ctrl/Cmd+click to multi-select cells and Shift+click for a row range.
- Enter a value in "Batch Edit Selected Cells" and click "Apply To Selection".

### Meta visible-column quick select (v0.88)

- Added **Select All Visible (Same Column)** to quickly select all currently rendered rows for the active metadata column before batch applying a value.

### Analysis panel toggle persistence (v0.89)

- Analysis Status panel no longer auto-collapses on outside clicks.
- Open/closed state now changes only when the toggle button is clicked.

### Analysis toggle label update (v0.90)

- Updated toggle labels to:
  - `Show more analysis status` (collapsed state)
  - `Collapse analysis status panel` (open state)
- Panel state still persists until the toggle button is clicked.

### Heatmap RdBlkGn colorscale (v0.91)

- New custom colorscale: **RdBlkGn** (red-black-green). Green = low, black = middle, red = high.
- RdBlkGn is now the default heatmap color theme.

### Plotly heatmap default autosize (v1.34)

- Plotly heatmap width/height now default to `Auto`, which fills 100% of the usable plot area on initial render.
- Users can still manually enter width/height (px) at any time to override autosize.

### PCA row-wise Z-score (v0.94)

- PCA tab now has **Row-wise Z-score Normalization** in addition to Column-wise.
- Both Z-score options are unchecked by default.
