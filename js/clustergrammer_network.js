/**
 * clustergrammer_network.js
 *
 * JavaScript port of the core Clustergrammer-PY pipeline.
 * Handles network_data construction with multiple filtered views,
 * Z-score normalization, category parsing, and dendrogram utilities.
 *
 * Exposes a single global: window.ClustergrammerNetwork
 */
(function (global) {
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────────

  // View thresholds matching clustergrammer-py defaults:
  //   views=['N_row_sum', 'N_row_var'] at counts [500, 250, 100, 50, 20, 10]
  var VIEW_THRESHOLDS = [500, 250, 100, 50, 20, 10];
  var NUM_DENDROGRAM_LEVELS = 11;

  // ── Math helpers ─────────────────────────────────────────────────────────────

  function computeVariance(arr) {
    var n = arr.length;
    if (n === 0) return 0;
    var sum = 0;
    for (var i = 0; i < n; i++) sum += arr[i];
    var mean = sum / n;
    var sq = 0;
    for (var j = 0; j < n; j++) {
      var d = arr[j] - mean;
      sq += d * d;
    }
    return sq / n;
  }

  function computeAbsSum(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += Math.abs(arr[i]);
    return s;
  }

  /**
   * Returns an array of indices that would sort `values` in descending order.
   */
  function argSortDesc(values) {
    var idx = values.map(function (_, i) { return i; });
    idx.sort(function (a, b) { return values[b] - values[a]; });
    return idx;
  }

  // ── Z-score normalization ────────────────────────────────────────────────────

  /**
   * Z-score normalize matrix per row (zero-mean, unit-std).
   * Returns a new matrix.
   */
  function zScoreMatrix(mat) {
    var out = [];
    for (var r = 0; r < mat.length; r++) {
      var row = mat[r];
      var n = row.length;
      var sum = 0;
      for (var c = 0; c < n; c++) sum += row[c];
      var mean = sum / n;
      var sq = 0;
      for (var c2 = 0; c2 < n; c2++) {
        var dd = row[c2] - mean;
        sq += dd * dd;
      }
      var std = Math.sqrt(sq / n) || 1e-10;
      var newRow = new Array(n);
      for (var c3 = 0; c3 < n; c3++) newRow[c3] = (row[c3] - mean) / std;
      out.push(newRow);
    }
    return out;
  }

  // ── Category parsing ─────────────────────────────────────────────────────────

  /**
   * Parse category annotations from raw TSV lines.
   *
   * Supports two Clustergrammer-PY formats:
   *
   * 1) Column categories — extra header rows between the column-name row and
   *    the first data row, identified by the first cell containing "cat-N:"
   *    or starting with a non-numeric non-empty string that does not contain
   *    a tab-only value:
   *
   *      \tSample1\tSample2
   *      cat-0: Subtype\tA\tB
   *      Gene1\t1.2\t3.4
   *
   * 2) Row tuple categories — row names encoded as tuples:
   *      (EGFR, cat-0: Kinase)\t1.2\t3.4
   *    → name becomes "EGFR", cat field "cat-0: Kinase" is added.
   *
   * @param {string[]} lines   - All lines from the file (as split strings).
   * @param {string}   delim   - The field delimiter ('\t' or ',').
   * @returns {{
   *   headerRow: number,         // index of the column-name row
   *   dataStartRow: number,      // index of the first numeric data row
   *   colNames: string[],        // column names (from headerRow)
   *   colCategories: Object[],   // [{title, values: [per-col strings]}]
   *   rowCategoryKeys: string[]  // category keys found in row tuple names
   * }}
   */
  function parseCategories(lines, delim) {
    // Find the header row: first line where the first field is empty or the
    // line has more than one field separated by delim.
    var headerRow = 0;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      var fields = lines[i].split(delim);
      if (fields[0].trim() === '' || fields.length > 1) {
        headerRow = i;
        break;
      }
    }

    var headerFields = lines[headerRow].split(delim);
    var colNames = headerFields.slice(1).map(function (s) { return s.trim(); });

    // Scan rows after the header to find column-category rows vs. data rows.
    var colCategories = [];
    var dataStartRow = headerRow + 1;

    for (var r = headerRow + 1; r < lines.length; r++) {
      var line = lines[r].trim();
      if (line === '') continue;
      var cells = lines[r].split(delim);
      var firstCell = cells[0].trim();

      // A column-category row has a non-numeric label in the first cell and
      // the remaining cells are not all numeric.
      var catMatch = /^cat-\d+:/i.test(firstCell);
      var firstNumeric = (firstCell !== '' && isFinite(Number(firstCell)));

      if (catMatch || (!firstNumeric && firstCell !== '' && isNaN(Number(cells[1])))) {
        // This looks like a category row.
        var catTitle = firstCell;
        var catValues = cells.slice(1).map(function (s) { return s.trim(); });
        colCategories.push({ title: catTitle, values: catValues });
        dataStartRow = r + 1;
      } else {
        // First numeric data row found.
        dataStartRow = r;
        break;
      }
    }

    // Detect row tuple category keys from the first data row.
    var rowCategoryKeys = [];
    if (dataStartRow < lines.length) {
      var sampleLine = lines[dataStartRow].trim();
      if (sampleLine.charAt(0) === '(') {
        var tuplePart = sampleLine.substring(1, sampleLine.indexOf(')'));
        var tupleParts = tuplePart.split(',').map(function (s) { return s.trim(); });
        for (var tp = 1; tp < tupleParts.length; tp++) {
          if (/^cat-\d+:/i.test(tupleParts[tp])) {
            rowCategoryKeys.push(tupleParts[tp].split(':')[0].trim());
          }
        }
      }
    }

    return {
      headerRow: headerRow,
      dataStartRow: dataStartRow,
      colNames: colNames,
      colCategories: colCategories,
      rowCategoryKeys: rowCategoryKeys
    };
  }

  /**
   * Parse a row name that may be in tuple format:
   *   "(EGFR, cat-0: Kinase, cat-1: TK)"
   * Returns { name, cats: {key: value} }
   */
  function parseRowName(rawName) {
    rawName = rawName.trim();
    if (rawName.charAt(0) !== '(') return { name: rawName, cats: {} };
    var inner = rawName.substring(1, rawName.lastIndexOf(')'));
    var parts = inner.split(',').map(function (s) { return s.trim(); });
    var name = parts[0];
    var cats = {};
    for (var i = 1; i < parts.length; i++) {
      var colon = parts[i].indexOf(':');
      if (colon !== -1) {
        var key = parts[i].substring(0, colon).trim();
        var val = parts[i].substring(colon + 1).trim();
        cats[key] = val;
      }
    }
    return { name: name, cats: cats };
  }

  // ── Dendrogram → group arrays ────────────────────────────────────────────────

  /**
   * Convert a dendrogram tree (as returned by the clustering worker) into
   * per-leaf group arrays with `numLevels` levels, suitable for Clustergrammer's
   * interactive dendrogram threshold sliders.
   *
   * Each leaf gets an array of length `numLevels` where entry L is an integer
   * cluster ID at dendrogram cut level L (0 = all leaves in one cluster,
   * numLevels-1 = every leaf is its own cluster).
   *
   * @param {Object} dendrogram - Root node { index, height, left, right }
   * @param {number} numLevels
   * @returns {number[][]|null} groupArrays[leafPosition][level]
   */
  function dendrogramToGroupArrays(dendrogram, numLevels) {
    if (!dendrogram || numLevels < 1) return null;
    numLevels = numLevels || NUM_DENDROGRAM_LEVELS;

    var leafOrder = [];
    var allHeights = [];

    function collectOrderAndHeights(node) {
      if (!node) return;
      if (node.left === null && node.right === null) {
        leafOrder.push(node.index);
        return;
      }
      if (typeof node.height === 'number' && isFinite(node.height)) {
        allHeights.push(node.height);
      }
      collectOrderAndHeights(node.left);
      collectOrderAndHeights(node.right);
    }
    collectOrderAndHeights(dendrogram);

    var n = leafOrder.length;
    if (n === 0) return null;

    var uniqueHeights = allHeights.filter(function (h, idx, arr) {
      return arr.indexOf(h) === idx;
    });
    uniqueHeights.sort(function (a, b) { return b - a; });

    var maxHeight = uniqueHeights.length > 0 ? uniqueHeights[0] : 1;
    var minHeight = uniqueHeights.length > 0 ? uniqueHeights[uniqueHeights.length - 1] : 0;

    // A node's merge "happened below the cut" when node.height <= cutHeight,
    // meaning the two sub-clusters it joined are similar enough to stay together.
    function cutAtHeight(node, height, nextId) {
      if (!node) return { map: {}, nextId: nextId };
      if (node.left === null && node.right === null) {
        var m = {}; m[node.index] = nextId;
        return { map: m, nextId: nextId + 1 };
      }
      if (node.height <= height) {
        // This merge is at or below the cut: all leaves under this node form ONE cluster.
        var lRes = cutAtHeight(node.left, height, nextId);
        var rRes = cutAtHeight(node.right, height, nextId);
        var merged = {};
        Object.keys(lRes.map).forEach(function (k) { merged[k] = nextId; });
        Object.keys(rRes.map).forEach(function (k) { merged[k] = nextId; });
        return { map: merged, nextId: nextId + 1 };
      }
      // node.height > cutHeight: this merge is above the cut → split into sub-clusters.
      var lRes2 = cutAtHeight(node.left, height, nextId);
      var rRes2 = cutAtHeight(node.right, height, lRes2.nextId);
      var combined = {};
      Object.keys(lRes2.map).forEach(function (k) { combined[k] = lRes2.map[k]; });
      Object.keys(rRes2.map).forEach(function (k) { combined[k] = rRes2.map[k]; });
      return { map: combined, nextId: rRes2.nextId };
    }

    var groupArrays = [];
    for (var i = 0; i < n; i++) groupArrays.push(new Array(numLevels).fill(1));

    // uniqueHeights is sorted descending: [maxHeight, ..., minHeight]
    // Level 0 = finest (all leaves separate, cut below all merges).
    // Level numLevels-1 = coarsest (one cluster, cut above the root).
    // Intermediate levels interpolate cutHeight from minHeight up to maxHeight.
    for (var L = 0; L < numLevels; L++) {
      var cutHeight;
      if (L === 0) {
        // Cut below every merge → every leaf is its own cluster.
        cutHeight = minHeight - 1e-9;
      } else if (L === numLevels - 1) {
        // Cut above the root → everything in one cluster.
        cutHeight = maxHeight + 1e-9;
      } else {
        // Interpolate ascending: L=1 picks near minHeight, L=numLevels-2 picks near maxHeight.
        // uniqueHeights[u] = minHeight, uniqueHeights[0] = maxHeight → pick from end toward start.
        var u = uniqueHeights.length - 1;
        var idx = Math.round((L - 1) / (numLevels - 2) * u);
        cutHeight = uniqueHeights[u - Math.min(idx, u)];
      }
      var result = cutAtHeight(dendrogram, cutHeight, 1);
      for (var ii = 0; ii < n; ii++) {
        var leafIdx = leafOrder[ii];
        groupArrays[ii][L] = (result.map[leafIdx] !== undefined) ? result.map[leafIdx] : 1;
      }
    }
    return groupArrays;
  }

  // ── Network data builder ─────────────────────────────────────────────────────

  /**
   * Build a complete Clustergrammer network_data object from an already-ordered
   * matrix, optionally including dendrograms and pre-parsed category annotations.
   *
   * This is the JS equivalent of clustergrammer-py's Network.cluster() +
   * write_json_to_file('viz', ...).
   *
   * @param {Object} orderedMatrix
   *   { mat: number[][], rowNames: string[], colNames: string[] }
   *   The matrix is already in cluster (display) order.
   *
   * @param {Object|null} rowDendrogram  - Tree returned by the clustering worker.
   * @param {Object|null} colDendrogram
   *
   * @param {Object} [opts]
   *   opts.distLabel    {string}   - e.g. 'cos', 'cor', 'euc' (for view dist field)
   *   opts.colCategories {Array}   - [{title, values}] from parseCategories
   *   opts.rowCategories {Object[]} - [{cats: {key: val}, ...}] aligned to mat rows
   *   opts.applyZscore  {boolean}  - if true, z-score rows before building network
   *
   * @returns {Object} network_data compatible with Clustergrammer.js
   */
  function buildNetworkDataWithViews(orderedMatrix, rowDendrogram, colDendrogram, opts) {
    opts = opts || {};
    var distLabel     = opts.distLabel     || 'cos';
    var colCategories = opts.colCategories || [];
    var rowCategories = opts.rowCategories || [];
    var applyZscore   = opts.applyZscore   !== undefined ? opts.applyZscore : false;

    var rawMat   = orderedMatrix.mat;
    var rowNames = orderedMatrix.rowNames;
    var colNames = orderedMatrix.colNames;
    var numRows  = rowNames.length;
    var numCols  = colNames.length;

    // Sanitize matrix values.
    var mat = [];
    for (var ri = 0; ri < numRows; ri++) {
      var srcRow = rawMat[ri];
      var outRow = new Array(numCols);
      for (var ci = 0; ci < numCols; ci++) {
        var v = Number(srcRow[ci]);
        outRow[ci] = isFinite(v) ? v : 0;
      }
      mat.push(outRow);
    }

    if (applyZscore) {
      mat = zScoreMatrix(mat);
    }

    // ── Compute sum and variance rank for each row ──────────────────────────

    var rowAbsSums = new Array(numRows);
    var rowVars    = new Array(numRows);
    for (var r = 0; r < numRows; r++) {
      rowAbsSums[r] = computeAbsSum(mat[r]);
      rowVars[r]    = computeVariance(mat[r]);
    }

    // rank[i]    = position of row i when rows are sorted by |sum| descending
    // rankvar[i] = position of row i when rows are sorted by variance descending
    var sumSortedIndices = argSortDesc(rowAbsSums); // [idxWithHighestSum, ...]
    var varSortedIndices = argSortDesc(rowVars);

    var rowRank    = new Array(numRows);
    var rowRankVar = new Array(numRows);
    for (var pos = 0; pos < numRows; pos++) {
      rowRank[sumSortedIndices[pos]]    = pos;
      rowRankVar[varSortedIndices[pos]] = pos;
    }

    // ── Compute sum rank for columns ────────────────────────────────────────

    var colAbsSums = new Array(numCols);
    for (var c = 0; c < numCols; c++) {
      var csum = 0;
      for (var r2 = 0; r2 < numRows; r2++) csum += Math.abs(mat[r2][c]);
      colAbsSums[c] = csum;
    }
    var colSumSorted = argSortDesc(colAbsSums);
    var colRank = new Array(numCols);
    for (var cp = 0; cp < numCols; cp++) colRank[colSumSorted[cp]] = cp;

    // ── Build dendrogram group arrays ───────────────────────────────────────

    var defaultGroup   = new Array(NUM_DENDROGRAM_LEVELS).fill(1);
    var rowGroupArrays = rowDendrogram ? dendrogramToGroupArrays(rowDendrogram, NUM_DENDROGRAM_LEVELS) : null;
    var colGroupArrays = colDendrogram ? dendrogramToGroupArrays(colDendrogram, NUM_DENDROGRAM_LEVELS) : null;

    // ── Build row_nodes ─────────────────────────────────────────────────────

    var rowNodes = rowNames.map(function (rawName, i) {
      var parsed = parseRowName(rawName);
      var node = {
        name:    parsed.name,
        clust:   i,
        rank:    rowRank[i],
        rankvar: rowRankVar[i],
        ini:     numRows - i,
        group:   rowGroupArrays && rowGroupArrays[i] ? rowGroupArrays[i].slice() : defaultGroup.slice()
      };
      // Attach any row-level categories from tuple parsing.
      var rowCat = rowCategories[i];
      if (rowCat && rowCat.cats) {
        Object.keys(rowCat.cats).forEach(function (key) {
          node[key] = rowCat.cats[key];
        });
      }
      return node;
    });

    // ── Build col_nodes ─────────────────────────────────────────────────────

    var colNodes = colNames.map(function (name, i) {
      var node = {
        name:    name,
        clust:   i,
        rank:    colRank[i],
        rankvar: i,
        ini:     numCols - i,
        group:   colGroupArrays && colGroupArrays[i] ? colGroupArrays[i].slice() : defaultGroup.slice()
      };
      // Attach column categories.
      colCategories.forEach(function (cat) {
        if (cat.values && cat.values[i] !== undefined) {
          node[cat.title] = cat.values[i];
        }
      });
      return node;
    });

    // ── Build views array ───────────────────────────────────────────────────
    // Mirrors clustergrammer-py's views=['N_row_sum', 'N_row_var']:
    //   One 'all' view + filtered views at each threshold for both sum and var.

    var views = [
      {
        N_row_sum: 'all',
        N_row_var: 'all',
        dist: distLabel,
        nodes: { row_nodes: rowNodes, col_nodes: colNodes }
      }
    ];

    VIEW_THRESHOLDS.forEach(function (N) {
      if (numRows > N) {
        // Top N rows by absolute sum (in cluster order).
        var topNBySum = rowNodes.filter(function (nd) { return nd.rank < N; });
        views.push({
          N_row_sum: N,
          dist: distLabel,
          nodes: { row_nodes: topNBySum, col_nodes: colNodes }
        });

        // Top N rows by variance (in cluster order).
        var topNByVar = rowNodes.filter(function (nd) { return nd.rankvar < N; });
        views.push({
          N_row_var: N,
          dist: distLabel,
          nodes: { row_nodes: topNByVar, col_nodes: colNodes }
        });
      }
    });

    return {
      mat:       mat,
      row_nodes: rowNodes,
      col_nodes: colNodes,
      links:     [],
      views:     views
    };
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  global.ClustergrammerNetwork = {
    buildNetworkDataWithViews: buildNetworkDataWithViews,
    dendrogramToGroupArrays:   dendrogramToGroupArrays,
    zScoreMatrix:              zScoreMatrix,
    parseCategories:           parseCategories,
    parseRowName:              parseRowName,
    VIEW_THRESHOLDS:           VIEW_THRESHOLDS
  };

}(typeof window !== 'undefined' ? window : this));
