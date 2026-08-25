### 7. Data QC — Row profile

The **Data QC > Row profile** sub-tab plots the intensity profile of **selected features (rows) across all samples**. It answers questions like "do these proteins behave the same way across the experiment?" - each selected row becomes one series in the chart.

#### Selecting rows

- **Search box** - filter the checklist by ID, gene, protein name, or description as you type.
- **Row label (list & plot legend)** - which annotation to show: `Protein.Names` (default), `Protein.Group`, `Genes`, or `First.Protein.Description` (falls back to matrix row IDs when DIANN protein-group annotations are not loaded).
- **Quick selection**:
  - **Select all rows** - select every feature.
  - **Select top N** - select the N rows (default 5) with the highest total intensity (sum of finite sample values).
  - **Select all Cont** - select all contaminant protein groups (accessions starting with `Cont_` / `CON__`).
  - **Clear selection**.
- The checklist shows all rows (with a selection counter); **Plot selected rows** renders the chart.

#### Plot settings

- **Plot type**:
  - **Stacked bar (composition)** (default) - one bar per sample; the selected rows are stacked to show their composition. With **Show as % composition** each sample's stack is normalized to 100% so relative contributions are comparable.
  - **Bar plot** - grouped bars per sample (one group per selected row).
  - **Line plot** - each selected row as a trend line across samples.
- **Color theme** - `Pastel` (default), `Default (Plotly)`, `Distinct (Category10)`, `Warm`, `Cool`, `Dark`, `High contrast`.
- **Use log scale (Y axis)** - plot log10-transformed intensities.
- **Z-score per row (across samples)** - normalize each selected row to mean 0, sd 1 so trends are comparable between rows of very different intensity.
- **Mark contaminant proteins (Cont_)** - checked by default; flags `Cont_`/`CON__` rows in the checklist and plot (and in the Column profile plots) so per-sample contamination is easy to spot.

The chart fills the visible panel and re-fits whenever the sub-tab is opened. The figure supports **Add to Report** (interactive Plotly embed) and **Pop out**.

See also: *8. Data QC - Column profile*, *22. Report export*.
