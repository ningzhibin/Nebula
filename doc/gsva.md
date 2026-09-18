### 24. GSVA (single-sample pathways)

The **GSVA** sub-tab (Downstream → GSVA) scores pathways **per sample** (Hanzelmann, Castelo & Guinney, *BMC Bioinformatics* 14:7, 2013): each sample gets one activity score per gene set, so you can see pathway activity vary across conditions without any group comparison.

#### Method (sidebar → Method)

- **gsva (classic KS walk)**: per-gene CDF across samples, log-odds transform, within-sample ranks, then a Kolmogorov–Smirnov-like random walk with exponent **tau** (default 1). **maxDiff** (on) returns max+min; off returns the max deviation. **absRanking** (maxDiff only) sums both tails (Kuiper statistic). The CDF kernel (**kcdf**, default **auto**) is **Gaussian** for continuous data (sd/4 bandwidth), **Poisson** for non-negative integer counts (λ = x+0.5, same log-odds), or **none** (direct ECDF). Under **auto**, samples ≥ **ECDF min sample size** (default 200) use the direct ECDF, all-integer data use Poisson, otherwise Gaussian. Poisson rows with values below −0.5 are dropped and counted (R would yield NaN there). No sparse-matrix path: the app matrix is always dense, so the classical algorithm always applies.
- **ssgsea (Barbie et al. 2009)**: rank-weighted ECDF difference with exponent **alpha** (default 0.25), normalized by the global range when **Normalize** is on.
- **plage (Tomfohr et al. 2005)**: row-standardized set matrix, singular value decomposition, first right singular vector (eigengene) as the per-sample score. Unsigned, as in the R package.
- **zscore (Lee et al. 2008)**: row-standardized combined z-score — column sums of the standardized set matrix divided by √k.

Gaussian kernel only (intensity data are continuous); constant and non-finite rows are dropped and counted. Ties follow R (`last` for gsva, `average` for ssgsea). plage and zscore take no method-specific parameters.

#### Input data and gene sets

Input is the working expression matrix with an optional **Log2(x+1)** transform (on by default). Gene sets come from the same MSigDB v2026.1 collection tree as GSEA (tick branches or leaves; BioCarta/KEGG Legacy/KEGG Medicus stay excluded on licence grounds) plus custom `.gmt` uploads. Sets outside **Min/Max set size** (defaults 5/500) are skipped and listed.

#### Reading the results

The **Score heatmap** shows pathway × sample scores (diverging scale, zero-centered; top-variable sets up to **Max sets in heatmap**, default 100). The **Scores table** lists every set with per-sample scores and the row mean. **Export CSV** downloads the full score matrix. Sessions store the matrix (capped for very large runs); the heatmap registers as a Report figure with pop-out support.
