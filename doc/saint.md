### 20. SAINT analysis

The **Downstream > SAINT** sub-tab scores bait-prey interactions in affinity-purification mass spectrometry (AP-MS) data using the SAINT algorithm: for each bait, it compares test (T) vs control (C) samples to compute interaction probabilities. Three sub-tabs: **SAINT analysis**, **Network**, and **Scatter Plot**.

#### Setting up the analysis

- **Sample grouping** - either tick **Use Status column as-is (values T / C)** when your meta table has a `Status` column, or map a meta column: **Group by (meta column)**, **Control group (-> C)**, **Treatment group (-> T)** (the group-count line shows the mapped sample counts).
- **Bait column (required)** - the meta column that identifies the bait per sample (e.g. the IP name).
- **Input settings** - the data level (**Protein** default, **Peptide**, **Fragment**) and the corresponding column names (Protein / Peptide / Fragment - defaults matching the standard SAINT input layout).
- **Analysis settings** - **Compress N control** (default 100), **Compress N replicate** (default 100), **Normalize control intensities** (off by default).

#### Running

- Press **Run SAINT analysis** (progress bar + analysis log in the sidebar; **Stop** aborts).
- The results table appears in the main panel (bait, prey, scores such as BFDR and AvgP, per-sample intensities).
- **Download results (TSV)** exports the table once the run finishes.

#### Network sub-tab

An interactive D3 force network of bait-prey interactions:

- **Filter thresholds** - keep interactions with **BFDR <= 0.05** (slider) and **AvgP >= 0.8** (slider), then **Construct network**.
- **Display** - Show labels (on), node size, label size, node shape (Circle/Ellipse/Rectangle), link opacity, a low-high color gradient for scores, and **Color by bait/prey type**.
- **Export** - SVG / PNG / PDF buttons once the network exists.

#### Scatter Plot sub-tab

A volcano-style per-bait scatter: pick the **Bait**, then the **X axis** (`log2FC` default, `BFDR`, `AvgP`, `log10 intensity`) and **Y axis** (`BFDR` default, ...) metrics and **Update plot**.

#### Notes

- SAINT needs data shaped like an AP-MS experiment (one bait per sample, control samples included). The **SAINT analysis structured matrix** example button in Data Preparation loads a ready-made example.
- The SAINT results can be sent straight to Enrichr (**SAINT result** gene source, see *21. Enrichr enrichment*).

See also: *19. Differential analysis*, *21. Enrichr enrichment*.
