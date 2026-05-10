### Replicate Parsing

- Parser detects replicate tags from sample names.
- Supports full `R#_T#`, or only complete `R1..RN`, or only complete `T1..TN`.
- A replicate axis is accepted only when all samples contain that axis and indices are contiguous from `1` to `N`.

**Technical reproducibility (Data Filter → Row Filter):** the **Arbitrary Technical Reproducibility Filter** groups columns into technical-replicate bundles using these rules in order: (1) optional meta column where **the same value** marks columns that are replicates of each other; (2) else **T1/T2…** tokens in file/column names (basename), combined with **R#** and the extracted **group** prefix when both are detected; (3) else meta **Technical_Replicate** + **Biological_Replicate** (+ **Group** when present). See **Post-filter Behavior** for the per-feature matrix rule.
