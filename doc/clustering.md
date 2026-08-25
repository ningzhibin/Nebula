### 18. Clustering (Heatmap · Clustergrammer · PCA · PCoA · t-SNE · K-means)

The top-level **Clustering** tab groups six unsupervised views of the loaded intensity matrix as sub-tabs: **Heatmap**, **Clustergrammer**, **PCA**, **PCoA**, **t-SNE**, and **K-means**. All read the current matrix (after Data PreProcess filtering/imputation/correction) and join metadata to matrix columns by `Sample_ID` for group coloring. Most views ordinate **samples (columns)** - the usual QC question is *do replicates/conditions group as expected?*

#### Heatmap

Interactive **Plotly** clustered heatmap with row/column dendrograms.

- **Clustering:** toggle **Cluster features (rows)** (checked by default) and **Cluster samples (columns)** independently. **Distance metric**: Manhattan (default), Correlation, or Euclidean. **Linkage**: Average (default), Complete, or Single. Changing any of these re-runs the clustering pipeline (a progress bar with **Cancel** shows for large matrices).
- **Preprocessing:** **Log10 transform** (checked by default; zeros/missing become log10(1 + x)) and optional **Z-score per row** (emphasizes pattern over absolute level).
- **Sampling:** **Max features** / **Max samples** (blank = all) cap the matrix before clustering; 2000-3000 features keeps very large matrices responsive.
- **Colors:** several diverging/sequential scales (default **Viridis**; also RdBlkGn, RdYlBu, Plasma, Inferno, Blues, Reds, Greens, YlOrRd, Turbo, Cividis); **Reverse scale (high = cold, low = hot)** option. Color changes redraw **without** re-clustering.
- **Row labels:** choose the **Feature label** (matrix row ID, `Protein.Names`, `Genes`, `Protein.Group`, `First.Protein.Description`) from DIANN annotations and/or Name mapping. Changing the label redraws without re-clustering.
- **Figure & margins** (collapsible): optional **Title** (auto if empty), **Width/Height** in px (auto), **Row dendro %** (default 20) and **Column dendro %** (default 20), and the three margins (left 50 / right 400 / bottom 100 px; increase the bottom margin if angled sample names are clipped; the framed area scrolls when the figure is larger than the panel).
- **Sample group overlays:** when metadata is loaded, metadata columns appear as **color bars above the samples** (checkbox + color scheme per column); a legend popover summarizes them.
- **Pop out** opens the current heatmap full-size in a new window. **Add to Report** embeds the interactive Plotly heatmap (generate first).

#### Clustergrammer

Embeds the **Clustergrammer** library for an alternative interactive clustered matrix: drag, zoom, reorder rows/columns, and search.

- **Cluster and visualize** clusters the current matrix in a Web Worker (progress bar with **Cancel**); **Pop out** opens a full-size static snapshot.
- **Feature label (rows)** - row names in Clustergrammer and in the Enrichr export.
- **Distance** (Cosine default, Correlation, Euclidean), **Linkage** (Average default, Single, Complete).
- **Pre-filter rows by variance (optional)** - keep the top-N most variable rows (blank = all).
- **Log10 transform** (checked) and **Z-score per row** preprocessing.
- **Label scale** - column label height, row label width, and font sizes for column and row labels.

Useful for exploratory browsing of row/column clusters; the **Heatmap** sub-tab is the lighter-weight, export-friendly option. The Clustergrammer network can be included in session snapshots (see *2. Data Preparation*).

#### PCA - Principal Component Analysis

Linear ordination by the directions of greatest variance, drawn in D3 with **2D**, **3D**, and **Details** sub-tabs.

- **Compute:** press **Generate PCA Plot**; data are preprocessed, then projected onto principal components in a Web Worker. Choose the **Number of Components** (default 3) and which components map to the **X / Y / Z** axes.
- **Preprocessing:** **Log10 Transform** (checked by default), optional **Column-wise Z-score Normalization** and **Row-wise Z-score Normalization**.
- **Sampling (speed):** **Max Samples for PCA** / **Max Features for PCA** cap the inputs (reducing features to 200-500 speeds up large datasets significantly). **Fast Mode** uses fewer iterations (faster, less precise).
- **2D plot:** zoom/pan, **Show Column Labels** (checked), **Auto label font/color** (checked) with manual font size/color overrides, **Show group confidence ellipses (95%)** (checked), repelled labels with optional leader arrows (**Auto show arrows** / **Show arrows (manual)**), a legend, and **Plot Width/Height** + optional **Main title**. Axis titles report the **% variance explained** per PC.
- **3D plot:** interactive **drag-to-rotate**, **wheel-zoom**, legend show/hide, and metadata tooltips (the same renderer is embedded in the report).
- **Details (third sub-tab):** a KPI summary (samples/features used, components extracted, PC1 variance, preprocessing), an interactive **scree plot** (% variance bars + cumulative line), and three **sortable tables**: **Variance explained (scree)**, **Sample scores (PC coordinates)**, and **Top feature loadings** (eigenvector weights over features, ranked by maximum absolute loading) - each with a **Download CSV** button (the loadings CSV exports all features). Percentages are relative to the **extracted** components (only the top N coordinates are computed), so they sum to 100% across those components, not the full data variance.
- **Group annotation:** select metadata columns to color points; the first selected column sets **color** (with a categorical color theme), an optional second sets **point shape**.
- **Add to Report** - PCA 2D (interactive embed) and PCA 3D (interactive D3 replica), generate first.

#### PCoA - Principal Coordinates Analysis

Classical **multidimensional scaling** on a **sample x sample distance matrix** - the same layout as PCA, but it can use **non-Euclidean** distances to reveal structure PCA cannot. (PCoA on Euclidean distance is mathematically equivalent to PCA.)

- **Distance metric:** **Bray-Curtis** (default; for non-negative abundance/intensity data), **Euclidean** (= PCA), **Manhattan**, **Cosine**, and **Correlation (1 - Pearson r)**. Bray-Curtis and Correlation/Cosine compare **profile composition/shape** rather than absolute level.
- **Coordinates:** pick which PCo coordinate goes on the **X / Y / Z** axes (default PCo1/PCo2/PCo3); **Number of Coordinates** (default 3, must be >= the highest axis you plot).
- **Layout & controls:** identical to PCA - **2D** (zoom/pan, 95% group ellipses, repelled labels, arrows, legend) and **3D** (drag-rotate, wheel-zoom) panels, the same **group-annotation** color/shape selectors, preprocessing (log10 checked, column/row z-score), sampling caps, plot width/height, and optional title. The info line reports the **variation explained** per coordinate and, for non-Euclidean metrics, the fraction of inertia carried by negative eigenvalues (which the coordinates omit).
- **Add to Report** - PCoA 2D and 3D.
- **Tip:** the distance matrix grows with samples^2 - use **Max Samples for PCoA** for very wide datasets.

#### t-SNE

Non-linear neighbor embedding (D3 2D scatter) for visualizing local structure when many samples are present.

- **Parameters:** **Perplexity (5-50)** (default 30; roughly the effective neighborhood size) and **Max iterations** (default 1000); runs in a Web Worker.
- **Preprocessing & sampling:** **Log10 Transform** (checked), column-wise z-score (checked), row-wise z-score, and **Max Samples / Max Features** caps (t-SNE handles many samples well; limit features to 200-500 for speed).
- **Display:** the same **group-annotation** coloring (first column = color, second = shape), **Show Column Labels**, auto/manual label style, leader arrows, plot width/height, and optional title.
- **Caveats:** t-SNE axes are **not interpretable** distances and the layout depends on perplexity and the random seed - use it for **exploration**, and rely on PCA/PCoA for variance/distance interpretation.

#### K-means

Exploratory clustering of **samples (columns)** by their feature profiles - reveal potential groups when no metadata grouping exists.

- **Choose number of clusters (k):** **Auto-select k (recommended)** or **Fixed k**. In auto mode, the **Selection metric** is **Silhouette (best separation)** (default) or **Elbow (WCSS knee)**, scanned across the **k min** (2) to **k max** (10) range; **Fixed k** uses the **Fixed k** input (default 3).
- **Algorithm:** **k-means++** initialization (recommended; or **Random points**), **Restarts (n_init)** (default 10; the run with the lowest inertia is kept), **Max iterations** (300), **Random seed** (42; fixed seed makes results reproducible).
- **Sampling (speed):** **Max samples** / **Max features** caps (silhouette analysis is skipped above 2000 samples - it grows with the square of the sample count).
- **Preprocessing:** **Log10 Transform** (checked), **Column-wise Z-score (per feature)** (checked - recommended so k-means is not dominated by high-abundance features), **Row-wise Z-score (per sample)**.
- **Display:** **Show centroids** (checked), **Show sample labels**, plot width/height, optional title.
- **Views:** **Cluster plot** - PCA projection colored by cluster with centroids; **Model selection** - the elbow (WCSS vs k) and silhouette (mean vs k) curves marking the chosen k; **Assignments** - the sample-to-cluster table with per-sample silhouette scores and **Export CSV**. Computation runs in a Web Worker.

#### Choosing a view

- **Heatmap / Clustergrammer** - see feature- and sample-level clusters together.
- **PCA** - variance-based overview; best when global intensity structure is meaningful (log scale).
- **PCoA** - when a **non-Euclidean** distance (e.g. Bray-Curtis composition) is more appropriate than variance.
- **t-SNE** - many samples and you want to surface local neighborhoods/sub-clusters.
- **K-means** - no known grouping and you want a concrete partition of the samples (with diagnostics for choosing k).

**Session JSON** stores the sidebar control values for these views; reopening a sub-tab or regenerating redraws from the restored settings. Group-annotation checkboxes are rebuilt after the metadata column list is repopulated.

See also: *6. Data QC - Overall*, *22. Report export*.
