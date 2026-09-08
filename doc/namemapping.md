### 15. Name mapping (MyGene)

The **Data PreProcess > Name mapping** sub-tab maps your matrix row IDs to gene symbols, protein names, and UniProt accessions using the free **MyGene.info** API (no key required). The results are stored like DIANN annotations: they become the **feature labels** shown in plots and tables, and they power Row Profile search.

#### Why use it

If your matrix uses accessions (e.g. `P04637`, `Q16539`) or vendor IDs as row labels, name mapping lets you see familiar gene symbols everywhere: heatmap labels, Row Profile lists, Differential tables, tooltips, and the exported reports.

#### Options

- **Species** - `Human (9606)` (default), `Mouse (10090)`, `Rat (10116)`, or `Other (NCBI taxid)` with a **NCBI taxid** input for any other organism (e.g. `7227` for Drosophila).
- **Interpret row IDs as** - `Auto (UniProt accession vs gene symbol)` (default), `Gene symbol`, or `UniProt accession`. Auto mode decides per label so mixed lists work.

#### Running

1. Open **Data PreProcess > Name mapping**.
2. Pick species and ID interpretation.
3. Press **Run mapping**. Large tables are queried in batches with progress in the status line.
4. Use **Stop** to interrupt and keep the partial results mapped so far.
5. **Clear stored mapping** removes the mapping and restores the original row labels.

The **Annotation table** on the right shows the mapping result; its row order, sort, and pagination follow the Data Filter sub-tab, and a log pane below records query progress.

#### Notes

- MyGene.info requires network access. When serving Nebula over `file://` the browser may block the requests - serve over `http://localhost` instead.
- The mapping is stored in memory for the current session; it is included in session snapshots and reports once computed.

See also: *2. Data Preparation*, *3. DIA-NN upload rules*, *7. Data QC - Row profile*.
