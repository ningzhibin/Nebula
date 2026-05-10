### Column profile

- **Data PreProcess** sub-tab **Column profile** (after **Row Profile**): one **button per sample column** above the plots.
- For the selected column, finite numeric values are sorted **high → low**. Interactive **Plotly** views: ranked **bars + line** (linear intensity y-axis: scientific notation, e.g. `1.2e+6`), **cumulative % of total**, **treemap**, and **pie** (top *N* features + **Other**; sidebar *Max features*). Optional **log10(1 + intensity)** for the bar/line panel uses fixed-decimal y ticks on the transformed scale.
- A full-width panel plots a **histogram** (probability density) and **Gaussian KDE** curve of **log10(1 + intensity)** for **every** feature in that column (not limited by *Max features*); KDE uses a Silverman bandwidth and subsamples very large matrices for speed.
- **Row Profile** bar/line chart: linear **Value** y-axis uses the same scientific tick style; **log Y** and **Z-score** modes keep their own tick formats. The plot uses the **full width and height** of the Row Profile plot column inside a framed container; sample names get extra bottom space and smaller tick fonts when there are many columns.
