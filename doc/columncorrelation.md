### Column correlation

**Data PreProcess** sub-tab **Column Correlation** (after **Column profile**) explores **sample–sample** relationships: matrix **columns** are treated as vectors over rows (features). This is **QC / replicate agreement**, not differential expression.

**Transforms and missing values:** Choose **none**, **log10(1 + x)**, or **log2(1 + x)**. Optional **Treat 0 as missing** (default on) matches DIANN-style intensity QC. Pair plots and correlations use **pairwise-complete** rows only (finite values after transform and missing rules).

**Nested tab strip:** Uses the same `data-filter-inner-tabs-row` / `data-filter-inner-tab` styling as **Data PreProcess → Data Filter** (e.g. Row Filter → Passed). **Overall correlations** shows subset heatmaps plus a mixed matrix plot: **lower triangle** = pairwise scatter plots; **upper triangle** = color-coded correlation cells. **Paired correlation** shows scatter, QQ, Bland–Altman, and the bar chart of **r(column X, j)** for each column *j* in the heatmap subset.

**Pair plots:** Pick **Column X** and **Column Y** (sidebar on the Paired tab); scatter includes an identity line when scales match. **QQ** compares sorted quantiles. **Bland–Altman**: difference vs mean, or **log2(Y/X)** vs geometric mean when both raw values are strictly positive.

**Correlation and distance matrices:** **Pearson** or **Spearman** (ranks with average ties, then Pearson on ranks). Matrices use the **first N** columns in file/matrix order (*Max columns in heatmaps*, default 40, cap 80). **Distance**: **1 − r**, **√(2(1 − r))**, or **Euclidean** on **z-scored** column vectors (pairwise-complete rows).

**Per-column summary (Plotly):** Moved to **Data QC → Overall** — bars for **every** sample column (**Bar metric**: mean raw intensity, mean transformed intensity, **non-zero feature count**, or detection rate). Uses the same **Transform** and **Treat 0 as missing** rules as this tab’s **Shared scale** block where those metrics apply. See **Document → Overview** subsection *Data QC → Overall — Bar metric* for definitions.

**Session JSON** saves the sidebar control values (`colCorr*` ids) so imports restore your settings; reopen the sub-tab or use **Refresh plots** to redraw.
