### 1. Overview & navigation

**Nebula** is a browser-based, single-page intensity-matrix QC and visualization tool. It covers the whole exploratory proteomics workflow: data import and cleaning (**Data Preparation**, **Data PreProcess**), quality control (**Data QC**), unsupervised structure (**Clustering**), and downstream statistics (**Downstream**: Differential, SAINT, Enrichr), ending with a shareable **Report**.

#### Key properties

- Pure JavaScript/HTML - runs in any modern browser, locally or server-hosted; no install, no backend.
- **No data leakage**: your data stays on your computer and is never uploaded for analysis.
- No server-failure risk - unlike Shiny/Python platforms there is no backend environment to maintain.
- Figures are interactive (Plotly or D3): hover, zoom, pan, and the toolbar's PNG/SVG export.

#### The main tabs

- **Data preparation** - load/upload the intensity matrix and meta table, try the built-in examples, and manage session snapshots. See *2. Data Preparation*.
- **Data QC** - Overall dashboard, Row profile, Column profile, Column correlation, and UpSet/Venn/K-map. See sections *6-10*.
- **Data preprocess** - Data Filter (row/column), Imputation, Batch Effect, Name mapping, and the Meta table (with its Sankey view). See sections *11-17*.
- **Clustering** - Heatmap, Clustergrammer, PCA, PCoA, t-SNE, and K-means. See *18. Clustering*.
- **Downstream** - Differential analysis, SAINT, and Enrichr. See sections *19-21*.
- **Report** - assemble figures into a preview and a self-contained HTML report. See *22. Report export*.

#### Header buttons

- **Nebula logo / name** - the app brand.
- **Coffee icon** - optional donation link (PayPal).
- **Download icon** - opens the **Session snapshot** dialog (export/import JSON or `qc_session.js`; see *2. Data Preparation*).
- **Version number** - the app version.
- **?** - opens this Documentation (the Document tab).
- **+/-** - toggles the **Analysis Status** log panel (recent analysis messages).

#### Navigation conventions

- **Main tabs** - the top bar; one is active at a time.
- **Sub-tabs** - the flat underline rows inside a main tab (e.g. Data QC has Overall / Row profile / ...).
- **Inner tabs** - the smaller rows inside a sub-tab (e.g. Column profile has Treemap / Ranked intensity / ...). The last visited inner tab is usually remembered.
- Many headings carry a small **? badge** - hover it for a tooltip explanation of that section.

#### Figure conventions

- Most figures are **interactive Plotly** charts; PCA/PCoA/SAINT use D3. Hover for full IDs, zoom/pan, and use the modebar for PNG/SVG downloads.
- **Pop out** - opens the figure full-size in a new window.
- **Add to Report** - adds the figure to the report (opens a small dialog for the caption; see *22. Report export*).

#### Quick start (2 minutes)

1. Open **Data preparation** and click **Plain Data Matrix** (or load your own file). The meta table auto-generates from the column names.
2. Open **Data QC > Overall** and press **Refresh dashboard** to see the matrix-wide summary.
3. Open **Clustering > PCA**, press **Generate PCA Plot**, and explore 2D / 3D / Details.
4. Open **Clustering > Heatmap** and **Generate heatmap** for the clustered view.
5. Pick figures with **Add to Report**, then open **Report** and **Save Report** for a shareable HTML.

#### Terminology

- **Matrix** - the intensity table: rows = features (proteins/sites), columns = samples.
- **Meta table** - one row per sample (`Sample_ID` + group/treatment/batch/... columns).
- **Current matrix** - the matrix after Data Filter / Imputation / Batch Effect; everything downstream analyzes it.

#### Offline / file:// caveats

Serve the app over `http://localhost` (or any static HTTP server) for the features that fetch resources: this Documentation (`doc/`), MyGene name mapping, Enrichr, and Eunoia (Proportional Venn for 4+ sets). When opened via `file://`, most of the app still works but those network features may be blocked by the browser.

Next: *2. Data Preparation*.
