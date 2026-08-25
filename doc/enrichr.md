### 21. Enrichr enrichment

The **Downstream > Enrichr** sub-tab runs gene-list enrichment against the Enrichr libraries (client-side calls to the public Enrichr API) and visualizes the results three ways: the **Run Analysis** results table, **Enrichment plots**, and a clustered **Heatmap** of the enriched terms.

#### Gene list source

- **Paste genes** (default) - one gene per line in the textarea.
- **Input Data Matrix** - the current matrix row labels.
- **Differential results table (after Differential run)** - genes from a completed Differential analysis.
- **SAINT result (after SAINT run)** - prey genes from a completed SAINT analysis.

#### Libraries

- **Species** - `Human` (default), `Mouse`, `Fruit fly`, `Yeast`, `Worm`, `Fish`.
- **Category** - `Ontologies` (default), `Transcription`, `Pathways`, `Diseases/Drugs`, `Cell Types`, `Misc`, `Legacy`, `Crowd`.
- **Library** - the multi-select of libraries in the chosen category (populated when the tab opens; needs internet access).

Press **Run enrichment**; the analysis log shows progress and the **Run Analysis** panel fills with the results table (term, overlap, p-value, adjusted p, combined score, odds ratio, genes).

#### Enrichment plots sub-tab

Plotly charts built from the full term list (not only the current results page). Options in the sidebar:

- **Top N** (default 25), **Rank / sort by** (`Adjusted P (lower first)` default, `P-value`, `Combined score (higher first)`), **Min overlap genes** (default 1), **Bubble color** (`-log10(adjusted P)` default or `Adjusted P`), **Bubble X axis** (`Overlap count` default or `Odds ratio`).
- **Redraw plots** applies the options; **Export results TSV** downloads the parsed table.
- The three plot views: **Bar chart** (horizontal bars ranked by the chosen metric), **Bubble plot** (overlap/odds ratio vs term, colored by significance), **Term similarity (Jaccard)** (heatmap of term-term overlap between the top terms).

#### Heatmap sub-tab

The same clustering pipeline as the top-level Heatmap, but plotting **rows = ontology/library terms** and **columns = per-sample intensities attached to those terms** (requires a loaded matrix so each term has sample values).

- **Row filters** (empty = skipped): **Max adj. P-value** (default 0.05), Max P-value, Min combined score, Min odds ratio, Min overlap (genes).
- **Rank before max rows** - `Adjusted P (ascending)` (default), `P-value (ascending)`, `Combined score (descending)`; **Max ontology terms (heatmap rows)** default 40.
- **Clustering** - Cluster ontology terms (rows) and Cluster samples (columns) (both checked), distance metric (Manhattan default / Correlation / Euclidean), linkage (Average default / Complete / Single).
- **Sampling** caps, **Preprocessing** (Log10 transform checked, Z-score per row), **Colors** (RdBlkGn default etc., Reverse scale), **Figure & dendrogram %** (title, size, dendro %, margins).
- **Generate clustered heatmap** runs the pipeline; **Apply layout / colors (no re-cluster)** refreshes without re-clustering; **Open Heatmap tab (full matrix)** jumps to the full protein x sample heatmap.

#### Notes

- Enrichr requires internet access (API + library downloads). Serving over `file://` may block the requests - use `http://localhost`.
- The Enrichr table participates in session snapshots and can be embedded in the report.

See also: *19. Differential analysis*, *20. SAINT analysis*, *22. Report export*.
