### 8. Data QC — Column profile

The **Data QC > Column profile** sub-tab profiles **one sample column at a time**: ranked intensities, cumulative share, treemap, pie, and the intensity distribution - five interactive Plotly figures in inner sub-tabs.

#### Sidebar (Display options)

- **Sample column** - which sample to profile (populated from the matrix columns; changes repopulate/redraw immediately).
- **Row/feature label** - what to show in hover/labels: `First.Protein.Description` (default), `Matrix row ID`, `Protein.Names`, `Genes`, `Protein.Group`.
- **Max features (bar, curve, treemap, pie)** - default 500 (range 10-20000): the top N features by intensity are shown individually; the remaining mass is grouped as *Other* (treemap / pie).
- **Use log10(1 + intensity) for bar & line chart** - unchecked by default; check to plot the ranked-intensity bar/line on a log scale.
- **Mark contaminant proteins (Cont_)** - checked by default; `Cont_`/`CON__` rows are shown red in the bar/pie/treemap and their share of the sample's total intensity is reported.
- **Refresh plots** - redraws the active figure.

#### The five figures (inner sub-tabs)

- **Treemap** (first, default) - area-proportional rectangles of the top features + an *Other* group.
- **Ranked intensity** - bars sorted by intensity (highest first) with a connecting line; optionally log10(1+intensity) scale.
- **Cumulative %** - cumulative percentage of the sample's total intensity in sorted order.
- **Pie chart** - top N features + *Other* as a pie.
- **Distribution** - log10(1+I) histogram + KDE over **all features** of the sample.

Only the active tab's figure is drawn, and each figure stretches to the full height of the visible panel. The **Add to Report** buttons on the treemap and ranked-intensity cards switch to the figure's own tab before capture; the status line under the figures reports the active view.

See also: *7. Data QC - Row profile*, *22. Report export*.
