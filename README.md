<div align="center">

<img src="image/Nebula_icon.png" alt="Nebula" width="96" height="96">

# Nebula

**Browser-based QC, statistics and visualisation for omics intensity matrices.**

No install. No build step. No backend. Your data never leaves your machine.

</div>

---

Nebula is a single-page web application for quality control and exploration of quantitative
omics data — built with proteomics in mind (DIA-NN, MaxQuant) but format-agnostic: any
features × samples intensity matrix works.

It takes you from a raw result file all the way to a publication-ready report in one
session: load → filter → QC → impute / batch-correct → cluster → differential analysis →
pathway enrichment → export.

> **Everything runs in the browser tab.** There is no server component, no database and no
> upload step — Nebula is a folder of static files you serve locally.

---

## Why Nebula

- **Zero setup** — no package manager, no bundler, no toolchain. Serve the folder and open it.
- **Private by design** — your matrix is read and analysed entirely in your browser and is never uploaded; only the optional Enrichr / MyGene lookups send gene identifiers to their public APIs.
- **Offline-capable** — the 27-section manual and all example datasets are bundled; the UI, themes and docs work without a network. (Charting/parsing libraries load once from a CDN and are then cached.)
- **Built for real matrices** — heavy work runs in Web Workers with chunked, yielding preprocessing, so tens of thousands of features × hundreds of samples stay interactive.
- **End-to-end, not a one-trick tool** — filtering, imputation, batch correction, clustering, differential testing and enrichment share one data pipeline, so each step feeds the next.
- **Interactive, publication-ready figures** — Plotly and D3 charts that zoom, pan, hover and export; figures can be added to a self-contained HTML report.
- **Reproducible sessions** — export the full session (matrix, metadata, settings, results) and reload it later, or bundle it as an auto-loading report.
- **One consistent design system** — a single typeface, type scale and token-based palette across every tab and tool, with five colour themes.

---

## Feature overview

### 1 · Data preparation

- Load data by **paste, file upload, or built-in example**.
- First-class parsers for **DIA-NN** (`results.pg_matrix.tsv`, gene-group matrix) and
  **MaxQuant** (`proteinGroups.txt`, `Phospho (STY)Sites.txt`).
- Choose the row-ID column, auto-strip shared filename prefixes, auto-parse `R#`/`T#`
  replicate patterns.
- **Paired phospho/total proteome** workspace with its own normalisation.
- **Meta table editor** — editable cells, batch edit, add/rename/delete columns, colour-coded
  group values, TSV export, and a **Sankey** view of the metadata hierarchy.
- **Session snapshots** — export/import the whole session as JSON, or export it as a
  `qc_session.js` bundle that auto-loads on the next page open.

### 2 · Data preprocess — filtering & cleaning

- **Row filter** — valid-value rules (global or per-group, count or percent), random
  sampling, CV threshold, row-ID keyword, group-completeness filter, and a technical
  reproducibility tool.
- **Column filter** — checkbox selection, pattern select/unselect, group-based selection,
  valid-value filtering.
- **Annotation filters** with per-column filter inputs in the header.
- **Outlier detection** — five robust per-sample metrics (missing %, median, IQR, skew, mean
  correlation) with MAD-based modified z-scores, score plot, z-score heatmap, sortable table
  and CSV export.
- **Missing-value imputation** — MinProb (MNAR), KNN, **Sequential KNN (SeqKNN)**, and a
  **SeqKNN → MinProb hybrid** for mixed MCAR/MNAR data, with before/after distribution plots,
  a per-sample ridgeline view, a matrix view that highlights imputed cells, and a
  row/group missingness cap so sparse features are not invented.
- **Batch effect detection & correction** — batch R² (per-feature ANOVA), batch silhouette,
  PC↔batch association, PCA and per-batch distributions; correction by median/mean centering
  or **ComBat** (location + scale, covariate-aware, optional empirical-Bayes shrinkage),
  applied on a scale-aware engine (log10 for intensities) with a before/after comparison and
  a built-in example containing a known batch effect.
- **Name mapping** via MyGene.info for UniProt IDs and long descriptions.

### 3 · Data QC

- **Overall dashboard** — per-sample feature counts, distributions, total signal.
- **Row profile** — grouped bar/line/stacked-composition profiles across selected features.
- **Column profile** — per-sample ranked intensity, cumulative %, treemap, pie and
  log10 distribution.
- **Column correlation** — Pearson/Spearman correlation and distance matrices, plus paired
  scatter, QQ and Bland–Altman plots.
- **UpSet / Venn / Karnaugh** — set intersections across samples with a configurable presence
  rule, plus an **area-proportional Venn** (Eunoia) for 4+ sets.

### 4 · Clustering & dimensionality reduction

- **Heatmap** — hierarchical clustering with configurable distance/linkage, colour scales,
  group annotation bars and margin control.
- **Clustergrammer** — interactive clustered heatmap with dendrogram sliders.
- **PCA** — 2D and 3D D3 plots with confidence ellipses, group colouring, label repulsion,
  interactive legends and a details tab (scree, loadings, scores).
- **PCoA** — classical MDS with Bray-Curtis, Euclidean, Manhattan, cosine and correlation
  distances.
- **t-SNE** and **UMAP** — non-linear embeddings with group overlays.
- **K-means** — sample clustering with silhouette/elbow model selection and an assignments table.

### 5 · Downstream analysis

- **Differential analysis** — Welch/Student/moderated-t (limma) two-group tests or
  ANOVA/Kruskal–Wallis for multiple groups; volcano, MA and group heatmap; optional fudge-factor
  volcano; per-sample quantification columns with in-cell sparklines/box/violin plots; CSV export.
- **Hybrid Differential** — presence/absence + intensity combined into a single FDR for
  sparse data.
- **SAINT** — bait/prey interaction scoring with network and scatter views.
- **Enrichr** — enrichment against the live Enrichr catalogue, with bar/bubble/Jaccard plots
  and per-sample intensity annotation.
- **GSEA** — preranked enrichment (Subramanian 2005) with the full human **MSigDB v2026.1**
  collection tree plus custom `.gmt` upload, leading-edge analysis and the official 3-panel plot.
- **GSVA** — single-sample pathway scoring (`gsva`, `ssgsea`, `plage`, `zscore`).

### 6 · Reporting & sessions

- **Add to Report** on any figure, with captions.
- **Live in-app preview** with per-figure tabs.
- **Self-contained HTML export** — one file with interactive Plotly figures, a sticky header
  and a figure-tab sidebar; no external assets required to view it.
- **Pop out** any figure into its own window.
- **Session export/import** (JSON) and **export as report JS** for auto-loading.

### 7 · More tools

- **DIA-NN Result Explorer** — browse DIA-NN output directly in the browser: KPIs,
  protein/gene/peptide matrices with TSV export, and a **Spectra & Coverage** browser with
  per-run XIC chromatograms and fragment maps. Large `.xic.parquet` files (~28 M rows) are
  read **by index** rather than fully parsed, so they stay memory-safe.
- **Phospho/Total proteome Normalization** — paired phospho/total normalisation workspace.

---

## Quick start

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>

# any static server works — Python is just the simplest
python -m http.server 8123
```

Then open **http://127.0.0.1:8123/index.html**

### Why a server (and not just double-clicking the file)?

Opening `index.html` directly as `file://` blocks `fetch()`, which several features rely on
(in-app documentation, MyGene name mapping, Enrichr). The core application still boots, but
serving over `http://` is recommended.

Useful URL flags:

| Flag | Effect |
|---|---|
| `?noSession=1` | Skip auto-loading a bundled session snapshot |
| `?v=2` | Cache-buster while iterating (browsers cache aggressively) |

---

## How to use it

1. **Load data** — *Data preparation* → paste, upload, or click a built-in example
   (*Plain Data Matrix*, *DIANN pg matrix*, *MaxQuant proteinGroups*, *MaxQuant Phospho
   (STY)Sites*, *SAINT structured matrix*).
2. **Add metadata (optional but recommended)** — load a meta table so group-aware analyses
   (differential, PCA colouring, batch correction) can join on `Sample_ID`.
3. **Clean up** — *Data preprocess*: filter rows/columns, inspect outliers, impute missing
   values, and correct batch effects if needed.
4. **Inspect quality** — *Data QC*: overall dashboard, row/column profiles, correlations,
   and set intersections.
5. **Explore structure** — *Clustering*: heatmap, PCA/PCoA, t-SNE, UMAP, K-means.
6. **Run statistics** — *Downstream*: differential analysis, then enrichment (Enrichr, GSEA,
   GSVA) or SAINT.
7. **Report** — add figures to the *Report* tab and export a self-contained HTML file.
   Export a session snapshot if you want to resume later.

The built-in **Documentation** (the **?** button in the header) is a 27-section manual covering
every tab, control and caveat — it is the authoritative reference.

---

## Supported input formats

| Format | Loader |
|---|---|
| Any TSV/CSV intensity matrix (features × samples) | Paste / file upload |
| DIA-NN `results.pg_matrix.tsv`, `results.gg_matrix.tsv` | Data preparation → DIANN |
| DIA-NN `results.parquet` (+ `.xic.parquet`, protein descriptions) | More Tools → DIA-NN Result Explorer |
| MaxQuant `proteinGroups.txt` | Data preparation → MaxQuant |
| MaxQuant `Phospho (STY)Sites.txt` | Data preparation → MaxQuant |
| Metadata table (`Sample_ID` + group/replicate columns) | Data preparation → Meta table |
| Gene sets (`.gmt`) | Downstream → GSEA / GSVA |
| Session snapshot (`.json` / `.js`) | Data preparation → Session |

---

## Requirements

- A modern browser — **Chrome, Edge, Firefox or Safari**.
- **Python 3** (or any static file server) to serve the folder.
- Internet access is needed **only** for: first-load CDN libraries, MyGene name mapping,
  Enrichr, and MSigDB collection downloads. Everything else is local.

---

## Privacy

Nebula has no backend and no telemetry. Your intensity matrix, metadata and results are read,
processed and stored entirely in the browser tab — there is no upload step, and exports
(report HTML, TSV/CSV, session JSON) are written straight to your downloads folder.

Two **optional** features make network calls, and both send only identifiers rather than your data:

| Feature | What is sent |
|---|---|
| Name mapping (MyGene.info) | Row identifiers (e.g. UniProt accessions) |
| Enrichr enrichment | The gene symbol list you choose to submit |

Skip those tabs and Nebula makes no outbound requests beyond loading its own libraries.

---

## Repository layout

```
index.html            the application (markup + main inline script)
css/                  main stylesheet + the DIA-NN panel stylesheet
js/                   ~55 plain-script modules (no bundler, no imports)
doc/                  in-app manual (Markdown) + generated docs bundle
data/                 optional session snapshot (data/qc_session.js)
image/                icons and brand assets
popout/               standalone pop-out figure windows
scripts/              generators for the embedded example datasets
MSigDB/               bundled human MSigDB v2026.1 gene-set collections
CHANGELOG.md          full version history
```

**Architecture note:** there is deliberately **no build step**. `js/` files are plain classic
scripts wired in dependency order by `<script src>` tags, and heavy computation runs in Blob-based
Web Workers so the app also works from `file://`. Adding a feature means adding a script and a
script tag — not configuring a toolchain.

---

## Documentation

- **In-app**: the **?** button in the header opens the full manual (27 sections).
- **On disk**: [`doc/`](doc/) holds the Markdown sources; [`doc/manifest.json`](doc/manifest.json)
  lists the sections.
- After editing any `doc/*.md`, regenerate the offline bundle:

  ```bash
  python doc/build_doc_bundle.py
  ```

---

## Third-party components

Nebula builds on excellent open-source work. Bundled or loaded at runtime:

| Component | Use | Licence |
|---|---|---|
| [Plotly.js](https://plotly.com/javascript/) | Interactive charts | MIT |
| [D3](https://d3js.org/) | PCA/PCoA/t-SNE/UMAP plots | ISC |
| [PapaParse](https://www.papaparse.com/) | CSV/TSV parsing | MIT |
| [ml-matrix](https://github.com/mljs/matrix) | Matrix maths | MIT |
| [umap-js](https://github.com/PAIR-code/umap-js) | UMAP embedding | Apache-2.0 |
| [marked](https://marked.js.org/) + [DOMPurify](https://github.com/cure53/DOMPurify) | Manual rendering | MIT / Apache-2.0 |
| [jsPDF](https://github.com/parallax/jsPDF) | PDF export | MIT |
| [DataTables](https://datatables.net/) + jQuery | Result tables | MIT |
| [hyparquet](https://github.com/hyparam/hyparquet) | In-browser Parquet reading | MIT |
| [Clustergrammer](https://github.com/MaayanLab/clustergrammer) | Clustered heatmap | MIT |
| [UpSet.js](https://upset.js.org/) | Set intersections | **AGPL-3.0** |
| [Eunoia](https://eunoia.bz) | Area-proportional Euler diagrams | MIT OR Apache-2.0 |
| [MSigDB](https://www.gsea-msigdb.org/) v2026.1 (human) | Gene-set collections | CC-BY-4.0 |

Please cite the relevant methods papers when publishing results produced with these methods
(Subramanian et al. 2005 for GSEA; Liberzon et al. for Hallmark; Johnson et al. 2007 for ComBat;
Kim et al. 2004 for SeqKNN; Hänzelmann et al. 2013 for GSVA).

---

## Licence

> **Not yet specified.** This repository has no `LICENSE` file.

Before publishing, add one. Two things worth deciding first:

- **UpSet.js is AGPL-3.0.** It is loaded from a CDN at runtime rather than vendored, but its
  licence is worth reviewing for how you intend to distribute the project.
- **MSigDB collections are CC-BY-4.0**, which requires attribution (already credited above).

If you want a permissive default, MIT or Apache-2.0 are the usual choices for a project like this.

---

## Version

Current release: **v0.699** — see [`CHANGELOG.md`](CHANGELOG.md) for the full history.
