### 6. Data QC — Overall

The **Data QC > Overall** sub-tab is the matrix-wide health check: three interactive Plotly figures (as sub-tabs) summarizing every sample column at once, plus a sidebar summary of the matrix. The dashboard always summarizes the **current matrix** (after Data Filter / Imputation / Batch Effect when those ran).

#### Sidebar

- **Matrix summary** - the feature (row) and sample (column) counts of the summarized matrix; shows an empty-state hint when no matrix is loaded.
- **Refresh dashboard** - recomputes the figures from the current matrix. Refresh after loading or filtering; the dashboard also auto-refreshes when Data Filter updates while the tab is open.
- **Per-column summary (Plotly) / Bar metric** - what the per-column bars show (all columns):
  - **Feature count (intensity > 0)** (default) - number of rows where the cell is finite and > 0 (the "quantified" rule used everywhere). The y-axis label reads *Non-zero feature count*.
  - **Mean (raw)** - average raw intensity across features; only finite values are used (zeros are excluded when Treat 0 as missing is on).
  - **Mean (transformed scale)** - average of the transformed intensities (Transform = none / log10(1+x) / log2(1+x)).
  - **Detection rate (fraction > 0)** - fraction of finite cells that are > 0, on a 0-1 axis.
- The Bar metric's mean/count/detection rules follow the shared **Transform** / **Treat 0 as missing** settings from **Data QC > Column correlation** (same sidebar controls).

#### The three figures

Sub-tabs above the charts (the last visited one is remembered while the panel is open):

1. **Per-column summary** - horizontal Plotly bars, one row per sample column, listed **top-to-bottom in the matrix column order**. Y-axis labels are shortened; hovering shows the full column id. The chart height scales with the sample count (base 88px + 20px per column, clamped 260-2200px) so every label fits.
2. **Distribution (box plot)** - horizontal box plots per sample of log10(1 + I) for I > 0, height scaling with the sample count; native hover shows the full column name. (Very tall matrices may be stratified for speed.)
3. **Total log signal** - horizontal bars of sum(log10(1 + I)) per sample over quantified features; height scales with the sample count.

All three figures are interactive (zoom, pan, hover) with the Plotly modebar. Each card has **Pop out** (full-size new window) and **Add to Report** (embeds the same interactive Plotly chart in the report; the per-column summary keeps its exact tab size while still scaling with the sample count).

See also: *9. Data QC - Column correlation* (shared scale controls), *22. Report export*.
