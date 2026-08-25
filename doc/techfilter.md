### 12. Group completeness filter

The group completeness filter is the **Filter Rows by Valid values** tool in **Data PreProcess > Data Filter > Row Filter** (scopes *In each group* / *In at least one group*). It enforces that a feature is reliably quantified within replicate groups before it is kept.

#### How it works

1. Choose one (or two) meta columns to define **groups** - matrix columns whose meta values match form one group.
2. A matrix cell counts as **valid** if it is finite and **> 0**.
3. Set the **Threshold**: a minimum **count** of valid values in the group, or a minimum **percentage** (required valid count = ceil(groupSize x P / 100)).
4. For each row, if a group fails its threshold, **all columns of that group in that row are set to 0**. Rows that are then all non-positive across every sample are removed.
5. Heatmap / PCA / t-SNE / Clustergrammer caches are reset so nothing stale survives.

#### "Ignore groups with fewer than 2 samples"

Each unique key of your grouping column(s) defines a group. This checkbox controls whether single-sample groups participate.

- **Checked (default):** only groups with at least two columns are evaluated; single-sample groups are excluded from the rule and their intensities are left exactly as they were. Use this to enforce completeness on replicate groups (R1-R3) without forcing odd one-off samples through a rule that expects several values per group.
- **Unchecked:** every meta key counts as a group, including singletons. A count threshold greater than 1 cannot be met by a singleton group, and the run reports an error when the smallest group is below your threshold. In percent mode a singleton needs ceil(1 x P/100) valid values - 1 for any P in 1-100 - so it always passes unless its value is invalid.

**Edge case:** if all groups are singletons with the option on, there are no groups of size >= 2 and the filter shows an error like "No groups match the chosen columns and minimum group size". Uncheck the option or change the grouping.

#### Notes

- The **Filtered out** result tab lists the row IDs removed by the last filter run, with the reason. The list is cleared when new data or a session snapshot is loaded.
- If `Biological_Replicate` / `Technical_Replicate` meta cells are empty but the column names still contain `R#`/`T#` tokens (e.g. DIANN raw paths), the tags are read from the column id so replicate triplets are not merged into one huge group.
- A legacy strict T1..TN technical-replicate rule still exists internally but is not exposed as a sidebar button; use the Technical Reproducibility Filter instead.

See also: *11. Data Filter*, *13. Post-filter behavior*.
