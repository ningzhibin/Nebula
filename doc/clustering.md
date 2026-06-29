### Clustering

The top-level **Clustering** tab groups five unsupervised views of the loaded intensity matrix as sub-tabs: **Heatmap**, **Clustergrammer**, **PCA**, **PCoA**, and **t-SNE**. All read the current matrix from **Data Preparation** (after any Data PreProcess filtering) and join metadata to matrix columns by `Sample_ID` for group coloring. Most views ordinate **samples (columns)** — the usual QC question is *do replicates/conditions group as expected?*

## Heatmap

Interactive **Plotly** clustered heatmap with row/column dendrograms.

- **Clustering:** toggle **Cluster features (rows)** and **Cluster samples (columns)** independently. **Distance metric**: Manhattan, Correlation, or Euclidean. **Linkage**: Average, Complete, or Single. Changing any of these re-runs the clustering pipeline (a progress bar with **Cancel** shows for large matrices).
- **Preprocessing:** **Log10 transform** (zeros/missing → `log10(1 + x)`) and optional **Z-score per row** (emphasizes pattern over absolute level).
- **Sampling:** **Max features** / **Max samples** (blank = all) cap the matrix before clustering; 2000–3000 features keeps very large matrices responsive.
- **Colors:** several diverging/sequential scales (default **RdBlkGn**); **Reverse scale** option. Color changes redraw **without** re-clustering.
- **Row labels:** choose the feature label (matrix row ID, `Genes`, `Protein.Names`, …) from DIANN columns and/or **Name mapping**. Changing the label redraws without re-clustering.
- **Figure & margins:** optional title, width/height, dendrogram sizes, and margins (increase **bottom margin** if angled sample names are clipped).
- **Sample group overlays:** when metadata is loaded, metadata columns appear as **color bars above the samples**; a legend popover summarizes them.
- **Pop out** opens the current heatmap full-size in a new window. **Add to Report** embeds the interactive Plotly heatmap.

## Clustergrammer

Embeds the **Clustergrammer** library for an alternative interactive clustered matrix (drag, zoom, reorder, search) driven by the current matrix and meta table. Pick the **Feature label (rows)**; the same labels feed the **Enrichr** export. Useful for exploratory browsing of row/column clusters; the **Heatmap** sub-tab is the lighter-weight, export-friendly option.

## PCA — Principal Component Analysis

Linear ordination by the directions of greatest variance, drawn in **D3** with **2D** and **3D** sub-panels.

- **Compute:** data are **transposed** (samples as rows), preprocessed, then projected onto principal components by an iterative power method (Web Worker; **Fast Mode** uses fewer iterations). Choose the **Number of Components** and which components map to the **X / Y / Z** axes.
- **Preprocessing:** **Log10 transform** (recommended for intensities), optional **column-wise** and/or **row-wise Z-score**.
- **Sampling:** **Max Samples** / **Max Features** cap the inputs (reducing features speeds up large datasets).
- **2D plot:** zoom/pan, **95% group confidence ellipses**, repelled sample labels with optional leader arrows, and a **show/hide legend**. Axis titles report **% variance explained** per PC.
- **3D plot:** interactive **drag-to-rotate**, **wheel-zoom**, legend show/hide, and metadata tooltips (same renderer used in the Report export).
- **Details (third sub-tab):** numeric view of the PCA result — a KPI summary (samples/features used, components extracted, PC1 variance, preprocessing), an interactive **scree plot** (% variance bars + cumulative line), and three **sortable, sticky-header** tables: **variance explained (scree)** (eigenvalue, % variance, cumulative %), **per-sample PC scores** (the projections, with the group label), and **top feature loadings** (eigenvector weights over features, ranked by maximum absolute loading). Each table has a **Download CSV** button; the loadings CSV exports **all** features. Note: percentages are relative to the **extracted** components (only the top *N* coordinates are computed), so they sum to 100% across those components, not the full data variance.
- **Group annotation:** select metadata columns to color points; the **first** selected column sets **color** (with a categorical color theme), an optional **second** sets **point shape**.
- **Export:** per-plot **PNG / SVG** download and view **Reset**; **Add to Report** for PCA 2D (Plotly embed) and PCA 3D (interactive D3 replica).

## PCoA — Principal Coordinates Analysis

Classical **multidimensional scaling** on a **sample × sample distance matrix** — the same layout as PCA, but it can use **non-Euclidean** distances to reveal structure PCA cannot. (PCoA on Euclidean distance is mathematically equivalent to PCA.)

- **Distance metric:** **Bray-Curtis** (default; for non-negative abundance/intensity data), **Euclidean** (≈ PCA), **Manhattan**, **Cosine**, and **Correlation** (1 − Pearson r). Choose the metric that matches your data and question; Bray-Curtis and Correlation/Cosine compare **profile composition/shape** rather than absolute level.
- **Method:** the squared-distance matrix is **double-centered** (Gower) and eigen-decomposed with a symmetric **Jacobi eigensolver**; coordinates are eigenvectors scaled by √eigenvalue. The info line reports the **variation explained** per coordinate (PCo1/PCo2/PCo3) and, for non-Euclidean metrics, the fraction of inertia carried by **negative eigenvalues** (which the coordinates omit).
- **Layout & controls:** identical to PCA — **2D** (zoom/pan, 95% ellipses, labels, legend) and **3D** (drag-rotate, wheel-zoom) D3 panels, the same **group-annotation** color/shape selectors, preprocessing (log10, column/row z-score), sampling caps, and per-plot **PNG / SVG** export. **Add to Report** supports PCoA 2D and 3D.
- **Tip:** the **distance matrix grows with samples²** — use **Max Samples** for very wide datasets. To test whether the groups you see actually separate, a **PERMANOVA** on the same distance matrix is the natural significance test (not currently built in; see Differential for per-feature tests).

## t-SNE

Non-linear neighbor-embedding (**Plotly** 2D scatter) for visualizing local structure when many samples are present.

- **Parameters:** **Perplexity** (5–50; roughly the effective neighborhood size) and **Max iterations**; runs in a Web Worker.
- **Preprocessing & sampling:** log10 transform, column/row z-score, and **Max Samples / Max Features** caps (t-SNE handles many samples well; limit features for speed).
- **Display:** the same **group-annotation** coloring (first column = color, second = shape), repelled labels, and arrow options as PCA.
- **Caveats:** t-SNE axes are **not interpretable** distances and the layout depends on perplexity and the random seed — use it for **exploration**, and rely on PCA/PCoA for variance/distance interpretation.

## Choosing a view

- **Heatmap / Clustergrammer** — see feature- and sample-level clusters together.
- **PCA** — variance-based overview; best when global intensity structure is meaningful (log scale).
- **PCoA** — when a **non-Euclidean** distance (e.g. Bray-Curtis composition) is more appropriate than variance.
- **t-SNE** — many samples and you want to surface local neighborhoods/sub-clusters.

**Session JSON** stores the sidebar control values for these views; reopening a sub-tab or regenerating redraws from the restored settings. Group-annotation checkboxes are rebuilt after the metadata column list is repopulated.
