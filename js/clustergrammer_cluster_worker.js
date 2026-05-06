/**
 * clustergrammer_cluster_worker.js  — dual-purpose (same pattern as index.html)
 *
 * When loaded via <script src> → sets window._clusterWorkerSrc for Blob Worker creation.
 * When instantiated as a Blob Worker → calls workerMain() directly.
 *
 * Optimisations over the naive O(n³ × cols) algorithm:
 *   1. Flat Float32Array distance matrix (n×n) — CPU-cache friendly, ½ the memory of Float64.
 *   2. Lance-Williams update formula — after merging clusters i and j, each remaining
 *      distance is updated in O(n) using cluster sizes; NO recomputation from raw data.
 *      Total merge-phase cost: O(n²) updates instead of O(n² × n × cols).
 *   3. Progress messages sent via postMessage every 1 % of merges.
 *   4. No hard row/column size limit — always runs real hierarchical clustering.
 *      (Pre-filter rows first if memory is a concern: n=3000 → 36 MB, n=5000 → 100 MB.)
 */
(function () {

  function workerMain() {

    // ── Utility ───────────────────────────────────────────────────────────────

    function computeVariance(arr) {
      var n = arr.length; if (!n) return 0;
      var s = 0; for (var i = 0; i < n; i++) s += arr[i];
      var m = s / n, sq = 0;
      for (var j = 0; j < n; j++) { var d = arr[j] - m; sq += d * d; }
      return sq / n;
    }

    function computeAbsSum(arr) {
      var s = 0; for (var i = 0; i < arr.length; i++) s += Math.abs(arr[i]); return s;
    }

    function argSortDesc(vals) {
      var idx = vals.map(function (_, i) { return i; });
      idx.sort(function (a, b) { return vals[b] - vals[a]; });
      return idx;
    }

    // ── Distance functions ────────────────────────────────────────────────────

    function cosineDist(a, b) {
      var dot = 0, na = 0, nb = 0;
      for (var i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
      var denom = Math.sqrt(na) * Math.sqrt(nb);
      return denom === 0 ? 1 : 1 - Math.max(-1, Math.min(1, dot / denom));
    }

    function correlationDist(a, b) {
      var n = a.length; if (!n) return 1;
      var ma = 0, mb = 0;
      for (var i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
      ma /= n; mb /= n;
      var num = 0, da2 = 0, db2 = 0;
      for (var j = 0; j < n; j++) {
        var da = a[j]-ma, db = b[j]-mb;
        num += da*db; da2 += da*da; db2 += db*db;
      }
      var denom = Math.sqrt(da2) * Math.sqrt(db2);
      return denom === 0 ? 1 : 1 - Math.max(-1, Math.min(1, num / denom));
    }

    function euclideanDist(a, b) {
      var s = 0;
      for (var i = 0; i < a.length; i++) { var d = a[i]-b[i]; s += d*d; }
      return Math.sqrt(s);
    }

    function getDistFn(t) {
      if (t === 'correlation') return correlationDist;
      if (t === 'euclidean')   return euclideanDist;
      return cosineDist;
    }

    // ── Optimised hierarchical clustering ─────────────────────────────────────
    // Uses Lance-Williams update formula so each merge step is O(n) — no
    // re-reading of raw data after the initial O(n² × cols) distance build.
    // Memory: one flat Float32Array of size n×n.
    //
    // onProgress(pct 0..1, message) — called ~100 times during the run.

    function hierarchicalClustering(data, distType, linkageType, onProgress) {
      var n = data.length;
      if (n === 0) return { order: [], dendrogram: null };
      if (n === 1) return {
        order: [0],
        dendrogram: { index: 0, height: 0, left: null, right: null }
      };

      var distFn = getDistFn(distType);

      // ── Build distance matrix ─────────────────────────────────────────────
      // n×n flat Float32Array; diagonal = Infinity to prevent self-merge.
      var D = new Float32Array(n * n);
      for (var p = 0; p < n; p++) D[p * n + p] = Infinity;
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          var d = distFn(data[i], data[j]);
          D[i * n + j] = d;
          D[j * n + i] = d;
        }
      }
      if (onProgress) onProgress(0.05, 'Building distance matrix… done');

      // ── Active set & sizes ────────────────────────────────────────────────
      var active = new Uint8Array(n); active.fill(1);
      var size   = new Float32Array(n); size.fill(1);

      // ── Dendrogram nodes ──────────────────────────────────────────────────
      var nodes = new Array(n);
      for (var k = 0; k < n; k++)
        nodes[k] = { index: k, height: 0, left: null, right: null };
      var nextIdx = n;

      var totalMerges = n - 1;
      var reportEvery = Math.max(1, Math.floor(totalMerges / 100));

      // ── Main merge loop ───────────────────────────────────────────────────
      for (var step = 0; step < totalMerges; step++) {

        // Find minimum distance pair among active clusters
        var minDist = Infinity, minI = -1, minJ = -1;
        for (var ii = 0; ii < n; ii++) {
          if (!active[ii]) continue;
          var base = ii * n;
          for (var jj = ii + 1; jj < n; jj++) {
            if (!active[jj]) continue;
            if (D[base + jj] < minDist) {
              minDist = D[base + jj]; minI = ii; minJ = jj;
            }
          }
        }

        // Create merged dendrogram node (kept at index minI)
        nodes[minI] = {
          index: nextIdx++, height: minDist,
          left: nodes[minI], right: nodes[minJ]
        };

        // Lance-Williams distance update — O(n), no re-read of raw data
        var si = size[minI], sj = size[minJ], sij = si + sj;
        for (var kk = 0; kk < n; kk++) {
          if (!active[kk] || kk === minI || kk === minJ) continue;
          var dik = D[minI * n + kk];
          var djk = D[minJ * n + kk];
          var nd;
          if      (linkageType === 'single')   nd = dik < djk ? dik : djk;
          else if (linkageType === 'complete') nd = dik > djk ? dik : djk;
          else                                 nd = (si * dik + sj * djk) / sij; // average
          D[minI * n + kk] = nd;
          D[kk * n + minI] = nd;
        }
        D[minI * n + minI] = Infinity;
        size[minI] = sij;
        active[minJ] = 0;

        // Progress reporting
        if (onProgress && (step % reportEvery === 0 || step === totalMerges - 1)) {
          var pct = 0.05 + (step / totalMerges) * 0.95;
          onProgress(pct, 'Clustering ' + (step + 1) + ' / ' + totalMerges + ' merges…');
        }
      }

      // ── In-order traversal → leaf order ──────────────────────────────────
      var root = null;
      for (var r = 0; r < n; r++) { if (active[r]) { root = nodes[r]; break; } }
      var order = [];
      function traverse(nd) {
        if (!nd) return;
        if (nd.left === null && nd.right === null) { order.push(nd.index); return; }
        traverse(nd.left); traverse(nd.right);
      }
      traverse(root);
      return { order: order, dendrogram: root };
    }

    // ── Message handler ───────────────────────────────────────────────────────

    self.onmessage = function (e) {
      var data = e.data || {}, mat = data.mat;
      if (!mat || !mat.length || !mat[0].length) {
        self.postMessage({ error: 'Matrix is empty or invalid.' }); return;
      }

      var numRows = mat.length, numCols = mat[0].length;
      var options     = data.options || {};
      var distType    = options.distType    || 'cosine';
      var linkageType = options.linkageType || 'average';

      // Pre-filter: keep only top-N rows by variance if explicitly requested
      var rowScores = new Array(numRows);
      for (var r = 0; r < numRows; r++) rowScores[r] = computeVariance(mat[r]);

      var rowKeepIndices;
      if (options.prefilterN > 0 && options.prefilterN < numRows) {
        rowKeepIndices = argSortDesc(rowScores).slice(0, options.prefilterN);
      } else {
        rowKeepIndices = [];
        for (var i = 0; i < numRows; i++) rowKeepIndices[i] = i;
      }

      var keptData = rowKeepIndices.map(function (ri) { return mat[ri]; });
      var keptN    = keptData.length;

      // Sum/variance rank orders (used by multi-view filtering)
      var keptAbsSums = keptData.map(computeAbsSum);
      var keptVars    = keptData.map(computeVariance);
      var rowSumOrder = argSortDesc(keptAbsSums);
      var rowVarOrder = argSortDesc(keptVars);

      var colAbsSums = new Array(numCols);
      for (var c = 0; c < numCols; c++) {
        var cs = 0;
        for (var r2 = 0; r2 < numRows; r2++) cs += Math.abs(mat[r2][c]);
        colAbsSums[c] = cs;
      }
      var colSumOrder = argSortDesc(colAbsSums);

      // Build column data (transposed rows)
      var colData = [];
      for (var c2 = 0; c2 < numCols; c2++) {
        var col = new Array(keptN);
        for (var row = 0; row < keptN; row++) col[row] = mat[rowKeepIndices[row]][c2];
        colData.push(col);
      }

      // ── Row clustering ────────────────────────────────────────────────────
      self.postMessage({
        type: 'progress', axis: 'row', percent: 0,
        message: 'Computing row distances (' + keptN + ' rows × ' + numCols + ' cols)…'
      });

      var rowResult = hierarchicalClustering(keptData, distType, linkageType,
        function (pct, msg) {
          self.postMessage({ type: 'progress', axis: 'row', percent: pct * 65, message: 'Rows: ' + msg });
        });

      // ── Column clustering ─────────────────────────────────────────────────
      self.postMessage({
        type: 'progress', axis: 'col', percent: 65,
        message: 'Clustering columns (' + numCols + ')…'
      });

      var colResult = hierarchicalClustering(colData, distType, linkageType,
        function (pct, msg) {
          self.postMessage({ type: 'progress', axis: 'col', percent: 65 + pct * 33, message: 'Cols: ' + msg });
        });

      self.postMessage({
        rowOrder: rowResult.order, rowKeepIndices: rowKeepIndices, colOrder: colResult.order,
        rowSumOrder: rowSumOrder, rowVarOrder: rowVarOrder, colSumOrder: colSumOrder,
        rowDendrogram: rowResult.dendrogram, colDendrogram: colResult.dendrogram,
        rowUsedRealClustering: true, colUsedRealClustering: true,
        usedRealClustering: true, distType: distType, linkageType: linkageType,
        numRows: numRows, numCols: numCols
      });
    };

  } // end workerMain

  // ── Dispatch ──────────────────────────────────────────────────────────────

  if (typeof window !== 'undefined') {
    window._clusterWorkerSrc = '(' + workerMain.toString() + ')()';
  } else {
    workerMain();
  }

}());
