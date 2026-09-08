### 18. Meta table & Sankey

The **Data PreProcess > Meta Table** sub-tab shows and edits the sample metadata, and visualizes its hierarchical structure as a **Sankey** diagram. The meta table is auto-generated from matrix column names (see *5. Replicate parsing*); you can override it by uploading your own in Data Preparation.

#### Inner tabs

**Table** - the meta table editor. **Sankey** - the hierarchy visualization.

#### Table tab

- **Open Data Preparation** - shortcut back to the upload panel.
- **Export meta table (TSV)...** - downloads the current meta table.
- **+ Add New Column** - appends a new meta column (empty cells to fill in).
- **Batch Edit Selected Cells** - type a value, select cells, and **Apply To Selection** writes it to all selected cells. Ctrl/Cmd+click multi-selects cells in one column, Shift+click selects a range, and **Select All Visible (Same Column)** selects a whole column; **Clear Selection** deselects.
- **Editing**: click any cell to edit it in place. `Sample_ID` is read-only.
- **Headers**: click a header to rename the column (blur commits the new name); a small delete button on each header removes the column. `Sample_ID` cannot be renamed or deleted, and no column can be renamed to `Sample_ID`. Duplicate names are rejected.

#### Sankey tab

The Sankey diagram visualizes the meta table's hierarchical structure as an interactive Plotly Sankey:

- **Each selected meta column is one level** of the hierarchy (left to right in the checklist order).
- **Each sample row is a flow** through the columns' values (e.g. Group -> Biological_Replicate -> Sample_ID).
- **Link widths** show how many samples share each value-to-value transition.
- Rows missing a value in any selected column are skipped and counted in the status line.

##### Hierarchy columns checklist

- Check/uncheck columns to include/exclude them from the hierarchy (the diagram needs at least two selected columns).
- **Reorder levels** by dragging checked rows (use the grip; an insert line shows the landing spot - top half of a row = before, bottom half = after) or with the up/down arrow buttons.
- Dropping onto an **unchecked row** or onto the **empty space below the list** appends the column to the end of the hierarchy.
- Unchecked rows appear dimmed at the end of the list.

##### Max nodes per level

Default 30 (range 5-200; values below 5 are treated as 30). Rarer values in a level are merged into a single "(other N)" node so wide columns stay readable.

##### The diagram

- **Vertically centered columns** - each level's node group sits mid-height instead of bottom-aligned.
- **Draggable nodes** - drag any node vertically within its level column to tidy the layout; the new position persists across redraws and column changes.
- **Redraw** button re-renders the diagram on demand; it also redraws automatically whenever the meta table changes or the Sankey tab is re-opened.
- The status line reports samples, nodes, links, and skipped rows.

See also: *2. Data Preparation*, *5. Replicate parsing*, *11. Data Filter*.
