### 14. Outlier detection

The **Outliers** sub-tab (Data PreProcess, right after Data Filter) flags suspect **samples (columns)** before you impute or correct anything — run it early, while the matrix still shows raw quality differences.

#### Method

Five per-sample QC metrics, computed on log10(1+x) intensities unless **Log10 transform** is off:

- **Missing %** — fraction of features with no positive intensity in the sample.
- **Median (log)** — median log intensity (level shifts: failed injection, loading differences).
- **IQR (log)** — inter-quartile range (spread anomalies).
- **Skew (log)** — distribution asymmetry (heavy tails from artifacts).
- **Mean corr.** — mean Pearson correlation of the sample against all others, pairwise-complete (replicate-inconsistent samples score low). Needs ≥ 3 samples; disable with **Include mean-correlation metric**.

Each metric is converted to a **robust modified z-score**, `0.6745·(x − median)/MAD` (Iglewicz–Hoaglin), so one bad sample cannot mask another the way mean/SD would. **Missing %** flags one-sided high, **Mean corr.** one-sided low, the rest two-sided. A sample is called an **outlier** when at least **Min. flags** metrics (default 2 of 5) exceed the **MAD threshold** (default |z| > 3.5). The **outlier score** is the maximum |z| across metrics. This mirrors the metric set of pmartR's RMD-PAV filter; a full multivariate Mahalanobis step is deliberately omitted because it is unstable when samples are few.

#### Reading the results

Results appear in three inner tabs so each view gets the full panel width:

- **Score plot** — bars colored red for outliers with a dashed threshold line; hover shows score and flagged metrics. **Add to Report** and **Pop out** work as on other tabs.
- **Z-score heatmap** — signed z-scores (red = high, blue = low, clipped at ±5); hover shows the raw metric value.
- **Metrics table** — sortable table with every metric, the flagged-metric list, score, and call. **Export CSV** downloads it.
- Flags are **advisory only** — nothing is removed until you act.

#### Excluding samples

The **Exclude samples** box lists every sample with its score; outliers come pre-checked. Adjust the checks and press **Apply exclusion**: the checked samples are removed through the shared column-filter pipeline (meta table, downstream caches, and all tabs update), and detection re-runs automatically on the remaining matrix. At least one sample must remain.
