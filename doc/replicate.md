### 5. Replicate parsing

When a data matrix is loaded, Nebula **auto-generates the meta table from the sample column names** (you can override it any time by uploading your own meta table). This section describes exactly how names are read, so you can name your columns so the app understands them.

#### S / R / T convention (replicate detection)

Tokens bounded by `_`, `-`, `.`, or the string edges are matched:

- `S#` - **Sample** (e.g. `S1`, `S2` in `S1_BAIT_R1_T1`)
- `R#` - **Biological_Replicate**
- `T#` - **Technical_Replicate**

Each axis is kept only when it is **complete**: every sample carries the token and the numbers form a contiguous 1..N run. Zero-padding is preserved (labels stay `R01..R14` and sort correctly). The **Group** is whatever remains after removing the S/R/T tokens (and the time token below) - e.g. `vector`, `bait`, `D292`.

Example: `S01_D292_5min`, `S02_D292_15min`, `S03_D292_30min` parse as Sample = `S01..S03`, Group = `D292`, Time = `5min/15min/30min`.

#### Time-course detection

One token **position** is examined across all sample names; if most values at that position look like a duration (a number plus a time unit: `ns`, `s`, `sec`, `min`, `h`, `hr`, `day`, `wk`, `month`, ...) and the position exists for every sample with 2..N-1 distinct values, it becomes a **Time** column. Non-duration values at the same position (e.g. `NS` for an unstimulated baseline) are kept as-is, so the whole time series is captured.

#### Generic group inference (no S/R/T patterns)

When no complete S/R/T structure is found, groups are guessed from the names:

- **Numeric group-replicate pattern** first: `1_1`, `1_2`, `2_1` - groups `1`, `2`.
- Otherwise each token position is tried: valid group-like tokens (1-8 characters, alphanumeric) that yield **2-20 distinct groups** are used.
- Fallbacks: an **even division** of the sample order (e.g. 15 samples - 5 groups x 3), legacy underscore patterns (`A_1`, `B_2`), then a positional split into `Group1..Group4` as a last resort.

Additional patterns are also recognized: names containing `control`/`ctrl` or `treatment`/`treat` produce a **Treatment** column; names containing `batch` produce a **Batch** column.

#### Blank-placeholder fallback

When a meta table you upload has empty or placeholder cells (`NA`, `N/A`, `null`, `none`, `-`, `.`, `?`, `n.d.`) in the Biological_Replicate / Technical_Replicate columns, the parser fills them from the corresponding R#/T# tokens in the column name, so grouping keeps working with partially filled meta tables.

#### Where the parsed meta is used

- **Data PreProcess > Data Filter** - "In each group" / "In at least one group" scopes and the technical-reproducibility bundle detection.
- **Meta Table** (and its Sankey visualization) - see *17. Meta table & Sankey*.
- **Heatmap** sample-group overlays and color annotations.
- **Clustering** PCA / t-SNE group coloring.
- **Downstream** Differential group selection and SAINT column mapping.

See also: *2. Data Preparation*, *17. Meta table & Sankey*.
