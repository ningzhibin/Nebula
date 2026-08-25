// KNN imputation worker source.
// Loaded via <script src="..."> so it works on Chrome with file:// URLs.
// index.html reads window._imputationWorkerSrc and creates a Blob Worker from it.
window._imputationWorkerSrc = `
function _isMissing(v, zeroIsMissing) {
    return v === null || isNaN(v) || (zeroIsMissing && v === 0);
}

function _transposeMatrix(m) {
    var rows = m.length, cols = rows > 0 ? m[0].length : 0;
    var t = [];
    for (var j = 0; j < cols; j++) {
        t[j] = [];
        for (var i = 0; i < rows; i++) t[j][i] = m[i][j];
    }
    return t;
}

function _medianOf(values) {
    if (values.length === 0) return NaN;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return (sorted.length % 2 === 0) ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Precompute the per-column fallback values used when no neighbor has an
// observed value for a cell. "Column" = the working-matrix orientation
// (samples when axis=row, features when axis=column).
function _columnFallbacks(M, zeroIsMissing, fallback) {
    var rows = M.length, cols = rows > 0 ? M[0].length : 0;
    var observed = [];
    var globalMin = Infinity;
    var i, j, v;
    for (j = 0; j < cols; j++) observed.push([]);
    for (i = 0; i < rows; i++) {
        for (j = 0; j < cols; j++) {
            v = M[i][j];
            if (!_isMissing(v, zeroIsMissing)) {
                observed[j].push(v);
                if (v < globalMin) globalMin = v;
            }
        }
    }
    if (!isFinite(globalMin)) globalMin = 0;
    var fallbacks = new Array(cols);
    for (j = 0; j < cols; j++) {
        if (fallback === 'columnMean') {
            var sum = 0;
            for (i = 0; i < observed[j].length; i++) sum += observed[j][i];
            fallbacks[j] = observed[j].length > 0 ? sum / observed[j].length : 0;
        } else if (fallback === 'globalMin') {
            fallbacks[j] = globalMin;
        } else if (fallback === 'zero') {
            fallbacks[j] = 0;
        } else { // columnMedian
            var med = _medianOf(observed[j]);
            fallbacks[j] = isNaN(med) ? 0 : med;
        }
    }
    return fallbacks;
}

// Distance between two working-matrix rows, computed over columns where both
// are observed. Returns { dist, shared } with dist=Infinity when unusable.
function _rowDistance(M, a, b, zeroIsMissing, metric) {
    var cols = M[0].length;
    var sumSq = 0, sumAbs = 0, shared = 0;
    var sumA = 0, sumB = 0, sumA2 = 0, sumB2 = 0, sumAB = 0;
    for (var c = 0; c < cols; c++) {
        var v1 = M[a][c], v2 = M[b][c];
        if (_isMissing(v1, zeroIsMissing) || _isMissing(v2, zeroIsMissing)) continue;
        shared++;
        var d = v1 - v2;
        sumSq += d * d;
        sumAbs += Math.abs(d);
        sumA += v1; sumB += v2;
        sumA2 += v1 * v1; sumB2 += v2 * v2;
        sumAB += v1 * v2;
    }
    if (shared === 0) return { dist: Infinity, shared: 0 };
    var dist;
    if (metric === 'manhattan') {
        dist = sumAbs / shared;
    } else if (metric === 'pearson') {
        if (shared < 2) return { dist: Infinity, shared: shared };
        var meanA = sumA / shared, meanB = sumB / shared;
        var cov = sumAB - shared * meanA * meanB;
        var varA = sumA2 - shared * meanA * meanA;
        var varB = sumB2 - shared * meanB * meanB;
        if (varA === 0 && varB === 0) dist = 0;
        else if (varA === 0 || varB === 0) dist = 1;
        else dist = Math.max(0, 1 - cov / Math.sqrt(varA * varB));
    } else if (metric === 'cosine') {
        var normA = Math.sqrt(sumA2), normB = Math.sqrt(sumB2);
        if (normA === 0 || normB === 0) dist = 1;
        else dist = Math.max(0, 1 - sumAB / (normA * normB));
    } else { // euclidean
        dist = Math.sqrt(sumSq / shared);
    }
    return { dist: dist, shared: shared };
}

// Sequential KNN imputation (SeqKNN; Kim, Golub & Kim, Bioinformatics 2004).
// Rows are imputed one at a time, starting from the row with the fewest missing
// values. Each row is imputed from the current pool of "complete" rows (rows
// with no missing values), and once imputed it is itself added to that pool so
// later, more-missing rows can borrow from it. Distances/neighbor values are
// therefore read from the progressively-filled matrix, not a frozen original.
function knnImpute(matrix, k, zeroIsMissing, opts) {
    opts = opts || {};
    var metric = opts.metric || 'euclidean';
    var minShared = Math.max(1, Number(opts.minShared) || 1);
    var fallback = opts.fallback || 'columnMedian';
    var weight = opts.weight || 'inverse';
    var axis = opts.axis || 'row';
    // Rows whose missing fraction exceeds this are left un-imputed (SeqKNN/impute.knn "rowmax").
    // Values >= 1 (default) mean "impute every row".
    var maxMissingFrac = (opts.maxMissingFrac === undefined || opts.maxMissingFrac === null)
        ? 1 : Number(opts.maxMissingFrac);
    if (!isFinite(maxMissingFrac)) maxMissingFrac = 1;
    // Per-group cap: a row is skipped if ANY group's within-group missing fraction exceeds this.
    // Only applied when a per-column group mapping is provided and the axis is features (rows).
    var maxMissingFracPerGroup = (opts.maxMissingFracPerGroup === undefined || opts.maxMissingFracPerGroup === null)
        ? 1 : Number(opts.maxMissingFracPerGroup);
    if (!isFinite(maxMissingFracPerGroup)) maxMissingFracPerGroup = 1;

    var M = matrix;
    var transposed = false;
    if (axis === 'column') {
        M = _transposeMatrix(matrix);
        transposed = true;
    }
    var rows = M.length;
    var cols = rows > 0 ? M[0].length : 0;
    var imputed = M.map(function (r) { return r.slice(); });
    var fallbacks = _columnFallbacks(M, zeroIsMissing, fallback);

    var i, j, m;

    // Build per-group column index lists for the per-group cap. Only valid when the working
    // matrix keeps its original column orientation (axis = features/rows), because the
    // supplied group keys are aligned to the original sample columns.
    var groups = null; // array of arrays of column indices, one per distinct group key
    if (!transposed && maxMissingFracPerGroup < 1 &&
        Array.isArray(opts.columnGroups) && opts.columnGroups.length === cols) {
        var byKey = {};
        var groupList = [];
        for (j = 0; j < cols; j++) {
            var gkey = String(opts.columnGroups[j]);
            if (!byKey.hasOwnProperty(gkey)) { byKey[gkey] = []; groupList.push(byKey[gkey]); }
            byKey[gkey].push(j);
        }
        groups = groupList;
    }

    // Split rows into complete (no missing) and incomplete; record missing counts.
    // Rows over the maxMissingFrac cap (or the per-group cap) are skipped: not imputed and
    // never used as donors.
    var complete = [];              // pool of donor row indices (grows during the run)
    var incomplete = [];            // { row, missing } for each row that needs imputing
    var skippedRows = 0;
    var missThreshold = cols > 0 ? maxMissingFrac * cols : 0;
    for (i = 0; i < rows; i++) {
        var miss = 0;
        for (j = 0; j < cols; j++) {
            if (_isMissing(imputed[i][j], zeroIsMissing)) miss++;
        }
        if (miss === 0) {
            complete.push(i);
            continue;
        }
        var overRowCap = (maxMissingFrac < 1 && miss > missThreshold);
        var overGroupCap = false;
        if (!overRowCap && groups) {
            for (var g = 0; g < groups.length; g++) {
                var gIdx = groups[g];
                if (gIdx.length === 0) continue;
                var gMiss = 0;
                for (var gc = 0; gc < gIdx.length; gc++) {
                    if (_isMissing(imputed[i][gIdx[gc]], zeroIsMissing)) gMiss++;
                }
                if (gMiss > maxMissingFracPerGroup * gIdx.length) { overGroupCap = true; break; }
            }
        }
        if (overRowCap || overGroupCap) {
            skippedRows++;          // too sparse (overall or within a group) -> leave untouched
        } else {
            incomplete.push({ row: i, missing: miss });
        }
    }

    // Sequential order: fewest missing first (ties broken by original row index).
    incomplete.sort(function (a, b) {
        return (a.missing - b.missing) || (a.row - b.row);
    });

    var totalMissingRows = incomplete.length;
    var progressEvery = Math.max(1, Math.floor(totalMissingRows / 20));

    for (var s = 0; s < incomplete.length; s++) {
        i = incomplete[s].row;

        // Find the k nearest donors among the current complete pool.
        var candidates = [];
        for (var p = 0; p < complete.length; p++) {
            m = complete[p];
            var d = _rowDistance(imputed, i, m, zeroIsMissing, metric);
            if (d.shared >= minShared && isFinite(d.dist)) {
                candidates.push({ row: m, dist: d.dist });
            }
        }
        candidates.sort(function (a, b) { return a.dist - b.dist; });
        var neighbors = candidates.slice(0, Math.min(k, candidates.length));

        for (j = 0; j < cols; j++) {
            if (!_isMissing(imputed[i][j], zeroIsMissing)) continue;
            var numerator = 0;
            var denominator = 0;
            for (var n = 0; n < neighbors.length; n++) {
                var nVal = imputed[neighbors[n].row][j];
                if (_isMissing(nVal, zeroIsMissing)) continue; // donors are complete, but guard anyway
                var w;
                if (weight === 'uniform') w = 1;
                else if (weight === 'rank') w = 1 / (n + 1);
                else w = 1 / Math.max(neighbors[n].dist, 1e-8);
                numerator += nVal * w;
                denominator += w;
            }
            imputed[i][j] = denominator > 0 ? numerator / denominator : fallbacks[j];
        }

        // This row is now fully filled: promote it into the donor pool for later rows.
        complete.push(i);

        var done = s + 1;
        if (done % progressEvery === 0 || done === totalMissingRows) {
            self.postMessage({
                type: 'progress',
                progress: totalMissingRows > 0 ? done / totalMissingRows : 1,
                message: 'Sequential KNN: ' + done + ' / ' + totalMissingRows + ' rows imputed'
            });
        }
    }

    var result = transposed ? _transposeMatrix(imputed) : imputed;
    self.postMessage({ type: 'result', imputedMatrix: result, skippedRows: skippedRows });
}

self.onmessage = function (e) {
    if (e.data && e.data.type === 'knn') {
        try {
            var d = e.data.data;
            knnImpute(d.matrix, d.k, !!d.zeroIsMissing, d.opts);
        } catch (err) {
            self.postMessage({ type: 'result', imputedMatrix: null, error: err.message });
        }
    }
};
`;
