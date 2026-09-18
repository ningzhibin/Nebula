### 17. Batch effect detection & correction

The **Data PreProcess > Batch Effect** sub-tab detects and corrects batch effects from metadata batch assignments. **Detection** quantifies and visualizes the structure, **Correction** applies a method and reports the result, and **Before/After** compares both states with the same metrics.

#### Controls

- **Load batch-effect example** - loads a built-in 500-feature × 24-sample dataset (2 batches × 2 groups × 6 replicates) with a known additive + scale batch effect and 80 truly group-different features. Use it to watch detection work and to compare methods.
- **Batch column** - the metadata column that defines batches (e.g. `Batch`). Every sample belongs to exactly one batch; samples with no metadata row are grouped as *(unassigned)* and reported in the panel.
- **Biological covariate (optional)** - a metadata column whose signal is preserved by every method: each sample is anchored to its group mean, the batch shift is estimated from the residual, and the group mean is added back. Batches should not be confounded with this column.
- **Correction method** - **Median centering (per batch)** (default), **Mean centering (per batch)**, or **ComBat (location + scale)**. ComBat removes both the additive (location) and the multiplicative (scale) batch effect and can use the biological covariate in its model.
- **Value scale** - **Auto** uses log10 for raw intensities (batch effects are multiplicative, so correcting in log space is what keeps small values meaningful) and raw for already-logged matrices. Override to **log10** or **Raw** if detection looks wrong for your data.
- **Empirical-Bayes shrinkage (ComBat)** - checked by default: weak per-batch estimates are shrunk toward the pooled estimate, which is safer with few samples per batch. Uncheck to use the raw per-batch estimates.

#### Detection

- **Batch R² (mean)** - share of each feature's variance explained by batch (one-way ANOVA on the working scale), averaged over features.
- **Batch-dominated features** - percentage of features with batch R² ≥ 0.3.
- **Mean silhouette** - how well batches separate in PC space (+1 separated, 0 overlapping, negative = mis-assigned).
- **PC1 batch η²** - how much of PC1 is driven by batch.
- PCA scatter colored by batch (with per-sample labels), per-batch box plots of log10 intensity, a per-feature batch-R² histogram, and a per-batch table (samples, observed cells, log10 mean/median/SD, missing %).

#### Correcting

1. Pick the **Batch column** (populated from the meta table).
2. Review **Detection** to confirm there is a batch effect worth removing.
3. Optionally pick a **Biological covariate** so real group differences survive the correction.
4. Choose the method (and the shrinkage / scale options) and press **Apply batch correction**.
5. Inspect **Correction** (KPI block, PCA and box plot of the corrected matrix) and **Before/After** (side-by-side PCA, a before/after metric bar chart, and a delta table). A good correction drives batch R² and the silhouette toward 0 while leaving the covariate's effect intact.
6. **Reset to original** restores the pre-correction matrix.

#### Notes

- Correction is applied to the current matrix (after Data Filter / Imputation if you ran them), and downstream analyses see the corrected values.
- If the matrix changes after a correction (new data load, filter apply, imputation, session restore), the stored pre-correction snapshot is discarded so **Reset** can never paste stale values into new data - re-apply the correction after such a change.
- Session snapshots keep the correction method, batch column, covariate and options, and for matrices up to 300,000 cells the pre-correction matrix, so Reset keeps working after a restore.

See also: *11. Data Filter*, *15. Missing value imputation*, *17. Meta table & Sankey*.
