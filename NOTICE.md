# Notices and attributions

Nebula is distributed under the **MIT License** (see [LICENSE](LICENSE)).

It bundles or uses the third-party components below, which remain under their own
licences. Components are grouped by *how* they are used, because that determines the
obligations: code **bundled** in this repository is redistributed by us and its notices
must be retained; code **loaded at runtime from a CDN** is not redistributed here.

---

## 1. Bundled code (redistributed with this repository)

| Component | Files | Licence | Copyright |
|---|---|---|---|
| **Clustergrammer** | `js/clustergrammer.js`, `js/clustergrammer_network.js`, `js/clustergrammer_cluster_worker.js` | MIT | © 2020 Ma'ayan Lab |
| **Enrichrgram** | `js/Enrichrgram.js` | MIT | © Ma'ayan Lab |
| **Harmonizome helper** | `js/hzome_functions.js` | MIT | © Ma'ayan Lab |

`Enrichrgram.js` and `hzome_functions.js` are patched copies of files from
[MaayanLab/clustergrammer](https://github.com/MaayanLab/clustergrammer) (API host updated,
`fetch()` rewrites, expanded library selector). The MIT notice above applies to them.

> The upstream MIT licence requires that its copyright and permission notice be retained in
> all copies. The three vendored files above did not carry that notice in their headers, so
> it is recorded here instead. **Do not remove this file.**

## 2. Bundled data (redistributed with this repository)

### MSigDB gene sets — `js/msigdb/*.js` (22 collections, human v2026.1)

Licensed under the **Creative Commons Attribution 4.0 International License (CC-BY 4.0)**.

> The contents of MSigDB are protected by copyright (c) 2004–2026 Broad Institute, Inc.,
> Massachusetts Institute of Technology, and Regents of the University of California,
> subject to the terms and conditions of the Creative Commons Attribution 4.0 International
> License.

Required attribution when you use or redistribute these gene sets:

- **Subramanian A, et al.** *Gene set enrichment analysis: a knowledge-based approach for
  interpreting genome-wide expression profiles.* PNAS 102(43):15545–15550 (2005).
- For the **Hallmark (H)** collection: **Liberzon A, et al.** *The Molecular Signatures
  Database Hallmark Gene Set Collection.* Cell Systems 1(6):417–425 (2015).
- Source: <https://www.gsea-msigdb.org/gsea/msigdb/>

**Restricted collections are deliberately NOT bundled.** MSigDB's CC-BY grant does not cover
every collection: KEGG Medicus sets are CC-BY-**SA** 4.0 (© Kanehisa Laboratories), and the
KEGG Legacy and BioCarta sets are included in MSigDB under separate qualified permissions
requiring retention of their own copyright notices. Nebula therefore ships **none** of them,
and its GSEA collection picker renders `C2:CP:BIOCARTA`, `C2:CP:KEGG_LEGACY` and
`C2:CP:KEGG_MEDICUS` as *licence-restricted* and disabled. Users who want those sets must
obtain them from MSigDB themselves under the applicable terms.

## 3. Runtime libraries (loaded from CDN — not redistributed here)

These are fetched from public CDNs by the browser at run time. They are **not** included in
this repository, and their licences do not apply to Nebula's own source.

| Library | Licence |
|---|---|
| [UpSet.js](https://upset.js.org/) (`@upsetjs/bundle` 1.11.0) | **AGPL-3.0** — see §4 |
| [Eunoia](https://eunoia.bz) (`@jolars/eunoia`) | MIT OR Apache-2.0 |
| [Plotly.js](https://plotly.com/javascript/) | MIT |
| [D3](https://d3js.org/) (v7 and v3.5) | ISC |
| [PapaParse](https://www.papaparse.com/) | MIT |
| [ml-matrix](https://github.com/mljs/matrix) | MIT |
| [umap-js](https://github.com/PAIR-code/umap-js) | MIT |
| [marked](https://marked.js.org/) | MIT |
| [DOMPurify](https://github.com/cure53/DOMPurify) | MPL-2.0 OR Apache-2.0 |
| [jsPDF](https://github.com/parallax/jsPDF) | MIT |
| [DataTables](https://datatables.net/) | MIT |
| [jQuery](https://jquery.com/) | MIT |
| [hyparquet](https://github.com/hyparam/hyparquet) | MIT |
| [Bootstrap](https://getbootstrap.com/) 3.4.1 | MIT |
| [Underscore.js](https://underscorejs.org/) | MIT |
| [Font Awesome](https://fontawesome.com/) 4.7 | OFL-1.1 AND MIT |
| [Inter](https://fonts.google.com/specimen/Inter) (Google Fonts) | OFL-1.1 |

## 4. About UpSet.js (AGPL-3.0)

Nebula uses [UpSet.js](https://github.com/upsetjs/upsetjs) for the UpSet / Venn / K-map tab.
UpSet.js is licensed under the **GNU Affero General Public License v3.0** (© 2021 Samuel
Gratzl). Its authors additionally require a separate commercial licence **for commercial use
only** — that requirement does not apply to this project.

Nebula is a free, open-source, non-commercial project, so it uses UpSet.js under the AGPL
open-source grant. No commercial licence is needed.

How Nebula uses it, and why that does not relicense Nebula:

- UpSet.js is loaded **unmodified** from a public CDN (`cdn.jsdelivr.net`) at run time.
- It is **not** vendored, modified, or redistributed in this repository.
- Nebula itself is not a network service: it is a static client-side application whose complete
  source is published here.

The only caveat is for **downstream** users: if you redistribute Nebula commercially, or your
organisation's policy restricts AGPL dependencies, this is the one component to review. The
UpSet/Venn/K-map tab's other views (Venn, Karnaugh map, and the Proportional Venn built on
Eunoia) do not depend on it.

> This file records licence facts for attribution. It is not legal advice.
