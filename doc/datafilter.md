### 11. Data Filter

The **Data PreProcess > Data Filter** sub-tab filters the loaded matrix. It has two inner tabs - **Row Filter** (remove features/rows) and **Column Filter** (remove samples/columns) - and a result area with **Passed**, **Filtered out**, and **Summary** views. Downstream tabs (Data QC, Clustering, Differential, SAINT, Enrichr) always analyze the filtered result.

#### Pipeline semantics (important)

- Every **Apply** computes the filter from the **original loaded matrix** - filters are never stacked. Applying a second filter replaces the first one instead of compounding it.
- The **result of the last applied filter** is the active matrix. **Passed** shows what remains; **Filtered out** lists what the last filter removed.
- **Clear all Data Filter steps** restores the original loaded matrix and empties the pipeline.
- After any filter, stale downstream results (heatmap, PCA, t-SNE, Clustergrammer) are cleared and the previews refresh.

#### Row Filter

The sidebar has five tools (two columns of sections):

##### Filter Rows by Valid values

Removes rows that do not have enough valid (finite, > 0) values. A cell counts as valid when it is finite and greater than 0.

- **Scope** - where the threshold must hold:
  - **In total (includes all columns)** - valid values across the whole row.
  - **In each group** - the threshold must hold inside every group (groups defined by the meta columns below).
  - **In at least one group** - the threshold must hold in at least one group.
- **Group by (meta column)** and optional **Then by** - define groups; samples with the same meta values form one group.
- **Ignore groups with fewer than 2 samples** - checked by default; single-sample groups are excluded from the rule (see *12. Group completeness filter* for the exact semantics).
- Threshold type: **Minimum count of valid values** (default) or **Minimum percentage of valid values**; the **Threshold** input (default 1) sets the number/percent.

##### Random sampling

**Keep random N rows** (default 100) keeps exactly N randomly chosen rows. Useful to shrink a large matrix for exploration.

##### CV filter

**Filter out rows with CV < threshold** (default 0.2). CV = SD / mean, computed per row from the finite values greater than 0. Rows whose relative variability is below the threshold are removed - i.e. it drops near-constant rows.

##### Technical Reproducibility Filter

Enforces that technical replicates agree: within each technical-replicate bundle, if **any** replicate is missing or non-positive for a feature, **all** replicates of that bundle are set to 0 for that feature; afterwards, rows that are all-zero across every sample are removed.

- **Choose group with technical replicates** - default **auto**: bundles are inferred from `T1`/`T2` tokens in the column names or from Technical_Replicate + Biological_Replicate (+ Group) in the meta table. Alternatively pick a meta column where identical values mark columns that are technical replicates of each other (at least 2 columns per value).

##### Row ID filter

Filters by the row ID text: a keyword/pattern (e.g. `ATPase|P53`) with **Contains** (default, case-insensitive) or **Regex** matching. Rows whose ID matches are kept.

##### Clearing

**Clear all Data Filter steps** resets everything back to the original loaded matrix.

#### Column Filter

Column tools update the matrix **instantly** (no Apply button for the checkbox tools; the Valid-values tool has its own Apply):

- **Column Select** - **Select all** / **Clear all** plus a per-column checkbox list; unchecking a column removes it from the matrix.
- **Pattern select** - select or unselect columns by substring (**Contains**, default) or **Regex** on the column name (e.g. `CTRL|TREAT`); **Select match** / **Unselect match** update the checkboxes and apply instantly.
- **Choose by groups** - list column groups from one or two meta columns (same grouping rules as Row Filter) and check/uncheck whole groups.
- **Filter columns by Valid values** - column-wise analogue of the row valid-values filter: **Global (all rows)** or **Grouped by metadata** scope, group columns, ignore-groups-under-2 checkbox, count/percent threshold, **Apply**. Columns that fail are removed.

#### Result views

- **Passed** - the filtered matrix as a DataTables view (search, sort, paging, sticky header, bar-style numeric cells).
- **Filtered out** - the rows the last filter removed, with the reason.
- **Summary** - cards (rows before/after, sparsity mean/median, pipeline steps) plus four Plotly charts: row counts + sparsity violins, row CV histogram before vs after, per-column completeness before vs after, and per-column log10-intensity box plots before vs after.

The Column Filter tab shows its own summary cards: columns before/after, the pipeline steps, and the lists of kept and removed columns.

See also: *12. Group completeness filter*, *13. Post-filter behavior*, *15. Missing value imputation*.
