### 23. GSEA (preranked)

The **GSEA** sub-tab (Downstream → GSEA) runs **Gene Set Enrichment Analysis in preranked mode** (Subramanian et al., *PNAS* 102(43):15545–15550, 2005): given a genome-wide ranked gene list, it tests whether members of a gene set cluster at the top or bottom of the ranking more than expected by chance.

#### Ranked gene list (sidebar → Ranked gene list)

- **Differential results** (default): uses the current Downstream → Differential outcome. Ranking metric choices for two-group tests: **log2FC**, **t-statistic**, **signed −log10(FDR)**, **signed −log10(p)**. Multi-group (ANOVA/Kruskal–Wallis) results rank by **−log10(p)** (unsigned — enrichment can only appear at the top).
- **Expression matrix (direct)**: ranks straight from the loaded matrix with its meta grouping — no Differential run needed. Pick Group-by column, Group A/B, and the metric: **log2FC** or **t-statistic (Welch)** (recommended), **z-statistic** (standardized mean difference, Cohen's d), or **signal-to-noise** (the classic GSEA default). Same log2(x+1) / treat-0-as-missing preprocessing as Differential, same B-vs-A sign convention, and the same FC pseudocount on the raw scale — log2FC values match a same-settings Differential run exactly.
- **Paste list**: `GENE <tab> score` per line (gene symbols, any score scale).
- **Upload file**: `.rnk` / `.tsv` / `.csv` with gene + score columns (header-tolerant).

Row labels are resolved to gene symbols in this order: DIANN **Genes** column → saved **Name mapping** `gene_symbol` → matrix row ID (species suffix stripped). Matching is case-insensitive; duplicate symbols collapse to the entry with max |score| (documented as Collapse/Max). The status line reports how many scored genes entered the analysis.

#### Gene sets (sidebar → Gene sets)

The picker mirrors the official MSigDB collection tree (human, v2026.1): tick a top-level collection (**H**, **C1**…**C9**) to use everything beneath it, or expand and tick individual branches (e.g. **C2:CP:REACTOME**, **C5:GO:BP**). Parent boxes show a mixed state when only some children are ticked. Files load into the page on first selection (≈60 KB–7.9 MB each, shown per branch) and stay cached for the session; everything works offline once loaded.

- **H**: hallmark (50 sets). **C1**: positional (302). **C2**: curated — CGP (3,555), CP:PID (196), CP:REACTOME (1,839), CP:WIKIPATHWAYS (925). **C3**: regulatory — miRDB (2,377), legacy miRNA (221), GTRD (506), legacy TFT (610). **C4**: computational — 3CA (148), CGN (427), CM (431). **C5**: ontology — GO BP (7,538), CC (1,080), MF (1,872), HPO (5,793). **C6**: oncogenic (189). **C7**: ImmuneSigDB (4,872), VAX (347). **C8**: cell type (866). **C9**: perturbation (62).

All built-in collections are MSigDB v2026.1 human (CC-BY-4.0) — please cite Subramanian et al. 2005 and, for Hallmark, Liberzon et al., *Cell Systems* 1(6):417–425 (2015). BioCarta, KEGG Legacy, and KEGG Medicus appear greyed out: they carry separate licence terms, so upload your own `.gmt` if you need them.
- **Custom .gmt**: upload any GMT file (name, description, genes…); it appears under “Custom (.gmt uploads)” in the tree for the session.
- **Download more**: the sidebar links to the [MSigDB collections page](https://www.gsea-msigdb.org/gsea/msigdb/collections.jsp) (free login required); download a `.symbols.gmt` there and load it via **Custom .gmt**. Do not embed KEGG_LEGACY/BioCarta subsets without their separate licences.

Gene sets with fewer than **Min set size** (default 15) or more than **Max set size** (default 500) matched genes are skipped and listed as filtered. Human symbols are expected; mouse data matches on identical (uppercased) symbols — check the matched-gene counts when results look empty.

#### Parameters

**Weight p** (default 1): exponent on |score| in the running sum (0 = classic unweighted). **Permutations** (default 1000): gene-set permutations per set; the run uses a seeded RNG (default seed 42) so results reproduce exactly. Computation runs in a Web Worker — the tab stays responsive with a progress bar.

#### Reading the results

The **Results table** lists, per gene set: size (matched genes), **ES** (enrichment score, signed), **NES** (normalized ES, comparable across sets), nominal **p**, permutation **FDR**, leading-edge gene count, and direction (Up = enriched at the top of your ranking). Rows with FDR < 0.25 are highlighted — the GSEA authors' recommended significance guideline for exploratory work. **Export CSV** downloads the full table including leading-edge genes.

The **Enrichment plot** (official 3-panel layout) shows the running ES curve with its peak marked, hit positions (leading-edge hits in red), and the ranked metric (red = positive, blue = negative). Pick the set in the plot header dropdown or click **Add to Report** / **Pop out** there.

#### Session & report

Exporting a session snapshot stores the GSEA results, parameters, and ranked list, so the tab restores without re-running. The enrichment plot registers as a Report figure and a pop-out target like the other Downstream figures.
