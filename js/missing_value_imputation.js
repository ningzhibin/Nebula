/*
 * Missing Value Imputation for Nebula
 * Methods: MinProb (MNAR), Sequential KNN / SeqKNN (MCAR via Web Worker),
 *          Seq KNN + MinProb hybrid (KNN within the missing-% caps, MinProb for the rest),
 *          Median, Mean, Global Min, Zero.
 * On apply, rewrites currentData.dataMatrix in-place; downstream recomputes from it.
 */

var imputationApplied = false;
var imputationAppliedMethod = null;
var imputationAppliedParams = null;
var imputationOriginalMatrix = null;
var imputationOriginalColumnHeaders = null;
var imputationBeforeStats = null;
var imputationAfterStats = null;
var imputationMask = null;
var imputationWorker = null;
var imputationWorkerBusy = false;
var imputationLastSkippedRows = 0;

function _ensureImputationWorker() {
    if (imputationWorker) return;
    if (typeof Worker === 'undefined' || !window._imputationWorkerSrc) return;
    var blob = new Blob([window._imputationWorkerSrc], { type: 'application/javascript' });
    imputationWorker = new Worker(URL.createObjectURL(blob));
    imputationWorker.onerror = function (err) { console.error('Imputation Worker error:', err); };
}

function _destroyImputationWorker() {
    if (imputationWorker) { try { imputationWorker.terminate(); } catch (e) {} imputationWorker = null; }
    imputationWorkerBusy = false;
}
function _countMissing(matrix, zeroIsMissing) {
    var rows = matrix.length;
    var cols = rows > 0 ? matrix[0].length : 0;
    var total = rows * cols, missing = 0;
    var perCol = new Array(cols).fill(0), perRow = new Array(rows).fill(0);
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            var v = matrix[r][c];
            if (v === null || isNaN(v) || (zeroIsMissing && Number(v) === 0)) {
                missing++; perCol[c]++; perRow[r]++;
            }
        }
    }
    return { totalCells: total, missingCells: missing, missingFraction: total > 0 ? missing / total : 0, perCol: perCol, perRow: perRow };
}

function _deepCopyMatrix(m) {
    return m.map(function (r) { return r.slice(); });
}

function _isMissingValue(v, zeroIsMissing) {
    return v === null || isNaN(v) || (zeroIsMissing && Number(v) === 0);
}

function imputeMinProb(matrix, downshift, width, zeroIsMissing) {
    var rows = matrix.length, cols = rows > 0 ? matrix[0].length : 0;
    var result = _deepCopyMatrix(matrix);
    for (var c = 0; c < cols; c++) {
        var logVals = [];
        for (var r = 0; r < rows; r++) {
            var v = matrix[r][c];
            if (v !== null && !isNaN(v) && (!zeroIsMissing || Number(v) !== 0)) logVals.push(Math.log10(1 + Number(v)));
        }
        if (logVals.length < 2) continue;
        var mean = 0, variance = 0;
        for (var i = 0; i < logVals.length; i++) mean += logVals[i];
        mean /= logVals.length;
        for (var i = 0; i < logVals.length; i++) variance += (logVals[i] - mean) * (logVals[i] - mean);
        variance /= (logVals.length - 1);
        var sd = Math.sqrt(Math.max(0, variance));
        var shift = mean - downshift * sd;
        var w = width * sd;
        for (var r = 0; r < rows; r++) {
            var v = matrix[r][c];
            if (v === null || isNaN(v) || (zeroIsMissing && Number(v) === 0)) {
                var u1 = Math.random(), u2 = Math.random();
                var z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
                result[r][c] = Math.max(0, Math.pow(10, shift + z * Math.max(w, 1e-10)) - 1);
            }
        }
    }
    return result;
}

function imputeMedianPerColumn(matrix, zeroIsMissing) {
    var rows = matrix.length, cols = rows > 0 ? matrix[0].length : 0;
    var result = _deepCopyMatrix(matrix);
    for (var c = 0; c < cols; c++) {
        var vals = [];
        for (var r = 0; r < rows; r++) {
            var v = matrix[r][c];
            if (v !== null && !isNaN(v) && (!zeroIsMissing || Number(v) !== 0)) vals.push(v);
        }
        if (vals.length === 0) continue;
        vals.sort(function (a, b) { return a - b; });
        var mid = Math.floor(vals.length / 2);
        var median = vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
        for (var r = 0; r < rows; r++) {
            var v = matrix[r][c];
            if (v === null || isNaN(v) || (zeroIsMissing && Number(v) === 0)) result[r][c] = median;
        }
    }
    return result;
}

function imputeMeanPerColumn(matrix, zeroIsMissing) {
    var rows = matrix.length, cols = rows > 0 ? matrix[0].length : 0;
    var result = _deepCopyMatrix(matrix);
    for (var c = 0; c < cols; c++) {
        var sum = 0, count = 0;
        for (var r = 0; r < rows; r++) {
            var v = matrix[r][c];
            if (v !== null && !isNaN(v) && (!zeroIsMissing || Number(v) !== 0)) { sum += v; count++; }
        }
        var mean = count > 0 ? sum / count : 0;
        for (var r = 0; r < rows; r++) {
            var v = matrix[r][c];
            if (v === null || isNaN(v) || (zeroIsMissing && Number(v) === 0)) result[r][c] = mean;
        }
    }
    return result;
}

function imputeGlobalMin(matrix, zeroIsMissing) {
    var rows = matrix.length, cols = rows > 0 ? matrix[0].length : 0;
    var result = _deepCopyMatrix(matrix);
    var globalMin = Infinity;
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            var v = matrix[r][c];
            if (v !== null && !isNaN(v) && (!zeroIsMissing || Number(v) !== 0) && v < globalMin) globalMin = v;
        }
    }
    if (!isFinite(globalMin)) globalMin = 0;
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            var v = matrix[r][c];
            if (v === null || isNaN(v) || (zeroIsMissing && Number(v) === 0)) result[r][c] = globalMin;
        }
    }
    return result;
}

function imputeZeroFill(matrix, zeroIsMissing) {
    var rows = matrix.length, cols = rows > 0 ? matrix[0].length : 0;
    var result = _deepCopyMatrix(matrix);
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            var v = matrix[r][c];
            if (v === null || isNaN(v) || (zeroIsMissing && Number(v) === 0)) result[r][c] = 0;
        }
    }
    return result;
}

function _missingMaskOf(matrix, zeroIsMissing) {
    var mask = [];
    for (var r = 0; r < matrix.length; r++) {
        mask[r] = [];
        for (var c = 0; c < matrix[r].length; c++) {
            var v = matrix[r][c];
            mask[r][c] = (v === null || isNaN(v) || (zeroIsMissing && Number(v) === 0));
        }
    }
    return mask;
}

function runImputationKnnAsync(matrix, k, zeroIsMissing, opts, progressCallback) {
    if (typeof opts === 'function') { progressCallback = opts; opts = {}; }
    return new Promise(function (resolve, reject) {
        _ensureImputationWorker();
        if (!imputationWorker) { reject(new Error('Web Worker unavailable')); return; }
        if (imputationWorkerBusy) { reject(new Error('KNN imputation already in progress')); return; }
        imputationWorkerBusy = true;
        imputationWorker.onmessage = function (e) {
            var d = e.data;
            if (!d) return;
            if (d.type === 'progress' && typeof progressCallback === 'function') {
                progressCallback(d.progress, d.message);
            } else if (d.type === 'result') {
                imputationWorkerBusy = false;
                if (d.error) reject(new Error(d.error));
                else { imputationLastSkippedRows = d.skippedRows || 0; resolve(d.imputedMatrix); }
            }
        };
        imputationWorker.postMessage({ type: 'knn', data: { matrix: matrix, k: k, zeroIsMissing: zeroIsMissing, opts: opts || {} } });
        setTimeout(function () { if (imputationWorkerBusy) { _destroyImputationWorker(); reject(new Error('KNN timeout')); } }, 300000);
    });
}

// ---- UI functions ----

function _imputationMethodLabel(method) {
    switch (method) {
        case 'knn': return 'Sequential KNN';
        case 'knnMinProb': return 'Seq KNN + MinProb';
        case 'minProb': return 'MinProb';
        case 'median': return 'Median per column';
        case 'mean': return 'Mean per column';
        case 'globalMin': return 'Global minimum';
        case 'zero': return 'Zero fill';
        default: return method;
    }
}

function onImputationMethodChange() {
    var method = (document.getElementById('imputationMethod') || {}).value || 'knn';
    var minProbBlock = document.getElementById('imputationMinProbParams');
    var knnBlock = document.getElementById('imputationKnnParams');
    var hybridHint = document.getElementById('imputationHybridHint');
    var usesKnn = (method === 'knn' || method === 'knnMinProb');
    var usesMinProb = (method === 'minProb' || method === 'knnMinProb');
    if (minProbBlock) minProbBlock.style.display = usesMinProb ? '' : 'none';
    if (knnBlock) knnBlock.style.display = usesKnn ? '' : 'none';
    if (hybridHint) hybridHint.style.display = method === 'knnMinProb' ? '' : 'none';
    if (usesKnn && typeof refreshImputationKnnGroupOptions === 'function') {
        refreshImputationKnnGroupOptions();
    }
}

function runImputation() {
    var status = document.getElementById('imputationStatus');
    if (!currentData || !Array.isArray(currentData.dataMatrix) || currentData.dataMatrix.length === 0) {
        if (status) { status.className = 'status error'; status.textContent = 'No data matrix loaded.'; }
        return;
    }
    var method = (document.getElementById('imputationMethod') || {}).value || 'knn';
    var methodLabel = _imputationMethodLabel(method);
    var zeroIsMissing = !!(document.getElementById('imputationZeroIsMissing') || {}).checked;
    var repetitive = !!(document.getElementById('imputationRepetitive') || {}).checked;
    var matrix = currentData.dataMatrix;
    // Non-repetitive (default): re-impute from the original matrix so repeated Apply clicks never compound prior imputations.
    if (!repetitive && imputationOriginalMatrix &&
        imputationOriginalMatrix.length === matrix.length &&
        imputationOriginalMatrix[0] && imputationOriginalMatrix[0].length === matrix[0].length) {
        for (var r = 0; r < matrix.length; r++) {
            for (var c = 0; c < matrix[r].length; c++) {
                matrix[r][c] = imputationOriginalMatrix[r][c];
            }
        }
        currentDataMatrix = matrix;
    }
    imputationBeforeStats = _countMissing(matrix, zeroIsMissing);
    if (status) { status.className = 'status'; status.textContent = 'Imputing (' + methodLabel + ')...'; }

    function finish(imputedMatrix) {
        // Keep the true original snapshot: take it only on the first apply (or when the data
        // has changed shape, e.g. a new matrix was loaded) so Reset always restores the source data.
        var keepOrig = imputationOriginalMatrix &&
            imputationOriginalMatrix.length === matrix.length &&
            imputationOriginalMatrix[0] && imputationOriginalMatrix[0].length === matrix[0].length;
if (!keepOrig) {
            imputationOriginalMatrix = _deepCopyMatrix(matrix);
            imputationOriginalColumnHeaders = (currentData.columnHeaders || []).slice();
        }
        imputationMask = _missingMaskOf(matrix, zeroIsMissing);
        for (var r = 0; r < matrix.length; r++) {
            for (var c = 0; c < matrix[r].length; c++) {
                matrix[r][c] = imputedMatrix[r][c];
            }
        }
        currentDataMatrix = matrix;
        imputationAfterStats = _countMissing(matrix, zeroIsMissing);
        imputationApplied = true;
        imputationAppliedMethod = method;
        imputationAppliedParams = { zeroIsMissing: zeroIsMissing, repetitive: repetitive };
        if (method === 'knn' || method === 'knnMinProb') {
            imputationAppliedParams.k = Number((document.getElementById('imputationKnnK') || {}).value || 5);
            imputationAppliedParams.metric = (document.getElementById('imputationKnnMetric') || {}).value || 'euclidean';
            imputationAppliedParams.minShared = Number((document.getElementById('imputationKnnMinShared') || {}).value || 1);
            imputationAppliedParams.fallback = (document.getElementById('imputationKnnFallback') || {}).value || 'columnMedian';
            imputationAppliedParams.weight = (document.getElementById('imputationKnnWeight') || {}).value || 'inverse';
            imputationAppliedParams.axis = (document.getElementById('imputationKnnAxis') || {}).value || 'row';
            var _mm = Number((document.getElementById('imputationKnnMaxMissing') || {}).value);
            imputationAppliedParams.maxMissingPct = isFinite(_mm) ? Math.max(0, Math.min(100, _mm)) : 100;
            var _mmg = Number((document.getElementById('imputationKnnMaxMissingGroup') || {}).value);
            imputationAppliedParams.maxMissingPctPerGroup = isFinite(_mmg) ? Math.max(0, Math.min(100, _mmg)) : 100;
            imputationAppliedParams.groupCol = (document.getElementById('imputationKnnGroupCol') || {}).value || '';
        }
        if (method === 'minProb' || method === 'knnMinProb') {
            imputationAppliedParams.downshift = Number((document.getElementById('imputationMinProbShift') || {}).value || 1.8);
            imputationAppliedParams.width = Number((document.getElementById('imputationMinProbWidth') || {}).value || 0.3);
        }
        if (status) {
            status.className = 'status success';
            var skippedNote = '';
            if (method === 'knn' && imputationLastSkippedRows > 0) {
                skippedNote = ' (' + imputationLastSkippedRows + ' row(s) left un-imputed: over the max missing % cap, per row or per group)';
            } else if (method === 'knnMinProb' && imputationLastSkippedRows > 0) {
                skippedNote = ' (' + imputationLastSkippedRows + ' row(s) above the caps filled by MinProb; the rest by Seq KNN)';
            }
            status.textContent = 'Imputation applied (' + methodLabel + '). ' + imputationBeforeStats.missingCells + ' cells -> ' + imputationAfterStats.missingCells + ' missing.' + skippedNote;
        }
        if (typeof clearDownstreamPlotsAfterMatrixMutation === 'function') clearDownstreamPlotsAfterMatrixMutation();
        if (typeof updateTablePreview === 'function') updateTablePreview();
        setTimeout(function () { refreshImputationOverview(); refreshImputationDistribution(); refreshImputationAllSamples(); refreshImputationMatrix(); }, 60);
    }

    if (method === 'knn' || method === 'knnMinProb') {
        var isHybrid = (method === 'knnMinProb');
        var kVal = Number((document.getElementById('imputationKnnK') || {}).value || 5);
        var maxMissPct = Number((document.getElementById('imputationKnnMaxMissing') || {}).value);
        if (!isFinite(maxMissPct)) maxMissPct = 100;
        maxMissPct = Math.max(0, Math.min(100, maxMissPct));
        var maxMissGroupPct = Number((document.getElementById('imputationKnnMaxMissingGroup') || {}).value);
        if (!isFinite(maxMissGroupPct)) maxMissGroupPct = 100;
        maxMissGroupPct = Math.max(0, Math.min(100, maxMissGroupPct));
        var groupCol = (document.getElementById('imputationKnnGroupCol') || {}).value || '';
        var columnGroups = (groupCol && typeof buildColumnGroupKeysForImputation === 'function')
            ? buildColumnGroupKeysForImputation(groupCol) : null;
        var knnOpts = {
            metric: (document.getElementById('imputationKnnMetric') || {}).value || 'euclidean',
            minShared: Number((document.getElementById('imputationKnnMinShared') || {}).value || 1),
            fallback: (document.getElementById('imputationKnnFallback') || {}).value || 'columnMedian',
            weight: (document.getElementById('imputationKnnWeight') || {}).value || 'inverse',
            axis: (document.getElementById('imputationKnnAxis') || {}).value || 'row',
            maxMissingFrac: maxMissPct / 100,
            maxMissingFracPerGroup: maxMissGroupPct / 100,
            columnGroups: columnGroups
        };
        runImputationKnnAsync(matrix, kVal, zeroIsMissing, knnOpts, function (progress, msg) {
            if (status) { status.textContent = (isHybrid ? 'Step 1/2 - ' : '') + msg; }
        }).then(function (knnMatrix) {
            if (!isHybrid) { finish(knnMatrix); return; }
            // Hybrid: SeqKNN filled the within-cap (MCAR-ish) rows; MinProb now fills
            // whatever SeqKNN deliberately left missing (the sparse, likely-MNAR rows).
            // MinProb column stats come from the ORIGINAL observed values (matrix is
            // untouched here - the worker imputes a structured-clone copy).
            if (status) { status.textContent = 'Step 2/2 - MinProb on remaining missing...'; }
            var shiftH = Number((document.getElementById('imputationMinProbShift') || {}).value || 1.8);
            var widthH = Number((document.getElementById('imputationMinProbWidth') || {}).value || 0.3);
            var minProbFull = imputeMinProb(matrix, shiftH, widthH, zeroIsMissing);
            var combined = knnMatrix.map(function (row, r) {
                return row.map(function (v, c) {
                    return _isMissingValue(v, zeroIsMissing) ? minProbFull[r][c] : v;
                });
            });
            finish(combined);
        }).catch(function (err) {
            if (status) { status.className = 'status error'; status.textContent = 'Error: ' + err.message; }
        });
    } else {
        var imputed = null;
        if (method === 'minProb') {
            var shift = Number((document.getElementById('imputationMinProbShift') || {}).value || 1.8);
            var width = Number((document.getElementById('imputationMinProbWidth') || {}).value || 0.3);
            imputed = imputeMinProb(matrix, shift, width, zeroIsMissing);
        } else if (method === 'median') imputed = imputeMedianPerColumn(matrix, zeroIsMissing);
        else if (method === 'mean') imputed = imputeMeanPerColumn(matrix, zeroIsMissing);
        else if (method === 'globalMin') imputed = imputeGlobalMin(matrix, zeroIsMissing);
        else if (method === 'zero') imputed = imputeZeroFill(matrix, zeroIsMissing);
        if (imputed) finish(imputed);
    }
}

function resetImputation() {
    if (!imputationApplied || !imputationOriginalMatrix) {
        var s = document.getElementById('imputationStatus');
        if (s) { s.className = 'status error'; s.textContent = 'No imputation to reset.'; }
        return;
    }
    var matrix = currentData.dataMatrix;
    for (var r = 0; r < matrix.length; r++) {
        for (var c = 0; c < matrix[r].length; c++) {
            matrix[r][c] = imputationOriginalMatrix[r][c];
        }
    }
    currentDataMatrix = matrix;
    imputationApplied = false;
    imputationAppliedMethod = null;
    imputationAppliedParams = null;
    imputationOriginalMatrix = null;
imputationBeforeStats = null;
    imputationAfterStats = null;
    imputationMask = null;
    var s = document.getElementById('imputationStatus');
    if (s) { s.className = 'status success'; s.textContent = 'Imputation reset. Matrix restored to original.'; }
    if (typeof clearDownstreamPlotsAfterMatrixMutation === 'function') clearDownstreamPlotsAfterMatrixMutation();
    if (typeof updateTablePreview === 'function') updateTablePreview();
    setTimeout(function () { refreshImputationOverview(); refreshImputationDistribution(); refreshImputationAllSamples(); refreshImputationMatrix(); }, 60);
}

function switchImputationInnerTab(tab) {
    var overview = document.getElementById('imputationOverviewPanel');
    var dist = document.getElementById('imputationDistributionPanel');
    var allSamples = document.getElementById('imputationAllSamplesPanel');
    var matrixPanel = document.getElementById('imputationMatrixPanel');
    var btns = document.querySelectorAll('[data-imputation-tab]');
    btns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-imputation-tab') === tab); });
    if (overview) overview.style.display = tab === 'overview' ? '' : 'none';
    if (dist) dist.style.display = tab === 'distribution' ? '' : 'none';
    if (allSamples) allSamples.style.display = tab === 'allsamples' ? '' : 'none';
    if (matrixPanel) matrixPanel.style.display = tab === 'matrix' ? '' : 'none';
    if (tab === 'distribution') setTimeout(refreshImputationDistribution, 60);
    if (tab === 'allsamples') setTimeout(refreshImputationAllSamples, 60);
    if (tab === 'matrix') setTimeout(refreshImputationMatrix, 60);
}

function refreshImputationAllSamples() {
    var host = document.getElementById('imputationAllSamplesHost');
    if (!host) return;
    var matrix = currentData && currentData.dataMatrix;
    if (!matrix || matrix.length === 0) { host.innerHTML = '<p class="small" style="padding:14px;color:#555;">No data to display.</p>'; return; }
    var headers = (currentData.columnHeaders || []);
    var cols = matrix[0].length;
    var hasImputation = !!(imputationApplied && imputationOriginalMatrix);
    var collect = function (m, c) {
        var vals = [];
        for (var r = 0; r < m.length; r++) {
            var v = m[r][c];
            if (v !== null && !isNaN(v) && Number(v) > 0) vals.push(Number(v));
        }
        return vals;
    };
    var ROW_PEAK = 0.85;
    var ROW_HEIGHT = 46;
    var traces = [];
    var firstOfGroup = {};
    for (var c = 0; c < cols; c++) {
        var curves = [];
        if (hasImputation) {
            var beforeVals = collect(imputationOriginalMatrix, c);
            if (beforeVals.length >= 2) curves.push({ vals: beforeVals, name: 'Before imputation', color: '#8884d8', fill: 'rgba(136,132,216,0.35)' });
        }
        var afterVals = collect(matrix, c);
        if (afterVals.length >= 2) curves.push({ vals: afterVals, name: hasImputation ? 'After imputation' : 'Before imputation', color: hasImputation ? '#82ca9d' : '#8884d8', fill: hasImputation ? 'rgba(130,202,157,0.35)' : 'rgba(136,132,216,0.35)' });
        if (curves.length === 0) continue;
        var kdes = [];
        var xmin = Infinity, xmax = -Infinity;
        for (var k = 0; k < curves.length; k++) {
            var kd = _computeKdeCurve(_subsampleForKde(curves[k].vals.map(Math.log10), 4000), 160);
            var peak = 0;
            for (var i = 0; i < kd.ys.length; i++) if (kd.ys[i] > peak) peak = kd.ys[i];
            if (!peak || !isFinite(peak)) { kdes.push(null); continue; }
            kdes.push({ xs: kd.xs, ys: kd.ys, peak: peak });
            if (kd.xs[0] < xmin) xmin = kd.xs[0];
            if (kd.xs[kd.xs.length - 1] > xmax) xmax = kd.xs[kd.xs.length - 1];
        }
        if (xmin === Infinity) continue;
        for (var k2 = 0; k2 < curves.length; k2++) {
            if (!kdes[k2]) continue;
            var gname = curves[k2].name;
            var isFirst = !firstOfGroup[gname];
            firstOfGroup[gname] = true;
            var xs = kdes[k2].xs.slice();
            var ys = kdes[k2].ys.map(function (y) { return c + ROW_PEAK * (y / kdes[k2].peak); });
            xs.push(xmax); ys.push(c);
            xs.push(xmin); ys.push(c);
            traces.push({ x: xs, y: ys, type: 'scatter', mode: 'lines', name: gname, legendgroup: gname,
                line: { color: curves[k2].color, width: 1.5 }, fill: 'toself', fillcolor: curves[k2].fill,
                hoverinfo: 'skip', showlegend: isFirst });
        }
    }
    var height = Math.min(70 + cols * ROW_HEIGHT, 2200);
    var tickvals = [], ticktext = [];
    for (var t = 0; t < cols; t++) { tickvals.push(t); ticktext.push(headers[t] || ('Sample ' + (t + 1))); }
    var layout = {
        title: 'Per-sample log10 intensity distribution' + (hasImputation ? ' — before vs after imputation' : ''),
        xaxis: { title: 'log10(intensity)', showgrid: true, gridcolor: '#e8e8e8', zeroline: false },
        yaxis: { tickmode: 'array', tickvals: tickvals, ticktext: ticktext,
            range: [-0.5, cols + 0.5], showgrid: false, zeroline: false },
        showlegend: true, legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom' },
        height: height, margin: { t: 50, b: 40, l: 90, r: 10 }
    };
    Plotly.newPlot('imputationAllSamplesHost', traces, layout, { responsive: true, displaylogo: false });
    host.style.height = height + 'px';
}

function refreshImputationMatrix() {
    var host = document.getElementById('imputationMatrixHost');
    if (!host) return;
    // Don't render into a hidden panel: the DataTables scroll shell measures the panel at draw
    // time, and the tab switch re-renders when it becomes visible (switchImputationInnerTab).
    var panel = document.getElementById('imputationMatrixPanel');
    var hint = document.getElementById('imputationMatrixHint');
    if (panel && panel.style.display === 'none') return;
    if (window.TableDisplay && typeof window.TableDisplay.destroy === 'function') {
        try { window.TableDisplay.destroy(host); } catch (e) {}
    }
    var matrix = currentData && currentData.dataMatrix;
    if (!matrix || matrix.length === 0) {
        if (hint) hint.style.display = 'none';
        host.innerHTML = '<p class="small" style="padding:14px;color:#555;">No data to display.</p>';
        return;
    }
    if (hint) {
        hint.style.display = imputationMask ? '' : 'none';
        hint.textContent = imputationMask
            ? 'Green-tinted cells were imputed by the last Apply (missing before imputation).'
            : '';
    }
    if (!window.TableDisplay || typeof window.TableDisplay.renderMatrixPreview !== 'function') return;
    var headers = currentData.columnHeaders || [];
    var opt = {
        rowIds: [],
        columnHeaders: headers,
        rows: matrix,
        sortedIndices: [],
        escapeHtml: typeof escapeHtml === 'function' ? escapeHtml : undefined,
        highlightMask: imputationMask,
        getIdTooltip: function () { return ''; },
        getIdLink: function () { return ''; }
    };
    for (var r = 0; r < matrix.length; r++) {
        opt.sortedIndices.push(r);
        opt.rowIds.push((currentData.rowIds && currentData.rowIds[r]) || String(r + 1));
    }
    try {
        window.TableDisplay.renderMatrixPreview(host, opt);
    } catch (e) {
        if (window.console && console.error) console.error('[imputation] matrix preview failed:', e);
    }
}

function refreshImputationOverview() {
    var host = document.getElementById('imputationOverviewHost');
    if (!host) return;
    var matrix = currentData && currentData.dataMatrix;
    var cols = matrix && matrix.length > 0 ? matrix[0].length : 0;
    var rows = matrix ? matrix.length : 0;
    var zeroIsMissing = !!(document.getElementById('imputationZeroIsMissing') || {}).checked;
    var before = imputationApplied && imputationBeforeStats ? imputationBeforeStats : (matrix ? _countMissing(matrix, zeroIsMissing) : null);
    var after = imputationApplied && imputationAfterStats ? imputationAfterStats : (matrix ? _countMissing(matrix, zeroIsMissing) : null);
    var summaryEl = document.getElementById('imputationSummary');
    if (!matrix) {
        host.innerHTML = '<p class="small" style="padding:14px;color:#555;">No data matrix loaded. Use Data Preparation to load a matrix first.</p>';
        if (summaryEl) summaryEl.innerHTML = '';
        return;
    }
    var methodLabel = imputationApplied ? imputationAppliedMethod : '(none)';
    var missingBefore = before ? before.missingCells + ' (' + (before.missingFraction * 100).toFixed(1) + '%)' : 'N/A';
    var missingAfter = after ? after.missingCells + ' (' + (after.missingFraction * 100).toFixed(1) + '%)' : 'N/A';
    if (summaryEl) {
        summaryEl.innerHTML = '<strong>Matrix:</strong> ' + rows + ' rows x ' + cols + ' columns<br>' +
            '<strong>Imputation method:</strong> ' + methodLabel + '<br>' +
            '<strong>Missing before:</strong> ' + missingBefore + '<br>' +
            '<strong>Missing after:</strong> ' + missingAfter;
    }
    host.innerHTML = '<div id="imputationMissingHeatmap" style="width:100%;"></div>';
    setTimeout(function () {
        var hmHost = document.getElementById('imputationMissingHeatmap');
        if (!hmHost || !matrix) return;
        var current = currentData.dataMatrix;
        var countMissingPerCol = function (m) {
            var out = new Array(cols).fill(0);
            for (var r = 0; r < rows; r++) {
                for (var c = 0; c < cols; c++) {
                    var v = m[r][c];
                    if (v === null || isNaN(v) || (zeroIsMissing && Number(v) === 0)) out[c]++;
                }
            }
            return out;
        };
        var afterPerCol = countMissingPerCol(current);
        var beforePerCol = (imputationApplied && imputationOriginalMatrix) ? countMissingPerCol(imputationOriginalMatrix) : afterPerCol;
        var pct = function (counts) { return counts.map(function (c) { return rows > 0 ? c / rows * 100 : 0; }); };
        var fallbackH = Math.round(Math.min(2200, Math.max(260, 88 + cols * 20)));
        var containerH = host ? host.clientHeight : 0;
        var plotH = (containerH > 60) ? Math.max(260, containerH) : fallbackH;
        hmHost.style.height = plotH + 'px';
        var y = (currentData.columnHeaders || []).slice(0, cols);
        var bar = function (name, color, vals, hoverVals) {
            return { y: y, x: vals, customdata: hoverVals, type: 'bar', orientation: 'h', width: 0.45, name: name,
                marker: { color: color }, hovertemplate: '%{y}<br>%{customdata:.1f}% missing<extra>' + name + '</extra>' };
        };
        var beforePcts = pct(beforePerCol);
        var maxBefore = Math.max.apply(null, beforePcts);
        var minBar = Math.max(0.2, maxBefore * 0.03);
        var padBar = function (vals) { return vals.map(function (v) { return Math.max(v, minBar); }); };
        var traces = [bar('Before imputation', '#8884d8', padBar(beforePcts), beforePcts)];
        if (imputationApplied && imputationOriginalMatrix) {
            var afterPcts = pct(afterPerCol);
            traces.push(bar('After imputation', '#82ca9d', padBar(afterPcts), afterPcts));
        }
        var layout = { margin: { l: 160, r: 40, t: 45, b: 40 }, height: plotH,
            xaxis: { title: 'Missing %' }, yaxis: { autorange: 'reversed' }, barmode: 'group',
            showlegend: true,
            legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1, yanchor: 'top' } };
        Plotly.newPlot('imputationMissingHeatmap', traces, layout, { responsive: true });
    }, 100);
}

function refreshImputationDistribution() {
    var host = document.getElementById('imputationDistributionHost');
    if (!host) return;
    var matrix = currentData && currentData.dataMatrix;
    if (!matrix || matrix.length === 0) { host.innerHTML = '<p class="small" style="padding:14px;color:#555;">No data to display.</p>'; return; }
    var cols = matrix[0].length;
    var headers = (currentData.columnHeaders || []);
    var sel = document.getElementById('imputationDistributionScope');
    var prev = sel ? sel.value : 'all';
    if (sel) {
        if (sel.options.length !== cols + 1) {
            sel.innerHTML = '';
            var oAll = document.createElement('option');
            oAll.value = 'all';
            oAll.textContent = 'All samples (combined)';
            sel.appendChild(oAll);
            for (var c = 0; c < cols; c++) {
                var o = document.createElement('option');
                o.value = String(c);
                o.textContent = headers[c] || ('Sample ' + (c + 1));
                sel.appendChild(o);
            }
        }
        if (prev !== 'all' && (isNaN(parseInt(prev, 10)) || parseInt(prev, 10) >= cols)) prev = 'all';
        sel.value = prev;
    }
    var scopeIdx = prev === 'all' ? null : Math.min(Math.max(parseInt(prev, 10), 0), cols - 1);
    var collect = function (m) {
        var vals = [];
        for (var r = 0; r < m.length; r++) {
            if (scopeIdx == null) {
                for (var c = 0; c < m[r].length; c++) {
                    var v = m[r][c];
                    if (v !== null && !isNaN(v) && Number(v) > 0) vals.push(Number(v));
                }
            } else {
                var v2 = m[r][scopeIdx];
                if (v2 !== null && !isNaN(v2) && Number(v2) > 0) vals.push(Number(v2));
            }
        }
        return vals;
    };
    var hasImputation = !!(imputationApplied && imputationOriginalMatrix);
    var traces = [];
    if (hasImputation) {
        var beforeVals = collect(imputationOriginalMatrix);
        if (beforeVals.length >= 2) {
            var bc = _computeKdeCurve(_subsampleForKde(beforeVals.map(Math.log10), 4000), 160);
            traces.push({ x: bc.xs, y: bc.ys, type: 'scatter', mode: 'lines', name: 'Before imputation',
                line: { color: '#8884d8', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(136,132,216,0.35)', hoverinfo: 'skip' });
        }
    }
    var currentVals = collect(matrix);
    if (currentVals.length >= 2) {
        var ac = _computeKdeCurve(_subsampleForKde(currentVals.map(Math.log10), 4000), 160);
        traces.push({ x: ac.xs, y: ac.ys, type: 'scatter', mode: 'lines',
            name: hasImputation ? 'After imputation' : 'Before imputation',
            line: { color: hasImputation ? '#82ca9d' : '#8884d8', width: 2 }, fill: 'tozeroy',
            fillcolor: hasImputation ? 'rgba(130,202,157,0.35)' : 'rgba(136,132,216,0.35)', hoverinfo: 'skip' });
    }
    if (traces.length === 0) {
        host.innerHTML = '<p class="small" style="padding:14px;color:#555;">No values to display' +
            (scopeIdx == null ? '.' : ' for this sample.') + '</p>';
        return;
    }
    var title = 'Log10 intensity distribution (before vs after)';
    if (scopeIdx != null) title = 'Log10 intensity distribution — ' + (headers[scopeIdx] || ('Sample ' + (scopeIdx + 1)));
    var layout = { title: title, xaxis: { title: 'log10(intensity)' },
        yaxis: { title: 'Density' }, showlegend: true, margin: { t: 40, b: 40 } };
    Plotly.newPlot('imputationDistributionHost', traces, layout, { responsive: true });
}

function _subsampleForKde(vals, maxN) {
    if (vals.length <= maxN) return vals;
    var out = new Array(maxN);
    for (var i = 0; i < maxN; i++) out[i] = vals[Math.floor(Math.random() * vals.length)];
    return out;
}
function _computeKdeCurve(vals, gridPoints) {
    var n = vals.length;
    var sorted = vals.slice().sort(function (a, b) { return a - b; });
    var min = sorted[0], max = sorted[n - 1];
    var mean = 0;
    for (var i = 0; i < n; i++) mean += vals[i];
    mean /= n;
    var sd = 0;
    for (var j = 0; j < n; j++) sd += (vals[j] - mean) * (vals[j] - mean);
    sd = Math.sqrt(sd / n);
    var q1 = sorted[Math.floor(0.25 * (n - 1))], q3 = sorted[Math.floor(0.75 * (n - 1))];
    var bw = 0.9 * Math.min(sd, (q3 - q1) / 1.34) * Math.pow(n, -0.2);
    if (!isFinite(bw) || bw <= 0) bw = (max - min) / 20 || 0.1;
    var lo = min - 2.5 * bw, hi = max + 2.5 * bw;
    var xs = [], ys = [];
    for (var g = 0; g < gridPoints; g++) {
        var x = lo + (hi - lo) * g / (gridPoints - 1);
        var sum = 0;
        for (var k = 0; k < n; k++) {
            var z = (x - vals[k]) / bw;
            sum += Math.exp(-0.5 * z * z);
        }
        xs.push(x);
        ys.push(sum / (n * bw));
    }
    return { xs: xs, ys: ys };
}

