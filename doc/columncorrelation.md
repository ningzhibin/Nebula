### 9. Data QC — Column correlation

The **Data QC > Column correlation** sub-tab is sample-vs-sample QC: a **Correlation matrix**, a **Distance matrix**, and pairwise comparisons between two chosen columns. Its shared scale controls also drive the Data QC > Overall per-column summary.

#### Shared scale (applies to all three views and Data QC > Overall)

- **Transform** - `log10(1 + intensity)` (default), `log2(1 + intensity)`, or `None (raw intensity)`.
- **Treat 0 as missing** - checked by default; zeros are excluded wherever the metric uses observed values.
- **Refresh plots** - redraws the visible view (the Overall summary respects the same settings).

#### Correlation matrix (inner tab)

A **scatter-correlation matrix** of the sample columns: lower triangle shows the pairwise scatter plots, upper triangle the correlation cells, colored by the correlation value.

- **Color theme** - `Default` (RdBu cells + violet scatter dots), `Distinct (Category10)`, `Warm`, `Cool`, `Pastel`, `Dark`, `High contrast` - correlation cells use a diverging colorscale per theme; the choice persists between sessions.
- **Correlation metric** - `Pearson` (default) or `Spearman`.
- **Max columns in heatmaps** - default 40 (range 3-80): the first N columns in matrix order are used (O(N^2) work).

#### Distance matrix (inner tab)

A heatmap of pairwise distances between sample columns. **Distance from correlation** (visible only on this tab):

- `1 - r` (default)
- `sqrt(2(1 - r))`
- `Euclidean (z-scored columns, pairwise rows)`

The distance heatmap stretches to the full panel height and uses the theme's sequential colorscale.

#### Paired correlation (inner tab)

Pick **Column X** and **Column Y**, plus a **Feature label (hover)**, and four figures compare the pair:

- **Pair scatter (Y vs X)** - scatter of the two columns with the correlation coefficient.
- **QQ plot (sorted quantiles)** - quantile-quantile comparison of the two columns.
- **Bland-Altman** - agreement plot; mode: `Difference (Y - X) vs mean` (default) or `log2(Y/X) vs geometric mean (raw > 0)`.
- **Correlation with column X** - every other column's correlation against Column X, highlighting the chosen Y.

Each figure card has **Add to Report** (the capture switches to the Paired correlation view so the embed reflects the current Column X / Column Y selection). The status line under the figures reports the active figure's settings.

See also: *6. Data QC - Overall*, *22. Report export*.
