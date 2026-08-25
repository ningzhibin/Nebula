### 2. Data Preparation

The **Data Preparation** tab is where data enters Nebula. It has three columns: the **Data matrix** upload panel, the **Meta table** panel, and a live **preview column** showing the currently loaded matrix and meta table. Everything else in the app (Data PreProcess, Data QC, Clustering, Downstream) works on the matrix and meta table that you load here.

#### Layout

- Left column - **Data matrix**: example-data buttons, copy & paste, and file upload with a format selector.
- Middle column - **Meta table**: example metadata, upload/paste of your own meta table.
- Right column - **Loaded data matrix** and **Loaded meta table**: two live DataTables previews (search, sort, paging, scroll, bar-style numeric cells) that always reflect the current matrix and meta table. They update automatically when you load, paste, upload, or edit data, and re-render when the tab is opened.

#### Try example data

Five built-in examples let you explore the app without preparing files:

- **Plain Data Matrix** - a 600 x 30 protein intensity matrix with sample columns `s01`-`s30`.
- **DIANN pg matrix** - a DIA-NN protein-group matrix whose sample names follow a `..._BAIT_R1_T1` convention, so the meta table auto-generates with Group / Biological_Replicate / Technical_Replicate columns (useful for testing the Sankey, Data Filter scopes, and Differential).
- **MaxQuant proteinGroups** - a MaxQuant proteinGroups example.
- **MaxQuant Phospho (STY)Sites** - a phosphosite example.
- **SAINT analysis structured matrix** - a matrix shaped for SAINT interaction scoring (bait/prey structure).

Each button shows a status line under it while loading. Loading example data goes through the same pipeline as a real upload: parse, generate the meta table from column names, refresh all previews.

#### Copy & Paste

Paste tab- or comma-separated text into the **Copy & Paste** box and press **Load Pasted Data**. The first row must be column headers and the first column must be the row IDs (feature IDs), e.g.:

    ID    Sample1    Sample2    Sample3
    Gene1    10.5    12.3    9.8
    Gene2    8.2    7.5    10.1

Pasted data is parsed as a plain matrix (same rules as the Plain format below).

#### Upload data file

1. **Choose file format** in the dropdown - Nebula uses the matching parser to separate annotation columns from the intensity matrix and to guess meta information.
2. **Choose file to upload**.

The formats:

- **Plain / clean data matrix** - first row = column headers, first column = row IDs; tab/comma-separated text files.
- **DIANN protein groups** (`results.pg*_matrix.tsv`, default) - see *3. DIA-NN upload rules*. Extra option: **Row ID column for plots** (`Protein.Names` default; also `Genes`, `First.Protein.Description`, `Protein.Group`).
- **DIANN gene groups** (`results.gg*_matrix.tsv`) - see *3. DIA-NN upload rules*.
- **MaxQuant - proteinGroups.txt** - see *4. MaxQuant upload rules*. Extra options: **Quantification columns** (`LFQ intensity` when present, otherwise raw `Intensity`), **Row ID column** (`Gene names` default), and **Remove Reverse & contaminants** (checked).
- **MaxQuant - Phospho (STY)Sites.txt** - see *4. MaxQuant upload rules*. Extra options: **Row ID (site)** (`Gene + site`, e.g. `AKT1_S473`, default), and **Remove Reverse & contaminants** (checked).

The status line under the file input reports what was loaded: parser, ID column used, and how many reverse/contaminant or blank-ID rows were dropped.

#### What happens after a load

1. The file is parsed into a row-ID column, an intensity matrix, and annotation columns (when the format has them).
2. The **meta table is auto-generated from the column names** (see *5. Replicate parsing*) - sample names like `..._BAIT_R1_T1` become Group / Sample / Biological_Replicate / Technical_Replicate columns, time-course tokens become a Time column, and so on.
3. The **Loaded data matrix** and **Loaded meta table** previews refresh.
4. PCA / t-SNE caches are cleared so stale projections are never shown against new data.

#### Meta table panel

- **Load Example Meta Data** - fills the meta table with a small demonstration meta table.
- **Upload Meta Table** - paste or upload your own meta table (first row = headers, first column = `Sample_ID`). Uploading replaces the auto-generated meta table.
- Note: the meta table is auto-generated from matrix column names when you load a data matrix; uploading here overrides it. Edit cells later under **Data PreProcess > Meta Table** (see *17. Meta table & Sankey*).

#### Phospho / total protein paired analysis

The purple **Phospho/total paired Data** button opens a dedicated workspace for phosphosite data: load a phosphosite matrix together with a matching total-proteome matrix, normalize (Sequential KNN imputation + auto-log2), inspect the result, and send the normalized matrix back into the main workflow.

- **Data Preparation sub-tab**
  - **1. Phosphosite Matrix** - format selector (**DIANN phosphosites** `results.phosphosites_99.tsv` default; MaxQuant Phospho (STY)Sites; MaxQuant proteinGroups; DIANN protein groups; Plain) and a **Remove Reverse & contaminants (MQ)** checkbox (checked). Site + residue columns are kept as annotations so each phosphosite is tracked and plotted separately.
  - **2. Total Proteome Matrix** - format selector (DIANN protein groups default; MaxQuant proteinGroups; Plain) and its own **Remove Reverse & Contaminants (MQ)** checkbox.
  - **Load Built-in Example Data (Both)** fills both matrices with built-in examples.
  - **Data View** - DataTables for the **Phosphosite matrix**, **Proteome matrix**, and (after normalization) the **Normalized matrix**, with a **Bar scale** selector for the in-cell bars.
- **Normalization sub-tab**
  - **Matching Columns** - which annotation column identifies the same protein in each matrix (e.g. Protein names).
  - **Imputation (Sequential KNN)** - **Enable Sequential KNN imputation** (checked) plus the **Sequential KNN parameters** block - the same controls, meanings and defaults as *15. Missing value imputation* → Sequential KNN: **K neighbors** (default 5), **Distance metric** (Euclidean / Manhattan / Pearson / Cosine), **Weighting** (Inverse distance / Uniform / Rank-based), **Min. shared columns** (default 1), **Fallback when no donor value** (Column median / mean / Global minimum / Zero), **Neighbor axis** (Features/rows or Samples/columns) and **Max missing % per row** (default 50 - rows above the cap are left un-imputed; 100 = no cap). The per-group cap has no counterpart here because this workspace's meta table is per-feature annotation (protein/gene/site), not per-sample metadata. It runs the **exact same SeqKNN worker** as the Imputation sub-tab, so both paths share one code path and identical results: rows are imputed fewest-missing first, each imputed row joins the donor pool, and missing cells are the weighted mean of the K nearest donors. The phosphosite and proteome matrices are imputed one after the other through that shared worker (per-matrix progress in the status line).
  - **Run Normalization (Auto-Log2)** - runs the normalization and shows progress in the status line.
  - **Normalization Profile Plot** - search a protein/site (e.g. `Mapt` or `AKT1_S473`) and plot its profile.
  - **Send Normalized Data to Main Analysis** - appears after normalization; loads the normalized matrix into the main workflow (previews, meta generation, and QC all update).

#### Session snapshot

The download icon in the header (top-right) opens the **Session snapshot (JSON / report JS)** dialog. A snapshot saves the matrix, the meta table, the heatmap clustering result, PCA/t-SNE when computed, optionally the Clustergrammer network, and - when those analyses were run - **Differential**, **Enrichr**, and **SAINT** results, plus a `plotting` section with group-annotation and color-scheme choices.

- **Include Clustergrammer network** - checked by default; uncheck for a smaller file when you only need matrix, meta, and plotting settings.
- **Export session to JSON...** - download a `.json` snapshot for backup/sharing.
- **Export session as report JS (qc_session.js)...** - download the snapshot as `qc_session.js`. Save it as `data/qc_session.js` next to `index.html` and the app auto-loads it on the next page load (add `?noSession=1` to the URL to skip auto-loading).
- **Import session from JSON...** - restore a previously exported snapshot.

Next: *3. DIA-NN upload rules*, *4. MaxQuant upload rules*, *14. Name mapping (MyGene)*, *5. Replicate parsing*.
