/*
 * Batch Effect Detection & Correction for Nebula
 * Detection: per-feature batch R2 (one-way ANOVA on log10 intensities), per-batch
 * silhouette, PCA with PC-batch association, per-batch distribution stats.
 * Correction: covariate-aware median/mean centering and ComBat (location + scale
 * with optional empirical-Bayes shrinkage). Local PCA keeps the tab dependency-free.
 */

var batchEffectApplied = false;
var batchEffectMethod = null;
var batchEffectOriginalMatrix = null;
var batchEffectOriginalHeaders = null;
var batchEffectBatchCol = null;
var batchEffectBioCol = null;
var batchEffectParametric = true;
var batchEffectValueScale = 'auto';
var batchEffectResolvedScale = null;
// True when a correction was applied and then invalidated by a matrix mutation:
// the corrected values stay in the matrix but can no longer be reverted.
var batchEffectUnrevertible = false;
var batchEffectBeforeMetrics = null;
var batchEffectAfterMetrics = null;

var BATCH_EFFECT_PALETTE = ['#6366f1', '#f59e0b', '#14b8a6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];
// A feature at or above this R2 is called "batch-dominated" in the KPIs.
var BATCH_EFFECT_R2_HIGH = 0.3;
// Pre-correction matrices larger than this stay out of session snapshots.
var BATCH_EFFECT_SESSION_ORIGINAL_MAX_CELLS = 300000;

// ---- State access -------------------------------------------------------
// currentData/metaData are lexical globals declared in index.html; the window.*
// mirrors are a convenience bridge, so prefer the lexical bindings.

function _batchMetaTable() {
    try { if (typeof metaData !== 'undefined' && metaData) return metaData; } catch (_) {}
    try { return window.metaData || null; } catch (_) {}
    return null;
}

function _batchCurrentData() {
    try { if (typeof currentData !== 'undefined' && currentData) return currentData; } catch (_) {}
    try { return window.currentData || null; } catch (_) {}
    return null;
}

// ---- Small numeric helpers ---------------------------------------------

function _deepCopy(m) { return m.map(function (r) { return r.slice(); }); }

function _medianSorted(sorted) {
    var n = sorted.length;
    if (n === 0) return 0;
    var mid = Math.floor(n / 2);
    return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function _sortedNumbers(values) {
    return values.slice().sort(function (a, b) { return a - b; });
}

function _meanOf(values) {
    if (!values.length) return 0;
    var s = 0;
    for (var i = 0; i < values.length; i++) s += values[i];
    return s / values.length;
}

function _sdOf(values, mean) {
    if (values.length < 2) return 0;
    var s = 0;
    for (var i = 0; i < values.length; i++) s += (values[i] - mean) * (values[i] - mean);
    return Math.sqrt(Math.max(s / (values.length - 1), 0));
}

function _isObserved(v) { return v !== null && v !== undefined && !isNaN(v) && v > 0; }

// ---- Value scale --------------------------------------------------------
// Omics intensities are multiplicative, so batch shifts/scales must be modelled
// in log space; already-logged matrices need the identity scale instead.

function _batchWorkScale(matrix, requested) {
    if (requested === 'log10' || requested === 'raw') return requested;
    var observed = 0, above100 = 0;
    var rowLimit = Math.min(matrix.length, 200);
    for (var r = 0; r < rowLimit; r++) {
        var row = matrix[r];
        for (var c = 0; c < row.length; c++) {
            var v = row[c];
            if (!_isObserved(v)) continue;
            observed++;
            if (v > 100) above100++;
        }
    }
    if (!observed) return 'raw';
    return (above100 / observed) > 0.5 ? 'log10' : 'raw';
}

function _batchToWork(v, mode) { return mode === 'log10' ? Math.log10(v) : v; }

function _batchFromWork(x, mode) { return mode === 'log10' ? Math.pow(10, x) : x; }

function _batchScaleLabel(mode) { return mode === 'log10' ? 'log10' : 'raw'; }

// ---- Metadata -> per-column assignments --------------------------------

function _sampleValuesForMetaCol(colName) {
    var meta = _batchMetaTable();
    var cd = _batchCurrentData();
    if (!meta || !Array.isArray(meta.headers) || !Array.isArray(meta.rows)) return { error: 'No metadata loaded.', values: null, missing: 0 };
    if (!cd || !Array.isArray(cd.columnHeaders)) return { error: 'No data matrix loaded.', values: null, missing: 0 };
    var hIdx = meta.headers.indexOf(colName);
    if (hIdx < 0) return { error: 'Column "' + colName + '" not found in metadata.', values: null, missing: 0 };
    var sampleColIdx = meta.headers.indexOf('Sample_ID');
    if (sampleColIdx < 0) sampleColIdx = 0;
    // Metadata rows are objects keyed by header (parseMetaData / meta editor);
    // older snapshots may still hold positional arrays, so accept both.
    var sampleKey = String(meta.headers[sampleColIdx] || '').trim();
    var valueKey = String(meta.headers[hIdx] || '').trim();
    var map = {};
    for (var i = 0; i < meta.rows.length; i++) {
        var row = meta.rows[i];
        var sid, val;
        if (Array.isArray(row)) { sid = row[sampleColIdx]; val = row[hIdx]; }
        else if (row) { sid = row[sampleKey]; val = row[valueKey]; }
        sid = String(sid == null ? '' : sid).trim();
        if (sid) map[sid] = String(val == null ? '' : val).trim();
    }
    var values = new Array(cd.columnHeaders.length);
    var missing = 0;
    for (var c = 0; c < cd.columnHeaders.length; c++) {
        var name = String(cd.columnHeaders[c]).trim();
        var v = Object.prototype.hasOwnProperty.call(map, name) ? map[name] : '';
        if (!v) { missing++; values[c] = '(unassigned)'; }
        else values[c] = v;
    }
    return { error: null, values: values, missing: missing };
}

function _getBatchAssignments(batchCol) {
    var res = _sampleValuesForMetaCol(batchCol);
    if (res.error) return { error: res.error, batchIndices: new Map(), batchNames: [], unassigned: 0 };
    var batchIndices = new Map();
    for (var c = 0; c < res.values.length; c++) {
        var b = res.values[c];
        if (!batchIndices.has(b)) batchIndices.set(b, []);
        batchIndices.get(b).push(c);
    }
    var batchNames = [];
    batchIndices.forEach(function (_, name) { batchNames.push(name); });
    return { batchIndices: batchIndices, batchNames: batchNames, error: null, unassigned: res.missing };
}

function _colBatchArray(batchIndices, cols) {
    var colBatch = new Array(cols);
    batchIndices.forEach(function (indices, name) {
        for (var k = 0; k < indices.length; k++) colBatch[indices[k]] = name;
    });
    for (var c = 0; c < cols; c++) if (colBatch[c] === undefined) colBatch[c] = '(unassigned)';
    return colBatch;
}

function _batchNameIndex(batchNames) {
    var map = {};
    for (var i = 0; i < batchNames.length; i++) map[batchNames[i]] = i;
    return map;
}

// ---- Simplified PCA -----------------------------------------------------
// The covariance matrix is samples x samples (columns), so its eigenvectors live
// in sample space and a sample score is eigenvector * sqrt(eigenvalue).

function runSimplifiedPCA(matrix, nComponents) {
    if (!nComponents) nComponents = 2;
    var rows = matrix.length, cols = rows > 0 ? matrix[0].length : 0;
    if (cols < 2 || rows < 2) return { scores: [], varianceExplained: [] };
    var centered = new Array(rows);
    for (var r = 0; r < rows; r++) centered[r] = new Array(cols);
    for (var c = 0; c < cols; c++) {
        var sum = 0, count = 0;
        for (var r = 0; r < rows; r++) {
            var v = matrix[r][c];
            if (v !== null && v !== undefined && !isNaN(v)) { sum += v; count++; }
        }
        var mean = count > 0 ? sum / count : 0;
        for (var r = 0; r < rows; r++) {
            var raw = matrix[r][c];
            centered[r][c] = (raw !== null && raw !== undefined && !isNaN(raw)) ? raw - mean : 0;
        }
    }
    var cov = new Array(cols);
    for (var i = 0; i < cols; i++) { cov[i] = new Array(cols); for (var j = 0; j < cols; j++) cov[i][j] = 0; }
    for (var i = 0; i < cols; i++) {
        for (var j = i; j < cols; j++) {
            var s = 0;
            for (var r = 0; r < rows; r++) s += centered[r][i] * centered[r][j];
            cov[i][j] = cov[j][i] = rows > 1 ? s / (rows - 1) : s;
        }
    }
    var eigVals = new Array(cols), eigVecs = new Array(cols);
    for (var i = 0; i < cols; i++) {
        eigVals[i] = 0;
        eigVecs[i] = new Array(cols);
        for (var j = 0; j < cols; j++) eigVecs[i][j] = i === j ? 1 : 0;
    }
    var maxIter = Math.max(100, Math.min(4000, cols * 25));
    for (var iter = 0; iter < maxIter; iter++) {
        var maxVal = 0, p = 0, q = 1;
        for (var i = 0; i < cols; i++) {
            for (var j = i + 1; j < cols; j++) {
                var abs = Math.abs(cov[i][j]);
                if (abs > maxVal) { maxVal = abs; p = i; q = j; }
            }
        }
        if (maxVal < 1e-10) break;
        var theta = 0.5 * Math.atan2(2 * cov[p][q], cov[q][q] - cov[p][p]);
        var cosT = Math.cos(theta), sinT = Math.sin(theta);
        var cpp = cosT * cosT * cov[p][p] - 2 * sinT * cosT * cov[p][q] + sinT * sinT * cov[q][q];
        var cqq = sinT * sinT * cov[p][p] + 2 * sinT * cosT * cov[p][q] + cosT * cosT * cov[q][q];
        var cpq = (cosT * cosT - sinT * sinT) * cov[p][q] + sinT * cosT * (cov[p][p] - cov[q][q]);
        cov[p][p] = cpp; cov[q][q] = cqq; cov[p][q] = cpq; cov[q][p] = cpq;
        for (var k = 0; k < cols; k++) {
            if (k === p || k === q) continue;
            var cpk = cosT * cov[p][k] - sinT * cov[q][k];
            var cqk = sinT * cov[p][k] + cosT * cov[q][k];
            cov[p][k] = cov[k][p] = cpk;
            cov[q][k] = cov[k][q] = cqk;
        }
        for (var k = 0; k < cols; k++) {
            var vpk = cosT * eigVecs[k][p] - sinT * eigVecs[k][q];
            var vqk = sinT * eigVecs[k][p] + cosT * eigVecs[k][q];
            eigVecs[k][p] = vpk; eigVecs[k][q] = vqk;
        }
    }
    for (var i = 0; i < cols; i++) eigVals[i] = cov[i][i];
    var order = [];
    for (var i = 0; i < cols; i++) order.push(i);
    order.sort(function (a, b) { return eigVals[b] - eigVals[a]; });
    var nc = Math.min(nComponents, cols);
    var scores = new Array(cols);
    for (var i = 0; i < cols; i++) {
        scores[i] = new Array(nc);
        for (var k = 0; k < nc; k++) {
            scores[i][k] = eigVecs[i][order[k]] * Math.sqrt(Math.max(0, eigVals[order[k]]));
        }
    }
    var totalVar = 0;
    for (var i = 0; i < cols; i++) totalVar += Math.max(0, eigVals[i]);
    var varExpl = [];
    for (var k = 0; k < nc; k++) varExpl.push(totalVar > 0 ? Math.max(0, eigVals[order[k]]) / totalVar : 0);
    return { scores: scores, varianceExplained: varExpl };
}

// ---- Detection statistics ----------------------------------------------

// Share of each feature's variance explained by batch (one-way ANOVA R2).
function computeBatchR2(matrix, batchIndices, scaleMode) {
    var rows = matrix.length, cols = rows > 0 ? matrix[0].length : 0;
    var mode = _batchWorkScale(matrix, scaleMode);
    var colBatch = _colBatchArray(batchIndices, cols);
    var batchNames = [];
    batchIndices.forEach(function (_, name) { batchNames.push(name); });
    var bIdx = _batchNameIndex(batchNames);
    var nB = batchNames.length;
    var perFeature = new Array(rows);
    var sum = 0, used = 0, high = 0;
    for (var r = 0; r < rows; r++) {
        var batchSum = new Array(nB), batchN = new Array(nB);
        for (var b = 0; b < nB; b++) { batchSum[b] = 0; batchN[b] = 0; }
        var grandSum = 0, grandN = 0;
        var values = [];
        for (var c = 0; c < cols; c++) {
            if (!_isObserved(matrix[r][c])) continue;
            var bi = bIdx[colBatch[c]];
            if (bi === undefined) continue;
            var lv = _batchToWork(matrix[r][c], mode);
            values.push(lv);
            batchSum[bi] += lv; batchN[bi]++;
            grandSum += lv; grandN++;
        }
        if (grandN < 2) { perFeature[r] = 0; used++; continue; }
        var grand = grandSum / grandN;
        var ssTotal = 0;
        for (var k = 0; k < values.length; k++) ssTotal += (values[k] - grand) * (values[k] - grand);
        var ssBetween = 0, batchesSeen = 0;
        for (var b = 0; b < nB; b++) {
            if (batchN[b] <= 0) continue;
            batchesSeen++;
            var mb = batchSum[b] / batchN[b];
            ssBetween += batchN[b] * (mb - grand) * (mb - grand);
        }
        var r2 = (ssTotal > 0 && batchesSeen >= 2) ? ssBetween / ssTotal : 0;
        if (!isFinite(r2) || r2 < 0) r2 = 0;
        if (r2 > 1) r2 = 1;
        perFeature[r] = r2;
        sum += r2; used++;
        if (r2 >= BATCH_EFFECT_R2_HIGH) high++;
    }
    var sorted = _sortedNumbers(perFeature);
    return {
        mean: used > 0 ? sum / used : 0,
        median: sorted.length ? _medianSorted(sorted) : 0,
        highFrac: used > 0 ? high / used : 0,
        nFeatures: rows,
        perFeature: perFeature
    };
}

// Share of one score vector's variance explained by batch (eta squared).
function etaSquaredByBatch(scores1d, batchIndices) {
    var groups = [];
    var n = 0, grandSum = 0;
    batchIndices.forEach(function (indices) {
        var vals = [];
        for (var k = 0; k < indices.length; k++) {
            var v = scores1d[indices[k]];
            if (v !== null && v !== undefined && !isNaN(v)) { vals.push(v); grandSum += v; n++; }
        }
        groups.push(vals);
    });
    if (n < 2) return 0;
    var grand = grandSum / n;
    var ssTotal = 0, ssBetween = 0;
    for (var g = 0; g < groups.length; g++) {
        var vals = groups[g];
        if (!vals.length) continue;
        var m = _meanOf(vals);
        ssBetween += vals.length * (m - grand) * (m - grand);
        for (var i = 0; i < vals.length; i++) ssTotal += (vals[i] - grand) * (vals[i] - grand);
    }
    if (!(ssTotal > 0)) return 0;
    var eta = ssBetween / ssTotal;
    if (!isFinite(eta) || eta < 0) return 0;
    return eta > 1 ? 1 : eta;
}

// Mean silhouette of samples grouped by batch (higher = better separated batches).
function computeSilhouetteByBatch(scores, batchIndices) {
    var colBatch = new Array(scores.length);
    batchIndices.forEach(function (indices, name) { for (var k = 0; k < indices.length; k++) colBatch[indices[k]] = name; });
    var batchNames = [];
    batchIndices.forEach(function (_, n) { batchNames.push(n); });
    var silPerSample = new Array(scores.length).fill(0);
    for (var i = 0; i < scores.length; i++) {
        var bi = colBatch[i];
        if (!bi) continue;
        var aDist = 0, aN = 0;
        for (var j = 0; j < scores.length; j++) {
            if (colBatch[j] !== bi || j === i) continue;
            var dist = 0;
            for (var d = 0; d < scores[i].length; d++) dist += (scores[i][d] - scores[j][d]) * (scores[i][d] - scores[j][d]);
            aDist += Math.sqrt(dist); aN++;
        }
        aDist = aN > 0 ? aDist / aN : 0;
        var bDist = Infinity;
        for (var bn = 0; bn < batchNames.length; bn++) {
            if (batchNames[bn] === bi) continue;
            var bd = 0, bN = 0;
            for (var j = 0; j < scores.length; j++) {
                if (colBatch[j] !== batchNames[bn]) continue;
                var dist = 0;
                for (var d = 0; d < scores[i].length; d++) dist += (scores[i][d] - scores[j][d]) * (scores[i][d] - scores[j][d]);
                bd += Math.sqrt(dist); bN++;
            }
            var avgB = bN > 0 ? bd / bN : 0;
            if (avgB < bDist) bDist = avgB;
        }
        var maxAB = Math.max(aDist, bDist);
        silPerSample[i] = maxAB > 0 ? (bDist - aDist) / maxAB : 0;
    }
    return silPerSample;
}

// Per-batch distribution stats on raw and log10 intensities.
function detectBatchEffect(matrix, batchIndices) {
    var rows = matrix.length;
    var perBatchStats = {};
    batchIndices.forEach(function (indices, name) {
        var raw = [], logv = [];
        for (var k = 0; k < indices.length; k++) {
            var col = indices[k];
            for (var r = 0; r < rows; r++) {
                var v = matrix[r][col];
                if (!_isObserved(v)) continue;
                raw.push(v); logv.push(Math.log10(v));
            }
        }
        var total = rows * indices.length;
        var logMean = _meanOf(logv);
        perBatchStats[name] = {
            n: raw.length,
            mean: _meanOf(raw),
            median: _medianSorted(_sortedNumbers(raw)),
            logMean: logMean,
            logMedian: _medianSorted(_sortedNumbers(logv)),
            logSd: _sdOf(logv, logMean),
            missingFrac: total > 0 ? 1 - raw.length / total : 0
        };
    });
    return { perBatchStats: perBatchStats };
}

// Detection bundle shared by the panels and the Before/After comparison.
function computeBatchMetrics(matrix, batchIndices, scaleMode) {
    var rows = matrix.length;
    var cols = rows > 0 ? matrix[0].length : 0;
    var r2 = computeBatchR2(matrix, batchIndices, scaleMode);
    var pca = runSimplifiedPCA(matrix, 2);
    var sil = (pca && pca.scores && pca.scores.length) ? computeSilhouetteByBatch(pca.scores, batchIndices) : [];
    var pc1Eta = 0, pc2Eta = 0;
    if (pca && pca.scores && pca.scores.length) {
        pc1Eta = etaSquaredByBatch(pca.scores.map(function (s) { return s[0]; }), batchIndices);
        if (pca.scores[0].length > 1) {
            pc2Eta = etaSquaredByBatch(pca.scores.map(function (s) { return s[1]; }), batchIndices);
        }
    }
    return {
        rows: rows,
        cols: cols,
        batchR2Mean: r2.mean,
        batchR2Median: r2.median,
        batchR2HighFrac: r2.highFrac,
        perFeatureR2: r2.perFeature,
        silhouette: sil.length ? _meanOf(sil) : 0,
        pc1Eta: pc1Eta,
        pc2Eta: pc2Eta,
        pca: pca,
        varExplained: (pca && pca.varianceExplained) || []
    };
}

// ---- Correction ---------------------------------------------------------

// One pass shared by every method. When bioGroups are supplied each sample is
// anchored to its group mean, so the biological signal survives the correction.
function _correctMatrix(matrix, batchIndices, opts) {
    opts = opts || {};
    var method = opts.method || 'median';
    var bioGroups = Array.isArray(opts.bioGroups) ? opts.bioGroups : null;
    var useCombat = method === 'combat';
    var useShrinkage = useCombat && opts.parametric !== false;
    var workMode = _batchWorkScale(matrix, opts.scale);
    var rows = matrix.length, cols = rows > 0 ? matrix[0].length : 0;
    var result = _deepCopy(matrix);
    var batchNames = [];
    batchIndices.forEach(function (_, name) { batchNames.push(name); });
    var nBatches = batchNames.length;
    var bIdx = _batchNameIndex(batchNames);
    var colBatch = _colBatchArray(batchIndices, cols);

    var groupLevels = null;
    if (bioGroups) {
        groupLevels = [];
        var seen = {};
        for (var c = 0; c < cols; c++) {
            var g = bioGroups[c];
            if (!Object.prototype.hasOwnProperty.call(seen, g)) { seen[g] = true; groupLevels.push(g); }
        }
        if (groupLevels.length < 2) groupLevels = null;
    }

    var eps = 1e-10;
    for (var r = 0; r < rows; r++) {
        var row = matrix[r];
        var observedIdx = [], observedVals = [];
        for (var c = 0; c < cols; c++) {
            if (_isObserved(row[c])) { observedIdx.push(c); observedVals.push(_batchToWork(row[c], workMode)); }
        }
        if (observedIdx.length < 2) continue;

        var grandMean = _meanOf(observedVals);
        var fallbackAnchor = method === 'median' ? _medianSorted(_sortedNumbers(observedVals)) : grandMean;

        var groupMeans = null;
        if (groupLevels) {
            groupMeans = {};
            var sums = {}, ns = {};
            for (var k = 0; k < observedIdx.length; k++) {
                var g = bioGroups[observedIdx[k]];
                if (!Object.prototype.hasOwnProperty.call(sums, g)) { sums[g] = 0; ns[g] = 0; }
                sums[g] += observedVals[k]; ns[g]++;
            }
            for (var gi = 0; gi < groupLevels.length; gi++) {
                var gl = groupLevels[gi];
                groupMeans[gl] = ns[gl] > 0 ? sums[gl] / ns[gl] : fallbackAnchor;
            }
        }

        var anchors = new Array(observedIdx.length);
        for (var k = 0; k < observedIdx.length; k++) {
            var col = observedIdx[k];
            if (groupMeans) {
                var g = bioGroups[col];
                anchors[k] = Object.prototype.hasOwnProperty.call(groupMeans, g) ? groupMeans[g] : fallbackAnchor;
            } else {
                anchors[k] = fallbackAnchor;
            }
        }

        var residByBatch = [], batchN = new Array(nBatches);
        for (var b = 0; b < nBatches; b++) { residByBatch.push([]); batchN[b] = 0; }
        var resid = new Array(observedIdx.length);
        var batchOfCell = new Array(observedIdx.length);
        for (var k = 0; k < observedIdx.length; k++) {
            var rr = observedVals[k] - anchors[k];
            resid[k] = rr;
            var bi = bIdx[colBatch[observedIdx[k]]];
            batchOfCell[k] = bi;
            if (bi !== undefined) { residByBatch[bi].push(rr); batchN[bi]++; }
        }

        var loc = new Array(nBatches), scale = new Array(nBatches);
        for (var b = 0; b < nBatches; b++) {
            var vals = residByBatch[b];
            loc[b] = method === 'median' ? _medianSorted(_sortedNumbers(vals)) : _meanOf(vals);
            scale[b] = _sdOf(vals, _meanOf(vals));
        }

        var pooledScale = 1;
        if (useCombat) {
            var ss = 0, df = 0;
            for (var b = 0; b < nBatches; b++) {
                if (batchN[b] > 1) { ss += (batchN[b] - 1) * scale[b] * scale[b]; df += batchN[b] - 1; }
            }
            pooledScale = df > 0 ? Math.sqrt(ss / df) : Math.max.apply(null, scale.concat([0]));
            if (!(pooledScale > 0)) pooledScale = 1;
        }

        var locAdj = loc.slice();
        var scaleAdj = scale.slice();
        if (useCombat) {
            if (useShrinkage && nBatches >= 2) {
                // Location: normal-normal empirical Bayes with prior mean 0, so weak
                // per-batch estimates are pulled toward the global mean.
                var locMean = _meanOf(loc), locVar = 0;
                for (var b = 0; b < nBatches; b++) locVar += (loc[b] - locMean) * (loc[b] - locMean);
                locVar = nBatches > 1 ? locVar / (nBatches - 1) : 0;
                var noise = 0, noiseN = 0;
                for (var b = 0; b < nBatches; b++) {
                    if (batchN[b] > 0 && scale[b] > 0) { noise += scale[b] * scale[b] / batchN[b]; noiseN++; }
                }
                var tau2 = Math.max(0, locVar - (noiseN > 0 ? noise / noiseN : 0));
                for (var b = 0; b < nBatches; b++) {
                    if (batchN[b] <= 0 || !(scale[b] > 0)) { locAdj[b] = 0; continue; }
                    var w = batchN[b] * tau2;
                    locAdj[b] = w > 0 ? loc[b] * w / (w + scale[b] * scale[b]) : 0;
                }
                // Scale: shrink each batch variance toward the pooled variance.
                var nu = Math.max(1, _meanOf(batchN) - 1);
                for (var b = 0; b < nBatches; b++) {
                    if (batchN[b] <= 1) { scaleAdj[b] = pooledScale; continue; }
                    var v = (batchN[b] - 1) * scale[b] * scale[b];
                    scaleAdj[b] = Math.sqrt(Math.max((v + nu * pooledScale * pooledScale) / ((batchN[b] - 1) + nu), eps));
                }
            } else {
                for (var b = 0; b < nBatches; b++) if (!(scaleAdj[b] > 0)) scaleAdj[b] = pooledScale;
            }
        }

        for (var k = 0; k < observedIdx.length; k++) {
            var col = observedIdx[k];
            var bi = batchOfCell[k];
            if (bi === undefined) { result[r][col] = row[col]; continue; }
            if (useCombat) {
                var sc = scaleAdj[bi] > 0 ? scaleAdj[bi] : pooledScale;
                result[r][col] = _batchFromWork(anchors[k] + pooledScale * (resid[k] - locAdj[bi]) / sc, workMode);
            } else {
                result[r][col] = _batchFromWork(anchors[k] + (resid[k] - locAdj[bi]), workMode);
            }
        }
    }
    return result;
}

function medianCenterPerBatch(matrix, batchIndices, scale) {
    return _correctMatrix(matrix, batchIndices, { method: 'median', scale: scale });
}

function meanCenterPerBatch(matrix, batchIndices, scale) {
    return _correctMatrix(matrix, batchIndices, { method: 'mean', scale: scale });
}

function combatCorrection(matrix, batchIndices, bioGroups, parametric, scale) {
    return _correctMatrix(matrix, batchIndices, { method: 'combat', bioGroups: bioGroups, parametric: parametric, scale: scale });
}

function combatLite(matrix, batchIndices, parametric) {
    return combatCorrection(matrix, batchIndices, null, parametric);
}

// ---- Mutation guard -----------------------------------------------------
// Any matrix mutation invalidates the stored pre-correction snapshot; keeping it
// would let "Reset to original" paste stale values into new data.

function notifyBatchEffectMatrixMutated() {
    if (batchEffectApplied || batchEffectOriginalMatrix) {
        if (batchEffectApplied) batchEffectUnrevertible = true;
        batchEffectApplied = false;
        batchEffectMethod = null;
        batchEffectOriginalMatrix = null;
        batchEffectOriginalHeaders = null;
    }
    batchEffectBeforeMetrics = null;
    batchEffectAfterMetrics = null;
}

// ---- Session snapshot ---------------------------------------------------

function getBatchEffectSessionState() {
    if (!batchEffectApplied) return null;
    var state = {
        applied: true,
        method: batchEffectMethod,
        batchCol: batchEffectBatchCol,
        bioCol: batchEffectBioCol,
        parametric: batchEffectParametric,
        valueScale: batchEffectValueScale,
        originalOmitted: true
    };
    if (batchEffectOriginalMatrix && batchEffectOriginalMatrix.length) {
        var cells = batchEffectOriginalMatrix.length * (batchEffectOriginalMatrix[0] ? batchEffectOriginalMatrix[0].length : 0);
        if (cells <= BATCH_EFFECT_SESSION_ORIGINAL_MAX_CELLS) {
            state.originalMatrix = batchEffectOriginalMatrix;
            state.originalHeaders = batchEffectOriginalHeaders;
            state.originalOmitted = false;
        }
    }
    return state;
}

function applyBatchEffectSessionState(state) {
    batchEffectApplied = false;
    batchEffectMethod = null;
    batchEffectBatchCol = null;
    batchEffectBioCol = null;
    batchEffectParametric = true;
    batchEffectValueScale = 'auto';
    batchEffectOriginalMatrix = null;
    batchEffectOriginalHeaders = null;
    batchEffectBeforeMetrics = null;
    batchEffectAfterMetrics = null;
    if (!state || !state.applied) return;
    batchEffectApplied = true;
    batchEffectMethod = state.method || null;
    batchEffectBatchCol = state.batchCol || null;
    batchEffectBioCol = state.bioCol || null;
    batchEffectParametric = state.parametric !== false;
    batchEffectValueScale = state.valueScale || 'auto';
    if (Array.isArray(state.originalMatrix) && state.originalMatrix.length) {
        batchEffectOriginalMatrix = state.originalMatrix;
        batchEffectOriginalHeaders = state.originalHeaders || null;
    }
}

// ---- UI -----------------------------------------------------------------

function _batchEffectStatus(text, kind) {
    var status = document.getElementById('batchEffectStatus');
    if (!status) return;
    status.className = 'status' + (kind ? ' ' + kind : '');
    status.textContent = text || '';
}

function onBatchColChange() {
    populateBatchColDropdowns();
    refreshBatchDetectionPanel();
}

function populateBatchColDropdowns() {
    var sel = document.getElementById('batchEffectBatchCol');
    var bioSel = document.getElementById('batchEffectBioCol');
    if (!sel && !bioSel) return;
    var meta = _batchMetaTable();
    var headers = (meta && Array.isArray(meta.headers)) ? meta.headers.filter(function (h) { return h && h !== 'Sample_ID'; }) : [];
    if (sel) {
        var prev = sel.value;
        sel.innerHTML = '<option value="">Select batch column...</option>';
        headers.forEach(function (h) { var o = document.createElement('option'); o.value = h; o.textContent = h; sel.appendChild(o); });
        if (prev && headers.indexOf(prev) >= 0) sel.value = prev;
    }
    if (bioSel) {
        var prevBio = bioSel.value;
        bioSel.innerHTML = '<option value="">(none)</option>';
        headers.forEach(function (h) { var o = document.createElement('option'); o.value = h; o.textContent = h; bioSel.appendChild(o); });
        if (prevBio && headers.indexOf(prevBio) >= 0) bioSel.value = prevBio;
    }
    syncBatchEffectControlsFromState();
    batchEffectBatchCol = sel ? sel.value : null;
}

function syncBatchEffectControlsFromState() {
    var methodSel = document.getElementById('batchEffectMethod');
    var parToggle = document.getElementById('batchEffectParametric');
    var bioSel = document.getElementById('batchEffectBioCol');
    var batchSel = document.getElementById('batchEffectBatchCol');
    var scaleSel = document.getElementById('batchEffectValueScale');
    if (batchSel && batchEffectBatchCol) batchSel.value = batchEffectBatchCol;
    if (bioSel && batchEffectBioCol) bioSel.value = batchEffectBioCol;
    if (methodSel && batchEffectMethod) methodSel.value = batchEffectMethod;
    if (scaleSel && batchEffectValueScale) scaleSel.value = batchEffectValueScale;
    if (parToggle) parToggle.checked = batchEffectParametric !== false;
}

function switchBatchEffectInnerTab(tab) {
    var panels = {
        detect: document.getElementById('batchEffectDetectPanel'),
        correct: document.getElementById('batchEffectCorrectPanel'),
        compare: document.getElementById('batchEffectComparePanel')
    };
    document.querySelectorAll('[data-batch-tab]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-batch-tab') === tab);
    });
    Object.keys(panels).forEach(function (key) {
        if (panels[key]) panels[key].style.display = key === tab ? 'flex' : 'none';
    });
    if (tab === 'detect') setTimeout(refreshBatchDetectionPanel, 60);
    if (tab === 'correct') setTimeout(refreshBatchCorrectionPanel, 60);
    if (tab === 'compare') setTimeout(refreshBatchComparePanel, 60);
}

function runBatchCorrection() {
    var cd = _batchCurrentData();
    if (!cd || !Array.isArray(cd.dataMatrix) || cd.dataMatrix.length === 0) {
        _batchEffectStatus('No data matrix loaded.', 'error');
        return;
    }
    var batchCol = (document.getElementById('batchEffectBatchCol') || {}).value;
    var bioCol = (document.getElementById('batchEffectBioCol') || {}).value || null;
    var method = (document.getElementById('batchEffectMethod') || {}).value || 'medianCenter';
    var parametric = !!(document.getElementById('batchEffectParametric') || {}).checked;
    var scaleSel = (document.getElementById('batchEffectValueScale') || {}).value || 'auto';
    if (!batchCol) { _batchEffectStatus('Select a batch column first.', 'error'); return; }
    var assigned = _getBatchAssignments(batchCol);
    if (assigned.error) { _batchEffectStatus(assigned.error, 'error'); return; }
    if (assigned.batchNames.length < 2) { _batchEffectStatus('The batch column needs at least two distinct values.', 'error'); return; }

    var bioGroups = null;
    if (bioCol) {
        var bio = _sampleValuesForMetaCol(bioCol);
        if (bio.error) { _batchEffectStatus(bio.error, 'error'); return; }
        bioGroups = bio.values;
        batchEffectBioCol = bioCol;
    } else {
        batchEffectBioCol = null;
    }

    _batchEffectStatus('Applying batch correction (' + method + ')...');
    var matrix = cd.dataMatrix;
    var resolvedScale = _batchWorkScale(matrix, scaleSel);
    // Invalidate downstream caches before the batch state is recorded, so the
    // mutation guard cannot clear the snapshot taken just below.
    if (typeof clearDownstreamPlotsAfterMatrixMutation === 'function') clearDownstreamPlotsAfterMatrixMutation();
    var hadUnrevertible = batchEffectUnrevertible;
    batchEffectBeforeMetrics = computeBatchMetrics(matrix, assigned.batchIndices, resolvedScale);
    batchEffectOriginalMatrix = _deepCopy(matrix);
    batchEffectOriginalHeaders = (cd.columnHeaders || []).slice();

    var corrected;
    if (method === 'medianCenter') corrected = medianCenterPerBatch(matrix, assigned.batchIndices, resolvedScale);
    else if (method === 'meanCenter') corrected = meanCenterPerBatch(matrix, assigned.batchIndices, resolvedScale);
    else corrected = combatCorrection(matrix, assigned.batchIndices, bioGroups, parametric, resolvedScale);

    for (var r = 0; r < matrix.length; r++) {
        for (var c = 0; c < matrix[r].length; c++) matrix[r][c] = corrected[r][c];
    }
    if (typeof currentDataMatrix !== 'undefined') currentDataMatrix = matrix;
    try { window.currentDataMatrix = matrix; } catch (_) {}
    batchEffectApplied = true;
    batchEffectMethod = method;
    batchEffectBatchCol = batchCol;
    batchEffectParametric = parametric;
    batchEffectValueScale = scaleSel;
    batchEffectResolvedScale = resolvedScale;
    batchEffectAfterMetrics = computeBatchMetrics(matrix, assigned.batchIndices, resolvedScale);

    if (typeof updateTablePreview === 'function') updateTablePreview();
    _batchEffectStatus('Batch correction applied (' + method + ', ' + _batchScaleLabel(resolvedScale) + ' values). Batch R² ' +
        (batchEffectBeforeMetrics.batchR2Mean * 100).toFixed(1) + '% → ' +
        (batchEffectAfterMetrics.batchR2Mean * 100).toFixed(1) + '%.' +
        (hadUnrevertible ? ' Note: the matrix already held a correction that can no longer be undone.' : ''), 'success');
    setTimeout(function () { refreshBatchCorrectionPanel(); refreshBatchComparePanel(); }, 60);
}

function resetBatchCorrection() {
    if (!batchEffectApplied || !batchEffectOriginalMatrix) {
        _batchEffectStatus('No batch correction to reset.', 'error');
        return;
    }
    var cd = _batchCurrentData();
    var matrix = cd && cd.dataMatrix;
    var snapshot = batchEffectOriginalMatrix;
    var fits = matrix && matrix.length === snapshot.length && matrix[0] && snapshot[0] && matrix[0].length === snapshot[0].length;
    if (!fits) {
        notifyBatchEffectMatrixMutated();
        _batchEffectStatus('Reset unavailable: the matrix changed after the correction was applied.', 'error');
        setTimeout(function () { refreshBatchDetectionPanel(); refreshBatchCorrectionPanel(); refreshBatchComparePanel(); }, 60);
        return;
    }
    for (var r = 0; r < matrix.length; r++) {
        for (var c = 0; c < matrix[r].length; c++) matrix[r][c] = snapshot[r][c];
    }
    if (typeof currentDataMatrix !== 'undefined') currentDataMatrix = matrix;
    try { window.currentDataMatrix = matrix; } catch (_) {}
    // Clear the state before the mutation hook runs, so it does not flag this
    // deliberate revert as an unrevertible correction.
    batchEffectApplied = false;
    batchEffectMethod = null;
    batchEffectOriginalMatrix = null;
    batchEffectOriginalHeaders = null;
    batchEffectBeforeMetrics = null;
    batchEffectAfterMetrics = null;
    batchEffectUnrevertible = false;
    if (typeof clearDownstreamPlotsAfterMatrixMutation === 'function') clearDownstreamPlotsAfterMatrixMutation();
    if (typeof updateTablePreview === 'function') updateTablePreview();
    _batchEffectStatus('Batch correction reset.', 'success');
    setTimeout(function () { refreshBatchDetectionPanel(); refreshBatchCorrectionPanel(); refreshBatchComparePanel(); }, 60);
}

// ---- Panel rendering ----------------------------------------------------

function _batchKpiCard(label, value, hint) {
    return '<div style="flex:1;min-width:150px;border:1px solid var(--md-border-subtle);border-radius:6px;padding:8px 10px;background:var(--md-bg-surface);">' +
        '<div style="font-size:11px;color:var(--md-text-secondary);">' + label + '</div>' +
        '<div style="font-size:18px;font-weight:600;color:var(--md-text-primary);">' + value + '</div>' +
        (hint ? '<div style="font-size:10px;color:var(--md-text-secondary);">' + hint + '</div>' : '') +
        '</div>';
}

function _batchKpiRow(metrics) {
    return '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
        _batchKpiCard('Batch R² (mean)', (metrics.batchR2Mean * 100).toFixed(1) + '%', 'log-intensity variance explained by batch') +
        _batchKpiCard('Batch-dominated features', (metrics.batchR2HighFrac * 100).toFixed(0) + '%', 'features with R² ≥ ' + BATCH_EFFECT_R2_HIGH) +
        _batchKpiCard('Mean silhouette', metrics.silhouette.toFixed(3), '+1 separated · 0 overlapping') +
        _batchKpiCard('PC1 batch η²', (metrics.pc1Eta * 100).toFixed(1) + '%', 'how batch-driven PC1 is') +
        '</div>';
}

function _batchPcaTraces(pca, colBatch, headerNames, assigned, showText) {
    var colorMap = {};
    assigned.batchNames.forEach(function (name, i) { colorMap[name] = BATCH_EFFECT_PALETTE[i % BATCH_EFFECT_PALETTE.length]; });
    var traces = [];
    assigned.batchNames.forEach(function (name) {
        var x = [], y = [], txt = [];
        for (var c = 0; c < colBatch.length; c++) {
            if (colBatch[c] !== name) continue;
            x.push(pca.scores[c][0]);
            y.push(pca.scores[c][1]);
            txt.push(headerNames[c] || ('Col ' + c));
        }
        traces.push({
            x: x, y: y, text: txt, type: 'scatter',
            mode: showText ? 'markers+text' : 'markers',
            name: name,
            marker: { color: colorMap[name] || '#999', size: 10 },
            textposition: 'top center', textfont: { size: 10 }
        });
    });
    return traces;
}

function _batchDrawPca(hostId, metrics, assigned, headerNames, title, showText) {
    var host = document.getElementById(hostId);
    if (!host || typeof Plotly === 'undefined' || !metrics.pca || !metrics.pca.scores.length) return;
    var colBatch = _colBatchArray(assigned.batchIndices, metrics.cols);
    var traces = _batchPcaTraces(metrics.pca, colBatch, headerNames, assigned, showText);
    var ve = metrics.varExplained || [];
    Plotly.newPlot(host, traces, {
        title: title,
        xaxis: { title: 'PC1' + (ve[0] !== undefined ? ' (' + (ve[0] * 100).toFixed(1) + '%)' : '') },
        yaxis: { title: 'PC2' + (ve[1] !== undefined ? ' (' + (ve[1] * 100).toFixed(1) + '%)' : '') },
        height: 420,
        margin: { t: 40, b: 60, l: 60 }
    }, { responsive: true });
}

function _batchDrawBox(hostId, matrix, assigned, title, height) {
    var host = document.getElementById(hostId);
    if (!host || typeof Plotly === 'undefined') return;
    var traces = [];
    assigned.batchNames.forEach(function (name, i) {
        var vals = [];
        var indices = assigned.batchIndices.get(name) || [];
        for (var k = 0; k < indices.length; k++) {
            for (var r = 0; r < matrix.length; r++) {
                if (_isObserved(matrix[r][indices[k]])) vals.push(Math.log10(matrix[r][indices[k]]));
            }
        }
        traces.push({ y: vals, type: 'box', name: name, marker: { color: BATCH_EFFECT_PALETTE[i % BATCH_EFFECT_PALETTE.length] }, boxpoints: 'outliers' });
    });
    Plotly.newPlot(host, traces, {
        title: title,
        yaxis: { title: 'log10(intensity)' },
        height: height || 380,
        margin: { t: 40, b: 40 }
    }, { responsive: true });
}

function _batchPerBatchTable(assigned, stats) {
    var html = '<div class="batch-effect-per-batch-stats"><table style="font-size:12px;border-collapse:collapse;width:100%;">' +
        '<tr><th>Batch</th><th>Samples</th><th>Observed cells</th><th>log10 mean</th><th>log10 median</th><th>log10 SD</th><th>Missing</th></tr>';
    assigned.batchNames.forEach(function (name) {
        var s = stats.perBatchStats[name] || { n: 0, logMean: 0, logMedian: 0, logSd: 0, missingFrac: 0 };
        var sampleCount = (assigned.batchIndices.get(name) || []).length;
        html += '<tr><td>' + name + '</td><td>' + sampleCount + '</td><td>' + s.n + '</td><td>' +
            s.logMean.toFixed(3) + '</td><td>' + s.logMedian.toFixed(3) + '</td><td>' +
            s.logSd.toFixed(3) + '</td><td>' + (s.missingFrac * 100).toFixed(1) + '%</td></tr>';
    });
    html += '</table></div>';
    return html;
}

function refreshBatchDetectionPanel() {
    var host = document.getElementById('batchEffectDetectHost');
    if (!host) return;
    var batchCard = document.getElementById('batchLandingCard');
    var batchRow = document.querySelector('#tableBatchEffectPanel .data-filter-inner-tabs-row');
    var cd = _batchCurrentData();
    var matrix = cd && cd.dataMatrix;
    if (!matrix) {
        host.innerHTML = '';
        if (batchCard) batchCard.style.display = '';
        if (batchRow) batchRow.style.display = 'none';
        return;
    }
    if (batchCard) batchCard.style.display = 'none';
    if (batchRow) batchRow.style.display = '';
    var batchCol = (document.getElementById('batchEffectBatchCol') || {}).value;
    if (!batchCol) { host.innerHTML = '<p class="small" style="padding:14px;">Select a batch column to see detection results.</p>'; return; }
    var assigned = _getBatchAssignments(batchCol);
    if (assigned.error) { host.innerHTML = '<p class="small" style="padding:14px;">' + assigned.error + '</p>'; return; }
    if (assigned.batchNames.length < 2) { host.innerHTML = '<p class="small" style="padding:14px;">The batch column needs at least two distinct values.</p>'; return; }

    var metrics = computeBatchMetrics(matrix, assigned.batchIndices);
    var stats = detectBatchEffect(matrix, assigned.batchIndices);
    var headerNames = (cd.columnHeaders || []).slice(0, metrics.cols);
    var note = assigned.unassigned > 0
        ? '<p class="small" style="color:var(--md-danger-soft-fg);margin:0 0 8px 0;">' + assigned.unassigned + ' sample(s) have no metadata row — grouped as "(unassigned)".</p>'
        : '';

    host.innerHTML = _batchKpiRow(metrics) + note +
        '<p class="small" style="margin:0 0 6px 0;">Matrix ' + metrics.rows + ' rows × ' + metrics.cols + ' cols · batch column <strong>' + batchCol +
        '</strong> (' + assigned.batchNames.length + ' batches: ' + assigned.batchNames.join(', ') + ')</p>' +
        '<div id="batchEffectDetectPcaHost" style="width:100%;height:420px;"></div>' +
        '<div id="batchEffectDetectBoxHost" style="width:100%;height:380px;margin-top:12px;"></div>' +
        '<div id="batchEffectDetectR2Host" style="width:100%;height:300px;margin-top:12px;"></div>' +
        _batchPerBatchTable(assigned, stats);

    setTimeout(function () {
        _batchDrawPca('batchEffectDetectPcaHost', metrics, assigned, headerNames, 'PCA colored by batch (' + batchCol + ')', true);
        _batchDrawBox('batchEffectDetectBoxHost', matrix, assigned, 'Per-batch log10 intensity distributions');
        var r2Host = document.getElementById('batchEffectDetectR2Host');
        if (r2Host && typeof Plotly !== 'undefined') {
            Plotly.newPlot(r2Host, [{
                x: metrics.perFeatureR2, type: 'histogram', name: 'features',
                xbins: { start: 0, end: 1, size: 0.05 },
                marker: { color: 'var(--md-accent)' }
            }], {
                title: 'Per-feature batch R² (' + metrics.rows + ' features)',
                xaxis: { title: 'batch R²', range: [0, 1] },
                yaxis: { title: 'features' },
                height: 300,
                margin: { t: 40, b: 45 }
            }, { responsive: true });
        }
    }, 100);
}

function refreshBatchCorrectionPanel() {
    var host = document.getElementById('batchEffectCorrectHost');
    if (!host) return;
    if (!batchEffectApplied) { host.innerHTML = '<p class="small" style="padding:14px;">Apply batch correction first to see results.</p>'; return; }
    var cd = _batchCurrentData();
    var matrix = cd && cd.dataMatrix;
    if (!matrix) { host.innerHTML = '<p class="small" style="padding:14px;">No data.</p>'; return; }
    var batchCol = batchEffectBatchCol || (document.getElementById('batchEffectBatchCol') || {}).value;
    var assigned = _getBatchAssignments(batchCol);
    if (assigned.error || assigned.batchNames.length < 2) { host.innerHTML = '<p class="small" style="padding:14px;">' + (assigned.error || 'Batch column no longer valid.') + '</p>'; return; }
    var metrics = computeBatchMetrics(matrix, assigned.batchIndices);
    batchEffectAfterMetrics = metrics;
    var headerNames = (cd.columnHeaders || []).slice(0, metrics.cols);
    var bioNote = batchEffectBioCol ? ' · preserving <strong>' + batchEffectBioCol + '</strong>' : '';
    var shrinkNote = batchEffectMethod === 'combat' ? (batchEffectParametric ? ' · empirical-Bayes shrinkage' : ' · no shrinkage') : '';

    host.innerHTML = '<p class="small" style="margin:0 0 8px 0;">Applied <strong>' + batchEffectMethod + '</strong> on batch <strong>' + batchCol + '</strong>' + bioNote + shrinkNote + '</p>' +
        _batchKpiRow(metrics) +
        '<div id="batchEffectCorrectPcaHost" style="width:100%;height:420px;"></div>' +
        '<div id="batchEffectCorrectBoxHost" style="width:100%;height:380px;margin-top:12px;"></div>';

    setTimeout(function () {
        _batchDrawPca('batchEffectCorrectPcaHost', metrics, assigned, headerNames, 'PCA after batch correction', false);
        _batchDrawBox('batchEffectCorrectBoxHost', matrix, assigned, 'Per-batch log10 intensity distributions (corrected)');
    }, 100);
}

function refreshBatchComparePanel() {
    var host = document.getElementById('batchEffectCompareHost');
    if (!host) return;
    if (!batchEffectApplied || !batchEffectOriginalMatrix) {
        host.innerHTML = '<p class="small" style="padding:14px;">Apply batch correction first, then compare before/after.</p>';
        return;
    }
    var cd = _batchCurrentData();
    var batchCol = batchEffectBatchCol || (document.getElementById('batchEffectBatchCol') || {}).value;
    var assigned = _getBatchAssignments(batchCol);
    if (assigned.error || assigned.batchNames.length < 2) { host.innerHTML = '<p class="small" style="padding:14px;">' + (assigned.error || 'Batch column no longer valid.') + '</p>'; return; }
    var before = batchEffectBeforeMetrics || computeBatchMetrics(batchEffectOriginalMatrix, assigned.batchIndices);
    var after = batchEffectAfterMetrics || computeBatchMetrics(cd.dataMatrix, assigned.batchIndices);

    host.innerHTML = _batchKpiRow(after) +
        '<div style="display:flex;gap:16px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:340px;"><strong>Before correction</strong><div id="batchEffectCompareBeforePca" style="width:100%;height:400px;"></div></div>' +
        '<div style="flex:1;min-width:340px;"><strong>After correction</strong><div id="batchEffectCompareAfterPca" style="width:100%;height:400px;"></div></div></div>' +
        '<div id="batchEffectCompareDistHost" style="width:100%;height:360px;margin-top:12px;"></div>' +
        '<div class="batch-effect-per-batch-stats" style="margin-top:12px;"><table style="font-size:12px;border-collapse:collapse;width:100%;">' +
        '<tr><th>Metric</th><th>Before</th><th>After</th><th>Δ</th></tr>' +
        '<tr><td>Batch R² (mean)</td><td>' + (before.batchR2Mean * 100).toFixed(1) + '%</td><td>' + (after.batchR2Mean * 100).toFixed(1) + '%</td><td>' + _batchDelta(before.batchR2Mean, after.batchR2Mean) + '</td></tr>' +
        '<tr><td>Batch-dominated features</td><td>' + (before.batchR2HighFrac * 100).toFixed(0) + '%</td><td>' + (after.batchR2HighFrac * 100).toFixed(0) + '%</td><td>' + _batchDelta(before.batchR2HighFrac, after.batchR2HighFrac) + '</td></tr>' +
        '<tr><td>Mean silhouette</td><td>' + before.silhouette.toFixed(3) + '</td><td>' + after.silhouette.toFixed(3) + '</td><td>' + _batchDelta(before.silhouette, after.silhouette) + '</td></tr>' +
        '<tr><td>PC1 batch η²</td><td>' + (before.pc1Eta * 100).toFixed(1) + '%</td><td>' + (after.pc1Eta * 100).toFixed(1) + '%</td><td>' + _batchDelta(before.pc1Eta, after.pc1Eta) + '</td></tr>' +
        '</table></div>';

    setTimeout(function () {
        _batchDrawPca('batchEffectCompareBeforePca', before, assigned, (cd.columnHeaders || []).slice(0, before.cols), 'Before', false);
        _batchDrawPca('batchEffectCompareAfterPca', after, assigned, (cd.columnHeaders || []).slice(0, after.cols), 'After', false);
        var distHost = document.getElementById('batchEffectCompareDistHost');
        if (distHost && typeof Plotly !== 'undefined') {
            var labels = ['Batch R² (mean)', 'Batch-dominated', 'Mean silhouette', 'PC1 batch η²'];
            var beforeVals = [before.batchR2Mean, before.batchR2HighFrac, before.silhouette, before.pc1Eta];
            var afterVals = [after.batchR2Mean, after.batchR2HighFrac, after.silhouette, after.pc1Eta];
            Plotly.newPlot(distHost, [
                { x: labels, y: beforeVals, type: 'bar', name: 'Before', marker: { color: '#94a3b8' } },
                { x: labels, y: afterVals, type: 'bar', name: 'After', marker: { color: '#14b8a6' } }
            ], {
                title: 'Batch metrics before vs after correction',
                yaxis: { title: 'value (0–1)' },
                barmode: 'group',
                height: 360,
                margin: { t: 40, b: 70 }
            }, { responsive: true });
        }
    }, 120);
}

function _batchDelta(beforeVal, afterVal) {
    var d = afterVal - beforeVal;
    var sign = d > 0 ? '+' : '';
    return sign + (d * 100).toFixed(1) + ' pp';
}
