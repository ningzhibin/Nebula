### 3. DIA-NN upload rules

Nebula parses DIA-NN report matrices directly. The parser separates the leading annotation columns from the intensity columns, picks a readable row ID, and shortens the raw-file-path sample headers into clean sample names.

#### Protein-group matrix (results.pg*_matrix.tsv)

Requirements and behavior:

- The file must have a header row and **at least 7 columns**: the first 6 are annotations, and **intensity columns start at column 7**. Rows are the protein groups.
- **Row ID column for plots** (dropdown in Data Preparation): `Protein.Names` (default), `Genes`, `First.Protein.Description`, or `Protein.Group`. The parser matches the header case-insensitively; if the requested column is missing it falls back to `Protein.Names`, then `Genes`, then `First.Protein.Description`, then `Protein.Group`, then the first column.
- The first six columns are kept as **annotations** (searchable, shown in tooltips and the Annotations sub-tab).
- **Blank row IDs are dropped** (the load status reports how many) - except when `Protein.Group` is the ID column, because group IDs are frequently empty while protein names are not.
- Missing or non-numeric intensities (`NA`, `N/A`, `null`, empty) become **0** in the matrix.

#### Gene-group matrix (results.gg*_matrix.tsv)

- Row IDs come from the **first column (Genes)**.
- **Intensity columns start at column 4**; the leading columns stay annotations.
- The same blank-ID removal and missing-value-to-0 rules apply.

#### Sample name simplification

DIA-NN names each sample column with the raw file path, e.g. `E:/searches/20260303_Zhibin\20260303_Zhibin_BAIT_R1_T1.raw`. Nebula turns these into readable sample names:

- The path is stripped to the file name and its extension removed.
- A **common prefix is trimmed** up to the last separator boundary (so the first character of the next token is never cut).
- If the trimmed names would not be unique, the **last tokens** of each name are used instead.
- If every simplified name starts with a digit (e.g. `1_T1`, `2_T3`), an `S` is prepended (`S1_T1`), which also enables the S#/R#/T# replicate detection (see *5. Replicate parsing*).
- Duplicates get a numeric suffix so every column stays unique.

For example, the two paths above become `BAIT_R1_T1` and similar - which the meta auto-generation then splits into Group = `BAIT`, Biological_Replicate = `R1`, Technical_Replicate = `T1`.

#### DIANN phosphosites (results.phosphosites_99.tsv)

The phosphosite parser is used by the **Phospho / total protein paired analysis** workspace (see *2. Data Preparation*). Expected columns: `Protein`, `Protein.Names`, `Gene.Names`, `Residue`, `Site`, `Sequence`, then intensity columns. Site and residue columns are kept as annotations so each phosphosite is tracked and plotted separately.

#### Annotations sub-tab (format-aware)

When a matrix with annotation columns is loaded (DIANN protein-group matrix, DIANN phosphosites, MaxQuant proteinGroups, or MaxQuant Phospho (STY)Sites), a **Data PreProcess > Annotations** sub-tab becomes available. The sidebar **adapts to the loaded format** - a format label is shown at the top, and only the relevant quick filters are displayed:

- **DIA-NN protein-group matrix** - min/max bounds on `N.Sequences` and `N.Proteotypic.Sequences` (empty side = unbounded).
- **MaxQuant proteinGroups** - keyword filters on the `Gene names` and `Protein.Group` / `Protein IDs` columns.
- **Phosphosites (MaxQuant STY / DIA-NN)** - a dedicated **Class I (unambiguous) sites only** button plus a **Residue** selector (Any / S / T / Y). For MaxQuant sites, Class I means `Positions within proteins` lists exactly one candidate position (multiple `;`-separated positions = ambiguous Class II site). DIA-NN phosphosite rows are single localized sites, so the Class I criterion passes all of them.
- **All formats** - a generic keyword / pattern filter across all annotation columns (Contains or Regex, row ID excluded).

You can also filter **directly in the table header**: every annotation column has a small live filter input under its header; typing filters that column immediately and is included in Apply.

- **Apply to matrix** removes non-passing rows (union of all active criteria, sidebar + header filters); **Clear criteria** resets the sidebar form and header filters (it does not restore removed rows).
- Result views: **Passed** and **Filtered out** tables.

Tip: the **DIANN pg matrix** and **MaxQuant Phospho (STY)Sites** example buttons in Data Preparation load ready-made examples so you can try each mode immediately.

See also: *2. Data Preparation*, *14. Name mapping (MyGene)*, *5. Replicate parsing*.
