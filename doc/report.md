# Report export (MVP)

## Overview

The **Report** tab (before **Document**) builds a **single self-contained HTML** document you can preview in-app and save. **Matrix and meta summary** is always available as a sidebar checkbox; **figure sections** appear in the sidebar only after you use **Add to Report** on that figure. Each section is either a short **HTML summary**, an **interactive Plotly embed** (serialized `data` / `layout` / `config`), or an **embedded PNG** (rasterized SVG or Plotly fallback).

## MVP scope

- **In scope:** **Matrix/meta summary** checkbox plus **opt-in figure rows** (created when you **Add to Report**); **live in-page preview** (`#reportPreviewRoot`) that refreshes when you open the tab or change sections; **Save Report** → download `nebula_report_YYYYMMDD_HHMM.html` (export HTML uses CDN scripts for Plotly/D3). **Plotly** figures in that HTML are **interactive** (embedded `data`/`layout`/`config` + CDN). **Data QC → Overall** (per-column summary, total log, box plot) are **D3 on screen** and export as **PNG snapshots** of the same SVG (not re-plotted in Plotly).
- **Out of scope (later):** PDF/Word export; **Include in Report** toggles on individual analysis panels beyond the current set; global figure numbering.

## How to use

1. Load a matrix (and optional meta) in **Data Preparation**.
2. Open the views you care about at least once. Use **Add to Report** on a figure to set an **export caption** (modal preset) and include that section; choose **Stay on current tab** or **Open Report tab**. On the **Report** tab, edit captions **in the preview**: each raster figure has a **caption box directly under that image** (scroll the preview). Generate **heatmap** / **PCA** under **Clustering** if you want those images.
3. Open the **Report** tab: the **preview panel** builds automatically (with a matrix loaded). Toggle **Matrix and meta summary** and any figure rows you added via **Add to Report**; the preview **updates after a short debounce**. **PCA 3D** is interactive in preview (same D3 mount as Clustering). Use **Save Report** to download HTML with **figcaption** text (not the preview `<textarea>` controls).

If a section has no plot yet, the HTML file still lists that heading with a short **“not available”** note instead of failing the whole report. **Data QC → Overall** figures are **rasterized from the same D3 SVG** you see after **Refresh dashboard** (the report pipeline refreshes the Overall dashboard before capture when needed, including when the **Overall** panel was not visible).

## Section list (checkboxes)

The sidebar lists **Matrix and meta summary** by default. Each **figure** row appears only after **Add to Report** for that figure (grouped under the headings below). Uncheck a row to omit it from preview and export.

| Checkbox area | What is captured |
|---------------|------------------|
| **Summary** | **Matrix and meta summary**: reads the matrix from `currentDataMatrix` **or** `currentData.dataMatrix` (same as other panels). Uses `DataQcOverallDashboard.computeColumnStats` — same rules as **Data QC → Overall** (quantified = finite intensity greater than zero; per-sample counts and log summaries, Σ log10(1+I)); matrix-wide quantified-cell fraction; **meta** dimensions, column list, `Sample_ID` ↔ matrix column match counts, and a short table of annotation columns (non-empty + distinct values). |
| **Data QC → Overall** | **PNG** raster of the on-screen **D3** SVG for **per-column summary** (`#dataQcOverallSummaryPlot`), **total log** (`#dataQcOverallChartTotalLog`), and **box plot** (`#dataQcOverallChartBox`). |
| **Data QC → Column profile** | Interactive **Plotly** bar and treemap for the **currently selected sample** (`#colProfileBarPlot`, `#colProfileTreePlot`). |
| **Data QC → Column correlation** | Interactive **Plotly** scatter matrix and distance heatmap (`#colCorrScatterMatrixMixed`, `#colCorrDistHeatmap`). |
| **Clustering** | Interactive **Plotly** heatmap (`#heatmapPlot`), **PCA 2D** (synthetic Plotly from PCA results + current D3 axis range / legend-hidden groups), **PCA 3D** (**interactive D3 replica** remounted from exported state — drag/wheel, legend, tooltips, same layout as `#pcaPlot3d`; generate PCA first), and **PCoA 2D/3D** (Principal Coordinates Analysis on the chosen distance metric — PCoA 2D as Plotly embed, PCoA 3D as the same interactive D3 replica; generate PCoA first). SVG/PNG fallback if the payload is too large or D3 cannot load. |

Plotly panels are embedded with the same **Plotly 2.27** CDN URL as the main app; the HTML stores a **Base64 JSON** payload of `data` / `layout` / `config` per figure. **v4.86+**: each Plotly embed uses **explicit height and width** (from the chart at export time) plus a matching host div so tall figures stay tall in the saved HTML. **v4.88+**: PNG rows use **fixed CSS dimensions** matching the source chart; Plotly embed hosts are not forced to `max-width:100%`; chart figures use a **white** frame (no gray padding box). **v4.89+**: Plotly and raster figures also set a fixed **figure** width (`inline-block` + `min-width`) so the chart column cannot shrink in the preview or saved HTML. Very large Plotly payloads may be **skipped** (or heatmaps may fall back to **PNG**) if serialization exceeds an internal size limit.

**Figure captions** under each figure come from **`window.nebulaReportFigureCaptions`** (defaults in `js/nebula_report.js`; set via **Add to Report** or the **inline caption fields under each figure in the Report preview**). Caption edits in the preview update the export snapshot via **`window.nebulaReportPreviewCaptionInput`** (debounced rebuild) without re-capturing Plotly/D3 until the next full refresh. Session snapshots persist captions under **`ui.reportFigureCaptions`** as well as checkbox state via **`ui.inputs`**.

## Follow-ups

- PDF: possible reuse of **jsPDF** or browser print-to-PDF.
- Word: optional **docx** library (bundle size trade-off).
- Custom blocks: “Include in Report” from Differential and other tabs, ordered list, captions, figure numbers.
