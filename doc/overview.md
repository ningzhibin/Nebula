### Overview

#### This tool was designed initially for self-use quick qc and analysis

**Nebula** is the application name for this single-page intensity-matrix QC and visualization tool (browser-based). This tab documents the key hard-coded behaviors in the app for data import, replicate parsing, and group completeness filtering (plus the technical-replicate algorithm where it still applies in code).

**SAINT** and **Enrichr** (v2.29): load matrix and meta in **Data Preparation**, then use **SAINT** to map control/treatment and bait columns, run analysis, and open **Network** / **Scatter Plot** sub-tabs. **Enrichr** accepts pasted genes, current matrix row labels, or SAINT prey names after a run. D3 v7 for SAINT is loaded on demand and does not replace Clustergrammer’s D3 v3.

**Enrichr enrichment plots** (v2.69+): After enrichment returns the term table, open the **Enrichment plots** sub-tab (next to **Results table**) for **Plotly** charts built from the *full* API result (not only the paginated table). The main panel uses tabs for the horizontal **bar** chart (rank by adjusted P, P-value, or combined score), the **bubble** plot (overlap count or odds ratio vs term; color −log10(adjusted P) or adjusted P), and the **Jaccard** heatmap between top terms using overlapping genes from each row. Plot options sit in the left sidebar; use **Export results TSV** for a tab-separated download of parsed columns (includes one TSV column per **data matrix** sample when row count matches and gene mapping is available).

**Enrichr → Heatmap** (v3.01+): Third sub-tab draws a **Plotly heatmap of per-sample matrix intensities** only (columns = samples). **Adjusted P, P-value, combined score, odds ratio,** and **overlap** are **row filters** in the sidebar; **max adj. P** defaults to **0.05** (clear to disable). Terms are ranked and capped by max rows. For hierarchical clustering of the full **protein × sample** matrix, use the top-level **Heatmap** tab.

**Heatmap pop-out** (v2.82+): After generating a heatmap, use **Pop out** in the left sidebar (to the right of **Generate heatmap**) to open `popout/heatmap_popout.html` in a new window with the same Plotly figure (full-window `autosize`), using `postMessage` and `sessionStorage` like the UpSet/Venn pop-out. The button appears only after a heatmap exists.

**Data QC → Overall** (v4.18+): Matrix-wide QC on the **current** matrix (v4.19+: **Plotly** per-column summary bars for **all** samples — mean raw/transformed, non-zero feature **count**, or detection **rate** — plus D3 box plots and total Σ log10(1+I); transform / treat-zero follow **Data QC → Column correlation** shared controls where applicable). Use **Refresh dashboard** after loading or filtering; auto-refresh when Data Filter updates while Overall is active.

#### Data QC → Overall — Bar metric (Per-column summary)

The sidebar **Bar metric** drives the Plotly bars (one bar per sample column). **Default** selection is **Feature count (intensity > 0)**.

- **Mean (raw)** — For each column, the **average raw matrix intensity** across all features (rows). Only **finite** values are used. If **Treat 0 as missing** is enabled (shared with **Data QC → Column correlation**), cells with intensity **0** are excluded from the mean.
- **Mean (transformed scale)** — For each column, the **average of transformed intensities** across features. The transform comes from the same sidebar **Transform** control (**none**, **log10(1 + x)**, or **log2(1 + x)**). Zeros are handled like elsewhere in column-correlation QC: if **Treat 0 as missing** is on, zero intensities are skipped before averaging. With **Transform → none**, values are still averaged on the linear scale but use that shared missing-value rule (same numeric idea as mean raw when zeros are excluded the same way).
- **Feature count (intensity > 0)** — For each column, the **number of rows (features)** where the cell is **finite** and **intensity > 0** (same “quantified” rule as elsewhere in this dashboard). The y-axis label is **Non-zero feature count**. This is an integer count per sample column, not a fraction.

**Detection rate** uses a different y-axis: fraction of finite cells that are **> 0** per column (between 0 and 1).

**Data QC → Column correlation** (v4.19+): Inner tabs **Overall correlations** (subset heatmaps) and **Paired correlation** (scatter, QQ, Bland–Altman, r vs X) use the same `data-filter-inner-tabs-row` / `data-filter-inner-tab` markup and styling as **Data PreProcess → Data Filter** nested tabs (e.g. Row Filter → Passed). Shared **Transform** / **Treat 0 as missing** at the top of the sidebar.

Use the outline on the left to jump to specific sections (including **Column profile** and **Column correlation** under Data PreProcess, sections 8–9).
