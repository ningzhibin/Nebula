### 13. Post-filter behavior

What happens after you apply a filter in **Data PreProcess > Data Filter** - and how filtering interacts with the rest of the pipeline.

#### Immediate effects

- The filtered matrix becomes the active matrix: **Passed** shows it, **Filtered out** lists what the last filter removed, **Summary** shows before/after stats and charts.
- Table previews refresh (Data Preparation third column included).
- **Stale downstream results are cleared**: heatmap, PCA, t-SNE, and Clustergrammer caches reset, so you can never look at projections computed from the unfiltered matrix by accident.

#### What downstream tabs see

- **Data QC** (Overall, Row profile, Column profile, Column correlation, UpSet/Venn) summarizes the filtered matrix; refresh the dashboard after filtering.
- **Clustering** (Heatmap, PCA, PCoA, t-SNE, K-means) runs on the filtered matrix.
- **Downstream** Differential / SAINT / Enrichr use the filtered matrix and its meta table.

#### Order of the pipeline

The Data PreProcess sub-tabs are independent steps applied in the order you use them:

1. **Data Filter** - remove rows/columns.
2. **Imputation** - fill missing values (see *15. Missing value imputation*).
3. **Batch Effect** - correct batch effects (see *16. Batch effect correction*).

Each step transforms the current matrix; a later step sees the result of the earlier ones. Each individual step's Apply/Reset works from its own snapshot (filters always recompute from the original loaded matrix; imputation Restores to the pre-imputation matrix, which includes your filters).

#### Undoing

- **Clear all Data Filter steps** returns to the original loaded matrix.
- **Imputation > Reset to original** removes the imputation.
- **Batch Effect > Reset to original** removes the correction.
- Loading new data resets everything.

See also: *11. Data Filter*, *12. Group completeness filter*.
