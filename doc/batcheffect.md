### 17. Batch effect correction

The **Data PreProcess > Batch Effect** sub-tab detects and corrects batch effects using metadata batch assignments. The **Detection** tab shows PCA colored by batch; **Correction** applies the selected method and shows the corrected PCA; **Before/After** compares the two.

#### Controls

- **Batch column** - the metadata column that defines batches (e.g. a Batch column with values Batch1/Batch2). Detection plots update when the column changes.
- **Biological covariate (optional)** - a metadata column whose biological signal is preserved during correction (ComBat-style covariate adjustment). Leave on *(none)* for a plain batch correction.
- **Correction method**:
  - **Median centering (per batch)** (default) - centers each batch on its column median.
  - **Mean centering (per batch)** - centers each batch on its column mean.
  - **ComBat-lite (location + scale)** - adjusts location and scale per batch (a lightweight ComBat-style correction).
- **Parametric adjustment (ComBat only)** - checked by default; use parametric empirical-Bayes adjustment for the ComBat-lite method.

#### Running

1. Pick the **Batch column** (the dropdown is populated from the meta table).
2. Look at the **Detection** tab: a PCA score plot with samples colored by batch, plus a batch-wise box plot, so you can see the batch structure before touching anything.
3. Optionally choose a **Biological covariate** to protect a real signal.
4. Choose the method and press **Apply batch correction**.
5. Inspect **Correction** (PCA of the corrected matrix) and **Before/After** (side-by-side comparison).
6. **Reset to original** removes the correction.

The status line reports what was applied. Detection also reports how much variance separates batches (a batch-variance ratio) and per-batch silhouette, which quantify how strong the batch effect is.

#### Notes

- Batches are per-sample assignments: one value per sample in the chosen column.
- Correction is applied to the current matrix (after Data Filter / Imputation if you ran them) and downstream analyses see the corrected values.

See also: *11. Data Filter*, *15. Missing value imputation*, *17. Meta table & Sankey*.
