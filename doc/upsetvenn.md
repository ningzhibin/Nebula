### 10. UpSet / Venn / K-map

The **Data QC > UpSet / Venn / K-map** sub-tab visualizes the overlap structure between sample sets: which features are detected in which samples. Two inner tabs: **Linked views** (UpSet plot, Venn diagram, Karnaugh map) and **Proportional Venn** (area-proportional circle diagram).

#### Sets and the presence rule

- Each **set** is one sample column (choose them in the sidebar checklist; a filter box, **Select all**, and **Clear** help with long lists).
- A row (feature) belongs to a set when its cell passes the **Presence rule**:
  - **Present if value is a finite non-zero number (0 counts as missing)** - default.
  - **Present if intensity is strictly greater than a threshold** - with a **Threshold** input (default 0 = same as > 0); use it to demand higher confidence.

#### Linked views (inner tab)

Three linked visualizations of the same set memberships (built on UpSet.js, AGPL-3.0):

- **UpSet plot** - the classic UpSet matrix: bars show combination sizes, the dot matrix shows which sets belong to each combination. Sidebar options under **Set combinations (UpSet plot)**: **Ordering** (cardinality high-low default; also by name, degree, ...), **Mode** (Set intersections default / Set unions / Distinct intersections), **Minimum set members** (default 1), **Maximum set members** (default 5; raise for many selected columns), **Max # combinations** (default 100, kept after ordering), **Include empty combinations**.
- **Venn diagram** - classic circle overlaps.
- **Karnaugh map** - grid-style overlap map.

Hovering a region in any of the three highlights the same intersection in the others (linked selection). A warning appears when many sets make the Venn/Karnaugh views crowded. Each view has **Pop out** (opens the shared popout window via postMessage - allow pop-ups; needed for file:// use) and **Add to Report** (captured as vector SVG).

#### Proportional Venn (inner tab)

Circles whose **areas are proportional to each set's feature count**; the overlap between two circles is placed to match the real intersection count (exact for 2 sets, approximate for 3; 3-set exact fitting is mathematically impossible).

- **4+ sets**: the whole layout is fitted area-proportionally by the **Eunoia** library (loaded from a CDN on demand). When the CDN is unreachable, sized circles without proportional overlaps are drawn and a note explains it (1-3 sets always work offline with the built-in solver).
- **Shape** - `Auto` (circles for 1-3 sets, ellipses for 4+), `Circle`, `Ellipse`, `Square`, `Rectangle` - the shape family used by the fitter.
- **Color theme** - `Default`, `Distinct (Category10)`, `Warm`, `Cool`, `Pastel`, `Dark`, `High contrast`.
- Hover a shape or region for the exact counts; region labels show real member counts.
- **Notes & attribution** (collapsed) documents the fitting method and the Eunoia citation.

**Refresh plots** re-renders both inner tabs from the current settings. The **Help & about this tab** box at the sidebar bottom (collapsed) explains the set/presence model and the pop-out details.

See also: *22. Report export*.
