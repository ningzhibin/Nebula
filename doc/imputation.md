### 15. Missing value imputation

The **Data PreProcess > Imputation** sub-tab replaces missing values in the matrix with imputed estimates. Choose a method, tune its parameters, press **Apply imputation**, and inspect the result in the four inner tabs. Downstream analyses use the imputed matrix.

> **Imputation is generally not recommended.** A warning banner at the top of the sidebar reminds you: missingness itself is informative, and imputation under a mismatched mechanism inflates type I error. Prefer keeping missing values (or a completeness filter) unless a downstream method truly requires a complete matrix.

#### What counts as missing

- `NA`/`null`/empty cells are missing.
- With **Treat 0 as missing** (checked by default, recommended for intensity data), zero values are also treated as missing and get imputed.

#### Imputation method

- **MinProb (MNAR - left-censored)** (default) - draws each missing value from a Gaussian placed below the observed distribution (Perseus/MaxQuant-style MNAR). Parameters: **Down-shift (sigma multiplier)** (default 1.8) and **Width (sigma fraction)** (default 0.3). Computed in log10(1+x) space so the imputed values are realistic down-shifted intensities.
- **Seq KNN then MinProb (MCAR + MNAR hybrid)** - a two-stage imputation for the common case where sparsely-missing rows are missing *at random* (MCAR) but heavily-missing rows are *not* (MNAR / below detection). **Stage 1** runs Sequential KNN with the missing-% caps, so only rows *within* the per-row and per-group caps are filled from their neighbors. **Stage 2** runs MinProb on every cell that Stage 1 deliberately left missing (i.e. the rows above the caps), drawing left-censored values. MinProb's per-column mean/SD are estimated from the **original observed** values (not the KNN-filled ones). The result has no remaining missing cells. Both the Sequential KNN and MinProb parameter blocks apply; tune the caps to set the boundary between "treat as MCAR (KNN)" and "treat as MNAR (MinProb)".
- **Sequential KNN (SeqKNN, MCAR)** - sequential distance-weighted nearest-neighbor imputation (Kim, Golub & Kim, *Bioinformatics* 2004). Rows are imputed **one at a time, starting from the row with the fewest missing values**; each imputed row is then added to the pool of complete donor rows, so more-missing rows can borrow from already-filled rows. Parameters:
  - **K neighbors** - default 5 (clamped to the available donor rows).
  - **Distance metric** - `Euclidean` (default), `Manhattan`, `Pearson correlation`, `Cosine`. Pearson finds co-regulated patterns; Euclidean is scale-sensitive (pair with a log-transform on raw intensities).
  - **Weighting** - `Inverse distance` (default, closer donors dominate), `Uniform` (plain mean of the k neighbors), `Rank-based (1/rank)`.
  - **Min. shared columns** - default 1; a donor is only considered when it shares at least this many observed values with the target. Raise on sparse matrices.
  - **Fallback when no donor value** - `Column median` (default), `Column mean`, `Global minimum`, `Zero` (used for the first rows when the complete-row pool is still empty).
  - **Neighbor axis** - `Features (rows)` (default: other features are the donors) or `Samples (columns)` (other samples are the donors).
  - **Max missing % per row (skip above)** - default **50**. Rows whose overall missing percentage (measured over the neighbor axis) exceeds this cap are **left un-imputed** - their missing cells stay missing and the row is never used as a donor - so extremely sparse rows are not filled from just one or two observed values. Analogous to `rowmax` in R's `impute.knn` / SeqKNN. Set to 100 to disable (impute every row).
  - **Group by (meta column)** - meta-table column that partitions samples into groups for the per-group cap (`(none)` disables it). Uses the same sample-id resolution / replicate fallback as the *Group completeness* filter.
  - **Max missing % per group per row (skip above)** - default **50**; requires a **Group-by** column and only applies when the neighbor axis is **Features (rows)**. A row is **left un-imputed if ANY group** has a within-group missing percentage above this cap, so a feature that is largely absent in a whole group is not imputed across groups (which would fabricate a group difference). Set to 100 to disable. When rows are skipped by either cap, the status line reports how many (e.g. *"3 row(s) left un-imputed: over the max missing % cap, per row or per group"*).
- **Median per column** - fills missing cells with the column median.
- **Mean per column** - fills missing cells with the column mean.
- **Global minimum** - fills with the matrix-wide minimum value.
- **Zero fill** - fills missing cells with 0.

The sidebar opens with the MinProb parameters visible (MinProb is the default method); the Sequential KNN parameters collapse until Sequential KNN (or the hybrid) is chosen. The **Seq KNN then MinProb** hybrid shows **both** parameter blocks.

#### Options

- **Treat 0 as missing** - checked by default; zeros are imputed like NAs.
- **Repetitive imputation** - **unchecked by default**. Unchecked: every **Apply imputation** restores the original matrix first and imputes from it, so clicking Apply repeatedly never compounds imputations, and **Reset to original** always restores the source data. Checked: Apply imputes the current matrix as-is (for repeated/pipeline-style runs).

#### Buttons and status

- **Apply imputation** - runs the chosen method on the missing cells.
- **Reset to original** - restores the matrix as it was before imputation.
- The sidebar bottom shows a **summary** (matrix size, imputation method, missing cells before and after) and the **status line** (e.g. "1210 cells -> 0 missing").

#### Inner tabs

- **Overview** - horizontal paired bar chart of **missing % per column**, purple "Before imputation" vs green "After imputation", ordered top-to-bottom in matrix column order; the height scales with the sample count so every label fits. Before any imputation only the purple bars are drawn; after one runs, the green after-bars appear (drawn as a minimum sliver so the pair stays visible even when imputation filled everything; hover reports the true missing %).
- **Distribution** - a **Sample** dropdown at the top (default "All samples (combined)") switches between the pooled and per-sample before/after comparison: two overlaid Gaussian KDE curves (Before = purple, After = green) of log10(intensity) with translucent fills; the legend is always shown. Samples with fewer than 2 usable values show a message instead of an empty plot.
- **All samples** - a single ridgeline plot stacking every sample column: one row per sample with a peak-normalized KDE ridge and the sample name as the y tick label. Rows are 46px tall, so the plot height grows with the sample count (the panel scrolls for wide matrices). After an imputation each row overlays purple "Before imputation" + green "After imputation" ridges.
- **Result Data** - the full intensity matrix as a DataTables view (search, sort, paging, sticky header, bar-style cells). Cells filled by the last Apply are **highlighted in green** (lighter bar fill, bold value, "Imputed value (this cell was missing before imputation)." tooltip) with a one-line legend above the table; the highlight clears on Reset.

See also: *11. Data Filter*, *16. Batch effect correction*.
