### 20. Differential analysis

The **Downstream > Differential** sub-tab tests every feature for differences between sample groups and visualizes the results: volcano plot, MA plot, p-value histogram, an optional group heatmap, and a sortable results table. It runs on the current matrix with the meta table groups.

#### Setting up the comparison

- **Comparison mode** - `Two groups` (default) or `Multiple groups (ANOVA / Kruskal-Wallis)`. The two-group test is chosen in **Test (two groups)** below (default **Moderated t (limma)**).
- **Group by (meta column)** - the meta column that defines the groups (e.g. Group or Treatment).
- Two groups: pick **Group A** (usually the baseline) and **Group B** (usually the treatment).
- Multiple groups: tick the **Groups to include** checkboxes (at least 2 groups, each with n >= 2) and choose the **Multi-group test**: `One-way ANOVA (equal variance)` or `Kruskal-Wallis (rank-based)`.
- The group-count line shows how many samples each group has.

#### Significance cutoffs

- **|log2FC|** (default 1) and the synchronized **Fold change** (default 1.5; FC = 2^|log2FC|) - used for two-group significance coloring.
- **p-value cutoff** (default 0.05) and **FDR cutoff (when BH)** (default 0.05).

#### Data & test options

- **Feature label (table & hover)** - which annotation to show (`Matrix row ID`, `Protein.Names`, `Genes`, `Protein.Group`, `First.Protein.Description`).
- **Log2(x+1)** - checked by default; log-transform the matrix before testing.
- **0 / invalid = missing** - checked by default; treat zeros and non-finite values as missing.
- **Min valid / group** (default 1) - a feature needs at least this many valid values per group to be tested.
- **FC pseudocount** (default 1) - added to group means before the fold-change ratio.
- **Test (two groups)** - `Moderated t (limma)` (default, recommended for proteomics with small sample counts and missing values — empirical-Bayes variance moderation), `Welch (unequal variance)`, or `Student (pooled variance)`.
- **Multiple testing** - `Benjamini-Hochberg FDR` (default), `Bonferroni`, `Storey q-value`, or `None`.

#### Plots & display

- **Volcano Y-axis** - `-log10(FDR)` (default) or `-log10(p)`.
- **Show labels for significantly changed** - checked; labels significant hits (label budget split between up and down so down-regulated hits are not crowded out; overlap-optimized placement updates on zoom/pan).
- **Fudge factor volcano** (SAM-style, two groups only, hidden until you run a two-group test... toggle it on to enforce a joint p/FDR + fold-change-vs-standard-error rule; **Fudge s0** default 0.05).
- Multi-group: **Volcano x-axis** - `eta^2 (effect size)` or `Test statistic (F or H)`; **eta^2 min** (default 0.02; omitted for Kruskal-Wallis) and **F/H min** (default 0 = ignore).
- **Group heatmap: top N (by p)** (default 40) and **Z-score rows (heatmap)** (checked) - for the multi-group heatmap.

#### Running and results

1. Configure the comparison and cutoffs.
2. Press **Run differential analysis**; a summary box reports the number of significant hits.
3. Browse the sub-tabs:
   - **Volcano** - log2FC vs -log10(p/FDR); significant hits colored (up/down), optional labels.
   - **MA plot** - mean intensity vs log2FC.
   - **P-value histogram** - distribution of raw p-values.
   - **Group heatmap** (multi-group only) - top N features by p; group means on the tested scale with optional row z-score.
   - **Results table** - sortable table (Feature, mean A, mean B, log2FC, t, df, p, FDR, sig) with **Showing only Significant Changed** filter and **Export CSV**. It also shows the underlying **quantification**:
     - a **Quant** column with a small **per-sample line chart** for each feature (a sparkline connecting each sample's value, dots colored by group),
     - a **Show sample quantification columns** checkbox (on by default) that appends one column per sample (grouped by condition, values on the tested scale - log2 if the analysis used log2, else raw), and
     - a **per-feature detail plot below the table** that appears when you **click a row**, with a **Detail plot: Line / Bar / Boxplot / Violin** selector (default Boxplot): **Line** / **Bar** show every sample (colored by group, with group labels and n), while **Boxplot** / **Violin** summarize each group (jittered points, median). Changing the selector re-plots the selected row.

See also: *20. SAINT analysis*, *21. Enrichr enrichment*, *22. Report export*.
