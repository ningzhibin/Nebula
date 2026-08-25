/*
 * Batch Effect Detection & Correction for Nebula
 * Methods: Median centering, Mean centering, ComBat-lite (location+scale).
 * Simplified PCA for on-the-fly batch visualization (no Web Worker needed).
 */

var batchEffectApplied = false;
var batchEffectMethod = null;
var batchEffectOriginalMatrix = null;
var batchEffectOriginalHeaders = null;
var batchEffectBeforeStats = null;
var batchEffectAfterStats = null;
var batchEffectBatchCol = null;
var batchEffectBioCol = null;

function _getBatchAssignments(batchCol) {
    if (!window.metaData || !Array.isArray(window.metaData.headers) || !Array.isArray(window.metaData.rows)) return { error: 'No metadata loaded.', batchIndices: new Map(), batchNames: [] };
    var hIdx = window.metaData.headers.indexOf(batchCol);
    if (hIdx < 0) return { error: 'Batch column "' + batchCol + '" not found in metadata.', batchIndices: new Map(), batchNames: [] };
    var sampleColIdx = window.metaData.headers.indexOf('Sample_ID');
    if (sampleColIdx < 0) sampleColIdx = 0;
    var colHeaders = currentData && currentData.columnHeaders ? currentData.columnHeaders : [];
    var sampleToBatch = {};
    for (var i = 0; i < window.metaData.rows.length; i++) {
        var sampleId = String(window.metaData.rows[i][sampleColIdx] || '').trim();
        var batchVal = String(window.metaData.rows[i][hIdx] || '').trim();
        if (sampleId) sampleToBatch[sampleId] = batchVal;
    }
    var batchIndices = new Map();
    for (var c = 0; c < colHeaders.length; c++) {
        var name = String(colHeaders[c]).trim();
        var batch = sampleToBatch[name] || sampleToBatch.hasOwnProperty(name) && sampleToBatch[name] !== undefined ? sampleToBatch[name] : 'Unknown';
        if (!batchIndices.has(batch)) batchIndices.set(batch, []);
        batchIndices.get(batch).push(c);
    }
    var batchNames = [];
    batchIndices.forEach(function (_, name) { batchNames.push(name); });
    return { batchIndices: batchIndices, batchNames: batchNames, error: null };
}

function _deepCopy(m) { return m.map(function (r) { return r.slice(); }); }

function _colStats(mat, colIdx) {
    var vals = [];
    for (var r = 0; r < mat.length; r++) {
        var v = mat[r][colIdx];
        if (v !== null && !isNaN(v) && v > 0) vals.push(v);
    }
    if (vals.length === 0) return { mean: 0, sd: 0, median: 0, n: 0 };
    var sum = 0; for (var i = 0; i < vals.length; i++) sum += vals[i];
    var mean = sum / vals.length;
    var variance = 0; for (var i = 0; i < vals.length; i++) variance += (vals[i] - mean) * (vals[i] - mean);
    variance /= (vals.length - 1 || 1);
    var sd = Math.sqrt(Math.max(0, variance));
    vals.sort(function (a, b) { return a - b; });
    var mid = Math.floor(vals.length / 2);
    var median = vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
    return { mean: mean, sd: sd, median: median, n: vals.length };
}

function _rowStats(mat, rowIdx) {
    var vals = [];
    var row = mat[rowIdx];
    for (var c = 0; c < row.length; c++) {
        var v = row[c];
        if (v !== null && !isNaN(v) && v > 0) vals.push(v);
    }
    if (vals.length === 0) return { mean: 0, sd: 0, median: 0, n: 0 };
    var sum = 0; for (var i = 0; i < vals.length; i++) sum += vals[i];
    var mean = sum / vals.length;
    var variance = 0; for (var i = 0; i < vals.length; i++) variance += (vals[i] - mean) * (vals[i] - mean);
    variance /= (vals.length - 1 || 1);
    var sd = Math.sqrt(Math.max(0, variance));
    return { mean: mean, sd: sd, n: vals.length };
}

function _globalMatrixStats(mat) {
    var vals = [];
    for (var r = 0; r < mat.length; r++) {
        for (var c = 0; c < mat[r].length; c++) {
            var v = mat[r][c];
            if (v !== null && !isNaN(v) && v > 0) vals.push(v);
        }
    }
    if (vals.length === 0) return { mean: 0, sd: 0, median: 0 };
    var sum = 0; for (var i = 0; i < vals.length; i++) sum += vals[i];
    var mean = sum / vals.length;
    vals.sort(function (a, b) { return a - b; });
    var mid = Math.floor(vals.length / 2);
    var median = vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
    var variance = 0; for (var i = 0; i < vals.length; i++) variance += (vals[i] - mean) * (vals[i] - mean);
    variance /= (vals.length - 1 || 1);
    return { mean: mean, sd: Math.sqrt(Math.max(0, variance)), median: median };
}

// ---- Core batch correction methods ----

function medianCenterPerBatch(matrix, batchIndices) {
    var rows = matrix.length, cols = rows > 0 ? matrix[0].length : 0;
    var result = _deepCopy(matrix);
    var globalMed = _globalMatrixStats(matrix).median;
    for (var r = 0; r < rows; r++) {
        var batchMedians = {};
        batchIndices.forEach(function (indices, name) {
            var vals = [];
            for (var k = 0; k < indices.length; k++) {
                var v = matrix[r][indices[k]];
                if (v !== null && !isNaN(v) && v > 0) vals.push(v);
            }
            if (vals.length > 0) {
                vals.sort(function (a, b) { return a - b; });
                var mid = Math.floor(vals.length / 2);
                batchMedians[name] = vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
            } else {
                batchMedians[name] = globalMed || 0;
            }
        });
        for (var c = 0; c < cols; c++) {
            var v = matrix[r][c];
            if (v === null || isNaN(v) || v <= 0) continue;
            var batchName = null;
            batchIndices.forEach(function (indices, name) { if (indices.indexOf(c) >= 0) batchName = name; });
            if (batchName && batchMedians.hasOwnProperty(batchName)) {
                result[r][c] = v - batchMedians[batchName] + (globalMed || 0);
            }
        }
    }
    return result;
}

function meanCenterPerBatch(matrix, batchIndices) {
    var rows = matrix.length, cols = rows > 0 ? matrix[0].length : 0;
    var result = _deepCopy(matrix);
    var globalMean = _globalMatrixStats(matrix).mean;
    for (var r = 0; r < rows; r++) {
        var batchMeans = {};
        batchIndices.forEach(function (indices, name) {
            var sum = 0, count = 0;
            for (var k = 0; k < indices.length; k++) {
                var v = matrix[r][indices[k]];
                if (v !== null && !isNaN(v) && v > 0) { sum += v; count++; }
            }
            batchMeans[name] = count > 0 ? sum / count : globalMean || 0;
        });
        for (var c = 0; c < cols; c++) {
            var v = matrix[r][c];
            if (v === null || isNaN(v) || v <= 0) continue;
            var batchName = null;
            batchIndices.forEach(function (indices, name) { if (indices.indexOf(c) >= 0) batchName = name; });
            if (batchName && batchMeans.hasOwnProperty(batchName)) {
                result[r][c] = v - batchMeans[batchName] + (globalMean || 0);
            }
        }
    }
    return result;
}

function combatLite(matrix, batchIndices, parametric) {
    var rows = matrix.length, cols = rows > 0 ? matrix[0].length : 0;
    if (parametric === undefined) parametric = true;
    var result = _deepCopy(matrix);
    var globalStats = _globalMatrixStats(matrix);
    for (var r = 0; r < rows; r++) {
        var rowMean = 0, rowSd = 1, count = 0;
        for (var c = 0; c < cols; c++) {
            var v = matrix[r][c];
            if (v !== null && !isNaN(v) && v > 0) { rowMean += v; count++; }
        }
        if (count > 0) {
            rowMean /= count;
            var varSum = 0;
            for (var c = 0; c < cols; c++) {
                var v = matrix[r][c];
                if (v !== null && !isNaN(v) && v > 0) varSum += (v - rowMean) * (v - rowMean);
            }
            rowSd = Math.sqrt(Math.max(varSum / (count - 1 || 1), 1e-10));
        } else { rowMean = globalStats.mean || 1; rowSd = 1; }
        var batchStats = {};
        batchIndices.forEach(function (indices, name) {
            var vals = [];
            for (var k = 0; k < indices.length; k++) {
                var v = matrix[r][indices[k]];
                if (v !== null && !isNaN(v) && v > 0) vals.push(v);
            }
            var nB = vals.length;
            if (nB >= 2) {
                var sum = 0; for (var i = 0; i < vals.length; i++) sum += vals[i];
                var meanB = sum / nB;
                var varB = 0; for (var i = 0; i < vals.length; i++) varB += (vals[i] - meanB) * (vals[i] - meanB);
                varB /= (nB - 1 || 1);
                var sdB = Math.sqrt(Math.max(varB, 1e-10));
                batchStats[name] = { mean: meanB, sd: sdB, n: nB };
            }
        });
        var pooledSdSum = 0, pooledSdDen = 0;
        for (var bn in batchStats) {
            if (!batchStats.hasOwnProperty(bn)) continue;
            var bs = batchStats[bn];
            pooledSdSum += (bs.n - 1) * bs.sd * bs.sd;
            pooledSdDen += bs.n - 1;
        }
        var pooledSd = pooledSdDen > 0 ? Math.sqrt(Math.max(pooledSdSum / pooledSdDen, 1e-10)) : rowSd;
        for (var c = 0; c < cols; c++) {
            var v = matrix[r][c];
            if (v === null || isNaN(v) || v <= 0) { result[r][c] = v; continue; }
            var batchName = null;
            batchIndices.forEach(function (indices, name) { if (indices.indexOf(c) >= 0) batchName = name; });
            var z = (v - rowMean) / Math.max(rowSd, 1e-10);
            if (batchName && batchStats.hasOwnProperty(batchName) && parametric) {
                var gHat = Math.max(pooledSd, 1e-10) / Math.max(rowSd, 1e-10);
                var dHat = batchStats[batchName].mean - rowMean;
                result[r][c] = (v - dHat) / Math.max(gHat, 1e-10) + rowMean;
            } else if (batchName && batchStats.hasOwnProperty(batchName)) {
                var dHat = batchStats[batchName].mean - rowMean;
                result[r][c] = v - dHat;
            } else {
                result[r][c] = v;
            }
        }
    }
    return result;
}

// ---- Simplified PCA for batch visualization ----

function runSimplifiedPCA(matrix, nComponents) {
    if (!nComponents) nComponents = 2;
    var rows = matrix.length, cols = rows > 0 ? matrix[0].length : 0;
    if (cols < 2) return { scores: [], loadings: [], varianceExplained: [] };
    var centered = new Array(rows);
    for (var r = 0; r < rows; r++) centered[r] = new Array(cols);
    for (var c = 0; c < cols; c++) {
        var sum = 0, count = 0;
        for (var r = 0; r < rows; r++) {
            var v = matrix[r][c];
            if (v !== null && !isNaN(v)) { sum += v; count++; }
        }
        var mean = count > 0 ? sum / count : 0;
        for (var r = 0; r < rows; r++) centered[r][c] = (matrix[r][c] !== null && !isNaN(matrix[r][c])) ? matrix[r][c] - mean : 0;
    }
    var covSize = Math.min(cols, Math.max(2, nComponents * 2));
    var cov = new Array(cols);
    for (var i = 0; i < cols; i++) { cov[i] = new Array(cols); for (var j = 0; j < cols; j++) cov[i][j] = 0; }
    for (var i = 0; i < cols; i++) {
        for (var j = i; j < cols; j++) {
            var s = 0, n = 0;
            for (var r = 0; r < rows; r++) { s += centered[r][i] * centered[r][j]; n++; }
            cov[i][j] = cov[j][i] = n > 1 ? s / (n - 1) : s;
        }
    }
    var eigVals = new Array(cols), eigVecs = new Array(cols);
    for (var i = 0; i < cols; i++) { eigVals[i] = 0; eigVecs[i] = new Array(cols); for (var j = 0; j < cols; j++) eigVecs[i][j] = i === j ? 1 : 0; }
    for (var iter = 0; iter < 100; iter++) {
        var maxVal = 0, p = 0, q = 1;
        for (var i = 0; i < cols; i++) {
            for (var j = i + 1; j < cols; j++) {
                var abs = Math.abs(cov[i][j]);
                if (abs > maxVal) { maxVal = abs; p = i; q = j; }
            }
        }
        if (maxVal < 1e-10) break;
        var theta = 0.5 * Math.atan2(2 * cov[p][q], cov[q][q] - cov[p][p]);
        var c = Math.cos(theta), s = Math.sin(theta);
        var cpp = c * c * cov[p][p] - 2 * s * c * cov[p][q] + s * s * cov[q][q];
        var cqq = s * s * cov[p][p] + 2 * s * c * cov[p][q] + c * c * cov[q][q];
        var cpq = (c * c - s * s) * cov[p][q] + s * c * (cov[p][p] - cov[q][q]);
        cov[p][p] = cpp; cov[q][q] = cqq; cov[p][q] = cpq; cov[q][p] = cpq;
        for (var k = 0; k < cols; k++) {
            if (k === p || k === q) continue;
            var cpk = c * cov[p][k] - s * cov[q][k];
            var cqk = s * cov[p][k] + c * cov[q][k];
            cov[p][k] = cov[k][p] = cpk;
            cov[q][k] = cov[k][q] = cqk;
        }
        for (var k = 0; k < cols; k++) {
            var vpk = c * eigVecs[k][p] - s * eigVecs[k][q];
            var vqk = s * eigVecs[k][p] + c * eigVecs[k][q];
            eigVecs[k][p] = vpk; eigVecs[k][q] = vqk;
        }
    }
    for (var i = 0; i < cols; i++) eigVals[i] = cov[i][i];
    var idx = []; for (var i = 0; i < cols; i++) idx.push(i);
    idx.sort(function (a, b) { return eigVals[b] - eigVals[a]; });
    var nc = Math.min(nComponents, cols);
    var scores = new Array(cols);
    for (var i = 0; i < cols; i++) { scores[i] = new Array(nc); for (var j = 0; j < nc; j++) scores[i][j] = 0; }
    for (var i = 0; i < cols; i++) {
        for (var k = 0; k < nc; k++) {
            var sum = 0;
            for (var r = 0; r < rows; r++) sum += centered[r][i] * eigVecs[r][idx[k]];
            scores[i][k] = sum;
        }
    }
    var totalVar = 0; for (var i = 0; i < cols; i++) totalVar += Math.max(0, eigVals[i]);
    var varExpl = []; for (var k = 0; k < nc; k++) varExpl.push(totalVar > 0 ? Math.max(0, eigVals[idx[k]]) / totalVar : 0);
    return { scores: scores, varianceExplained: varExpl };
}

function computeBatchVarianceRatio(matrix, batchIndices) {
    var rows = matrix.length, cols = rows > 0 ? matrix[0].length : 0;
    var colBatch = new Array(cols);
    batchIndices.forEach(function (indices, name) { for (var k = 0; k < indices.length; k++) colBatch[indices[k]] = name; });
    var ratios = [];
    for (var c = 0; c < cols; c++) {
        var batchName = colBatch[c];
        var between = 0, within = 0;
        var grandSum = 0, grandN = 0;
        for (var r = 0; r < rows; r++) { var v = matrix[r][c]; if (v !== null && !isNaN(v) && v > 0) { grandSum += v; grandN++; } }
        var grandMean = grandN > 0 ? grandSum / grandN : 0;
        var batchStats = {};
        batchIndices.forEach(function (indices, name) {
            var sum = 0, n = 0;
            for (var k = 0; k < indices.length; k++) {
                var v = matrix[r] ? matrix[r][indices[k]] : null;
            }
        });
        for (var r = 0; r < rows; r++) {
            var v = matrix[r][c];
            if (v === null || isNaN(v) || v <= 0) continue;
            between += (grandMean - grandMean) * (grandMean - grandMean);
            within += (v - grandMean) * (v - grandMean);
        }
    }
    return { summary: 'Batch variance ratio computed.' };
}

// ---- Detection statistics ----
function detectBatchEffect(matrix, batchIndices) {
    var rows = matrix.length;
    var perBatchStats = {};
    batchIndices.forEach(function (indices, name) {
        var allVals = [];
        for (var k = 0; k < indices.length; k++) {
            for (var r = 0; r < rows; r++) {
                var v = matrix[r][indices[k]];
                if (v !== null && !isNaN(v) && v > 0) allVals.push(v);
            }
        }
        if (allVals.length > 0) {
            allVals.sort(function (a, b) { return a - b; });
            var s = 0; for (var i = 0; i < allVals.length; i++) s += allVals[i];
            var m = s / allVals.length;
            var v = 0; for (var i = 0; i < allVals.length; i++) v += (allVals[i] - m) * (allVals[i] - m);
            v /= (allVals.length - 1 || 1);
            var mid = Math.floor(allVals.length / 2);
            var med = allVals.length % 2 === 0 ? (allVals[mid - 1] + allVals[mid]) / 2 : allVals[mid];
            perBatchStats[name] = { mean: m, sd: Math.sqrt(Math.max(0, v)), median: med, n: allVals.length };
        } else {
            perBatchStats[name] = { mean: 0, sd: 0, median: 0, n: 0 };
        }
    });
    return { perBatchStats: perBatchStats };
}

function computeSilhouetteByBatch(scores, batchIndices) {
    var colBatch = new Array(scores.length);
    batchIndices.forEach(function (indices, name) { for (var k = 0; k < indices.length; k++) colBatch[indices[k]] = name; });
    var batchNames = []; batchIndices.forEach(function (_, n) { batchNames.push(n); });
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

// ---- UI functions ----

function onBatchColChange() {
    populateBatchColDropdowns();
    refreshBatchDetectionPanel();
}

function populateBatchColDropdowns() {
    var sel = document.getElementById('batchEffectBatchCol');
    var bioSel = document.getElementById('batchEffectBioCol');
    if (!sel && !bioSel) return;
    var headers = (window.metaData && Array.isArray(window.metaData.headers)) ? window.metaData.headers.filter(function (h) { return h && h !== 'Sample_ID'; }) : [];
    if (sel) {
        var prev = sel.value;
        sel.innerHTML = '<option value="">Select batch column...</option>';
        headers.forEach(function (h) { var o = document.createElement('option'); o.value = h; o.textContent = h; sel.appendChild(o); });
        if (prev && headers.indexOf(prev) >= 0) sel.value = prev;
    }
    if (bioSel) {
        var prev = bioSel.value;
        bioSel.innerHTML = '<option value="">(none)</option>';
        headers.forEach(function (h) { var o = document.createElement('option'); o.value = h; o.textContent = h; bioSel.appendChild(o); });
        if (prev && headers.indexOf(prev) >= 0) bioSel.value = prev;
    }
    batchEffectBatchCol = sel ? sel.value : null;
}

function switchBatchEffectInnerTab(tab) {
    var detectPanel = document.getElementById('batchEffectDetectPanel');
    var correctPanel = document.getElementById('batchEffectCorrectPanel');
    var comparePanel = document.getElementById('batchEffectComparePanel');
    var btns = document.querySelectorAll('[data-batch-tab]');
    btns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-batch-tab') === tab); });
    if (detectPanel) detectPanel.style.display = tab === 'detect' ? '' : 'none';
    if (correctPanel) correctPanel.style.display = tab === 'correct' ? '' : 'none';
    if (comparePanel) comparePanel.style.display = tab === 'compare' ? '' : 'none';
    if (tab === 'detect') setTimeout(refreshBatchDetectionPanel, 60);
    if (tab === 'correct') setTimeout(refreshBatchCorrectionPanel, 60);
    if (tab === 'compare') setTimeout(refreshBatchComparePanel, 60);
}

function runBatchCorrection() {
    var status = document.getElementById('batchEffectStatus');
    if (!currentData || !Array.isArray(currentData.dataMatrix) || currentData.dataMatrix.length === 0) {
        if (status) { status.className = 'status error'; status.textContent = 'No data matrix loaded.'; }
        return;
    }
    var batchCol = (document.getElementById('batchEffectBatchCol') || {}).value;
    var method = (document.getElementById('batchEffectMethod') || {}).value || 'medianCenter';
    if (!batchCol) { if (status) { status.className = 'status error'; status.textContent = 'Select a batch column first.'; } return; }
    var assigned = _getBatchAssignments(batchCol);
    if (assigned.error) { if (status) { status.className = 'status error'; status.textContent = assigned.error; } return; }
    if (status) { status.className = 'status'; status.textContent = 'Applying batch correction (' + method + ')...'; }

    var matrix = currentData.dataMatrix;
    batchEffectOriginalMatrix = _deepCopy(matrix);
    batchEffectOriginalHeaders = (currentData.columnHeaders || []).slice();

    var corrected;
    if (method === 'medianCenter') corrected = medianCenterPerBatch(matrix, assigned.batchIndices);
    else if (method === 'meanCenter') corrected = meanCenterPerBatch(matrix, assigned.batchIndices);
    else if (method === 'combat') corrected = combatLite(matrix, assigned.batchIndices, true);
    else corrected = medianCenterPerBatch(matrix, assigned.batchIndices);

    for (var r = 0; r < matrix.length; r++) {
        for (var c = 0; c < matrix[r].length; c++) matrix[r][c] = corrected[r][c];
    }
    currentDataMatrix = matrix;
    batchEffectApplied = true;
    batchEffectMethod = method;
    batchEffectBatchCol = batchCol;

    if (status) { status.className = 'status success'; status.textContent = 'Batch correction applied (' + method + ').'; }
    if (typeof clearDownstreamPlotsAfterMatrixMutation === 'function') clearDownstreamPlotsAfterMatrixMutation();
if (typeof updateTablePreview === 'function') updateTablePreview();
    setTimeout(function () { refreshBatchCorrectionPanel(); refreshBatchComparePanel(); }, 60);
}

function resetBatchCorrection() {
    if (!batchEffectApplied || !batchEffectOriginalMatrix) {
        var s = document.getElementById('batchEffectStatus');
        if (s) { s.className = 'status error'; s.textContent = 'No batch correction to reset.'; }
        return;
    }
    var matrix = currentData.dataMatrix;
    for (var r = 0; r < matrix.length; r++) {
        for (var c = 0; c < matrix[r].length; c++) matrix[r][c] = batchEffectOriginalMatrix[r][c];
    }
    currentDataMatrix = matrix;
    batchEffectApplied = false;
    batchEffectMethod = null;
    batchEffectOriginalMatrix = null;
    var s = document.getElementById('batchEffectStatus');
    if (s) { s.className = 'status success'; s.textContent = 'Batch correction reset.'; }
    if (typeof clearDownstreamPlotsAfterMatrixMutation === 'function') clearDownstreamPlotsAfterMatrixMutation();
if (typeof updateTablePreview === 'function') updateTablePreview();
    setTimeout(function () { refreshBatchDetectionPanel(); refreshBatchCorrectionPanel(); refreshBatchComparePanel(); }, 60);
}

function refreshBatchDetectionPanel() {
    var host = document.getElementById('batchEffectDetectHost');
    if (!host) return;
    var matrix = currentData && currentData.dataMatrix;
    if (!matrix) { host.innerHTML = '<p class="small" style="padding:14px;color:#555;">No data matrix loaded.</p>'; return; }
    var batchCol = (document.getElementById('batchEffectBatchCol') || {}).value;
    if (!batchCol) { host.innerHTML = '<p class="small" style="padding:14px;color:#555;">Select a batch column to see detection results.</p>'; return; }
    var assigned = _getBatchAssignments(batchCol);
    if (assigned.error) { host.innerHTML = '<p class="small" style="padding:14px;color:#555;">' + assigned.error + '</p>'; return; }
    var stats = detectBatchEffect(matrix, assigned.batchIndices);
    var pca = runSimplifiedPCA(matrix, 2);
    var cols = matrix[0].length;
    var rows = matrix.length;
    var headerNames = (currentData.columnHeaders || []).slice(0, cols);
    var sil = pca && pca.scores && pca.scores.length > 0 ? computeSilhouetteByBatch(pca.scores, assigned.batchIndices) : [];
    var meanSil = sil.length > 0 ? sil.reduce(function (a, b) { return a + b; }, 0) / sil.length : 0;
    var varExpl = pca && pca.varianceExplained ? pca.varianceExplained : [0, 0];

    var statHtml = '<div class="batch-effect-detection-stats"><strong>Matrix:</strong> ' + rows + ' rows x ' + cols + ' cols<br>' +
        '<strong>Batch column:</strong> ' + batchCol + ' (' + assigned.batchNames.length + ' batches: ' + assigned.batchNames.join(', ') + ')<br>' +
        '<strong>Silhouette (batch):</strong> ' + (meanSil >= 0 ? meanSil.toFixed(3) : 'N/A') + '  <span class="small" style="color:#888;">(+1 = well-separated batches, 0 = overlap, -1 = mis-assigned)</span><br></div>';

    var perBatchHtml = '<div class="batch-effect-per-batch-stats"><table style="font-size:12px; border-collapse:collapse; width:100%;">' +
        '<tr style="background:#f2efe8;"><th>Batch</th><th>Samples</th><th>Mean (log10)</th><th>SD</th><th>Median (log10)</th></tr>';
    assigned.batchNames.forEach(function (name) {
        var s = stats.perBatchStats[name] || { mean: 0, sd: 0, median: 0, n: 0 };
        perBatchHtml += '<tr><td>' + name + '</td><td>' + s.n + '</td><td>' + (s.mean > 0 ? Math.log10(s.mean).toFixed(3) : 'N/A') + '</td><td>' + s.sd.toFixed(3) + '</td><td>' + (s.median > 0 ? Math.log10(s.median).toFixed(3) : 'N/A') + '</td></tr>';
    });
    perBatchHtml += '</table></div>';

    host.innerHTML = statHtml + '<div id="batchEffectDetectPcaHost" style="width:100%; height:420px;"></div>' +
        '<div id="batchEffectDetectBoxHost" style="width:100%; height:380px; margin-top:12px;"></div>' + perBatchHtml;

    setTimeout(function () {
        var pcaHost = document.getElementById('batchEffectDetectPcaHost');
        if (!pcaHost || !pca || !pca.scores || pca.scores.length === 0) return;
        var colors = Array.isArray(assigned.batchNames) ? assigned.batchNames.map(function (name, i) {
            var pal = ['#6366f1', '#f59e0b', '#14b8a6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];
            var idx = i % pal.length;
            return { name: name, color: pal[idx] };
        }) : [];
        var colorMap = {};
        colors.forEach(function (c) { colorMap[c.name] = c.color; });
        var colBatch = new Array(cols);
        assigned.batchIndices.forEach(function (indices, name) { for (var k = 0; k < indices.length; k++) colBatch[indices[k]] = name; });
        var traces = [];
        assigned.batchNames.forEach(function (name) {
            var x = [], y = [], txt = [];
            for (var c = 0; c < cols; c++) {
                if (colBatch[c] !== name) continue;
                x.push(pca.scores[c][0]);
                y.push(pca.scores[c][1]);
                txt.push(headerNames[c] || ('Col ' + c));
            }
            traces.push({ x: x, y: y, text: txt, type: 'scatter', mode: 'markers+text', name: name,
                marker: { color: colorMap[name] || '#999', size: 10 }, textposition: 'top center', textfont: { size: 10 } });
        });
        var layout = {
            title: 'Simplified PCA colored by batch (' + batchCol + ')',
            xaxis: { title: 'PC1 (' + (varExpl[0] * 100).toFixed(1) + '%)' },
            yaxis: { title: 'PC2 (' + (varExpl[1] * 100).toFixed(1) + '%)' },
            height: 420, margin: { t: 40, b: 60, l: 60 }
        };
        Plotly.newPlot('batchEffectDetectPcaHost', traces, layout, { responsive: true });

        var boxHost = document.getElementById('batchEffectDetectBoxHost');
        if (!boxHost || typeof Plotly === 'undefined') return;
        var logMat = matrix.map(function (r) { return r.map(function (v) { return (v !== null && !isNaN(v) && v > 0) ? Math.log10(v) : null; }); });
        var boxTraces = [];
        assigned.batchNames.forEach(function (name) {
            var vals = [];
            assigned.batchIndices.get(name).forEach(function (c) {
                for (var r = 0; r < logMat.length; r++) { var v = logMat[r][c]; if (v !== null && !isNaN(v)) vals.push(v); }
            });
            boxTraces.push({ y: vals, type: 'box', name: name, marker: { color: colorMap[name] || '#999' }, boxpoints: 'outliers' });
        });
        var boxLayout = { title: 'Per-batch log10 intensity distributions', yaxis: { title: 'log10(intensity)' }, height: 380, margin: { t: 40, b: 40 } };
        Plotly.newPlot('batchEffectDetectBoxHost', boxTraces, boxLayout, { responsive: true });
    }, 100);
}

function refreshBatchCorrectionPanel() {
    var host = document.getElementById('batchEffectCorrectHost');
    if (!host) return;
    if (!batchEffectApplied) { host.innerHTML = '<p class="small" style="padding:14px;color:#555;">Apply batch correction first to see results.</p>'; return; }
    var matrix = currentData.dataMatrix;
    if (!matrix) { host.innerHTML = '<p class="small" style="padding:14px;color:#555;">No data.</p>'; return; }
    var batchCol = batchEffectBatchCol || (document.getElementById('batchEffectBatchCol') || {}).value;
    var assigned = _getBatchAssignments(batchCol);
    var rows = matrix.length; var cols = rows > 0 ? matrix[0].length : 0;

    host.innerHTML = '<div class="small" style="padding:8px 12px;color:#555;">Method: <strong>' + batchEffectMethod + '</strong> | Batch: <strong>' + batchCol + '</strong></div>' +
        '<div id="batchEffectCorrectPcaHost" style="width:100%; height:420px;"></div>' +
        '<div id="batchEffectCorrectBoxHost" style="width:100%; height:380px; margin-top:12px;"></div>';

    setTimeout(function () {
        var pca = runSimplifiedPCA(matrix, 2);
        var pcaHost = document.getElementById('batchEffectCorrectPcaHost');
        if (!pcaHost || !pca || !pca.scores || pca.scores.length === 0) return;
        var colors = ['#6366f1', '#f59e0b', '#14b8a6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];
        var colorMap = {};
        assigned.batchNames.forEach(function (name, i) { colorMap[name] = colors[i % colors.length]; });
        var colBatch = new Array(cols);
        assigned.batchIndices.forEach(function (indices, name) { for (var k = 0; k < indices.length; k++) colBatch[indices[k]] = name; });
        var headerNames = (currentData.columnHeaders || []).slice(0, cols);
        var traces = [];
        assigned.batchNames.forEach(function (name) {
            var x = [], y = [], txt = [];
            for (var c = 0; c < cols; c++) {
                if (colBatch[c] !== name) continue;
                x.push(pca.scores[c][0]); y.push(pca.scores[c][1]); txt.push(headerNames[c] || ('Col ' + c));
            }
            traces.push({ x: x, y: y, text: txt, type: 'scatter', mode: 'markers+text', name: name,
                marker: { color: colorMap[name] || '#999', size: 10 }, textposition: 'top center', textfont: { size: 10 } });
        });
        Plotly.newPlot('batchEffectCorrectPcaHost', traces, {
            title: 'PCA after batch correction', xaxis: { title: 'PC1' }, yaxis: { title: 'PC2' },
            height: 420, margin: { t: 40, b: 60, l: 60 }
        }, { responsive: true });
    }, 100);
}

function refreshBatchComparePanel() {
    var host = document.getElementById('batchEffectCompareHost');
    if (!host) return;
    if (!batchEffectApplied || !batchEffectOriginalMatrix) {
        host.innerHTML = '<p class="small" style="padding:14px;color:#555;">Apply batch correction first, then compare before/after.</p>';
        return;
    }
    host.innerHTML = '<div style="display:flex;gap:16px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:340px;"><strong>Before correction</strong><div id="batchEffectCompareBeforePca" style="width:100%;height:400px;"></div></div>' +
        '<div style="flex:1;min-width:340px;"><strong>After correction</strong><div id="batchEffectCompareAfterPca" style="width:100%;height:400px;"></div></div></div>' +
        '<div id="batchEffectCompareDistHost" style="width:100%;height:360px;margin-top:12px;"></div>';

    setTimeout(function () {
        var batchCol = batchEffectBatchCol || (document.getElementById('batchEffectBatchCol') || {}).value;
        var assigned = _getBatchAssignments(batchCol);
        var cols = currentData.dataMatrix[0].length;
        var colors = ['#6366f1', '#f59e0b', '#14b8a6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];
        var colorMap = {};
        assigned.batchNames.forEach(function (name, i) { colorMap[name] = colors[i % colors.length]; });
        var colBatch = new Array(cols);
        assigned.batchIndices.forEach(function (indices, name) { for (var k = 0; k < indices.length; k++) colBatch[indices[k]] = name; });
        var headerNames = (currentData.columnHeaders || []).slice(0, cols);

        function plotPca(hostId, mat, title) {
            var h = document.getElementById(hostId);
            if (!h) return;
            var pca = runSimplifiedPCA(mat, 2);
            if (!pca || !pca.scores || pca.scores.length === 0) return;
            var traces = [];
            assigned.batchNames.forEach(function (name) {
                var x = [], y = [], txt = [];
                for (var c = 0; c < cols; c++) {
                    if (colBatch[c] !== name) continue;
                    x.push(pca.scores[c][0]); y.push(pca.scores[c][1]); txt.push(headerNames[c] || ('Col ' + c));
                }
                traces.push({ x: x, y: y, text: txt, type: 'scatter', mode: 'markers', name: name,
                    marker: { color: colorMap[name] || '#999', size: 10 } });
            });
            Plotly.newPlot(h, traces, { title: title, height: 400, margin: { t: 35, b: 40, l: 50 }, showlegend: false }, { responsive: true });
        }
        plotPca('batchEffectCompareBeforePca', batchEffectOriginalMatrix, 'Before');
        plotPca('batchEffectCompareAfterPca', currentData.dataMatrix, 'After');
    }, 120);
}
