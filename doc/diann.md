### DIANN Upload Rules

- For DIANN `results.pg*_matrix.tsv`, intensity values are read from column 7 onward; the first six columns are stored as per-row annotation (same file).
- **Data PreProcess → DIANN annotations** lists those columns in a read-only table (same row order, sort, and pagination as **Data Filter**).
- Default row-ID column is `Protein.Names` (plots and tables use this ID); you can choose `Genes`, `First.Protein.Description`, or `Protein.Group` instead.
- **Data PreProcess → Row Profile** search matches the primary ID plus all stored annotation fields (e.g. gene, protein names, descriptions). **Row label** dropdown chooses which DIANN annotation column labels the checklist and plot legend (`Protein.Group`, `Protein.Names`, `Genes`, `First.Protein.Description`); without DIANN pg annotations, matrix row IDs are used. Sidebar width is enlarged for the checklist. Quick selection: **Select all rows**, **Select top N** by row intensity sum (numeric input, default 5), **Clear selection**.
- If the selected ID column is missing from the header, fallback order is `Protein.Names` → `Genes` → `First.Protein.Description` → `Protein.Group` → first column.
- If selected ID is not `Protein.Group`, rows with blank selected IDs are removed.
- For DIANN `results.gg*_matrix.tsv`, intensity values are read from column 4 onward and row IDs always come from the first column (`Genes`).
- Sample names are simplified from raw file paths to concise informative names.
