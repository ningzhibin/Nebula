### Group completeness filter (Data Filter → Row Filter)

- **Apply group completeness filter** (Data PreProcess → **Data Filter** → **Row Filter**): choose one or two metadata columns to define **groups** (same combination of meta values ⇒ one group).
- A matrix cell counts as **valid** if it is finite and **> 0**.
- **Threshold**: minimum **count** of valid columns in the group, or minimum **percentage** — required valid count = ⌈groupSize × P / 100⌉.
- For each row, if a group fails its threshold, **all** columns in that group for that row are set to `0`. Rows that are then all non-positive across every sample are removed; heatmap/PCA/t-SNE/Clustergrammer caches are reset.
- **Filtered out** (Data PreProcess, sub-tab next to **Data Filter**; **v3.12**: the tab appears only after at least one row has been dropped): lists row IDs removed for that reason, with intensities at the moment of removal and a short note of the last filter run. The list is cleared when you load new data or a session snapshot. **Technical replicate** filter (console) updates the same list when it drops all-zero rows.
- If `Biological_Replicate` / `Technical_Replicate` cells are empty in the meta table but the matrix column id still contains `R#` / `T#` tokens (e.g. DIANN paths), those tags are read from the column id for grouping so replicate triplets are not merged into one huge group.
- The legacy **T1..TN technical replicate** rule is still implemented in code as `applyTechnicalReplicateFiltering()` (strict complete technical sets on `Group` + `Biological_Replicate`) but is **not** exposed as a sidebar button.

#### “Ignore groups with fewer than 2 samples”

Each unique key from your one (or two) grouping column(s) defines a **group**: the matrix columns whose metadata match that key. The checkbox controls whether **single-sample** groups — only **one** sample column shares that key — participate in the filter.

**When the option is on (default):** only groups with **at least two** columns are kept. Single-sample groups are **excluded** from `validGroups` in the implementation: the completeness rule (min count or min percentage of valid `>0` values) is **not** evaluated for those columns. Their intensities are **left as they were** before you click *Apply* (they are not zeroed by this rule, and they are not part of any other group’s column set). Use this when you only want to enforce completeness on replicate groups (e.g. R1–R3) and to avoid orphan conditions or odd one-off samples being forced through a rule that expects several values per group. It also avoids pathological cases with mixed designs: if you required e.g. “min count 3” and the smallest group had only one column, the tool would report an error; dropping singletons from the group list can make the remaining “valid” groups all large enough for your threshold.

**When the option is off:** every meta key counts as a group, including singletons (group size = 1). Then a **count** threshold greater than 1 cannot be met for that “group”, and the filter will reject the run if the smallest group size is below your threshold. **Percent** mode still runs, but for a single column the required count of valid values is ⌈1 × P/100⌉, which is `1` for any P from 1–100, so a singleton always “passes” unless the value is invalid (not `>0`).

**Edge case:** if *all* groups are singletons (e.g. every sample has a unique combination in the chosen meta column(s)), with the option on there are no groups of size ≥ 2 and the filter shows an error like *No groups match the chosen columns and minimum group size*. Uncheck the option or change the grouping so at least one key has two or more samples.
