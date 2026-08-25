### 4. MaxQuant upload rules

Nebula parses `proteinGroups.txt` and `Phospho (STY)Sites.txt` directly. The parser detects the per-sample quantification columns, keeps everything else as annotations, applies standard QC row removal, and builds row IDs the way you choose.

#### proteinGroups.txt

- **Quantification columns**: per-sample columns named `LFQ intensity <experiment>` are used by default (**LFQ intensity (default if present)** - normalized). Choose **Intensity (raw)** to use the raw `Intensity <experiment>` columns instead. If no LFQ columns exist, raw Intensity is used automatically.
- **Row ID column**: `Gene names` (default), `Protein names`, `Protein IDs`, `Majority protein IDs`, or `id`. For multi-valued cells only the **first semicolon-separated entry** is used; if the chosen column is empty, the parser falls back to gene names, then protein names, then majority protein IDs, then protein IDs, then `id`. Duplicate IDs get `_2`, `_3`, ... suffixes so rows stay unique.
- **Remove Reverse & contaminants** (checked by default): drops rows flagged with `+` in `Reverse`, `Potential contaminant`, or `Only identified by site` - standard MaxQuant QC. The load status reports how many rows were removed.
- Column classification: a column is per-sample (and used for the matrix or annotations-per-sample) when its header contains one of the experiment names; all other columns become a single global annotation set. Bare total columns (no experiment suffix) and phospho multiplicity expansions (`___` suffixes) are skipped.
- Missing values (`NA`, `NaN`, empty, ...) become **0** in the matrix.

#### Phospho (STY)Sites.txt

- **Quantification columns**: per-sample `Intensity <experiment>` columns, with the multiplicity expansions (`Intensity <exp>___1`, `___2`, `___3`) collapsed to the summed per-sample value. Choose this format for phosphosite-level analysis (single-site quantification is used for the matrix).
- **Row ID (site)** options:
  - **Gene + site (e.g. AKT1_S473)** (default) - gene symbol + amino acid + position.
  - **Protein + site** - protein name + amino acid + position.
  - **Leading proteins + position** - first leading protein + position.
  - **MaxQuant id** - the file's own `id` column.
- **Remove Reverse & contaminants** (checked by default) applies the same QC removal.

#### Status reporting

The load status line summarizes each import, e.g. `MaxQuant proteinGroups loaded; quant: LFQ intensity; ID: Gene names; removed 12 reverse/contaminant rows`. If no rows survive parsing, an explanatory error is shown instead.

#### Built-in examples

**MaxQuant proteinGroups** and **MaxQuant Phospho (STY)Sites** buttons in Data Preparation load ready-made examples. The phospho example can also be sent through the **Phospho / total protein paired analysis** normalization workspace (see *2. Data Preparation*).

See also: *2. Data Preparation*, *3. DIA-NN upload rules*, *5. Replicate parsing*.
