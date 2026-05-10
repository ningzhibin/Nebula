### Name mapping (Data PreProcess)

**Data PreProcess** → **Name mapping** calls the free [MyGene.info](https://mygene.info/) API (no key) to map matrix row IDs to **gene_symbol**, **protein_name**, **uniprotkb_ac**, and related fields. Choose species (human / mouse / rat / custom NCBI taxid), whether IDs are gene symbols, UniProt accessions, or **auto** (accession regex vs symbol), then **Run mapping**. Large tables are queried in batches; **Stop** keeps partial results.

Results are stored in the session as `featureNameMapHeaders` / `featureNameMapRows` and appear in **feature label** dropdowns (heatmap, Clustergrammer, Differential, column profile, column correlation, Row Profile) and in **Row Profile** search — similar to DIANN row annotations. Mapping is **best-effort**; ambiguous or missing hits are noted in `mapping_note`.

If the browser blocks cross-origin requests (e.g. opening the app as `file://`), serve the folder over `http://localhost` or another HTTP server so `fetch` to MyGene can succeed. The **Document** tab loads Markdown from the `doc/` folder the same way: serve the app over HTTP so `fetch('doc/...')` works.
