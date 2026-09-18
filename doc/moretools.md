### 27. More Tools (DIA-NN Result Explorer)

The **More Tools ▾** dropdown sits after the **Report** tab in the top tab bar (same level and font as the tab titles). It opens isolated accessory tools in a **temporary top-level tab**: the tool panel appears with no permanent tab-bar entry, and the More Tools button carries the active underline while a tool tab is open. Switching to any regular tab hides the tool panel; reopening it from the menu resumes exactly where you left off (no reload).

#### DIA-NN Result Explorer

The first More Tools entry, ported from the standalone DIA-NN Parquet Studio. It parses a DIA-NN `results.parquet` (plus optional FASTA and `.xic.parquet` files) entirely in the browser and offers three views:

- **Summary** - KPI cards (precursors filtered/total, protein groups, unique peptides, sample runs, all-run overlaps), per-sample identification table, FDR filter sliders (Precursor / Global / Protein Group Q.Value), and quantification settings (intensity metric, PG.MaxLFQ / Sum / Top3, proteotypic-only).
- **Data Matrix Explorer** - sortable, searchable, paginated **Protein / Gene / Peptide** tables with TSV export (PG matrix, peptide matrix). Click a protein row to inspect its peptides.
- **Spectra & Coverage** - three-column Protein → Precursor → Run browser with per-run XIC chromatograms (y/b/ms1/theoretical toggles) and per-residue protein sequence coverage mapped from the FASTA.

#### Data sources

- On first open the tool idles with **No file loaded**; **Load example data** loads the bundled demo dataset (embedded parquet + FASTA, no upload needed).
- **Open result folder** (Chrome/Edge) reads a DIA-NN output folder: the main `.parquet`, `protein_description.tsv`-style FASTA, and per-run `.xic.parquet` files.
- Parsing uses the `hyparquet` library, fetched from CDN on first parse (internet required); without it, loading a file shows an error toast but the app is unaffected.

#### Notes and limits

- The studio follows the Nebula **Color theme**: Nebula Dark gives the dark studio, any light theme gives the light studio. It syncs when opened, on every theme switch, and live while open.
- **Export Report is disabled inside Nebula** (the standalone report clones the whole page); use Nebula's **Report** tab for Nebula figures.
- The explorer is **isolated**: it does not read Nebula's loaded matrix and Nebula tabs do not read its matrices. To analyze a DIA-NN protein-group matrix with Nebula's QC/clustering/differential pipeline, load `results.pg_matrix.tsv` via **Data preparation** instead.
