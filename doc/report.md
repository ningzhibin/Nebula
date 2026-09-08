### 23. Report export

The **Report** tab assembles the figures you marked with **Add to Report** into a live preview and a self-contained HTML report. Figures are embedded exactly as they were on screen at capture time (interactive Plotly where possible, vector snapshots otherwise).

#### Adding figures

- Across the app, figure cards have an **Add to Report** button. Clicking it opens a small dialog: optionally edit the **Figure caption** and choose **Stay on current tab** or **Open Report tab** after adding.
- A figure must have been **generated first** (e.g. generate the heatmap or run PCA before adding it); the button adds the figure with a sensible default caption either way, and figures that have never been drawn get a guarded capture path.
- Main figures available: Data QC Overall (per-column summary, box plot, total log signal), Row profile, Column profile (bar, treemap), Column correlation (both matrices + all four paired figures), UpSet/Venn/K-map (all four views), Clustering (heatmap, PCA 2D/3D, PCA scree, PCoA 2D/3D, t-SNE, K-means cluster plot), Differential (volcano, MA, group heatmap), SAINT (scatter, network), Enrichr (bar, bubble, results heatmap).

#### Report tab

- **Figures in report** - one checkbox per added figure (grouped by tab); uncheck to exclude a figure from the preview and the saved HTML. The preview refreshes when checkboxes change.
- **Generate Quick Report** - one-click pipeline (overview, figures, preview).
- **Save Report** - downloads the HTML shown in the preview.
- The **preview** renders when you open the Report tab (with a matrix loaded) or change checkboxes; with multiple figures it shows one sub-tab per figure (last visited remembered; interactive figures mount lazily when their tab is activated).

#### Capture types

- **Interactive Plotly embeds** - most Plotly figures (QC dashboards, heatmap, correlation matrices, differential, Enrichr, PCA/PCoA 2D, t-SNE, K-means): the exported figure keeps the on-screen layout with locked dimensions and stays fully interactive (zoom, pan, hover) in the report.
- **Interactive D3 replicas** - PCA 3D and PCoA 3D (drag to rotate, wheel zoom, tooltips).
- **Vector SVG snapshots** - UpSet/Venn/K-map figures, PCA scree, SAINT scatter and network: crisp vector captures of the rendered figure.

#### Layout in the saved report

The downloaded `.html` is fully self-contained (inline CSS + Plotly/D3 boot scripts; works offline) with a modern bookdown-style layout:

- A sticky dark header with the report title and generated timestamp.
- A left sidebar of **numbered vertical figure tabs** - click a tab to show that figure in the content column (smooth scroll, "Back to top" links, active-tab highlight; on narrow screens the sidebar becomes a wrapping chip bar).
- One numbered section card at a time in the content column, each with the figure and its caption.
- **Row profile and Clustering figures stretch to the full width**; the **heatmap and row profile also fill the full viewport height**.
- Interactive figures mount lazily when their tab is first activated; **print** shows all figures.

#### Captions

Each figure has a default caption explaining what it shows; your custom caption (edited in the Add to Report dialog or in the preview) overrides it. Captions are stored with the session snapshot.

#### Session snapshots vs reports

- **Report** = a polished, shareable HTML document of figures.
- **Session snapshot** (`qc_session.js`) = the full working state (matrix, meta, analyses, plotting settings) that reloads the app itself. See *2. Data Preparation*.

#### Troubleshooting

- A figure missing from the preview? Regenerate it on its tab (e.g. re-run the heatmap) before saving the report.
- Large reports: interactive Plotly embeds carry their data, so a report with many heatmaps/PCA figures can be several MB - that is expected.

See also: *1. Overview & navigation*, *2. Data Preparation*.
