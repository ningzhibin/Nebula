/* SAINT + Enrichr embedded module (part 1: bridge). Requires js/saint_algorithm.js before this file. */

window.ensureD3Saint = function ensureD3Saint() {
    if (window.d3Saint) return Promise.resolve(window.d3Saint);
    if (window._d3SaintLoadPromise) return window._d3SaintLoadPromise;
    window._d3SaintLoadPromise = new Promise(function(resolve, reject) {
        var savedD3 = typeof window.d3 !== 'undefined' ? window.d3 : undefined;
        if (!window.d3Clustergrammer && savedD3) window.d3Clustergrammer = savedD3;
        var s = document.createElement('script');
        s.src = 'https://d3js.org/d3.v7.min.js';
        s.onload = function() {
            window.d3Saint = window.d3;
            window.d3 = window.d3Clustergrammer || savedD3;
            resolve(window.d3Saint);
        };
        s.onerror = function() { reject(new Error('Failed to load d3 v7')); };
        document.head.appendChild(s);
    });
    return window._d3SaintLoadPromise;
};

window.saintIntegratedData = null;
window.saintMetadataRows = null;
window.saintAnalysisRunning = false;
window.saintShouldStop = false;

/** Keep global currentDataMatrix and currentData.dataMatrix in sync (some loaders set only one). */
window.saintSyncMatrixRefs = function() {
    var cd = window.currentData;
    if (!cd) return;
    if (cd.dataMatrix && Array.isArray(cd.dataMatrix) && cd.dataMatrix.length > 0) {
        window.currentDataMatrix = cd.dataMatrix;
    } else if (window.currentDataMatrix && Array.isArray(window.currentDataMatrix) && window.currentDataMatrix.length > 0) {
        cd.dataMatrix = window.currentDataMatrix;
    }
};

window.saintGetMatrixForBridge = function() {
    window.saintSyncMatrixRefs();
    var m = window.currentDataMatrix;
    if (m && Array.isArray(m) && m.length > 0) return m;
    var cd = window.currentData;
    if (cd && cd.dataMatrix && Array.isArray(cd.dataMatrix) && cd.dataMatrix.length > 0) return cd.dataMatrix;
    return null;
};

window.saintEnsureMetaHeaders = function() {
    var md = window.metaData;
    if (!md || !md.rows || md.rows.length === 0) return false;
    if (!md.headers || !Array.isArray(md.headers) || md.headers.length === 0) {
        var keys = Object.keys(md.rows[0] || {});
        md.headers = keys.length ? keys : ['Sample_ID'];
    }
    return true;
};

window.saintGetNumFeatureColumns = function() {
    var el = document.getElementById('saintInputLevel');
    var level = (el && el.value) || 'protein';
    return level === 'fragment' ? 3 : (level === 'peptide' ? 2 : 1);
};

function saintBuildFeatureRow(ri, nFeat, proteinCol, pepCol, fragCol) {
    var cd = window.currentData;
    var rid = cd.rowIds[ri];
    var ann = cd.diannPgAnnotationRows && cd.diannPgAnnotationRows[ri];
    var annH = cd.diannPgAnnotationHeaders;
    if (nFeat === 1) return [String(rid)];
    if (ann && annH && nFeat >= 2) {
        var idxP = annH.indexOf(proteinCol);
        var idxPep = annH.indexOf(pepCol);
        var idxFrag = annH.indexOf(fragCol);
        if (nFeat === 2 && idxP >= 0 && idxPep >= 0) return [String(ann[idxP] || ''), String(ann[idxPep] || '')];
        if (nFeat === 3 && idxP >= 0 && idxPep >= 0 && idxFrag >= 0) {
            return [String(ann[idxP] || ''), String(ann[idxPep] || ''), String(ann[idxFrag] || '')];
        }
    }
    var parts = String(rid).split(/\t+/);
    if (nFeat === 2) return [parts[0] || '', parts[1] || ''];
    if (nFeat === 3) return [parts[0] || '', parts[1] || '', parts[2] || ''];
    return [String(rid)];
}

window.saintBuildIntegratedFromMainApp = function() {
    var cd = window.currentData;
    var md = window.metaData;
    var matrix = window.saintGetMatrixForBridge();
    if (!cd || !cd.rowIds || !cd.columnHeaders || !matrix || !md || !md.rows || !md.rows.length) return false;
    if (!window.saintEnsureMetaHeaders()) return false;

    var nFeat = window.saintGetNumFeatureColumns();
    var headers = cd.columnHeaders.map(String);
    var proteinCol = (document.getElementById('saintProteinColname') && document.getElementById('saintProteinColname').value.trim()) || 'Protein';
    var pepCol = (document.getElementById('saintPepColname') && document.getElementById('saintPepColname').value.trim()) || 'Peptide';
    var fragCol = (document.getElementById('saintFragColname') && document.getElementById('saintFragColname').value.trim()) || 'Fragment';

    var headerRow = [];
    var levelEl = document.getElementById('saintInputLevel');
    var level = (levelEl && levelEl.value) || 'protein';
    if (level === 'protein') headerRow = [proteinCol];
    else if (level === 'peptide') headerRow = [proteinCol, pepCol];
    else headerRow = [proteinCol, pepCol, fragCol];
    while (headerRow.length < nFeat) headerRow.push('');

    var groupColEl = document.getElementById('saintMetaGroupColumn');
    var baitColEl = document.getElementById('saintBaitColumn');
    var groupCol = groupColEl ? groupColEl.value : '';
    var baitCol = baitColEl ? baitColEl.value : '';
    var controlVal = (document.getElementById('saintControlValue') && document.getElementById('saintControlValue').value || '').trim();
    var treatmentVal = (document.getElementById('saintTreatmentValue') && document.getElementById('saintTreatmentValue').value || '').trim();
    var useStatus = document.getElementById('saintUseStatusAsIs') && document.getElementById('saintUseStatusAsIs').checked;

    var metaBySample = {};
    md.rows.forEach(function(r) {
        var sid = r.Sample_ID !== undefined ? r.Sample_ID : r.sample_id;
        if (sid != null && sid !== '') metaBySample[String(sid).trim()] = r;
    });

    var statusRow = headerRow.slice();
    var baitRow = headerRow.slice();
    var colnamesRow = headerRow.slice();

    for (var i = 0; i < nFeat; i++) {
        statusRow[i] = '';
        baitRow[i] = '';
    }

    for (var j = 0; j < headers.length; j++) {
        var sid = headers[j].trim();
        var r = metaBySample[sid];
        var st = '';
        var bait = '';
        if (r) {
            if (useStatus) {
                st = (r.Status !== undefined ? r.Status : r.status || '').trim().toUpperCase();
            } else if (groupCol) {
                var g = (r[groupCol] != null) ? String(r[groupCol]).trim() : '';
                if (g === controlVal) st = 'C';
                else if (g === treatmentVal) st = 'T';
                else st = '';
            }
            if (baitCol) bait = (r[baitCol] != null) ? String(r[baitCol]) : '';
        }
        statusRow[nFeat + j] = st;
        baitRow[nFeat + j] = bait;
        colnamesRow[nFeat + j] = sid;
    }

    var dataRows = [];
    for (var ri = 0; ri < cd.rowIds.length; ri++) {
        var feat = saintBuildFeatureRow(ri, nFeat, proteinCol, pepCol, fragCol);
        var row = feat.concat(matrix[ri] || []);
        dataRows.push(row);
    }

    window.saintIntegratedData = [statusRow, baitRow, colnamesRow].concat(dataRows);
    window.saintMetadataRows = [statusRow, baitRow, colnamesRow];
    return true;
};

window.saintBuildMetaBySampleId = function() {
    var map = new Map();
    var md = window.metaData;
    if (!md || !md.rows) return map;
    md.rows.forEach(function(r) {
        var sid = r.Sample_ID !== undefined ? r.Sample_ID : r.sample_id;
        if (sid != null && String(sid).trim() !== '') map.set(String(sid).trim(), r);
    });
    return map;
};

window.saintGetGroupLevelsForColumn = function(metaCol) {
    var cd = window.currentData;
    if (!metaCol || !cd || !Array.isArray(cd.columnHeaders)) return [];
    var metaMap = window.saintBuildMetaBySampleId();
    var asText = function(v) { return String(v == null ? '' : v).trim(); };
    var valueSet = new Set();
    cd.columnHeaders.forEach(function(sampleId) {
        var sid = asText(sampleId);
        var row = metaMap.get(sid);
        if (!row) return;
        var v = asText(row[metaCol]);
        if (v) valueSet.add(v);
    });
    return Array.from(valueSet).sort(function(a, b) {
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
};

window.saintUpdateGroupCounts = function() {
    var countsEl = document.getElementById('saintGroupCounts');
    if (!countsEl) return;
    var useStatus = document.getElementById('saintUseStatusAsIs') && document.getElementById('saintUseStatusAsIs').checked;
    if (useStatus) {
        countsEl.textContent = '';
        return;
    }
    var metaCol = document.getElementById('saintMetaGroupColumn') && document.getElementById('saintMetaGroupColumn').value;
    var ctrlVal = document.getElementById('saintControlValue') && document.getElementById('saintControlValue').value;
    var treatVal = document.getElementById('saintTreatmentValue') && document.getElementById('saintTreatmentValue').value;
    if (!metaCol || !ctrlVal || !treatVal) {
        countsEl.textContent = '';
        return;
    }
    var cd = window.currentData;
    if (!cd || !Array.isArray(cd.columnHeaders)) {
        countsEl.textContent = '';
        return;
    }
    var metaMap = window.saintBuildMetaBySampleId();
    var asText = function(v) { return String(v == null ? '' : v).trim(); };
    var nC = 0;
    var nT = 0;
    cd.columnHeaders.forEach(function(sampleId) {
        var sid = asText(sampleId);
        var row = metaMap.get(sid);
        if (!row) return;
        var v = asText(row[metaCol]);
        if (v === ctrlVal) nC++;
        else if (v === treatVal) nT++;
    });
    countsEl.textContent = 'Control (C): n=' + nC + ' · Treatment (T): n=' + nT;
};

window.saintOnMetaGroupColumnChange = function() {
    var metaCol = document.getElementById('saintMetaGroupColumn') && document.getElementById('saintMetaGroupColumn').value;
    var ctrlSel = document.getElementById('saintControlValue');
    var treatSel = document.getElementById('saintTreatmentValue');
    if (!ctrlSel || !treatSel) return;
    var prevC = ctrlSel.value;
    var prevT = treatSel.value;
    ctrlSel.innerHTML = '';
    treatSel.innerHTML = '';
    if (!metaCol) {
        window.saintUpdateGroupCounts();
        return;
    }
    var values = window.saintGetGroupLevelsForColumn(metaCol);
    values.forEach(function(v) {
        var oc = document.createElement('option');
        oc.value = v;
        oc.textContent = v;
        ctrlSel.appendChild(oc);
        var ot = document.createElement('option');
        ot.value = v;
        ot.textContent = v;
        treatSel.appendChild(ot);
    });
    if (values.length >= 1) {
        if (prevC && values.indexOf(prevC) >= 0) ctrlSel.value = prevC;
        else ctrlSel.selectedIndex = 0;
        if (prevT && values.indexOf(prevT) >= 0) treatSel.value = prevT;
        else treatSel.selectedIndex = values.length >= 2 ? 1 : 0;
    }
    if (ctrlSel.value === treatSel.value && values.length >= 2) {
        treatSel.selectedIndex = ctrlSel.selectedIndex === 0 ? 1 : 0;
    }
    window.saintUpdateGroupCounts();
    window.saintSyncBaitToGroupColumn();
};

/** When false, Bait column follows Group by; set true after user picks a different bait column. */
window.saintBaitManuallyChanged = false;

window.saintOnBaitColumnChange = function() {
    var groupSel = document.getElementById('saintMetaGroupColumn');
    var baitSel = document.getElementById('saintBaitColumn');
    if (!baitSel) return;
    var useStatus = document.getElementById('saintUseStatusAsIs') && document.getElementById('saintUseStatusAsIs').checked;
    if (useStatus) {
        var defBait = Array.from(baitSel.options).some(function(op) { return op.value === 'Bait'; }) ? 'Bait' : '';
        window.saintBaitManuallyChanged = defBait ? baitSel.value !== defBait : !!baitSel.value;
        return;
    }
    if (!groupSel) return;
    window.saintBaitManuallyChanged = baitSel.value !== groupSel.value;
};

window.saintSyncBaitToGroupColumn = function() {
    if (window.saintBaitManuallyChanged) return;
    var groupSel = document.getElementById('saintMetaGroupColumn');
    var baitSel = document.getElementById('saintBaitColumn');
    if (!baitSel) return;
    var useStatus = document.getElementById('saintUseStatusAsIs') && document.getElementById('saintUseStatusAsIs').checked;
    if (useStatus) {
        if (Array.from(baitSel.options).some(function(op) { return op.value === 'Bait'; })) {
            baitSel.value = 'Bait';
        }
        return;
    }
    if (!groupSel) return;
    var g = groupSel.value;
    if (!g) return;
    var has = Array.from(baitSel.options).some(function(op) { return op.value === g; });
    if (has) baitSel.value = g;
};

window.saintOnUseStatusAsIsChange = function() {
    var wrap = document.getElementById('saintGroupMapWrap');
    var useStatus = document.getElementById('saintUseStatusAsIs') && document.getElementById('saintUseStatusAsIs').checked;
    if (wrap) wrap.style.display = useStatus ? 'none' : 'block';
    if (!useStatus) window.saintOnMetaGroupColumnChange();
    else {
        window.saintUpdateGroupCounts();
        window.saintSyncBaitToGroupColumn();
    }
};

window.saintRefreshMetaColumnSelects = function() {
    var md = window.metaData;
    if (md && (!md.headers || !md.headers.length) && md.rows && md.rows.length) {
        window.saintEnsureMetaHeaders();
    }
    var allNames = md && md.headers ? md.headers.slice() : [];
    var groupCols = allNames.filter(function(h) {
        return h && String(h).trim() !== '' && h !== 'Sample_ID';
    });
    var groupSel = document.getElementById('saintMetaGroupColumn');
    if (groupSel) {
        var curG = groupSel.value;
        groupSel.innerHTML = '<option value="">-- select column --</option>';
        groupCols.forEach(function(h) {
            var o = document.createElement('option');
            o.value = h;
            o.textContent = h;
            groupSel.appendChild(o);
        });
        if (groupCols.indexOf(curG) >= 0) groupSel.value = curG;
        else if (groupCols.indexOf('Condition') >= 0) groupSel.value = 'Condition';
        else if (groupCols.length) groupSel.value = groupCols[0];
    }
    var baitSel = document.getElementById('saintBaitColumn');
    if (baitSel) {
        var curB = baitSel.value;
        baitSel.innerHTML = '<option value="">-- select column --</option>';
        allNames.forEach(function(h) {
            if (!h || String(h).trim() === '') return;
            var o = document.createElement('option');
            o.value = h;
            o.textContent = h;
            baitSel.appendChild(o);
        });
        if (window.saintBaitManuallyChanged && curB && allNames.indexOf(curB) >= 0) {
            baitSel.value = curB;
        }
    }
    window.saintOnMetaGroupColumnChange();
    window.saintOnUseStatusAsIsChange();
};

window.saintShowError = function(msg) {
    var el = document.getElementById('saintErrorMessage');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.className = 'status error';
};
window.saintHideError = function() {
    var el = document.getElementById('saintErrorMessage');
    if (el) {
        el.style.display = 'none';
        el.textContent = '';
    }
};

window.saintAppendAnalysisLog = function(message) {
    var logEl = document.getElementById('saintAnalysisLogContent');
    if (!logEl) return;
    var timestamp = new Date().toLocaleTimeString();
    var logEntry = document.createElement('div');
    logEntry.style.marginBottom = '4px';
    logEntry.textContent = '[' + timestamp + '] ' + message;
    logEl.appendChild(logEntry);
    logEl.scrollTop = logEl.scrollHeight;
};

window.saintClearAnalysisLog = function(titleText) {
    var logEl = document.getElementById('saintAnalysisLogContent');
    if (!logEl) return;
    logEl.innerHTML = '';
    if (titleText) window.saintAppendAnalysisLog(titleText);
};

window.enrichrAppendLog = function(message) {
    var logEl = document.getElementById('enrichrAnalysisLogContent');
    if (!logEl) return;
    var timestamp = new Date().toLocaleTimeString();
    var logEntry = document.createElement('div');
    logEntry.style.marginBottom = '4px';
    logEntry.textContent = '[' + timestamp + '] ' + message;
    logEl.appendChild(logEntry);
    logEl.scrollTop = logEl.scrollHeight;
};

window.enrichrClearLog = function(titleText) {
    var logEl = document.getElementById('enrichrAnalysisLogContent');
    if (!logEl) return;
    logEl.innerHTML = '';
    if (titleText) window.enrichrAppendLog(titleText);
};

window.saintUpdateProgress = function(percent, message) {
    var progressContainer = document.getElementById('saintProgressContainer');
    var progressFill = document.getElementById('saintProgressFill');
    var statusMessage = document.getElementById('saintStatusMessage');
    if (progressContainer) progressContainer.classList.add('active');
    if (progressFill) {
        progressFill.style.width = percent + '%';
        progressFill.textContent = Math.round(percent) + '%';
    }
    if (statusMessage) statusMessage.textContent = message || 'Processing...';
    if (message) window.saintAppendAnalysisLog(message + ' (' + Math.round(percent) + '%)');
};

/** Dismiss the fixed SAINT progress overlay (shown via .progress-container.active). */
window.saintHideAnalysisProgress = function() {
    var progressContainer = document.getElementById('saintProgressContainer');
    if (progressContainer) progressContainer.classList.remove('active');
    var progressFill = document.getElementById('saintProgressFill');
    if (progressFill) {
        progressFill.style.width = '0%';
        progressFill.textContent = '0%';
    }
    var statusMessage = document.getElementById('saintStatusMessage');
    if (statusMessage) statusMessage.textContent = '';
};

window.saintCanRunAnalysis = function() {
    window.saintSyncMatrixRefs();
    var matrix = window.saintGetMatrixForBridge();
    var md = window.metaData;
    if (md && (!md.headers || !md.headers.length) && md.rows && md.rows.length) {
        window.saintEnsureMetaHeaders();
    }
    return window.currentData && window.currentData.rowIds && window.currentData.columnHeaders &&
        matrix && Array.isArray(matrix) && matrix.length > 0 &&
        md && md.rows && md.rows.length > 0;
};
        function computeProteinAvgLog10(saintData, params) {
            if (!saintData || !saintData.dataRows || !saintData.ipColumns || !params || params.proteinColname == null) return {};
            const dataRows = saintData.dataRows;
            const colMap = saintData.colMap;
            const ipColumns = saintData.ipColumns;
            const proteinColIdx = colMap[params.proteinColname];
            if (proteinColIdx == null) return {};
            const sumByProtein = {};
            const countByProtein = {};
            for (let r = 0; r < dataRows.length; r++) {
                const row = dataRows[r];
                const protein = (row[proteinColIdx] || '').toString().trim();
                if (!protein) continue;
                for (let c = 0; c < ipColumns.length; c++) {
                    const colIdx = ipColumns[c].colIndex;
                    let val = parseFloat(row[colIdx]);
                    if (isNaN(val) || val <= 0) val = 1;
                    const logVal = Math.log10(val);
                    if (!sumByProtein[protein]) { sumByProtein[protein] = 0; countByProtein[protein] = 0; }
                    sumByProtein[protein] += logVal;
                    countByProtein[protein]++;
                }
            }
            const out = {};
            Object.keys(sumByProtein).forEach(function(p) {
                const n = countByProtein[p];
                out[p] = n > 0 ? sumByProtein[p] / n : NaN;
            });
            return out;
        }

        function computeProteinLog2FCByBait(saintData, params) {
            // x-axis values for the volcano plot:
            // log2FC = (mean log2 intensity in selected bait test samples) - (mean log2 intensity in control samples),
            // with missing/0 intensities replaced by 1 (so log2=0).
            // Protein-level log2FC is averaged across all rows that share the same protein identifier.
            if (!saintData || !saintData.dataRows || !saintData.ipColumns || !saintData.colMap || !params) return {};
            if (params.proteinColname == null) return {};

            const dataRows = saintData.dataRows;
            const colMap = saintData.colMap;
            const ipColumns = saintData.ipColumns;
            const proteinColIdx = colMap[params.proteinColname];
            if (proteinColIdx == null) return {};

            const compressNCtrl = Math.max(1, parseInt(params.compressNCtrl, 10) || 100);

            // Control columns are all samples with Status=C (independent of bait).
            const ctrlColIdxs = ipColumns
                .filter(ip => (ip.status || '').toUpperCase() === 'C')
                .map(ip => ip.colIndex);
            if (!ctrlColIdxs.length) return {};

            // Test columns are grouped by bait.
            const testColIdxsByBait = {};
            ipColumns.forEach(ip => {
                if ((ip.status || '').toUpperCase() !== 'T') return;
                // Keep bait key consistent with SAINT output (avoid trimming to preserve exact keys).
                const baitKey = (ip.bait != null) ? String(ip.bait) : '';
                if (!testColIdxsByBait[baitKey]) testColIdxsByBait[baitKey] = [];
                testColIdxsByBait[baitKey].push(ip.colIndex);
            });
            const baits = Object.keys(testColIdxsByBait);
            if (!baits.length) return {};

            // Map protein -> row indices in the data matrix.
            const proteinToRows = {};
            for (let r = 0; r < dataRows.length; r++) {
                // Keep protein key consistent with SAINT output (avoid trimming to preserve exact keys).
                const protein = (dataRows[r][proteinColIdx] != null) ? String(dataRows[r][proteinColIdx]) : '';
                if (!proteinToRows[protein]) proteinToRows[protein] = [];
                proteinToRows[protein].push(r);
            }

            const out = {};
            baits.forEach(b => { out[b] = {}; });

            // For each protein row, compute ctrlMean and (bait-specific) testMean.
            // Then average the row-wise log2FC values into protein-level log2FC.
            Object.keys(proteinToRows).forEach(function(protein) {
                const rowIndices = proteinToRows[protein];
                const sumByBait = {};
                const countByBait = {};
                baits.forEach(b => { sumByBait[b] = 0; countByBait[b] = 0; });

                for (let rr = 0; rr < rowIndices.length; rr++) {
                    const rowIdx = rowIndices[rr];

                    // Control mean (top N by intensity).
                    const ctrlLogVals = ctrlColIdxs.map(colIdx => {
                        let v = parseFloat(dataRows[rowIdx][colIdx]);
                        if (isNaN(v) || v <= 0) v = 1; // missing/0 -> 1
                        return Math.log2(v);
                    });

                    ctrlLogVals.sort((a, b) => b - a);
                    const nTop = Math.min(compressNCtrl, ctrlLogVals.length);
                    let ctrlMean = 0;
                    for (let i = 0; i < nTop; i++) ctrlMean += ctrlLogVals[i];
                    ctrlMean = nTop > 0 ? ctrlMean / nTop : 0;

                    // Test mean for each bait.
                    baits.forEach(function(baitKey) {
                        const testColIdxs = testColIdxsByBait[baitKey] || [];
                        if (!testColIdxs.length) return;
                        let testSum = 0;
                        for (let i = 0; i < testColIdxs.length; i++) {
                            const colIdx = testColIdxs[i];
                            let v = parseFloat(dataRows[rowIdx][colIdx]);
                            if (isNaN(v) || v <= 0) v = 1; // missing/0 -> 1
                            testSum += Math.log2(v);
                        }
                        const testMean = testSum / testColIdxs.length;
                        const log2FCRow = testMean - ctrlMean;
                        sumByBait[baitKey] += log2FCRow;
                        countByBait[baitKey] += 1;
                    });
                }

                baits.forEach(function(baitKey) {
                    out[baitKey][protein] = countByBait[baitKey] > 0 ? (sumByBait[baitKey] / countByBait[baitKey]) : NaN;
                });
            });

            return out;
        }

        function prepareSaintData(data, metadataRows, params) {
            const statusRow = metadataRows[0];
            const baitRow = metadataRows[1];
            const colnamesRow = metadataRows[2];

            // Find start column
            let startCol = 0;
            for (let i = 0; i < statusRow.length; i++) {
                if (statusRow[i] && statusRow[i].trim() !== '') {
                    startCol = i;
                    break;
                }
            }

            // Extract data rows (skip first 3 header rows)
            const dataRows = data.slice(3);

            // Build column mapping
            const colMap = {};
            for (let i = 0; i < startCol; i++) {
                colMap[colnamesRow[i]] = i;
            }

            // Extract IP columns
            const ipColumns = [];
            for (let i = startCol; i < statusRow.length; i++) {
                ipColumns.push({
                    status: (statusRow[i] || '').trim().toUpperCase(),
                    bait: baitRow[i] || '',
                    ipName: colnamesRow[i] || '',
                    colIndex: i
                });
            }

            return {
                dataRows: dataRows,
                colMap: colMap,
                ipColumns: ipColumns,
                colnamesRow: colnamesRow
            };
        }

        function getConfidenceColor(avgP, bfdr) {
            // High confidence: BFDR ≤ 0.01 and AvgP ≥ 0.8
            if (bfdr !== undefined && !isNaN(bfdr) && bfdr <= 0.01 && 
                avgP !== undefined && !isNaN(avgP) && avgP >= 0.8) {
                return '#d4edda'; // Light green background
            }
            // Medium confidence: BFDR ≤ 0.05 and AvgP ≥ 0.5
            if (bfdr !== undefined && !isNaN(bfdr) && bfdr <= 0.05 && 
                avgP !== undefined && !isNaN(avgP) && avgP >= 0.5) {
                return '#fff3cd'; // Light yellow background
            }
            // Low confidence: everything else
            return '#f8d7da'; // Light red background
        }

        function sortIndicator(col, currentCol, dir) {
            if (col !== currentCol) return ' <span style="opacity:0.4; font-size:var(--fs-md);">↕</span>';
            return dir === 1 ? ' <span style="font-size:var(--fs-md);">↑</span>' : ' <span style="font-size:var(--fs-md);">↓</span>';
        }

        function getFilteredScores() {
            if (!window.saintResults || !window.saintResults.scores) return [];
            const el = document.getElementById('saintResultsSearchInput');
            const text = (el && el.value) ? el.value.trim().toLowerCase() : '';
            if (!text) return window.saintResults.scores;
            return window.saintResults.scores.filter(s => {
                const bait = (s.bait || '').toLowerCase();
                const prey = (s.prey || '').toLowerCase();
                return bait.indexOf(text) !== -1 || prey.indexOf(text) !== -1;
            });
        }

        function applySort(scores, col, dir) {
            if (!col) return scores;
            return [...scores].sort((a, b) => {
                let va = a[col], vb = b[col];
                if (col === 'bait' || col === 'prey') {
                    va = (va || '').toString().toLowerCase();
                    vb = (vb || '').toString().toLowerCase();
                    return dir * (va < vb ? -1 : va > vb ? 1 : 0);
                }
                if (col === 'nRep') {
                    va = Number(va); vb = Number(vb);
                    return dir * (isNaN(va) ? -1 : isNaN(vb) ? 1 : va - vb);
                }
                if (col === 'avgP' || col === 'bfdr') {
                    va = Number(va); vb = Number(vb);
                    if (isNaN(va)) va = col === 'bfdr' ? 1 : -1;
                    if (isNaN(vb)) vb = col === 'bfdr' ? 1 : -1;
                    return dir * (va - vb);
                }
                return 0;
            });
        }

        function getFilteredAndSortedScores() {
            const filtered = getFilteredScores();
            const sCol = (window.saintResultsSort && window.saintResultsSort.column != null) ? window.saintResultsSort.column : null;
            const sDir = (window.saintResultsSort && window.saintResultsSort.dir !== undefined) ? window.saintResultsSort.dir : 1;
            return applySort(filtered, sCol, sDir);
        }

        function renderResultsTable() {
            const wrap = document.getElementById('saintResultsTableWrap');
            if (!wrap || !window.saintResults || !window.saintResults.scores) return;
            const scores = getFilteredAndSortedScores();
            let html = '<div style="margin-bottom: 12px; padding: 10px; background-color: #f8f9fa; border-radius: 4px; font-size: var(--fs-md);">';
            html += '<strong>Confidence levels:</strong> ';
            html += '<span style="background-color: #d4edda; padding: 3px 8px; border-radius: 3px; margin: 0 4px;">Green = High</span>';
            html += '<span style="background-color: #fff3cd; padding: 3px 8px; border-radius: 3px; margin: 0 4px;">Yellow = Medium</span>';
            html += '<span style="background-color: #f8d7da; padding: 3px 8px; border-radius: 3px; margin: 0 4px;">Red = Low</span>';
            if (document.getElementById('saintResultsSearchInput') && document.getElementById('saintResultsSearchInput').value.trim()) {
                html += ` <span style="color:#666;">(${scores.length} of ${window.saintResults.scores.length} rows)</span>`;
            }
            html += '</div>';
            html += '<div id="saintResultsTableHost"></div>';
            wrap.innerHTML = html;
            const host = document.getElementById('saintResultsTableHost');
            if (!host || !window.TableDisplay || typeof window.TableDisplay.renderGenericTable !== 'function') return;
            const rows = scores.map((score) => ({
                bait: score.bait || '',
                prey: score.prey || '',
                nRep: score.nRep || 0,
                avgP: score.avgP !== undefined ? score.avgP : NaN,
                bfdr: score.bfdr !== undefined ? score.bfdr : NaN
            }));
            void window.TableDisplay.renderGenericTable(host, {
                data: rows,
                tableClassName: 'saint-results-table',
                rootClassName: 'saint-results-table-root',
                pageLength: 100,
                columns: [
                    { key: 'bait', title: 'Bait', className: 'dt-type-string' },
                    { key: 'prey', title: 'Prey', className: 'dt-type-string' },
                    { key: 'nRep', title: '#Rep', className: 'dt-type-numeric' },
                    {
                        key: 'avgP',
                        title: 'AvgP',
                        className: 'dt-type-numeric',
                        render: function (data, type, row) {
                            if (type === 'sort' || type === 'type' || type === 'filter') return Number.isFinite(data) ? data : null;
                            var bg = getConfidenceColor(row.avgP, row.bfdr);
                            return '<span style="display:block;background:' + bg + ';font-weight:bold;padding:2px 4px;border-radius:4px;">' + (Number.isFinite(data) ? Number(data).toFixed(4) : '') + '</span>';
                        }
                    },
                    {
                        key: 'bfdr',
                        title: 'BFDR',
                        className: 'dt-type-numeric',
                        render: function (data, type, row) {
                            if (type === 'sort' || type === 'type' || type === 'filter') return Number.isFinite(data) ? data : null;
                            var bg = getConfidenceColor(row.avgP, row.bfdr);
                            return '<span style="display:block;background:' + bg + ';font-weight:bold;padding:2px 4px;border-radius:4px;">' + (Number.isFinite(data) ? Number(data).toFixed(4) : '') + '</span>';
                        }
                    }
                ],
                order: [[3, 'desc']],
                language: { search: 'Search results:', searchPlaceholder: 'Type to filter rows…' }
            }).catch(function (err) {
                console.error('SAINT results table:', err);
            });
        }

        function saintSortResultsBy(column) {
            if (!window.saintResults || !window.saintResults.scores) return;
            if (!window.saintResultsSort) window.saintResultsSort = { column: null, dir: 1 };
            if (window.saintResultsSort.column === column) {
                window.saintResultsSort.dir = -window.saintResultsSort.dir;
            } else {
                window.saintResultsSort.column = column;
                window.saintResultsSort.dir = 1;
            }
            renderResultsTable();
        }
        window.saintSortResultsBy = saintSortResultsBy;
        window.saintApplyResultsFilter = function() { renderResultsTable(); };

        function displayResults(results, saintData) {
            const container = document.getElementById('saintResultsContainer');
            const downloadBtn = document.getElementById('saintDownloadResultsBtn');
            const constructBtn = document.getElementById('saintConstructNetworkBtn');
            
            if (!results || !results.scores) {
                container.innerHTML = '<p style="padding: 20px; text-align: center; color: #666;">No results to display.</p>';
                downloadBtn.style.display = 'none';
                if (constructBtn) { constructBtn.disabled = true; }
                return;
            }

            window.saintResults = results;
            window.saintResultsSort = { column: null, dir: 1 };
            if (typeof window.refreshEnrichrGeneSourceOptions === 'function') window.refreshEnrichrGeneSourceOptions();

            const toolbarHtml = '<div id="saintResultsToolbar" style="margin-bottom: 12px;">' +
                '<label for="saintResultsSearchInput" style="margin-right: 8px;">Search (Bait or Prey):</label>' +
                '<input type="text" id="saintResultsSearchInput" placeholder="Type to filter..." style="padding: 6px 10px; width: 240px; border: 1px solid #ccc; border-radius: 4px;" oninput="if(window.saintApplyResultsFilter) window.saintApplyResultsFilter();">' +
                '</div>' +
                '<div id="saintResultsTableWrap"></div>';
            container.innerHTML = toolbarHtml;
            renderResultsTable();
            downloadBtn.style.display = 'block';
            if (constructBtn) constructBtn.disabled = false;
        }

        function saintInitVolcanoTabIfNeeded() {
            const baitSelect = document.getElementById('saintVolcanoBaitSelect');
            const placeholder = document.getElementById('saintVolcanoPlaceholder');
            if (!baitSelect || !placeholder) return;

            // No results yet
            if (!window.saintResults || !window.saintResults.scores || !window.saintResults.scores.length) {
                baitSelect.innerHTML = '<option value="">-- Run analysis first --</option>';
                const statusEl = document.getElementById('saintVolcanoBaitStatus');
                if (statusEl) {
                    statusEl.textContent = 'No SAINT results available.';
                    statusEl.className = 'status error';
                }
                placeholder.style.display = 'block';
                return;
            }

            // Populate bait selector from SAINT scores (unique bait values).
            const baits = Array.from(new Set(window.saintResults.scores.map(s => (s.bait != null ? String(s.bait) : ''))));
            baits.sort((a, b) => {
                const la = a ? a.toLowerCase() : '';
                const lb = b ? b.toLowerCase() : '';
                return la.localeCompare(lb);
            });

            const currentValue = baitSelect.value;
            baitSelect.innerHTML = '';
            baits.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b;
                opt.textContent = b && b.trim() ? b : '(unspecified bait)';
                baitSelect.appendChild(opt);
            });

            if (baits.includes(currentValue)) {
                baitSelect.value = currentValue;
            } else if (baits.length) {
                baitSelect.value = baits[0];
            }

            const statusEl = document.getElementById('saintVolcanoBaitStatus');
            if (statusEl) {
                statusEl.textContent = `Ready: ${baits.length} bait(s).`;
                statusEl.className = 'status success';
            }

            // Render plot when switching into the tab.
            renderVolcanoPlot();
        }

        function volcanoScatterMetricLabel(metric) {
            if (metric === 'log2fc') return 'log2FC (Test − Control)';
            if (metric === 'bfdr') return 'BFDR';
            if (metric === 'avgp') return 'AvgP';
            if (metric === 'log10Intensity') return 'log10(Intensity)';
            return '';
        }

        function volcanoScatterMetricIs01(metric) {
            return metric === 'bfdr' || metric === 'avgp';
        }

        function volcanoScatterAxisDomain(metric, values) {
            const arr = (values || []).filter(function(v) { return v != null && isFinite(v); });
            if (!arr.length) return [0, 1];
            let lo = Math.min.apply(null, arr);
            let hi = Math.max.apply(null, arr);
            if (lo === hi) {
                lo -= 1;
                hi += 1;
            }
            const pad = (hi - lo) * 0.08;
            return [lo - pad, hi + pad];
        }

        function volcanoScatterGetValue(p, metric) {
            if (!p || !metric) return NaN;
            if (metric === 'log2fc') {
                const v = p.log2FC;
                return (v != null && !isNaN(v)) ? v : NaN;
            }
            if (metric === 'bfdr') return p.bfdrPlot;
            if (metric === 'avgp') return p.avgPPlot;
            if (metric === 'log10Intensity') {
                const v = p.log10Intensity;
                return (v != null && !isNaN(v)) ? v : NaN;
            }
            return NaN;
        }

        function renderVolcanoPlot() {
            if (typeof window.d3Saint === 'undefined' || !window.d3Saint) {
                if (typeof window.ensureD3Saint === 'function') {
                    window.ensureD3Saint().then(function() { renderVolcanoPlot(); });
                }
                return;
            }
            const surface = document.getElementById('saintVolcanoPlotSurface');
            const placeholder = document.getElementById('saintVolcanoPlaceholder');
            if (!surface || !placeholder) return;

            if (!window.saintResults || !window.saintResults.scores || !window.saintResults.scores.length) {
                surface.innerHTML = '<div id="saintVolcanoTooltip" style="display:none; position:absolute; pointer-events:none;"></div>';
                placeholder.style.display = 'block';
                return;
            }

            const baitSelect = document.getElementById('saintVolcanoBaitSelect');
            const xSelect = document.getElementById('saintVolcanoXAxisMetric');
            const ySelect = document.getElementById('saintVolcanoYAxisMetric');
            const bait = baitSelect ? (baitSelect.value != null ? String(baitSelect.value) : '') : '';
            let xMetric = (xSelect && xSelect.value) ? String(xSelect.value) : 'log2fc';
            let yMetric = (ySelect && ySelect.value) ? String(ySelect.value) : 'bfdr';

            const validMetrics = { log2fc: true, bfdr: true, avgp: true, log10Intensity: true };
            if (!validMetrics[xMetric]) xMetric = 'log2fc';
            if (!validMetrics[yMetric]) yMetric = 'bfdr';

            // Tear down prior scatter interactions (pan uses window listeners).
            d3Saint.select(window).on('mousemove.volcanoScatterPan', null).on('mouseup.volcanoScatterPan', null);
            // Clear previous SVG only (keep tooltip div).
            d3Saint.select(surface).selectAll('svg').remove();
            placeholder.style.display = 'none';

            const scoresForBait = window.saintResults.scores.filter(s => (s.bait != null ? String(s.bait) : '') === bait);
            if (!scoresForBait.length) {
                surface.querySelector('#saintVolcanoTooltip')?.remove();
                surface.innerHTML = '<div id="saintVolcanoTooltip" style="display:none; position:absolute; pointer-events:none;"></div>' +
                    '<div style="padding: 20px; text-align:center; color:#666;">No SAINT scores for this bait.</div>';
                return;
            }

            const fcByBait = window.saintResults.proteinLog2FCByBait || {};
            const baitFc = fcByBait[bait] || {};
            const exprLog10Map = window.saintResults.proteinAvgLog10Expr || {};

            function clamp01(v) {
                if (v == null || isNaN(v)) return NaN;
                return Math.max(0, Math.min(1, v));
            }

            const rawPoints = scoresForBait.map(function(s) {
                const prey = s.prey != null ? String(s.prey) : '';
                const log2FC = baitFc[prey];
                const avgPRaw = (s.avgP != null && !isNaN(s.avgP)) ? Number(s.avgP) : NaN;
                const bfdrRaw = (s.bfdr != null && !isNaN(s.bfdr)) ? Number(s.bfdr) : NaN;
                const l10v = exprLog10Map[prey];
                const log10Intensity = (l10v != null && !isNaN(l10v)) ? Number(l10v) : NaN;
                const bfdrPlot = clamp01(bfdrRaw);
                const avgPPlot = clamp01(avgPRaw);
                const isHigh = (!isNaN(bfdrRaw) && !isNaN(avgPRaw) && bfdrRaw <= 0.01 && avgPRaw >= 0.8);
                return {
                    prey: prey,
                    log2FC: (log2FC != null && !isNaN(log2FC)) ? log2FC : NaN,
                    bfdrRaw: bfdrRaw,
                    avgPRaw: avgPRaw,
                    bfdrPlot: bfdrPlot,
                    avgPPlot: avgPPlot,
                    log10Intensity: log10Intensity,
                    isHigh: isHigh
                };
            });

            const points = rawPoints.filter(function(p) {
                const xv = volcanoScatterGetValue(p, xMetric);
                const yv = volcanoScatterGetValue(p, yMetric);
                return !isNaN(xv) && !isNaN(yv);
            });

            if (!points.length) {
                surface.querySelector('#saintVolcanoTooltip')?.remove();
                surface.innerHTML = '<div id="saintVolcanoTooltip" style="display:none; position:absolute; pointer-events:none;"></div>' +
                    '<div style="padding: 20px; text-align:center; color:#666;">No points to plot for the selected bait and axes (missing values for one or both metrics).</div>';
                return;
            }

            const xLabel = volcanoScatterMetricLabel(xMetric);
            const yLabel = volcanoScatterMetricLabel(yMetric);

            const xVals = points.map(function(p) { return volcanoScatterGetValue(p, xMetric); });
            const yVals = points.map(function(p) { return volcanoScatterGetValue(p, yMetric); });
            const xDom = volcanoScatterAxisDomain(xMetric, xVals);
            const yDom = volcanoScatterAxisDomain(yMetric, yVals);
            let xd0 = xDom[0], xd1 = xDom[1];
            let yd0 = yDom[0], yd1 = yDom[1];
            const xdInit0 = xd0, xdInit1 = xd1, ydInit0 = yd0, ydInit1 = yd1;

            // Layout
            const rect = surface.getBoundingClientRect();
            const width = Math.max(520, Math.floor(rect.width || 800));
            const height = Math.max(520, Math.floor(rect.height || 600));
            const margin = { top: 22, right: 22, bottom: 52, left: 72 };
            const plotW = Math.max(10, width - margin.left - margin.right);
            const plotH = Math.max(10, height - margin.top - margin.bottom);

            if (!isFinite(xd0) || !isFinite(xd1) || !isFinite(yd0) || !isFinite(yd1)) return;

            // Match log10 intensity behavior: no forced [0,1] clamping for BFDR/AvgP.
            // Use a tiny minimum span to prevent numeric collapse.
            const minSpanX = Math.max(1e-15, (xdInit1 - xdInit0) * 1e-9);
            const minSpanY = Math.max(1e-15, (ydInit1 - ydInit0) * 1e-9);
            const xClamp = null;
            const yClamp = null;

            function zoom1DDomain(lo, hi, focal, spanFactor, clampPair, minSpan) {
                let span = hi - lo;
                if (!isFinite(span) || span <= 0) return [lo, hi];
                let newSpan = span * spanFactor;
                if (newSpan < minSpan) newSpan = minSpan;
                let t = (focal - lo) / span;
                if (!isFinite(t)) t = 0.5;
                t = Math.max(0, Math.min(1, t));
                let nLo = focal - t * newSpan;
                let nHi = focal + (1 - t) * newSpan;
                if (clampPair) {
                    const c0 = clampPair[0], c1 = clampPair[1];
                    if (nLo < c0) { nHi += c0 - nLo; nLo = c0; }
                    if (nHi > c1) { nLo -= nHi - c1; nHi = c1; }
                    if (nLo < c0) nLo = c0;
                    if (nHi > c1) nHi = c1;
                    if (nHi - nLo < minSpan) {
                        const mid = (nLo + nHi) / 2;
                        nLo = Math.max(c0, mid - minSpan / 2);
                        nHi = Math.min(c1, nLo + minSpan);
                        if (nHi > c1) { nHi = c1; nLo = nHi - minSpan; }
                        if (nLo < c0) { nLo = c0; nHi = Math.min(c1, nLo + minSpan); }
                    }
                }
                return [nLo, nHi];
            }

            /** Pointer in inner g coords: 'plot' | 'xAxis' | 'yAxis' | null */
            function zoomHitRegion(mx, my) {
                if (mx >= 0 && mx <= plotW && my >= 0 && my <= plotH) return 'plot';
                if (mx >= -margin.left && mx < 0 && my >= 0 && my <= plotH) return 'yAxis';
                if (mx >= 0 && mx <= plotW && my > plotH && my <= plotH + margin.bottom) return 'xAxis';
                return null;
            }

            /** Keep [lo,hi] inside [c0,c1] with at least minSpan. */
            function clampDomainWindow(lo, hi, c0, c1, minSpan) {
                let nLo = lo, nHi = hi;
                const span = nHi - nLo;
                if (nLo < c0) { nHi += c0 - nLo; nLo = c0; }
                if (nHi > c1) { nLo -= nHi - c1; nHi = c1; }
                if (nLo < c0) nLo = c0;
                if (nHi > c1) nHi = c1;
                if (nHi - nLo < minSpan) {
                    const mid = (nLo + nHi) / 2;
                    nLo = Math.max(c0, mid - minSpan / 2);
                    nHi = Math.min(c1, nLo + minSpan);
                    if (nHi > c1) { nHi = c1; nLo = nHi - minSpan; }
                    if (nLo < c0) { nLo = c0; nHi = Math.min(c1, nLo + minSpan); }
                }
                return [nLo, nHi];
            }

            function clampPanDomains() {
                if (xClamp) {
                    const r = clampDomainWindow(xd0, xd1, xClamp[0], xClamp[1], minSpanX);
                    xd0 = r[0]; xd1 = r[1];
                }
                // NOTE: user-requested behavior:
                // For BFDR/AvgP, allow Y-axis domain to move beyond 0-1 during *pan*.
                // We still clamp domains during wheel-zoom (handled in zoom1DDomain via xClamp/yClamp).
            }

            let panDrag = null;

            const xScale = d3Saint.scaleLinear().range([0, plotW]);
            const yScale = d3Saint.scaleLinear().range([plotH, 0]);

            const svg = d3Saint.select(surface).append('svg')
                .attr('width', '100%')
                .attr('height', height)
                .attr('viewBox', '0 0 ' + width + ' ' + height)
                .attr('preserveAspectRatio', 'xMidYMid meet');

            const g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

            const clipId = 'volcanoScatterClip_' + String(Date.now());
            svg.append('defs').append('clipPath').attr('id', clipId)
                .append('rect').attr('width', plotW).attr('height', plotH).attr('x', 0).attr('y', 0);

            const xAxisG = g.append('g').attr('class', 'volcano-x-axis').attr('transform', 'translate(0,' + plotH + ')');
            const yAxisG = g.append('g').attr('class', 'volcano-y-axis');

            g.append('text')
                .attr('x', plotW / 2)
                .attr('y', plotH + 40)
                .attr('text-anchor', 'middle')
                .attr('fill', '#333')
                .style('font-size', 'var(--fs-md, 13px)')
                .text(xLabel);
            g.append('text')
                .attr('transform', 'rotate(-90)')
                .attr('x', -plotH / 2)
                .attr('y', -50)
                .attr('text-anchor', 'middle')
                .attr('fill', '#333')
                .style('font-size', 'var(--fs-md, 13px)')
                .text(yLabel);

            const refG = g.append('g').attr('class', 'volcano-ref-lines');
            const plotClipG = g.append('g').attr('clip-path', 'url(#' + clipId + ')');

            plotClipG.append('rect')
                .attr('class', 'volcano-plot-pan-bg')
                .attr('x', 0).attr('y', 0).attr('width', plotW).attr('height', plotH)
                .attr('fill', 'transparent')
                .style('cursor', 'grab');

            const otherPoints = points.filter(function(p) { return !p.isHigh; });
            const highPoints = points.filter(function(p) { return p.isHigh; });

            const symbol = d3Saint.symbol().type(d3Saint.symbolCross).size(80);
            plotClipG.append('g').attr('class', 'volcano-marks-low')
                .selectAll('circle')
                .data(otherPoints)
                .enter()
                .append('circle')
                .attr('r', 3)
                .attr('fill', 'white')
                .attr('stroke', 'black')
                .attr('stroke-width', 0.9)
                .attr('opacity', 0.55);

            plotClipG.append('g').attr('class', 'volcano-marks-high')
                .selectAll('path')
                .data(highPoints)
                .enter()
                .append('path')
                .attr('d', symbol)
                .attr('fill', 'none')
                .attr('stroke', '#dc2626')
                .attr('stroke-width', 1.8)
                .attr('opacity', 0.95);

            g.append('rect')
                .attr('class', 'volcano-y-axis-pan')
                .attr('x', -margin.left).attr('y', 0)
                .attr('width', margin.left).attr('height', plotH)
                .attr('fill', 'transparent')
                .style('cursor', 'ns-resize');
            g.append('rect')
                .attr('class', 'volcano-x-axis-pan')
                .attr('x', 0).attr('y', plotH)
                .attr('width', plotW).attr('height', margin.bottom)
                .attr('fill', 'transparent')
                .style('cursor', 'ew-resize');

            function inRange(v, lo, hi) {
                return v >= lo && v <= hi;
            }

            function refreshScatterPlot() {
                xScale.domain([xd0, xd1]);
                yScale.domain([yd0, yd1]);

                if (volcanoScatterMetricIs01(xMetric)) {
                xAxisG.call(d3Saint.axisBottom(xScale).ticks(6));
                } else {
                    xAxisG.call(d3Saint.axisBottom(xScale).ticks(6));
                }
                if (volcanoScatterMetricIs01(yMetric)) {
                yAxisG.call(d3Saint.axisLeft(yScale).ticks(6));
                } else {
                    yAxisG.call(d3Saint.axisLeft(yScale).ticks(6));
                }

                refG.selectAll('*').remove();

                if (xMetric === 'log2fc' && inRange(0, xd0, xd1)) {
                    refG.append('line')
                        .attr('x1', xScale(0)).attr('x2', xScale(0)).attr('y1', 0).attr('y2', plotH)
                        .attr('stroke', '#9ca3af').attr('stroke-width', 1).attr('stroke-dasharray', '4 4').attr('opacity', 0.9);
                }
                if (yMetric === 'log2fc' && inRange(0, yd0, yd1)) {
                    refG.append('line')
                        .attr('x1', 0).attr('x2', plotW).attr('y1', yScale(0)).attr('y2', yScale(0))
                        .attr('stroke', '#9ca3af').attr('stroke-width', 1).attr('stroke-dasharray', '4 4').attr('opacity', 0.9);
                }
                if (xMetric === 'bfdr' && inRange(0.01, xd0, xd1)) {
                    refG.append('line')
                        .attr('x1', xScale(0.01)).attr('x2', xScale(0.01)).attr('y1', 0).attr('y2', plotH)
                        .attr('stroke', '#dc2626').attr('stroke-width', 1).attr('stroke-dasharray', '4 4').attr('opacity', 0.8);
                }
                if (yMetric === 'bfdr' && inRange(0.01, yd0, yd1)) {
                    refG.append('line')
                        .attr('x1', 0).attr('x2', plotW).attr('y1', yScale(0.01)).attr('y2', yScale(0.01))
                        .attr('stroke', '#dc2626').attr('stroke-width', 1).attr('stroke-dasharray', '4 4').attr('opacity', 0.8);
                }
                if (xMetric === 'avgp' && inRange(0.8, xd0, xd1)) {
                    refG.append('line')
                        .attr('x1', xScale(0.8)).attr('x2', xScale(0.8)).attr('y1', 0).attr('y2', plotH)
                        .attr('stroke', '#dc2626').attr('stroke-width', 1).attr('stroke-dasharray', '4 4').attr('opacity', 0.8);
                }
                if (yMetric === 'avgp' && inRange(0.8, yd0, yd1)) {
                    refG.append('line')
                        .attr('x1', 0).attr('x2', plotW).attr('y1', yScale(0.8)).attr('y2', yScale(0.8))
                        .attr('stroke', '#dc2626').attr('stroke-width', 1).attr('stroke-dasharray', '4 4').attr('opacity', 0.8);
                }

                plotClipG.select('.volcano-marks-low').selectAll('circle')
                    .attr('cx', function(d) { return xScale(volcanoScatterGetValue(d, xMetric)); })
                    .attr('cy', function(d) { return yScale(volcanoScatterGetValue(d, yMetric)); });
                plotClipG.select('.volcano-marks-high').selectAll('path')
                    .attr('transform', function(d) {
                        return 'translate(' + xScale(volcanoScatterGetValue(d, xMetric)) + ',' + yScale(volcanoScatterGetValue(d, yMetric)) + ') rotate(45)';
                    });
            }

            refreshScatterPlot();

            svg.node().addEventListener('wheel', function(event) {
                if (event.deltaY === 0) return;
                const region = zoomHitRegion.apply(null, d3Saint.pointer(event, g.node()));
                if (!region) return;
                event.preventDefault();
                const spanFactor = event.deltaY < 0 ? 0.92 : 1.08;
                const [mx, my] = d3Saint.pointer(event, g.node());

                if (region === 'plot') {
                    const fX = xScale.invert(Math.max(0, Math.min(plotW, mx)));
                    const fY = yScale.invert(Math.max(0, Math.min(plotH, my)));
                    const rx = zoom1DDomain(xd0, xd1, fX, spanFactor, xClamp, minSpanX);
                    xd0 = rx[0]; xd1 = rx[1];
                    const ry = zoom1DDomain(yd0, yd1, fY, spanFactor, yClamp, minSpanY);
                    yd0 = ry[0]; yd1 = ry[1];
                } else if (region === 'xAxis') {
                    const mxClamped = Math.max(0, Math.min(plotW, mx));
                    const fX = xScale.invert(mxClamped);
                    const rx = zoom1DDomain(xd0, xd1, fX, spanFactor, xClamp, minSpanX);
                    xd0 = rx[0]; xd1 = rx[1];
                } else if (region === 'yAxis') {
                    const myClamped = Math.max(0, Math.min(plotH, my));
                    const fY = yScale.invert(myClamped);
                    const ry = zoom1DDomain(yd0, yd1, fY, spanFactor, yClamp, minSpanY);
                    yd0 = ry[0]; yd1 = ry[1];
                }
                refreshScatterPlot();
            }, { passive: false });

            svg.on('mousedown', function(event) {
                if (event.button !== 0) return;
                const pt = d3Saint.pointer(event, g.node());
                const region = zoomHitRegion(pt[0], pt[1]);
                if (!region) return;
                event.preventDefault();
                panDrag = { region: region, lastCX: event.clientX, lastCY: event.clientY };
                if (region === 'plot') {
                    plotClipG.select('.volcano-plot-pan-bg').style('cursor', 'grabbing');
                } else if (region === 'yAxis') {
                    svg.style('cursor', 'ns-resize');
                } else {
                    svg.style('cursor', 'ew-resize');
                }
            });

            d3Saint.select(window).on('mousemove.volcanoScatterPan', function(event) {
                if (!panDrag) return;
                const dx = event.clientX - panDrag.lastCX;
                const dy = event.clientY - panDrag.lastCY;
                panDrag.lastCX = event.clientX;
                panDrag.lastCY = event.clientY;
                const spanX = xd1 - xd0;
                const spanY = yd1 - yd0;
                if (panDrag.region === 'plot' || panDrag.region === 'xAxis') {
                    const shiftX = -(dx / plotW) * spanX;
                    xd0 += shiftX;
                    xd1 += shiftX;
                }
                if (panDrag.region === 'plot' || panDrag.region === 'yAxis') {
                    const shiftY = (dy / plotH) * spanY;
                    yd0 += shiftY;
                    yd1 += shiftY;
                }
                clampPanDomains();
                refreshScatterPlot();
            });

            d3Saint.select(window).on('mouseup.volcanoScatterPan', function() {
                if (!panDrag) return;
                panDrag = null;
                plotClipG.select('.volcano-plot-pan-bg').style('cursor', 'grab');
                svg.style('cursor', null);
            });

            svg.on('dblclick', function(event) {
                const [mx, my] = d3Saint.pointer(event, g.node());
                const region = zoomHitRegion(mx, my);
                if (!region) return;
                event.preventDefault();
                if (region === 'plot') {
                    xd0 = xdInit0; xd1 = xdInit1; yd0 = ydInit0; yd1 = ydInit1;
                } else if (region === 'xAxis') {
                    xd0 = xdInit0; xd1 = xdInit1;
                } else if (region === 'yAxis') {
                    yd0 = ydInit0; yd1 = ydInit1;
                }
                refreshScatterPlot();
            });

            const tooltip = document.getElementById('saintVolcanoTooltip');
            const showTooltip = points.length <= 5000 && tooltip;
            if (showTooltip) {
                function fmtNum(v, dec) {
                    if (v == null || isNaN(v)) return '—';
                    return v.toFixed(dec);
                }
                function formatTooltip(p) {
                    const xPlotted = volcanoScatterGetValue(p, xMetric);
                    const yPlotted = volcanoScatterGetValue(p, yMetric);
                    const xDec = volcanoScatterMetricIs01(xMetric) ? 4 : 3;
                    const yDec = volcanoScatterMetricIs01(yMetric) ? 4 : 3;
                    return [
                        '<div style="font-weight:700; margin-bottom:4px;">' + p.prey + '</div>',
                        '<div><b>log2FC:</b> ' + fmtNum(p.log2FC, 3) + '</div>',
                        '<div><b>AvgP:</b> ' + fmtNum(p.avgPRaw, 4) + '</div>',
                        '<div><b>BFDR:</b> ' + fmtNum(p.bfdrRaw, 4) + '</div>',
                        '<div><b>log10(Intensity):</b> ' + fmtNum(p.log10Intensity, 3) + '</div>',
                        '<div style="margin-top:6px; border-top:1px solid rgba(255,255,255,0.25); padding-top:4px;">',
                        '<b>' + xLabel + ' (X):</b> ' + fmtNum(xPlotted, xDec) + '<br>',
                        '<b>' + yLabel + ' (Y):</b> ' + fmtNum(yPlotted, yDec),
                        '</div>'
                    ].join('');
                }

                const rootRect = surface.getBoundingClientRect();
                plotClipG.select('.volcano-marks-low').selectAll('circle')
                    .on('mousemove', function(event, d) {
                        tooltip.style.display = 'block';
                        tooltip.innerHTML = formatTooltip(d);
                        tooltip.style.left = (event.clientX - rootRect.left + 10) + 'px';
                        tooltip.style.top = (event.clientY - rootRect.top + 10) + 'px';
                    }).on('mouseleave', function() {
                        tooltip.style.display = 'none';
                    });

                plotClipG.select('.volcano-marks-high').selectAll('path')
                    .on('mousemove', function(event, d) {
                        tooltip.style.display = 'block';
                        tooltip.innerHTML = formatTooltip(d);
                        tooltip.style.left = (event.clientX - rootRect.left + 10) + 'px';
                        tooltip.style.top = (event.clientY - rootRect.top + 10) + 'px';
                    }).on('mouseleave', function() {
                        tooltip.style.display = 'none';
                    });
            }
        }

        function downloadResults() {
            if (!window.saintResults || !window.saintResults.scores) {
                alert('No results to download');
                return;
            }

            let tsv = 'Bait\tPrey\t#Rep\tAvgP\tBFDR\n';
            window.saintResults.scores.forEach(score => {
                tsv += `${score.bait || ''}\t${score.prey || ''}\t${score.nRep || 0}\t${score.avgP !== undefined ? score.avgP.toFixed(4) : ''}\t${score.bfdr !== undefined ? score.bfdr.toFixed(4) : ''}\n`;
            });

            const blob = new Blob([tsv], { type: 'text/tab-separated-values' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'saint_results_' + new Date().toISOString().slice(0,10) + '.tsv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function constructNetwork() {
            if (typeof window.d3Saint === 'undefined' || !window.d3Saint) {
                if (typeof window.ensureD3Saint === 'function') {
                    window.ensureD3Saint().then(function() { constructNetwork(); });
                } else {
                    alert('D3 could not be loaded.');
                }
                return;
            }
            if (!window.saintResults || !window.saintResults.scores.length) {
                alert('No results available. Run SAINT analysis first.');
                return;
            }
            var bfdrEl = document.getElementById('saintNetworkBfdrThreshold');
            var avgPEl = document.getElementById('saintNetworkAvgPThreshold');
            var bfdrThreshold = (bfdrEl && bfdrEl.value != null) ? Number(bfdrEl.value) : 0.05;
            var avgPThreshold = (avgPEl && avgPEl.value != null) ? Number(avgPEl.value) : 0.8;
            var scores = window.saintResults.scores;
            var filtered = scores.filter(function(s) {
                var bfdr = s.bfdr != null ? Number(s.bfdr) : NaN;
                var avgP = s.avgP != null ? Number(s.avgP) : NaN;
                return !isNaN(bfdr) && !isNaN(avgP) && bfdr <= bfdrThreshold && avgP >= avgPThreshold;
            });
            if (filtered.length === 0) {
                alert('No interactions pass the current thresholds (BFDR ≤ ' + bfdrThreshold + ', AvgP ≥ ' + avgPThreshold + '). Try relaxing the thresholds.');
                return;
            }
            var nodeIds = {};
            var nodes = [];
            filtered.forEach(function(s) {
                var bait = (s.bait || '').toString().trim();
                var prey = (s.prey || '').toString().trim();
                if (bait && !nodeIds[bait]) { nodeIds[bait] = true; nodes.push({ id: bait, label: bait }); }
                if (prey && !nodeIds[prey]) { nodeIds[prey] = true; nodes.push({ id: prey, label: prey }); }
            });
            var links = filtered.map(function(s) {
                return { source: (s.bait || '').toString().trim(), target: (s.prey || '').toString().trim(), avgP: s.avgP, bfdr: s.bfdr };
            });
            var baitIds = {};
            var preyIds = {};
            links.forEach(function(l) { baitIds[l.source] = true; preyIds[l.target] = true; });
            nodes.forEach(function(n) { n.isBait = !!baitIds[n.id]; n.isPrey = !!preyIds[n.id]; });
            var nodeMinBfdr = {};
            links.forEach(function(l) {
                var b = (typeof l.bfdr === 'number' && !isNaN(l.bfdr)) ? l.bfdr : 0.05;
                if (nodeMinBfdr[l.source] == null || b < nodeMinBfdr[l.source]) nodeMinBfdr[l.source] = b;
                if (nodeMinBfdr[l.target] == null || b < nodeMinBfdr[l.target]) nodeMinBfdr[l.target] = b;
            });
            var bfdrVals = [];
            nodes.forEach(function(n) {
                n.minBfdr = nodeMinBfdr[n.id];
                if (n.minBfdr != null && !isNaN(n.minBfdr)) bfdrVals.push(n.minBfdr);
            });
            var bfdrMin = bfdrVals.length ? Math.min.apply(null, bfdrVals) : 0;
            var bfdrMax = bfdrVals.length ? Math.max.apply(null, bfdrVals) : 0.05;
            if (bfdrMax <= bfdrMin) bfdrMax = bfdrMin + 0.01;
            var exprMap = (window.saintResults && window.saintResults.proteinAvgLog10Expr) ? window.saintResults.proteinAvgLog10Expr : {};
            var exprVals = [];
            nodes.forEach(function(n) {
                var v = exprMap[n.id];
                n.avgLog10Expr = (v != null && !isNaN(v)) ? v : undefined;
                if (n.avgLog10Expr != null) exprVals.push(n.avgLog10Expr);
            });
            var exprMin = exprVals.length ? Math.min.apply(null, exprVals) : 0;
            var exprMax = exprVals.length ? Math.max.apply(null, exprVals) : 1;
            if (exprMax <= exprMin) exprMax = exprMin + 1;
            var avgPArr = links.map(function(l) { return typeof l.avgP === 'number' && !isNaN(l.avgP) ? l.avgP : 0.5; });
            var avgPMin = avgPArr.length ? Math.min.apply(null, avgPArr) : 0.5;
            var avgPMax = avgPArr.length ? Math.max.apply(null, avgPArr) : 1;
            if (avgPMax <= avgPMin) avgPMax = avgPMin + 0.01;
            var container = document.getElementById('saintNetworkContainer');
            var placeholder = document.getElementById('saintNetworkPlaceholder');
            if (!container) return;
            if (placeholder) placeholder.style.display = 'none';
            container.innerHTML = '';
            switchSaintSubTab('network');
            function getNetworkOptions() {
                var showLabels = document.getElementById('saintNetworkShowLabels') && document.getElementById('saintNetworkShowLabels').checked;
                var nodeSize = document.getElementById('saintNetworkNodeSize') ? Number(document.getElementById('saintNetworkNodeSize').value) : 6;
                var labelSize = document.getElementById('saintNetworkLabelSize') ? Number(document.getElementById('saintNetworkLabelSize').value) : 12;
                var nodeShape = document.getElementById('saintNetworkNodeShape') ? document.getElementById('saintNetworkNodeShape').value : 'circle';
                var linkOpacity = document.getElementById('saintNetworkLinkOpacity') ? Number(document.getElementById('saintNetworkLinkOpacity').value) : 0.6;
                var colorByType = document.getElementById('saintNetworkColorByType') && document.getElementById('saintNetworkColorByType').checked;
                var colorHigh = document.getElementById('saintNetworkColorHigh') ? document.getElementById('saintNetworkColorHigh').value : '#1e3a5f';
                var colorLow = document.getElementById('saintNetworkColorLow') ? document.getElementById('saintNetworkColorLow').value : '#cce0f0';
                return { showLabels: showLabels, nodeSize: nodeSize, labelSize: labelSize, nodeShape: nodeShape, linkOpacity: linkOpacity, colorByType: colorByType, colorHigh: colorHigh, colorLow: colorLow };
            }
            function nodeRadiusFromExpr(d, opts) {
                var scaleFactor = (opts.nodeSize || 6) / 6;
                if (d.avgLog10Expr != null && !isNaN(d.avgLog10Expr)) {
                    var rMin = 4 * scaleFactor;
                    var rMax = 18 * scaleFactor;
                    var t = (d.avgLog10Expr - exprMin) / (exprMax - exprMin);
                    return rMin + t * (rMax - rMin);
                }
                return 6 * scaleFactor;
            }
            var radiusSum = 0;
            nodes.forEach(function(n) { radiusSum += nodeRadiusFromExpr(n, getNetworkOptions()); });
            var avgNodeRadius = nodes.length ? radiusSum / nodes.length : 6;
            function nodeRadius(d, opts) {
                if (d.isBait) return avgNodeRadius;
                return nodeRadiusFromExpr(d, opts);
            }
            function linkWidth(d) {
                var avgP = (typeof d.avgP === 'number' && !isNaN(d.avgP)) ? d.avgP : 0.5;
                var t = (avgP - avgPMin) / (avgPMax - avgPMin);
                return 0.8 + Math.max(0, Math.min(1, t)) * 2.7;
            }
            function linkDistance(d) {
                var avgP = (typeof d.avgP === 'number' && !isNaN(d.avgP)) ? d.avgP : 0.5;
                var t = (avgP - avgPMin) / (avgPMax - avgPMin);
                var normalizedT = Math.max(0, Math.min(1, t));
                return 25 + (1 - normalizedT) * 200;
            }
            function bfdrColorScale(bfdr, lowColor, highColor) {
                if (bfdr == null || isNaN(bfdr)) return '#94a3b8';
                var t = (bfdr - bfdrMin) / (bfdrMax - bfdrMin);
                t = Math.max(0, Math.min(1, t));
                var scale = d3Saint.scaleLinear().domain([0, 1]).range([lowColor, highColor]);
                return scale(t);
            }
            function nodeFill(d, opts) {
                if (d.isBait && !d.isPrey) return '#c2410c';
                if (d.isBait && d.isPrey) return '#9f7aea';
                if (opts.colorByType) return '#48bb78';
                return bfdrColorScale(d.minBfdr, opts.colorLow || '#cce0f0', opts.colorHigh || '#1e3a5f');
            }
            function draw() {
                var width = container.clientWidth || 800;
                var height = container.clientHeight || 600;
                var opts = getNetworkOptions();
                var svg = d3Saint.select(container).append('svg').attr('width', '100%').attr('height', '100%').attr('viewBox', '0 0 ' + width + ' ' + height).attr('preserveAspectRatio', 'xMidYMid meet');
            var tooltip = document.getElementById('saintNetworkTooltip');
            var tooltipHideTimer = null;
            var tooltipPinned = false;
            function _placeTooltipAt(host, x, y) {
                if (!tooltip || !host) return;
                var maxX = host.clientWidth - tooltip.offsetWidth - 8;
                var maxY = host.clientHeight - tooltip.offsetHeight - 8;
                if (maxX < 8) maxX = 8;
                if (maxY < 8) maxY = 8;
                tooltip.style.left = Math.min(Math.max(8, x), maxX) + 'px';
                tooltip.style.top = Math.min(Math.max(8, y), maxY) + 'px';
            }
            function placeTooltip(event) {
                if (!tooltip) return;
                var host = tooltip.parentElement || container;
                var rect = host.getBoundingClientRect();
                var cx = (event.clientX != null ? event.clientX : 0) - rect.left + 12;
                var cy = (event.clientY != null ? event.clientY : 0) - rect.top + 12;
                _placeTooltipAt(host, cx, cy);
            }
            function placeTooltipNearTarget(targetEl) {
                if (!tooltip || !targetEl) return;
                var host = tooltip.parentElement || container;
                var hostRect = host.getBoundingClientRect();
                var r = targetEl.getBoundingClientRect();
                var x = (r.left - hostRect.left) + r.width + 8;
                var y = (r.top - hostRect.top) + (r.height * 0.5) - (tooltip.offsetHeight * 0.5);
                _placeTooltipAt(host, x, y);
            }
            function showTooltip(html, event, stickToTarget) {
                if (!tooltip) return;
                if (tooltipHideTimer) {
                    clearTimeout(tooltipHideTimer);
                    tooltipHideTimer = null;
                }
                tooltip.innerHTML = html;
                tooltip.style.display = 'block';
                tooltipPinned = !!stickToTarget;
                if (tooltipPinned && event && event.currentTarget) placeTooltipNearTarget(event.currentTarget);
                else placeTooltip(event);
            }
            function moveTooltip(event) {
                if (tooltip && tooltip.style.display === 'block' && !tooltipPinned) placeTooltip(event);
            }
            function hideTooltip() {
                if (!tooltip) return;
                if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
                tooltipHideTimer = setTimeout(function() {
                    if (!tooltip.matches(':hover')) {
                        tooltip.style.display = 'none';
                        tooltipPinned = false;
                    }
                }, 140);
            }
            if (tooltip && !tooltip.dataset.bound) {
                tooltip.addEventListener('mouseenter', function() {
                    if (tooltipHideTimer) {
                        clearTimeout(tooltipHideTimer);
                        tooltipHideTimer = null;
                    }
                });
                tooltip.addEventListener('mouseleave', function() {
                    tooltip.style.display = 'none';
                    tooltipPinned = false;
                });
                tooltip.dataset.bound = '1';
            }
            function nodeTooltipHtml(d) {
                var gene = encodeURIComponent((d.label || '').trim());
                var uniprot = gene ? 'https://www.uniprot.org/uniprotkb?query=' + gene : '';
                var stringUrl = gene ? 'https://string-db.org/cgi/network?identifiers=' + gene + '&species=9606' : '';
                var uni = uniprot ? '<a href="' + uniprot + '" target="_blank" rel="noopener noreferrer">UniProt</a>' : '';
                var str = stringUrl ? '<a href="' + stringUrl + '" target="_blank" rel="noopener noreferrer">STRING</a>' : '';
                var linksHtml = [uni, str].filter(function(x) { return x; }).join(' | ');
                var expr = (d.avgLog10Expr != null && !isNaN(d.avgLog10Expr)) ? d.avgLog10Expr.toFixed(3) : '—';
                var bfdr = (d.minBfdr != null && !isNaN(d.minBfdr)) ? d.minBfdr.toFixed(4) : '—';
                return '<strong>' + d.label + '</strong><br>Avg expression (log10): ' + expr + '<br>Min BFDR: ' + bfdr + (linksHtml ? '<br>' + linksHtml : '');
            }
            var g = svg.append('g');
            var link = g.append('g').attr('class', 'links').selectAll('line').data(links).join('line').attr('stroke', '#999').attr('stroke-opacity', opts.linkOpacity).attr('stroke-width', linkWidth);
            var linkHover = g.append('g').attr('class', 'links-hover').selectAll('line').data(links).join('line').attr('stroke', 'transparent').attr('stroke-width', 16).attr('stroke-linecap', 'round').on('mouseover', function(event, d) {
                var bfdr = (d.bfdr != null && !isNaN(d.bfdr)) ? d.bfdr.toFixed(4) : '—';
                var avgP = (d.avgP != null && !isNaN(d.avgP)) ? d.avgP.toFixed(4) : '—';
                showTooltip('BFDR: ' + bfdr + '<br>AvgP: ' + avgP, event, false);
            }).on('mousemove', moveTooltip).on('mouseout', hideTooltip);
            function nodeShapeRadii(d, localOpts) {
                var rr = nodeRadius(d, localOpts);
                var scaleFactor = (localOpts.nodeSize || 6) / 6;
                if (localOpts.nodeShape === 'ellipse') return { rx: rr * 1.25, ry: rr * 0.8, shape: 'ellipse' };
                if (localOpts.nodeShape === 'rectangle') {
                    var displayLabel = (d.label || '').toString();
                    if (displayLabel.length > 30) displayLabel = displayLabel.slice(0, 27) + '...';
                    var textHalfW = Math.min(120 * scaleFactor, Math.max(10 * scaleFactor, displayLabel.length * 3.2));
                    var rx = Math.max(rr * 1.2, textHalfW + 6 * scaleFactor);
                    var ry = Math.min(Math.max(8 * scaleFactor, rr * 0.65), 14 * scaleFactor);
                    var corner = Math.min(ry * 0.6, 8 * scaleFactor);
                    return { rx: rx, ry: ry, shape: 'rectangle', corner: corner };
                }
                return { rx: rr, ry: rr, shape: 'circle' };
            }
            function nodePath(d, localOpts) {
                var g = nodeShapeRadii(d, localOpts), rx = g.rx, ry = g.ry;
                if (g.shape === 'rectangle') {
                    var c = Math.max(0, Math.min(g.corner || 0, rx, ry));
                    return 'M ' + (-rx + c) + ' ' + (-ry) +
                           ' L ' + (rx - c) + ' ' + (-ry) +
                           ' Q ' + rx + ' ' + (-ry) + ' ' + rx + ' ' + (-ry + c) +
                           ' L ' + rx + ' ' + (ry - c) +
                           ' Q ' + rx + ' ' + ry + ' ' + (rx - c) + ' ' + ry +
                           ' L ' + (-rx + c) + ' ' + ry +
                           ' Q ' + (-rx) + ' ' + ry + ' ' + (-rx) + ' ' + (ry - c) +
                           ' L ' + (-rx) + ' ' + (-ry + c) +
                           ' Q ' + (-rx) + ' ' + (-ry) + ' ' + (-rx + c) + ' ' + (-ry) + ' Z';
                }
                return 'M ' + (-rx) + ' 0 A ' + rx + ' ' + ry + ' 0 1 0 ' + rx + ' 0 A ' + rx + ' ' + ry + ' 0 1 0 ' + (-rx) + ' 0 Z';
            }
            var node = g.append('g').attr('class', 'nodes').selectAll('path').data(nodes).join('path').attr('d', function(d) { return nodePath(d, opts); }).attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; }).attr('fill', function(d) { return nodeFill(d, opts); }).attr('stroke', '#fff').attr('stroke-width', 2).call(d3Saint.drag().on('start', dragstart).on('drag', dragged).on('end', dragend)).on('mouseover', function(event, d) {
                showTooltip(nodeTooltipHtml(d), event, true);
            }).on('mouseout', hideTooltip);
            var label = g.append('g').attr('class', 'labels').selectAll('text').data(nodes).join('text').text(function(d) { return d.label.length > 30 ? d.label.slice(0, 27) + '...' : d.label; }).attr('font-size', opts.labelSize || 12).attr('text-anchor', 'middle').attr('dominant-baseline', 'middle').attr('fill', '#333').style('display', opts.showLabels ? null : 'none').on('mouseover', function(event, d) { showTooltip(nodeTooltipHtml(d), event, true); }).on('mouseout', hideTooltip);
            function boundaryDistance(a, b, localOpts) {
                var geom = nodeShapeRadii(a, localOpts);
                var rx = Math.max(1e-6, geom.rx), ry = Math.max(1e-6, geom.ry);
                var dx = (b.x - a.x), dy = (b.y - a.y);
                var dist = Math.sqrt(dx * dx + dy * dy) || 1e-6;
                var ux = dx / dist, uy = dy / dist;
                if (geom.shape === 'rectangle') {
                    var tx = Math.abs(ux) > 1e-8 ? (rx / Math.abs(ux)) : Infinity;
                    var ty = Math.abs(uy) > 1e-8 ? (ry / Math.abs(uy)) : Infinity;
                    return Math.min(tx, ty);
                }
                var denom = Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry));
                if (!isFinite(denom) || denom <= 0) return Math.max(rx, ry);
                return 1 / denom;
            }
            function edgeEndpoint(a, b, boundaryDist) {
                var dx = b.x - a.x;
                var dy = b.y - a.y;
                var dist = Math.sqrt(dx * dx + dy * dy) || 1e-6;
                var t = Math.min(1, Math.max(0, boundaryDist / dist));
                return { x: a.x + dx * t, y: a.y + dy * t };
            }
            function updateEdgeAnchors(localOpts) {
                var lo = localOpts || opts;
                link.attr('x1', function(d) {
                    return edgeEndpoint(d.source, d.target, boundaryDistance(d.source, d.target, lo)).x;
                }).attr('y1', function(d) {
                    return edgeEndpoint(d.source, d.target, boundaryDistance(d.source, d.target, lo)).y;
                }).attr('x2', function(d) {
                    return edgeEndpoint(d.target, d.source, boundaryDistance(d.target, d.source, lo)).x;
                }).attr('y2', function(d) {
                    return edgeEndpoint(d.target, d.source, boundaryDistance(d.target, d.source, lo)).y;
                });
                linkHover.attr('x1', function(d) {
                    return edgeEndpoint(d.source, d.target, boundaryDistance(d.source, d.target, lo)).x;
                }).attr('y1', function(d) {
                    return edgeEndpoint(d.source, d.target, boundaryDistance(d.source, d.target, lo)).y;
                }).attr('x2', function(d) {
                    return edgeEndpoint(d.target, d.source, boundaryDistance(d.target, d.source, lo)).x;
                }).attr('y2', function(d) {
                    return edgeEndpoint(d.target, d.source, boundaryDistance(d.target, d.source, lo)).y;
                });
            }
            var simulation = d3Saint.forceSimulation(nodes).force('link', d3Saint.forceLink(links).id(function(d) { return d.id; }).distance(linkDistance)).force('charge', d3Saint.forceManyBody().strength(-400)).force('center', d3Saint.forceCenter(width / 2, height / 2)).force('collision', d3Saint.forceCollide().radius(function(d) { return Math.max(20, nodeRadius(d, opts) + 4); })).velocityDecay(0.65).alpha(0.4).alphaDecay(0.04);
            function dragstart(event) {
                if (!event.active) {
                    simulation.alphaTarget(0).stop();
                }
                event.subject.fx = event.subject.x;
                event.subject.fy = event.subject.y;
            }
            function dragged(event) {
                event.subject.fx = event.x;
                event.subject.fy = event.y;
                event.subject.x = event.x;
                event.subject.y = event.y;
                updateEdgeAnchors(opts);
                node.attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
                label.attr('x', function(d) { return d.x; }).attr('y', function(d) { return d.y; });
            }
            function dragend(event) {
                if (!event.active) {
                    simulation.alphaTarget(0);
                }
                event.subject.fx = event.x;
                event.subject.fy = event.y;
            }
            simulation.on('tick', function() {
                updateEdgeAnchors(opts);
                node.attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
                label.attr('x', function(d) { return d.x; }).attr('y', function(d) { return d.y; });
            });
            var zoom = d3Saint.zoom().scaleExtent([0.2, 4]).on('zoom', function(event) {
                g.attr('transform', event.transform);
                var k = event.transform.k;
                var baseFontSize = opts.labelSize || 12;
                label.attr('font-size', baseFontSize / k);
            });
            svg.call(zoom);
            window._saintNetworkState = { node: node, link: link, label: label, nodes: nodes, exprMin: exprMin, exprMax: exprMax, avgPMin: avgPMin, avgPMax: avgPMax, bfdrMin: bfdrMin, bfdrMax: bfdrMax, avgNodeRadius: avgNodeRadius, svg: svg, g: g, updateEdgeAnchors: updateEdgeAnchors };
            document.getElementById('saintExportNetworkSvg').disabled = false;
            document.getElementById('saintExportNetworkPng').disabled = false;
            document.getElementById('saintExportNetworkPdf').disabled = false;
            }
            requestAnimationFrame(draw);
        }
        window.constructNetwork = constructNetwork;

        function applyNetworkDisplayOptions() {
            if (!window._saintNetworkState) return;
            var st = window._saintNetworkState;
            var opts = { showLabels: document.getElementById('saintNetworkShowLabels') && document.getElementById('saintNetworkShowLabels').checked, nodeSize: document.getElementById('saintNetworkNodeSize') ? Number(document.getElementById('saintNetworkNodeSize').value) : 6, labelSize: document.getElementById('saintNetworkLabelSize') ? Number(document.getElementById('saintNetworkLabelSize').value) : 12, nodeShape: document.getElementById('saintNetworkNodeShape') ? document.getElementById('saintNetworkNodeShape').value : 'circle', linkOpacity: document.getElementById('saintNetworkLinkOpacity') ? Number(document.getElementById('saintNetworkLinkOpacity').value) : 0.6, colorByType: document.getElementById('saintNetworkColorByType') && document.getElementById('saintNetworkColorByType').checked, colorHigh: document.getElementById('saintNetworkColorHigh') ? document.getElementById('saintNetworkColorHigh').value : '#1e3a5f', colorLow: document.getElementById('saintNetworkColorLow') ? document.getElementById('saintNetworkColorLow').value : '#cce0f0' };
            var scaleFactor = (opts.nodeSize || 6) / 6;
            var rMin = 4 * scaleFactor, rMax = 18 * scaleFactor;
            var eMin = st.exprMin != null ? st.exprMin : 0, eMax = st.exprMax != null ? st.exprMax : 1;
            if (eMax <= eMin) eMax = eMin + 1;
            function radius(d) {
                if (d.isBait) return (st.avgNodeRadius != null ? st.avgNodeRadius * scaleFactor : 6 * scaleFactor);
                if (d.avgLog10Expr != null && !isNaN(d.avgLog10Expr)) {
                    var t = (d.avgLog10Expr - eMin) / (eMax - eMin);
                    return rMin + t * (rMax - rMin);
                }
                return 6 * scaleFactor;
            }
            st.link.attr('stroke-opacity', opts.linkOpacity).attr('stroke-width', function(d) {
                var avgP = (typeof d.avgP === 'number' && !isNaN(d.avgP)) ? d.avgP : 0.5;
                var pMin = st.avgPMin != null ? st.avgPMin : 0.5, pMax = st.avgPMax != null ? st.avgPMax : 1;
                if (pMax <= pMin) pMax = pMin + 0.01;
                var t = (avgP - pMin) / (pMax - pMin);
                return 0.8 + Math.max(0, Math.min(1, t)) * 2.7;
            });
            function bfdrFill(d) {
                if (d.minBfdr == null || isNaN(d.minBfdr)) return '#94a3b8';
                var bMin = st.bfdrMin != null ? st.bfdrMin : 0, bMax = st.bfdrMax != null ? st.bfdrMax : 0.05;
                if (bMax <= bMin) bMax = bMin + 0.01;
                var t = (d.minBfdr - bMin) / (bMax - bMin);
                t = Math.max(0, Math.min(1, t));
                var scale = d3Saint.scaleLinear().domain([0, 1]).range([opts.colorLow || '#cce0f0', opts.colorHigh || '#1e3a5f']);
                return scale(t);
            }
            function shapeR(d) {
                var rr = radius(d), scaleFactor = (opts.nodeSize || 6) / 6;
                if (opts.nodeShape === 'ellipse') return { rx: rr * 1.25, ry: rr * 0.8, shape: 'ellipse' };
                if (opts.nodeShape === 'rectangle') {
                    var displayLabel = (d.label || '').toString();
                    if (displayLabel.length > 30) displayLabel = displayLabel.slice(0, 27) + '...';
                    var textHalfW = Math.min(120 * scaleFactor, Math.max(10 * scaleFactor, displayLabel.length * 3.2));
                    var rx = Math.max(rr * 1.2, textHalfW + 6 * scaleFactor);
                    var ry = Math.min(Math.max(8 * scaleFactor, rr * 0.65), 14 * scaleFactor);
                    var corner = Math.min(ry * 0.6, 8 * scaleFactor);
                    return { rx: rx, ry: ry, shape: 'rectangle', corner: corner };
                }
                return { rx: rr, ry: rr, shape: 'circle' };
            }
            function shapePath(d) {
                var g = shapeR(d), rx = g.rx, ry = g.ry;
                if (g.shape === 'rectangle') {
                    var c = Math.max(0, Math.min(g.corner || 0, rx, ry));
                    return 'M ' + (-rx + c) + ' ' + (-ry) +
                           ' L ' + (rx - c) + ' ' + (-ry) +
                           ' Q ' + rx + ' ' + (-ry) + ' ' + rx + ' ' + (-ry + c) +
                           ' L ' + rx + ' ' + (ry - c) +
                           ' Q ' + rx + ' ' + ry + ' ' + (rx - c) + ' ' + ry +
                           ' L ' + (-rx + c) + ' ' + ry +
                           ' Q ' + (-rx) + ' ' + ry + ' ' + (-rx) + ' ' + (ry - c) +
                           ' L ' + (-rx) + ' ' + (-ry + c) +
                           ' Q ' + (-rx) + ' ' + (-ry) + ' ' + (-rx + c) + ' ' + (-ry) + ' Z';
                }
                return 'M ' + (-rx) + ' 0 A ' + rx + ' ' + ry + ' 0 1 0 ' + rx + ' 0 A ' + rx + ' ' + ry + ' 0 1 0 ' + (-rx) + ' 0 Z';
            }
            st.node.attr('d', shapePath).attr('fill', function(d) {
                if (d.isBait && !d.isPrey) return '#c2410c';
                if (d.isBait && d.isPrey) return '#9f7aea';
                if (opts.colorByType) return '#48bb78';
                return bfdrFill(d);
            }).attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
            if (typeof st.updateEdgeAnchors === 'function') st.updateEdgeAnchors(opts);
            st.label.style('display', opts.showLabels ? null : 'none');
            if (opts.showLabels && st.svg) {
                var currentTransform = d3Saint.zoomTransform(st.svg.node());
                if (currentTransform) {
                    var k = currentTransform.k;
                    var baseFontSize = opts.labelSize || 12;
                    st.label.attr('font-size', baseFontSize / k);
                }
            }
        }
        function updateNetworkThresholdLabels() {
            var bfdrEl = document.getElementById('saintNetworkBfdrThreshold');
            var avgPEl = document.getElementById('saintNetworkAvgPThreshold');
            var bfdrVal = document.getElementById('saintNetworkBfdrValue');
            var avgPVal = document.getElementById('saintNetworkAvgPValue');
            if (bfdrEl && bfdrVal) bfdrVal.textContent = bfdrEl.value;
            if (avgPEl && avgPVal) avgPVal.textContent = avgPEl.value;
        }
        function updateNetworkDisplayLabels() {
            var nodeSizeEl = document.getElementById('saintNetworkNodeSize');
            var nodeSizeVal = document.getElementById('saintNetworkNodeSizeValue');
            var labelSizeEl = document.getElementById('saintNetworkLabelSize');
            var labelSizeVal = document.getElementById('saintNetworkLabelSizeValue');
            var linkOpacityEl = document.getElementById('saintNetworkLinkOpacity');
            var linkOpacityVal = document.getElementById('saintNetworkLinkOpacityValue');
            if (nodeSizeEl && nodeSizeVal) nodeSizeVal.textContent = nodeSizeEl.value;
            if (labelSizeEl && labelSizeVal) labelSizeVal.textContent = labelSizeEl.value;
            if (linkOpacityEl && linkOpacityVal) linkOpacityVal.textContent = Number(linkOpacityEl.value).toFixed(2);
        }
        function updateNetworkColorGradientPreview() {
            var high = document.getElementById('saintNetworkColorHigh');
            var low = document.getElementById('saintNetworkColorLow');
            var preview = document.getElementById('saintNetworkColorGradientPreview');
            if (high && low && preview) {
                preview.style.background = 'linear-gradient(90deg, ' + low.value + ' 0%, ' + high.value + ' 100%)';
            }
        }
        function setupSaintNetworkOptionListeners() {
            ['saintNetworkShowLabels', 'saintNetworkNodeSize', 'saintNetworkLabelSize', 'saintNetworkNodeShape', 'saintNetworkLinkOpacity', 'saintNetworkColorByType', 'saintNetworkColorHigh', 'saintNetworkColorLow'].forEach(function(id) {
                var el = document.getElementById(id);
                if (!el) return;
                el.addEventListener('change', applyNetworkDisplayOptions);
                if (id === 'saintNetworkNodeSize' || id === 'saintNetworkLabelSize' || id === 'saintNetworkLinkOpacity') {
                    el.addEventListener('input', function() {
                        updateNetworkDisplayLabels();
                        applyNetworkDisplayOptions();
                    });
                }
                if (id === 'saintNetworkColorHigh' || id === 'saintNetworkColorLow') {
                    el.addEventListener('input', function() {
                        updateNetworkColorGradientPreview();
                        applyNetworkDisplayOptions();
                    });
                }
            });
            var bfdrSlider = document.getElementById('saintNetworkBfdrThreshold');
            var avgPSlider = document.getElementById('saintNetworkAvgPThreshold');
            if (bfdrSlider) bfdrSlider.addEventListener('input', updateNetworkThresholdLabels);
            if (avgPSlider) avgPSlider.addEventListener('input', updateNetworkThresholdLabels);
            updateNetworkDisplayLabels();
            updateNetworkColorGradientPreview();
            updateNetworkThresholdLabels();
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupSaintNetworkOptionListeners); else setupSaintNetworkOptionListeners();
        var GO_DEMO_GENES = 'TP53\nBRCA1\nEGFR\nMYC\nAKT1\nMAPK1\nSTAT3\nJUN\nFOS\nCDK1';
        window.updateEnrichrGeneSourceUi = function () {
            var selected = document.querySelector('input[name="enrichrGeneSource"]:checked');
            var value = (selected && selected.value) ? selected.value : 'paste';
            var ta = document.getElementById('enrichrPasteGenes');
            if (value === 'paste') {
                if (ta) { ta.style.display = 'block'; if (!ta.value.trim()) ta.value = GO_DEMO_GENES; }
            } else if (ta) {
                ta.style.display = 'none';
            }
        };
        document.querySelectorAll('input[name="enrichrGeneSource"]').forEach(function(r) {
            r.addEventListener('change', function() {
                if (typeof window.updateEnrichrGeneSourceUi === 'function') window.updateEnrichrGeneSourceUi();
            });
        });
        if (typeof window.updateEnrichrGeneSourceUi === 'function') window.updateEnrichrGeneSourceUi();
        if (typeof window.refreshEnrichrGeneSourceOptions === 'function') window.refreshEnrichrGeneSourceOptions();

        window.ENRICHR_STATS = null;
        var ENRICHR_CATEGORIES = [
            { id: 1, name: 'Transcription' },
            { id: 2, name: 'Pathways' },
            { id: 3, name: 'Ontologies' },
            { id: 4, name: 'Diseases/Drugs' },
            { id: 5, name: 'Cell Types' },
            { id: 6, name: 'Misc' },
            { id: 7, name: 'Legacy' },
            { id: 8, name: 'Crowd' }
        ];
        function loadEnrichrStatsIfNeeded() {
            if (window.ENRICHR_STATS) {
                updateEnrichrLibraryDropdown();
                return;
            }
            var statusEl = document.getElementById('enrichrLoadStatus');
            if (!statusEl) return;
            var ENRICHR_STATS_URL = 'https://maayanlab.cloud/Enrichr/datasetStatistics';
            var MAX_ATTEMPTS = 10;
            var waitMs = function(ms) {
                return new Promise(function(resolve) { setTimeout(resolve, ms); });
            };
            function applyStatsData(data) {
                window.ENRICHR_STATS = data;
                statusEl.textContent = 'Libraries loaded. Select category and library.';
                var catSel = document.getElementById('enrichrCategory');
                var spEl = document.getElementById('enrichrSpecies');
                if (catSel && !catSel.dataset.enrichrBound) {
                    catSel.addEventListener('change', updateEnrichrLibraryDropdown);
                    catSel.dataset.enrichrBound = '1';
                }
                if (spEl && !spEl.dataset.enrichrBound) {
                    spEl.addEventListener('change', updateEnrichrLibraryDropdown);
                    spEl.dataset.enrichrBound = '1';
                }
                updateEnrichrLibraryDropdown();
            }
            function showFinalFailure(err) {
                var base = 'Failed to load libraries: ' + (err && err.message ? err.message : err);
                var extra = '';
                var msg = (err && err.message) ? err.message : '';
                if (msg.indexOf('Failed to fetch') !== -1) {
                    extra = ' If the console mentions CORS from origin null (file://), a gateway error (e.g. HTTP 504) often returns a body without Access-Control-Allow-Origin; the browser then reports CORS even though Enrichr normally echoes Origin (including null) on success. Retries above help; you can also try a local HTTP server or try again later.';
                }
                statusEl.innerHTML = '';
                var wrap = document.createElement('div');
                wrap.style.marginBottom = '8px';
                wrap.textContent = base + extra;
                statusEl.appendChild(wrap);
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = 'Retry loading libraries';
                btn.style.marginTop = '4px';
                btn.style.padding = '6px 10px';
                btn.style.cursor = 'pointer';
                btn.onclick = function() {
                    window.ENRICHR_STATS = null;
                    loadEnrichrStatsIfNeeded();
                };
                statusEl.appendChild(btn);
            }
            statusEl.textContent = 'Loading library list from Enrichr...';
            function attemptFetch(attemptNum) {
                return fetch(ENRICHR_STATS_URL)
                    .then(function(r) {
                        if (!r.ok) {
                            return Promise.reject(new Error('HTTP ' + r.status + ' ' + (r.statusText || '')));
                        }
                        return r.json();
                    })
                    .then(function(data) {
                        if (!data || !Array.isArray(data.statistics)) {
                            return Promise.reject(new Error('Unexpected response (missing statistics array)'));
                        }
                        applyStatsData(data);
                    })
                    .catch(function(err) {
                        if (attemptNum < MAX_ATTEMPTS) {
                            var delay = Math.min(8000, 400 * attemptNum * attemptNum);
                            statusEl.textContent = 'Enrichr library list failed (' + (err.message || err) + '). Retrying attempt ' + (attemptNum + 1) + '/' + MAX_ATTEMPTS + ' after ' + Math.round(delay / 1000) + 's...';
                            return waitMs(delay).then(function() { return attemptFetch(attemptNum + 1); });
                        }
                        showFinalFailure(err);
                    });
            }
            return attemptFetch(1);
        }
        window.loadEnrichrStatsIfNeeded = loadEnrichrStatsIfNeeded;
        window.enrichrRetryLoadLibraryStats = function() {
            window.ENRICHR_STATS = null;
            loadEnrichrStatsIfNeeded();
        };
        function parseLibraryYear(libraryName) {
            var m = libraryName.match(/_20(\d{2})$/);
            return m ? parseInt(m[1], 10) : 0;
        }
        /** Default GO Cellular Component libraries (newest first); matches Enrichr dataset names. */
        var ENRICHR_PREFERRED_GO_CC_LIBRARIES = [
            'GO_Cellular_Component_2025',
            'GO_Cellular_Component_2023',
            'GO_Cellular_Component_2021'
        ];
        function updateEnrichrLibraryDropdown() {
            var libSel = document.getElementById('enrichrLibrary');
            var infoEl = document.getElementById('enrichrLibraryInfo');
            if (!window.ENRICHR_STATS || !window.ENRICHR_STATS.statistics) {
                libSel.innerHTML = '<option value="">-- Load libraries first --</option>';
                return;
            }
            var catId = document.getElementById('enrichrCategory').value;
            var species = (document.getElementById('enrichrSpecies').value || '').trim();
            if (!catId) {
                libSel.innerHTML = '<option value="">-- Select category first --</option>';
                infoEl.textContent = '';
                return;
            }
            var list = window.ENRICHR_STATS.statistics.filter(function(s) {
                return String(s.categoryId) === String(catId);
            });
            list = list.filter(function(s) {
                var n = (s.libraryName || '');
                if (species === 'Human') return n.indexOf('Human') !== -1 || (n.indexOf('Mouse') === -1 && n.indexOf('Muris') === -1 && n.indexOf('Drosophila') === -1 && n.indexOf('Fly') === -1 && n.indexOf('Yeast') === -1 && n.indexOf('Saccharomyces') === -1 && n.indexOf('elegans') === -1 && n.indexOf('Worm') === -1 && n.indexOf('Fish') === -1 && n.indexOf('Zebrafish') === -1 && n.indexOf('Danio') === -1);
                if (species === 'Mouse') return n.indexOf('Mouse') !== -1 || n.indexOf('Muris') !== -1;
                if (species === 'Fruit fly') return n.indexOf('Drosophila') !== -1 || n.indexOf('Fly') !== -1;
                if (species === 'Yeast') return n.indexOf('Yeast') !== -1 || n.indexOf('Saccharomyces') !== -1 || n.indexOf('cerevisiae') !== -1;
                if (species === 'Worm') return n.indexOf('Worm') !== -1 || n.indexOf('elegans') !== -1 || n.indexOf('Caenorhabditis') !== -1;
                if (species === 'Fish') return n.indexOf('Fish') !== -1 || n.indexOf('Zebrafish') !== -1 || n.indexOf('Danio') !== -1;
                return true;
            });
            list.sort(function(a, b) {
                var yA = parseLibraryYear(a.libraryName), yB = parseLibraryYear(b.libraryName);
                if (yB !== yA) return yB - yA;
                return (a.libraryName || '').localeCompare(b.libraryName || '');
            });
            libSel.innerHTML = '';
            list.forEach(function(s) {
                var opt = document.createElement('option');
                opt.value = s.libraryName;
                opt.textContent = s.libraryName + ' (' + (s.numTerms || 0) + ' terms)';
                libSel.appendChild(opt);
            });
            if (list.length > 0) {
                var pickIdx = 0;
                var pi;
                var li;
                for (pi = 0; pi < ENRICHR_PREFERRED_GO_CC_LIBRARIES.length; pi++) {
                    var want = ENRICHR_PREFERRED_GO_CC_LIBRARIES[pi];
                    for (li = 0; li < list.length; li++) {
                        if ((list[li].libraryName || '') === want) {
                            pickIdx = li;
                            pi = ENRICHR_PREFERRED_GO_CC_LIBRARIES.length;
                            break;
                        }
                    }
                }
                libSel.selectedIndex = pickIdx;
                var chosen = list[pickIdx];
                infoEl.textContent = 'Terms: ' + (chosen.numTerms || 0) + ', genes/term: ' + (chosen.genesPerTerm || '-');
            } else {
                infoEl.textContent = 'No libraries match. Try another category or species.';
            }
        }

        /**
         * Matrix row labels → optional species inference, optional MyGene mapping, deduped gene_symbol list.
         * Depends on js/enrichr_matrix_context.js and js/feature_name_mapping.js.
         */
        window.prepareEnrichrRowLabelGeneList = async function (updateStatus, appendLog) {
            var log = typeof appendLog === 'function' ? appendLog : function () {};
            var cd = window.currentData;
            if (!cd || !Array.isArray(cd.rowIds) || !cd.rowIds.length) {
                throw new Error('No matrix row labels. Load a data matrix in Data Preparation first.');
            }
            if (typeof window.guessEnrichrSpeciesFromMatrix !== 'function') {
                throw new Error('Enrichr matrix helpers not loaded (enrichr_matrix_context.js).');
            }
            if (typeof window.applyEnrichrSpeciesGuessToDom === 'function') {
                window.applyEnrichrSpeciesGuessToDom({ logFn: log });
            } else {
                var guess = window.guessEnrichrSpeciesFromMatrix(cd, window.metaData);
                if (guess.enrichrSpecies) {
                    var enrichrSel = document.getElementById('enrichrSpecies');
                    if (enrichrSel) enrichrSel.value = guess.enrichrSpecies;
                    var fms = document.getElementById('featureNameMapSpecies');
                    if (fms) fms.value = guess.enrichrSpecies === 'Mouse' ? 'mouse' : 'human';
                    log('Species inferred: ' + guess.enrichrSpecies + ' (' + (guess.confidence || '') + ') — ' + guess.rationale);
                } else {
                    log('Species not inferred from row IDs, column headers, or meta. Set Enrichr species and Data PreProcess → Name mapping species manually if results look wrong.');
                }
            }

            var enrichmentSp = (document.getElementById('enrichrSpecies').value || '').trim();
            if (enrichmentSp !== 'Human' && enrichmentSp !== 'Mouse') {
                throw new Error('Enrichr run supports Human or Mouse only. Select a supported species (or load data that allows inference).');
            }
            var speciesKey = typeof window.enrichrSpeciesValueToMappingKey === 'function'
                ? window.enrichrSpeciesValueToMappingKey(enrichmentSp)
                : (enrichmentSp === 'Mouse' ? 'mouse' : 'human');
            var taxidOther = '';

            if (typeof window.buildGeneListFromDiannPgGeneColumn === 'function') {
                var diannGenePack = window.buildGeneListFromDiannPgGeneColumn(cd);
                if (diannGenePack && diannGenePack.genes && diannGenePack.genes.length) {
                    try {
                        window._enrichrAssertGeneSymbolCoverage(cd, diannGenePack.genes.length);
                        log('Using DIANN gene names column "' + diannGenePack.columnLabel + '" (' + diannGenePack.source + '): ' + diannGenePack.genes.length + ' unique symbols.');
                        updateStatus('Enrichr gene list from DIANN "' + diannGenePack.columnLabel + '": ' + diannGenePack.genes.length + ' genes');
                        return diannGenePack.genes;
                    } catch (covErr) {
                        log('DIANN gene column not used for Enrichr (' + (covErr.message || covErr) + '); falling back to row labels / MyGene.');
                    }
                }
            }

            var normRowTok = typeof window.normalizeMatrixRowLabelTokenForEnrichr === 'function'
                ? function (rid) { return window.normalizeMatrixRowLabelTokenForEnrichr(rid); }
                : function (rid) { return String(rid == null ? '' : rid).split(/\t|;|\|/)[0].trim(); };
            var normalizedRowIds = cd.rowIds.map(function (rid) { return normRowTok(rid); });
            var heuristic = window.rowIdsLikelyNeedGeneMapping(normalizedRowIds);
            log('Row ID check: ' + (heuristic.need ? 'likely need MyGene → gene_symbol' : 'look like gene symbols; using row labels') +
                ' (n≈' + heuristic.sampleSize + ', UniProt-like ' + (heuristic.uniprotFrac * 100).toFixed(0) + '%, gene-like ' + (heuristic.geneLikeFrac * 100).toFixed(0) + '%).');
            if (typeof window.stripMatrixRowLabelSpeciesSuffixForEnrichr === 'function') {
                log('Row labels normalized for Enrichr: UniProt-style _SPECIES suffix removed when matched (e.g. UBA6_HUMAN → UBA6, Gene_mouse → Gene).');
            }

            if (!heuristic.need) {
                var seenR = {};
                var rawList = [];
                cd.rowIds.forEach(function (rid) {
                    var g = normRowTok(rid);
                    if (g && !seenR[g]) { seenR[g] = true; rawList.push(g); }
                });
                updateStatus('Using matrix row labels (first token per row, species suffix stripped): ' + rawList.length + ' genes');
                return rawList;
            }

            var reuse = window.canReuseFeatureNameMapForEnrichr(cd, true);
            if (reuse.reuse) {
                log('Reusing existing name mapping (' + (reuse.symbolFrac * 100).toFixed(0) + '% rows with gene_symbol).');
                var fromCache = window.buildGeneListFromFeatureMap(cd);
                if (fromCache.length === 0) {
                    throw new Error('Saved name mapping has no gene_symbol values. Run Name mapping or clear and retry.');
                }
                window._enrichrAssertGeneSymbolCoverage(cd, fromCache.length);
                updateStatus('Enrichr gene list from saved mapping: ' + fromCache.length + ' unique symbols');
                return fromCache;
            }

            if (typeof window.runFeatureNameMappingAsync !== 'function') {
                throw new Error('runFeatureNameMappingAsync not available (feature_name_mapping.js).');
            }
            log('Running MyGene name mapping (same pipeline as Data PreProcess → Name mapping)...');
            await window.runFeatureNameMappingAsync({
                speciesKey: speciesKey,
                taxidOther: taxidOther,
                mode: 'auto',
                statusEl: null,
                logEl: null,
                onLog: function (m) { log('[MyGene] ' + m); },
                suppressComplete: false,
                alertOnError: false
            });
            var mapped = window.buildGeneListFromFeatureMap(cd);
            if (mapped.length === 0) {
                throw new Error('No gene_symbol after mapping. Try another species or inspect Data PreProcess → Name mapping.');
            }
            window._enrichrAssertGeneSymbolCoverage(cd, mapped.length);
            updateStatus('Enrichr gene list from MyGene mapping: ' + mapped.length + ' unique symbols');
            return mapped;
        };

        window._enrichrAssertGeneSymbolCoverage = function (cd, symbolCount) {
            var n = cd.rowIds.length;
            var minOk = Math.max(15, Math.floor(n * 0.12));
            if (symbolCount < minOk) {
                throw new Error('Too few gene symbols (' + symbolCount + ' for ' + n + ' rows). Check species (Enrichr + Name mapping) or ID type.');
            }
        };

        /**
         * Build Enrichr results table UI from API terms or from a session snapshot (restoredBundle).
         * When restoredBundle is set, column order and colMax are taken from the snapshot so the table matches exactly.
         */
        window.enrichrSetupResultsDisplay = function (terms, resultsEl, updateStatus, restoredBundle) {
            if (!resultsEl) resultsEl = document.getElementById('enrichrResultsContainer');
            if (!resultsEl) return;
            if (!terms || !Array.isArray(terms)) {
                if (updateStatus) updateStatus('No Enrichr terms to display.', true);
                return;
            }
            var allColNames = ['Rank', 'Term', 'P-value', 'Odds Ratio', 'Combined Score', 'Genes', 'Adjusted P-value', 'Old P-value', 'Old Adj P-value'];
            var colHelp = {
                'Rank': 'Rank order of the term in the results (e.g. by combined score or p-value).',
                'Term': 'Name of the enriched term (pathway, GO term, or gene set from the library).',
                'P-value': 'The p-value is computed from the Fisher exact test, which is a proportion test that assumes a binomial distribution and independence for the probability of any gene belonging to any set.',
                'Odds Ratio': 'The rank based ranking is derived from running the Fisher exact test for many random gene sets in order to compute a mean rank and standard deviation from the expected rank for each term in the gene-set library and finally calculating a z-score to assess the deviation from the expected rank.',
                'Combined Score': 'A combined metric that incorporates both the p-value and the odds ratio to summarize enrichment strength.',
                'Genes': 'Genes from your input list that overlap with this term (gene set).',
                'Adjusted P-value': 'P-value corrected for multiple testing (e.g. Benjamini–Hochberg FDR). Lower values indicate stronger enrichment after correction.',
                'Old P-value': 'Legacy or alternative p-value from a previous Enrichr calculation method.',
                'Old Adj P-value': 'Legacy or alternative adjusted p-value from a previous Enrichr calculation method.'
            };
            if (restoredBundle && restoredBundle.displayOrder && restoredBundle.displayOrder.length) {
                window._enrichrDisplayOrder = restoredBundle.displayOrder.slice();
                window._enrichrTerms = terms;
                window._enrichrColNames = restoredBundle.colNames && restoredBundle.colNames.length
                    ? restoredBundle.colNames.slice()
                    : window._enrichrDisplayOrder.map(function (i) {
                        return i < allColNames.length ? allColNames[i] : 'Col ' + (i + 1);
                    });
                window._enrichrColHelp = restoredBundle.colHelp ? JSON.parse(JSON.stringify(restoredBundle.colHelp)) : colHelp;
                window._enrichrRowsPerPage = restoredBundle.rowsPerPage != null ? restoredBundle.rowsPerPage : 100;
                window._enrichrTotalPages = Math.max(1, restoredBundle.totalPages != null ? restoredBundle.totalPages : Math.ceil(terms.length / window._enrichrRowsPerPage));
                window._enrichrCurrentPage = Math.min(window._enrichrTotalPages, Math.max(1, restoredBundle.currentPage != null ? restoredBundle.currentPage : 1));
                window._enrichrSortCol = restoredBundle.sortCol !== undefined && restoredBundle.sortCol !== null ? restoredBundle.sortCol : null;
                window._enrichrSortDir = restoredBundle.sortDir != null ? restoredBundle.sortDir : 1;
                window._enrichrAllColNames = restoredBundle.allColNames && restoredBundle.allColNames.length ? restoredBundle.allColNames.slice() : allColNames.slice();
                window._enrichrResultsEl = resultsEl;
                if (restoredBundle.colMax && typeof restoredBundle.colMax === 'object') {
                    window._enrichrColMax = JSON.parse(JSON.stringify(restoredBundle.colMax));
                } else {
                    var numericDataIndicesR = [2, 3, 4, 6, 7, 8];
                    var pvalDataIndicesR = [2, 6, 7, 8];
                    var colMaxR = {};
                    terms.forEach(function (t) {
                        if (!Array.isArray(t)) return;
                        numericDataIndicesR.forEach(function (idx) {
                            var v = t[idx];
                            if (v === undefined || v === null) return;
                            if (pvalDataIndicesR.indexOf(idx) !== -1) {
                                var p = Number(v);
                                if (typeof p === 'number' && !isNaN(p) && p > 0) {
                                    var negLog = -Math.log10(Math.min(1, Math.max(p, 1e-20)));
                                    colMaxR[idx] = Math.max(colMaxR[idx] || 0, Math.min(20, negLog));
                                }
                            } else if (idx === 0) {
                                var r = Number(v);
                                if (typeof r === 'number' && !isNaN(r) && r >= 1) colMaxR[0] = 1;
                            } else if (idx === 3 || idx === 4) {
                                var n = Number(v);
                                if (typeof n === 'number' && !isNaN(n) && n > 0) {
                                    colMaxR[idx] = Math.max(colMaxR[idx] || 0, n);
                                }
                            }
                        });
                    });
                    if (!colMaxR[0]) colMaxR[0] = 1;
                    var negLogMaxR = 20;
                    pvalDataIndicesR.forEach(function (idx) { if (colMaxR[idx] === undefined) colMaxR[idx] = negLogMaxR; });
                    window._enrichrColMax = colMaxR;
                }
            } else {
                var maxLen = 0;
                terms.forEach(function (t) { if (Array.isArray(t) && t.length > maxLen) maxLen = t.length; });
                var colHasData = [];
                for (var hi = 0; hi < Math.min(maxLen, allColNames.length); hi++) {
                    var hasData = false;
                    for (var hj = 0; hj < Math.min(terms.length, 100); hj++) {
                        var tt = terms[hj];
                        if (Array.isArray(tt) && hi < tt.length) {
                            var vv = tt[hi];
                            if (vv !== undefined && vv !== null && vv !== '' && !(typeof vv === 'number' && vv === 0 && hi >= 7)) {
                                hasData = true;
                                break;
                            }
                        }
                    }
                    colHasData[hi] = hasData;
                }
                var dataIndices = [];
                for (var di = 0; di < Math.min(maxLen, allColNames.length); di++) {
                    if (di < 7 || colHasData[di]) {
                        dataIndices.push(di);
                    }
                }
                for (var dj = allColNames.length; dj < maxLen; dj++) {
                    if (colHasData[dj] !== false) {
                        dataIndices.push(dj);
                    }
                }
                var genesIdx = 5;
                var adjPvalIdx = 6;
                var pvalIdx = 2;
                var displayOrder = dataIndices.filter(function (i) { return i !== genesIdx && i !== adjPvalIdx; });
                var pvalPos = displayOrder.indexOf(pvalIdx);
                if (pvalPos !== -1 && dataIndices.indexOf(adjPvalIdx) !== -1) {
                    displayOrder.splice(pvalPos + 1, 0, adjPvalIdx);
                }
                if (dataIndices.indexOf(genesIdx) !== -1) {
                    displayOrder.push(genesIdx);
                }
                var colNames = displayOrder.map(function (i) {
                    return i < allColNames.length ? allColNames[i] : 'Col ' + (i + 1);
                });
                window._enrichrDisplayOrder = displayOrder;
                var rowsPerPage = 100;
                var totalPages = Math.max(1, Math.ceil(terms.length / rowsPerPage));
                window._enrichrTerms = terms;
                window._enrichrColNames = colNames;
                window._enrichrColHelp = colHelp;
                window._enrichrRowsPerPage = rowsPerPage;
                window._enrichrTotalPages = totalPages;
                window._enrichrCurrentPage = 1;
                window._enrichrResultsEl = resultsEl;
                window._enrichrAllColNames = allColNames;
                window._enrichrSortCol = null;
                window._enrichrSortDir = 1;
                var colMax = {};
                var numericDataIndices0 = [2, 3, 4, 6, 7, 8];
                var pvalDataIndices0 = [2, 6, 7, 8];
                terms.forEach(function (t) {
                    if (!Array.isArray(t)) return;
                    numericDataIndices0.forEach(function (idx) {
                        var v = t[idx];
                        if (v === undefined || v === null) return;
                        if (pvalDataIndices0.indexOf(idx) !== -1) {
                            var p = Number(v);
                            if (typeof p === 'number' && !isNaN(p) && p > 0) {
                                var negLog = -Math.log10(Math.min(1, Math.max(p, 1e-20)));
                                colMax[idx] = Math.max(colMax[idx] || 0, Math.min(20, negLog));
                            }
                        } else if (idx === 0) {
                            var r = Number(v);
                            if (typeof r === 'number' && !isNaN(r) && r >= 1) colMax[0] = 1;
                        } else if (idx === 3 || idx === 4) {
                            var n = Number(v);
                            if (typeof n === 'number' && !isNaN(n) && n > 0) {
                                colMax[idx] = Math.max(colMax[idx] || 0, n);
                            }
                        }
                    });
                });
                if (!colMax[0]) colMax[0] = 1;
                var negLogMax0 = 20;
                pvalDataIndices0.forEach(function (idx) { if (colMax[idx] === undefined) colMax[idx] = negLogMax0; });
                window._enrichrColMax = colMax;
            }

            var ENRICHR_MAT_COL_PREFIX = '__matc__';
            function enrichrMatColKey(j) {
                return ENRICHR_MAT_COL_PREFIX + j;
            }
            function enrichrIsMatrixColSynthetic(dataIdx) {
                return typeof dataIdx === 'string' && dataIdx.indexOf(ENRICHR_MAT_COL_PREFIX) === 0;
            }
            function enrichrMatrixColIndexFromKey(dataIdx) {
                if (!enrichrIsMatrixColSynthetic(dataIdx)) return -1;
                var j = parseInt(String(dataIdx).slice(ENRICHR_MAT_COL_PREFIX.length), 10);
                return Number.isFinite(j) ? j : -1;
            }
            function enrichrStripAttachedMatrixColumns() {
                var dOrd = window._enrichrDisplayOrder;
                var cNames = window._enrichrColNames;
                var cHelp = window._enrichrColHelp || {};
                var ac = window._enrichrAllColNames;
                var colMax2 = window._enrichrColMax || {};
                if (!Array.isArray(dOrd) || !Array.isArray(cNames)) return;
                for (var i = dOrd.length - 1; i >= 0; i--) {
                    var d = dOrd[i];
                    if (d === -42 || enrichrIsMatrixColSynthetic(d)) {
                        var removedName = cNames[i];
                        dOrd.splice(i, 1);
                        cNames.splice(i, 1);
                        if (removedName) delete cHelp[removedName];
                        if (enrichrIsMatrixColSynthetic(d)) delete colMax2[d];
                        if (d === -42) delete colMax2[-42];
                        if (Array.isArray(ac) && removedName) {
                            var ai = ac.lastIndexOf(removedName);
                            if (ai !== -1) ac.splice(ai, 1);
                        }
                    }
                }
                window._enrichrColHelp = cHelp;
                window._enrichrColMax = colMax2;
            }
            function enrichrAttachMatrixIntensityColumn() {
                enrichrStripAttachedMatrixColumns();
                terms.forEach(function (term) {
                    if (Array.isArray(term)) delete term._enrichrMatrixColSums;
                });
                var matrix = typeof window.saintGetMatrixForBridge === 'function' ? window.saintGetMatrixForBridge() : null;
                var cd = window.currentData;
                if (!terms || !terms.length || !matrix || !cd || !Array.isArray(cd.rowIds) || cd.rowIds.length !== matrix.length) return;
                if (typeof window.buildEnrichrGeneUpperToRowIndicesMap !== 'function') return;
                var geneToRows = window.buildEnrichrGeneUpperToRowIndicesMap(cd);
                if (!geneToRows || Object.keys(geneToRows).length === 0) return;
                var parse = window.EnrichrResultsParse;
                if (!parse) return;
                var nCols = Array.isArray(cd.columnHeaders) && cd.columnHeaders.length > 0
                    ? cd.columnHeaders.length
                    : (Array.isArray(matrix[0]) ? matrix[0].length : 0);
                if (!nCols) return;
                var matrixColHeaders = [];
                var hc;
                for (hc = 0; hc < nCols; hc++) {
                    if (Array.isArray(cd.columnHeaders) && hc < cd.columnHeaders.length) {
                        matrixColHeaders.push(String(cd.columnHeaders[hc] == null ? '' : cd.columnHeaders[hc]));
                    } else {
                        matrixColHeaders.push('Column ' + (hc + 1));
                    }
                }
                terms.forEach(function (term) {
                    if (!Array.isArray(term)) return;
                    var genes = parse.parseGeneCell(term.length > 5 ? term[5] : null);
                    genes = parse.dedupeGenes(genes);
                    var seenRows = {};
                    genes.forEach(function (g) {
                        var u = String(g || '').trim().toUpperCase();
                        var rows = geneToRows[u];
                        if (!rows || !rows.length) return;
                        var rr;
                        for (rr = 0; rr < rows.length; rr++) {
                            var ri = rows[rr];
                            if (seenRows[ri]) continue;
                            seenRows[ri] = true;
                        }
                    });
                    var nMatch = Object.keys(seenRows).length;
                    if (genes.length === 0 || nMatch === 0) {
                        term._enrichrMatrixColSums = null;
                        return;
                    }
                    var sums = new Array(nCols);
                    var ci;
                    for (ci = 0; ci < nCols; ci++) sums[ci] = 0;
                    Object.keys(seenRows).forEach(function (riKey) {
                        var ri = parseInt(riKey, 10);
                        if (!Number.isFinite(ri)) return;
                        var row = matrix[ri];
                        if (!Array.isArray(row)) return;
                        for (ci = 0; ci < nCols; ci++) {
                            var v = row[ci];
                            var nv = typeof v === 'number' ? v : parseFloat(String(v));
                            if (typeof nv === 'number' && !isNaN(nv) && Number.isFinite(nv)) sums[ci] += nv;
                        }
                    });
                    term._enrichrMatrixColSums = sums;
                });
                var dOrd = window._enrichrDisplayOrder;
                var cNames = window._enrichrColNames;
                if (!Array.isArray(dOrd) || !Array.isArray(cNames)) return;
                var cHelp = window._enrichrColHelp || {};
                var matHelp = 'Sum of this sample’s intensities across matrix rows matched to overlapping genes (row label, gene_symbol from Name mapping, DIANN Genes). Each matrix row counted at most once per term.';
                var jc;
                for (jc = 0; jc < nCols; jc++) {
                    var hname = matrixColHeaders[jc];
                    dOrd.push(enrichrMatColKey(jc));
                    cNames.push(hname);
                    cHelp[hname] = matHelp;
                }
                window._enrichrColHelp = cHelp;
                if (window._enrichrAllColNames && Array.isArray(window._enrichrAllColNames)) {
                    for (jc = 0; jc < nCols; jc++) {
                        window._enrichrAllColNames.push(matrixColHeaders[jc]);
                    }
                }
                var colMax2 = window._enrichrColMax || {};
                for (jc = 0; jc < nCols; jc++) {
                    var key = enrichrMatColKey(jc);
                    var mx = 0;
                    terms.forEach(function (t) {
                        var arr = t._enrichrMatrixColSums;
                        if (!Array.isArray(arr) || jc >= arr.length) return;
                        var s = arr[jc];
                        if (typeof s === 'number' && !isNaN(s) && s > mx) mx = s;
                    });
                    colMax2[key] = mx > 0 ? mx : 1;
                }
                window._enrichrColMax = colMax2;
            }
            enrichrAttachMatrixIntensityColumn();

            var numericDataIndices = [2, 3, 4, 6, 7, 8];
            if (window._enrichrDisplayOrder) {
                window._enrichrDisplayOrder.forEach(function (d) {
                    if (enrichrIsMatrixColSynthetic(d) && numericDataIndices.indexOf(d) === -1) {
                        numericDataIndices.push(d);
                    }
                });
            }
            var pvalDataIndices = [2, 6, 7, 8];
            var colMaxRef = window._enrichrColMax || {};
            var negLogMax = 20;

            function barWidthFor(val, dataIdx) {
                if (val === undefined || val === null) return 0;
                var n = Number(val);
                if (typeof n !== 'number' || isNaN(n)) return 0;
                if (pvalDataIndices.indexOf(dataIdx) !== -1) {
                    if (n <= 0 || n > 1) return 0;
                    var negLog = -Math.log10(Math.max(n, 1e-20));
                    return Math.min(100, (negLog / negLogMax) * 100);
                }
                if (dataIdx === 0) {
                    if (n < 1) return 0;
                    return Math.min(100, (1 / n) * 100);
                }
                if ((dataIdx === 3 || dataIdx === 4) && colMaxRef[dataIdx] > 0) {
                    return Math.min(100, (n / colMaxRef[dataIdx]) * 100);
                }
                if (enrichrIsMatrixColSynthetic(dataIdx) && colMaxRef[dataIdx] > 0) {
                    return Math.min(100, (n / colMaxRef[dataIdx]) * 100);
                }
                return 0;
            }
            function getEnrichrSortValue(term, dataIdx) {
                if (!Array.isArray(term)) return undefined;
                if (enrichrIsMatrixColSynthetic(dataIdx)) {
                    var j = enrichrMatrixColIndexFromKey(dataIdx);
                    if (j < 0) return undefined;
                    var arr = term._enrichrMatrixColSums;
                    if (!Array.isArray(arr) || j >= arr.length) return undefined;
                    var sm = arr[j];
                    return typeof sm === 'number' && !isNaN(sm) ? sm : undefined;
                }
                if (typeof dataIdx !== 'number') return undefined;
                if (dataIdx < 0) return undefined;
                if (dataIdx >= term.length) return undefined;
                return term[dataIdx];
            }
            function getSortedEnrichrTerms() {
                var tms = window._enrichrTerms || [];
                var col = window._enrichrSortCol;
                var dir = window._enrichrSortDir;
                var dOrd = window._enrichrDisplayOrder;
                var dataCol = (dOrd && col != null && col < dOrd.length) ? dOrd[col] : col;
                if (col === null || col === undefined) return tms.slice();
                return tms.slice().sort(function (a, b) {
                    var va = getEnrichrSortValue(a, dataCol);
                    var vb = getEnrichrSortValue(b, dataCol);
                    var isNum = function (x) { return typeof x === 'number' && !isNaN(x); };
                    var isArray = function (x) { return Array.isArray(x); };
                    if (isArray(va)) va = va.length;
                    if (isArray(vb)) vb = vb.length;
                    if (va === undefined || va === null) return dir;
                    if (vb === undefined || vb === null) return -dir;
                    if (isNum(va) && isNum(vb)) {
                        if (va !== vb) return dir * (va - vb);
                        return 0;
                    }
                    var sa = String(va);
                    var sb = String(vb);
                    return dir * (sa.localeCompare(sb, undefined, { numeric: true }));
                });
            }
            window.enrichrSortBy = function (col) {
                var current = window._enrichrSortCol;
                var dir = window._enrichrSortDir;
                if (current === col) {
                    window._enrichrSortDir = -dir;
                } else {
                    window._enrichrSortCol = col;
                    window._enrichrSortDir = 1;
                }
                if (window._enrichrRenderPage) window._enrichrRenderPage();
            };
            function fmt(val, idx) {
                if (val === undefined || val === null || val === '') return '';
                if (idx === 5 && Array.isArray(val)) return val.join(', ');
                if (enrichrIsMatrixColSynthetic(idx)) {
                    if (!Number.isFinite(val)) return '';
                    var axm = Math.abs(val);
                    if (axm >= 1e7 || (axm > 0 && axm < 1e-4)) return val.toExponential(4);
                    return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
                }
                if (typeof val === 'number') {
                    if (isNaN(val) || val === 0 && idx >= 7) return '';
                    if (idx === 2 || idx === 6 || idx === 7 || idx === 8) return val < 0.001 ? val.toExponential(3) : val.toFixed(4);
                    if (idx === 3 || idx === 4) return Number(val).toFixed(4);
                }
                return String(val);
            }
            function renderEnrichrPage() {
                var page = window._enrichrCurrentPage || 1;
                var sortedTerms = getSortedEnrichrTerms();
                var colNames = window._enrichrColNames;
                var rowsPerPage = window._enrichrRowsPerPage;
                var totalPages = window._enrichrTotalPages;
                var chunk = sortedTerms.slice();
                var colHelpLocal = window._enrichrColHelp || {};
                var sortCol = window._enrichrSortCol;
                var sortDir = window._enrichrSortDir;
                var displayOrder = window._enrichrDisplayOrder || [];
                var tableRows = [];
                chunk.forEach(function (term) {
                    var rowObj = {};
                    var termLen = Array.isArray(term) ? term.length : 0;
                    for (var c = 0; c < colNames.length; c++) {
                        var dataIdx = displayOrder[c];
                        var val = '';
                        if (Array.isArray(term)) {
                            if (enrichrIsMatrixColSynthetic(dataIdx)) {
                                var jix = enrichrMatrixColIndexFromKey(dataIdx);
                                var ars = term._enrichrMatrixColSums;
                                val = (Array.isArray(ars) && jix >= 0 && jix < ars.length) ? ars[jix] : undefined;
                            } else if (typeof dataIdx === 'number' && dataIdx < termLen) {
                                val = term[dataIdx];
                            } else {
                                val = undefined;
                            }
                        } else if (dataIdx === 1) {
                            val = term;
                        }
                        if (numericDataIndices.indexOf(dataIdx) !== -1 && val != null && val !== '') {
                            var nv = typeof val === 'number' ? val : Number(val);
                            if (!isNaN(nv)) val = nv;
                        }
                        rowObj['raw_' + c] = val;
                        rowObj['idx_' + c] = dataIdx;
                    }
                    tableRows.push(rowObj);
                });
                var paginationHtml = '';
                resultsEl.innerHTML = '<div class="enrichr-table-wrap" id="enrichrTableHost"></div>' + paginationHtml;
                var tableHost = document.getElementById('enrichrTableHost');
                if (tableHost && window.TableDisplay && typeof window.TableDisplay.renderGenericTable === 'function') {
                    var dtCols = colNames.map(function (h, c) {
                        var help = colHelpLocal[h] || 'Additional column from the Enrichr API result.';
                        return {
                            key: 'raw_' + c,
                            title: h || '',
                            className: 'dt-type-string',
                            render: function (data, type, row) {
                                var dataIdx = row['idx_' + c];
                                if (type === 'sort' || type === 'type') {
                                    if (numericDataIndices.indexOf(dataIdx) !== -1) {
                                        var sv = typeof data === 'number' ? data : Number(data);
                                        return isNaN(sv) ? null : sv;
                                    }
                                    return data == null ? '' : String(data);
                                }
                                var text = fmt(data, dataIdx);
                                if (dataIdx === 5 && text.length > 120) text = text.substring(0, 120) + '...';
                                var esc = String(text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                if (numericDataIndices.indexOf(dataIdx) !== -1 && typeof data === 'number' && !isNaN(data)) {
                                    var bw = barWidthFor(data, dataIdx);
                                    var barClass = pvalDataIndices.indexOf(dataIdx) !== -1 ? ' enrichr-bar-pvalue' : '';
                                    return '<div class="enrichr-cell-numeric" title="' + String(help).replace(/"/g, '&quot;') + '"><div class="enrichr-bar-wrap"><div class="enrichr-bar-fill' + barClass + '" style="width:' + Math.max(0, bw) + '%"></div></div><span class="enrichr-bar-text">' + esc + '</span></div>';
                                }
                                return '<span title="' + String(help).replace(/"/g, '&quot;') + '">' + esc + '</span>';
                            }
                        };
                    });
                    void window.TableDisplay.renderGenericTable(tableHost, {
                        data: tableRows,
                        columns: dtCols,
                        tableClassName: 'results-table',
                        rootClassName: 'enrichr-results-table-root',
                        pageLength: rowsPerPage,
                        info: false,
                        language: { search: 'Search Enrichr:', searchPlaceholder: 'Type to filter terms…' }
                    }).catch(function (ex) {
                        console.error('Enrichr table:', ex);
                    });
                }
                var pageInput = document.getElementById('enrichrPageInput');
                if (pageInput) {
                    pageInput.addEventListener('change', function () {
                        var p = parseInt(this.value, 10);
                        if (!isNaN(p) && p >= 1 && p <= totalPages) {
                            window._enrichrCurrentPage = p;
                            renderEnrichrPage();
                        } else {
                            this.value = window._enrichrCurrentPage;
                        }
                    });
                }
            }
            window._enrichrRenderPage = renderEnrichrPage;
            window.changeEnrichrPage = function (delta) {
                var total = window._enrichrTotalPages || 1;
                var newPage = (window._enrichrCurrentPage || 1) + delta;
                if (newPage >= 1 && newPage <= total) {
                    window._enrichrCurrentPage = newPage;
                    renderEnrichrPage();
                }
            };
            renderEnrichrPage();
            if (typeof window.enrichrRefreshDownstreamPlots === 'function') {
                try {
                    window.enrichrRefreshDownstreamPlots();
                } catch (ex) {
                    console.warn('Enrichr downstream plots:', ex);
                }
            }
            if (typeof window.enrichrRefreshResultsDataHeatmapWhenVisible === 'function') {
                try {
                    window.enrichrRefreshResultsDataHeatmapWhenVisible();
                } catch (exHm) {
                    console.warn('Enrichr results heatmap:', exHm);
                }
            }
        };

        window.collectEnrichrSessionSnapshot = function () {
            if (!window._enrichrTerms || !window._enrichrTerms.length) return null;
            return {
                terms: JSON.parse(JSON.stringify(window._enrichrTerms)),
                displayOrder: window._enrichrDisplayOrder ? window._enrichrDisplayOrder.slice() : null,
                colNames: window._enrichrColNames ? window._enrichrColNames.slice() : null,
                colHelp: window._enrichrColHelp ? JSON.parse(JSON.stringify(window._enrichrColHelp)) : null,
                allColNames: window._enrichrAllColNames ? window._enrichrAllColNames.slice() : null,
                rowsPerPage: window._enrichrRowsPerPage,
                totalPages: window._enrichrTotalPages,
                currentPage: window._enrichrCurrentPage,
                sortCol: window._enrichrSortCol,
                sortDir: window._enrichrSortDir,
                colMax: window._enrichrColMax ? JSON.parse(JSON.stringify(window._enrichrColMax)) : null
            };
        };

        window.restoreEnrichrSessionSnapshot = function (bundle) {
            if (!bundle || !bundle.terms || !bundle.terms.length) return false;
            var resultsEl = document.getElementById('enrichrResultsContainer');
            if (!resultsEl) return false;
            var terms = JSON.parse(JSON.stringify(bundle.terms));
            window.enrichrSetupResultsDisplay(terms, resultsEl, function () {}, bundle);
            return true;
        };

        async function runEnrichrEnrichment() {
            var statusEl = document.getElementById('enrichrStatus');
            var resultsEl = document.getElementById('enrichrResultsContainer');
            var species = (document.getElementById('enrichrSpecies').value || '').trim();
            var libraryName = (document.getElementById('enrichrLibrary').value || '').trim();
            if (typeof window.refreshEnrichrGeneSourceOptions === 'function') window.refreshEnrichrGeneSourceOptions();
            var geneSource = (document.querySelector('input[name="enrichrGeneSource"]:checked') || {}).value || 'paste';
            var geneList = [];
            var runBtn = document.getElementById('enrichrRunBtn');
            resultsEl.innerHTML = '';
            enrichrClearLog('Starting Enrichr enrichment analysis...');
            var updateStatus = function(msg, isError) {
                var prefix = isError ? 'ERROR: ' : '';
                enrichrAppendLog(prefix + msg);
                statusEl.textContent = msg;
            };
            if (!libraryName) {
                updateStatus('Please select a library.', true);
                return;
            }
            if (geneSource === 'preys') {
                if (species !== 'Human' && species !== 'Mouse') {
                    updateStatus('Analysis is currently supported only for Human and Mouse. Please select Human or Mouse.', true);
                    return;
                }
                if (!window.saintResults || !window.saintResults.scores || !window.saintResults.scores.length) {
                    updateStatus('No SAINT results. Run SAINT analysis first, then use SAINT preys.', true);
                    return;
                }
                var seen = {};
                window.saintResults.scores.forEach(function(s) {
                    var p = (s.prey || '').toString().trim();
                    if (p && !seen[p]) { seen[p] = true; geneList.push(p); }
                });
                updateStatus('Using SAINT preys source: ' + geneList.length + ' genes');
            } else if (geneSource === 'diffresults') {
                if (species !== 'Human' && species !== 'Mouse') {
                    updateStatus('Analysis is currently supported only for Human and Mouse. Please select Human or Mouse.', true);
                    return;
                }
                if (typeof window.prepareEnrichrDiffResultGeneList !== 'function') {
                    updateStatus('Differential result source is unavailable in this build.', true);
                    return;
                }
                var diffBundle = window.prepareEnrichrDiffResultGeneList();
                geneList = Array.isArray(diffBundle && diffBundle.genes) ? diffBundle.genes.slice() : [];
                if (geneList.length === 0) {
                    updateStatus('No Differential labels to send. Run Differential analysis first (and check sig-only filter if desired).', true);
                    return;
                }
                updateStatus('Using Differential results table source: ' + geneList.length + ' labels' + (diffBundle && diffBundle.usedSigOnly ? ' (sig-only filter ON)' : ''));
            } else if (geneSource === 'rowlabels') {
                if (runBtn) runBtn.disabled = true;
                try {
                    geneList = await window.prepareEnrichrRowLabelGeneList(updateStatus, window.enrichrAppendLog);
                } catch (err) {
                    updateStatus((err && err.message) ? err.message : String(err), true);
                    if (runBtn) runBtn.disabled = false;
                    return;
                }
                if (runBtn) runBtn.disabled = false;
                species = (document.getElementById('enrichrSpecies').value || '').trim();
                if (species !== 'Human' && species !== 'Mouse') {
                    updateStatus('Select Human or Mouse for Enrichr (species not inferred—set manually).', true);
                    return;
                }
            } else {
                if (species !== 'Human' && species !== 'Mouse') {
                    updateStatus('Analysis is currently supported only for Human and Mouse. Please select Human or Mouse.', true);
                    return;
                }
                var textarea = document.getElementById('enrichrPasteGenes');
                var raw = (textarea && textarea.value || '').trim();
                if (!raw) {
                    updateStatus('Paste a gene list (one per line or comma-separated).', true);
                    return;
                }
                var lines = raw.split(/\r?\n/);
                lines.forEach(function(line) {
                    line = line.trim();
                    if (!line) return;
                    if (line.indexOf(',') !== -1 || line.indexOf('\t') !== -1) {
                        line.split(/[,\t]+/).forEach(function(gene) {
                            gene = gene.trim();
                            if (gene) geneList.push(gene);
                        });
                    } else {
                        geneList.push(line);
                    }
                });
                updateStatus('Using pasted source: ' + geneList.length + ' genes');
            }
            if (geneList.length === 0) {
                updateStatus('No genes to test.', true);
                return;
            }
            updateStatus('Uploading ' + geneList.length + ' genes to Enrichr (' + libraryName + ')...');
            var formData = new FormData();
            formData.append('list', geneList.join('\n'));
            formData.append('description', 'SAINTq Enrichr');
            fetch('https://maayanlab.cloud/Enrichr/addList', { method: 'POST', body: formData })
                .then(function(r) {
                    if (!r.ok) return r.text().then(function(t) { throw new Error('HTTP ' + r.status + (t ? ': ' + t.substring(0, 100) : '')); });
                    return r.json();
                })
                .then(function(addResult) {
                    if (!addResult || !addResult.userListId) throw new Error('No userListId');
                    var userListId = addResult.userListId;
                    updateStatus('Querying enrichment for ' + libraryName + '...');
                    var url = 'https://maayanlab.cloud/Enrichr/enrich?userListId=' + encodeURIComponent(userListId) + '&backgroundType=' + encodeURIComponent(libraryName);
                    return fetch(url).then(function(r) {
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return r.json();
                    });
                })
                .then(function(enrichData) {
                    var terms = enrichData[libraryName];
                    if (!terms || !Array.isArray(terms)) throw new Error('No results for ' + libraryName);
                    updateStatus('Done. Found ' + terms.length + ' terms.');
                    window.enrichrSetupResultsDisplay(terms, resultsEl, updateStatus, null);
                })
                .catch(function(err) {
                    updateStatus('Enrichment failed: ' + (err.message || err), true);
                });
        }
        window.runEnrichrEnrichment = runEnrichrEnrichment;

        // Enrichr API functions
        function enrichrAddList(geneList, description) {
            var listStr = Array.isArray(geneList) ? geneList.join('\n') : geneList;
            // Enrichr has a limit, try to handle large lists
            if (geneList.length > 2000) {
                console.warn('Large gene list (' + geneList.length + ' genes). Enrichr may have limits.');
            }
            // Use FormData as per Enrichr API documentation
            var formData = new FormData();
            formData.append('list', listStr);
            if (description) {
                formData.append('description', description);
            }
            return fetch('https://maayanlab.cloud/Enrichr/addList', {
                method: 'POST',
                body: formData
                // Don't set Content-Type header - browser sets it automatically for FormData with boundary
            }).then(function(r) {
                if (!r.ok) {
                    // Try to get error message from response
                    return r.text().then(function(text) {
                        var errorMsg = 'HTTP ' + r.status;
                        console.error('Enrichr API error response:', text);
                        try {
                            var json = JSON.parse(text);
                            if (json.error) errorMsg += ': ' + json.error;
                            else if (json.message) errorMsg += ': ' + json.message;
                            else if (json.detail) errorMsg += ': ' + json.detail;
                            else errorMsg += ': ' + JSON.stringify(json).substring(0, 200);
                        } catch(e) {
                            // Not JSON, use text directly
                            if (text && text.length < 500) {
                                errorMsg += ': ' + text;
                            } else if (text) {
                                errorMsg += ': ' + text.substring(0, 200) + '...';
                            }
                        }
                        throw new Error(errorMsg);
                    });
                }
                return r.json();
            });
        }
        function enrichrEnrich(userListId, libraryName) {
            // Use libraryName as backgroundType parameter (as per Enrichr API)
            var url = 'https://maayanlab.cloud/Enrichr/enrich?userListId=' + encodeURIComponent(userListId) + '&backgroundType=' + encodeURIComponent(libraryName);
            return fetch(url).then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            }).then(function(data) {
                // Enrichr returns: { libraryName: [[rank, term, pvalue, ...], ...], ... }
                if (data && data[libraryName] && Array.isArray(data[libraryName])) {
                    return data[libraryName];
                }
                // Try alternative: data might be { libraryName: { ... } } or direct array
                if (data && Array.isArray(data)) {
                    return data; // Direct array response
                }
                throw new Error('Library ' + libraryName + ' not found in Enrichr results. Available: ' + Object.keys(data || {}).join(', '));
            });
        }
        function exportNetwork(format) {
            if (!window._saintNetworkState || !window._saintNetworkState.svg) {
                alert('No network to export. Construct a network first.');
                return;
            }
            var st = window._saintNetworkState;
            var svg = st.svg.node();
            var container = document.getElementById('saintNetworkContainer');
            var width = container.clientWidth || 800;
            var height = container.clientHeight || 600;
            var svgClone = svg.cloneNode(true);
            var gClone = svgClone.querySelector('g');
            if (gClone) {
                gClone.removeAttribute('transform');
            }
            var labels = svgClone.querySelectorAll('.labels text');
            labels.forEach(function(label) {
                var k = 1;
                var baseFontSize = 12, baseDx = 10, baseDy = 4;
                label.setAttribute('font-size', baseFontSize / k);
                label.setAttribute('dx', baseDx / k);
                label.setAttribute('dy', baseDy / k);
            });
            svgClone.setAttribute('width', width);
            svgClone.setAttribute('height', height);
            var svgData = new XMLSerializer().serializeToString(svgClone);
            var svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            var svgUrl = URL.createObjectURL(svgBlob);
            var filename = 'saint_network_' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
            if (format === 'svg') {
                var downloadLink = document.createElement('a');
                downloadLink.href = svgUrl;
                downloadLink.download = filename + '.svg';
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                URL.revokeObjectURL(svgUrl);
            } else if (format === 'png') {
                var img = new Image();
                img.onload = function() {
                    var canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    var ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fafafa';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob(function(blob) {
                        var url = URL.createObjectURL(blob);
                        var downloadLink = document.createElement('a');
                        downloadLink.href = url;
                        downloadLink.download = filename + '.png';
                        document.body.appendChild(downloadLink);
                        downloadLink.click();
                        document.body.removeChild(downloadLink);
                        URL.revokeObjectURL(url);
                        URL.revokeObjectURL(svgUrl);
                    }, 'image/png');
                };
                img.onerror = function() {
                    alert('Failed to export PNG. Please try SVG format instead.');
                    URL.revokeObjectURL(svgUrl);
                };
                img.src = svgUrl;
            } else if (format === 'pdf') {
                if (typeof window.jspdf === 'undefined') {
                    alert('PDF export requires jsPDF library. Please check your internet connection and refresh the page.');
                    URL.revokeObjectURL(svgUrl);
                    return;
                }
                var img = new Image();
                img.onload = function() {
                    var canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    var ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fafafa';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0);
                    var imgData = canvas.toDataURL('image/png');
                    var pdf = new window.jspdf.jsPDF({
                        orientation: width > height ? 'landscape' : 'portrait',
                        unit: 'px',
                        format: [width, height]
                    });
                    pdf.addImage(imgData, 'PNG', 0, 0, width, height);
                    pdf.save(filename + '.pdf');
                    URL.revokeObjectURL(svgUrl);
                };
                img.onerror = function() {
                    alert('Failed to export PDF. Please try SVG format instead.');
                    URL.revokeObjectURL(svgUrl);
                };
                img.src = svgUrl;
            }
        }
        window.exportNetwork = exportNetwork;
window.saintRunAnalysis = async function() {
    if (!window.saintCanRunAnalysis()) {
        window.saintShowError('Load a data matrix and meta table from Data Preparation first.');
        return;
    }
    if (!window.saintBuildIntegratedFromMainApp()) {
        window.saintShowError('Failed to integrate matrix and meta (check Sample_ID matches column names).');
        return;
    }
    if (window.saintAnalysisRunning) return;

    var useStatus = document.getElementById('saintUseStatusAsIs') && document.getElementById('saintUseStatusAsIs').checked;
    if (!useStatus) {
        var gc = document.getElementById('saintMetaGroupColumn') && document.getElementById('saintMetaGroupColumn').value;
        var cv = document.getElementById('saintControlValue') && document.getElementById('saintControlValue').value;
        var tv = document.getElementById('saintTreatmentValue') && document.getElementById('saintTreatmentValue').value;
        if (!gc || !cv || !tv) {
            window.saintShowError('Choose a meta column and two groups for control (C) and treatment (T), or use Status as-is.');
            return;
        }
        if (cv === tv) {
            window.saintShowError('Control and treatment groups must be distinct.');
            return;
        }
    }
    var bc = document.getElementById('saintBaitColumn') && document.getElementById('saintBaitColumn').value;
    if (!bc) {
        window.saintShowError('Choose a meta column for Bait.');
        return;
    }

    window.saintAnalysisRunning = true;
    window.saintShouldStop = false;
    if (window._saintProgressHideTimer) {
        clearTimeout(window._saintProgressHideTimer);
        window._saintProgressHideTimer = null;
    }
    var runBtn = document.getElementById('saintRunAnalysisBtn');
    var stopBtn = document.getElementById('saintStopAnalysisBtn');
    if (runBtn) runBtn.disabled = true;
    if (stopBtn) { stopBtn.disabled = false; stopBtn.style.display = 'block'; }
    window.saintHideError();

    try {
        window.saintClearAnalysisLog('Starting SAINT analysis...');
        window.saintUpdateProgress(0, 'Preparing data...');

        var params = {
            inputLevel: document.getElementById('saintInputLevel').value,
            proteinColname: document.getElementById('saintProteinColname').value,
            pepColname: document.getElementById('saintPepColname').value,
            fragColname: document.getElementById('saintFragColname').value,
            compressNCtrl: parseInt(document.getElementById('saintCompressNCtrl').value, 10),
            compressNRep: parseInt(document.getElementById('saintCompressNRep').value, 10),
            normalizeControl: document.getElementById('saintNormalizeControl').checked
        };

        window.saintAppendAnalysisLog('Input level: ' + params.inputLevel);
        window.saintUpdateProgress(10, 'Parsing input data...');
        if (window.saintShouldStop) throw new Error('Analysis stopped by user');

        var saintData = prepareSaintData(window.saintIntegratedData, window.saintMetadataRows, params);
        window.saintAppendAnalysisLog('Found ' + saintData.dataRows.length + ' data rows');
        window.saintAppendAnalysisLog('Found ' + saintData.ipColumns.length + ' IP columns');

        window.saintUpdateProgress(30, 'Running SAINT algorithm...');
        if (window.saintShouldStop) throw new Error('Analysis stopped by user');

        var results = await runSaintAnalysis(saintData, params, function(progress, msg) {
            window.saintUpdateProgress(30 + progress * 0.6, msg);
        });

        if (window.saintShouldStop) throw new Error('Analysis stopped by user');

        window.saintUpdateProgress(95, 'Generating results...');
        window.saintAppendAnalysisLog('Calculated ' + results.scores.length + ' interaction scores');
        results.proteinAvgLog10Expr = computeProteinAvgLog10(saintData, params);
        results.proteinLog2FCByBait = computeProteinLog2FCByBait(saintData, params);

        displayResults(results, saintData);

        window.saintUpdateProgress(100, 'Analysis complete!');
        window.saintAppendAnalysisLog('Analysis completed successfully!');
        setTimeout(function() { window.switchSaintSubTab('analysis'); }, 500);
        window._saintProgressHideTimer = setTimeout(function() {
            window._saintProgressHideTimer = null;
            if (typeof window.saintHideAnalysisProgress === 'function') window.saintHideAnalysisProgress();
        }, 1600);
    } catch (error) {
        if (typeof window.saintHideAnalysisProgress === 'function') window.saintHideAnalysisProgress();
        window.saintShowError('Analysis error: ' + error.message);
        window.saintAppendAnalysisLog('ERROR: ' + error.message);
        console.error(error);
    } finally {
        window.saintAnalysisRunning = false;
        if (runBtn) runBtn.disabled = false;
        if (stopBtn) { stopBtn.disabled = true; stopBtn.style.display = 'none'; }
    }
};

window.saintStopAnalysis = function() {
    window.saintShouldStop = true;
    window.saintUpdateProgress(0, 'Stopping analysis...');
    window.saintAppendAnalysisLog('Analysis stopped by user');
    if (window._saintProgressHideTimer) {
        clearTimeout(window._saintProgressHideTimer);
        window._saintProgressHideTimer = null;
    }
    setTimeout(function() {
        if (typeof window.saintHideAnalysisProgress === 'function') window.saintHideAnalysisProgress();
    }, 800);
};

window.currentSaintSubTab = 'analysis';
window.switchSaintSubTab = function(name) {
    window.currentSaintSubTab = name;
    document.querySelectorAll('.saint-sub-tab').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-saint-sub') === name);
    });
    document.querySelectorAll('.saint-sub-panel').forEach(function(p) {
        p.style.display = p.getAttribute('data-saint-panel') === name ? 'flex' : 'none';
    });
    if (name === 'volcano') {
        if (typeof saintInitVolcanoTabIfNeeded === 'function') saintInitVolcanoTabIfNeeded();
        setTimeout(function() {
            if (typeof renderVolcanoPlot === 'function') renderVolcanoPlot();
        }, 80);
    }
    if (name === 'network' && typeof applyNetworkDisplayOptions === 'function') {
        setTimeout(function() { applyNetworkDisplayOptions(); }, 60);
    }
};

window.saintOnMainTabOpened = function() {
    window.saintSyncMatrixRefs();
    if (window.metaData && window.metaData.rows && window.metaData.rows.length) {
        window.saintEnsureMetaHeaders();
    }
    if (typeof saintRefreshMetaColumnSelects === 'function') saintRefreshMetaColumnSelects();
};

/** Session snapshot: SAINT scores + integrated matrix bridge (optional) for report-style reload. */
window.collectSaintSessionSnapshot = function () {
    if (!window.saintResults || !window.saintResults.scores || !window.saintResults.scores.length) return null;
    return {
        saintResults: JSON.parse(JSON.stringify(window.saintResults)),
        saintResultsSort: window.saintResultsSort ? JSON.parse(JSON.stringify(window.saintResultsSort)) : { column: null, dir: 1 },
        saintIntegratedData: window.saintIntegratedData ? JSON.parse(JSON.stringify(window.saintIntegratedData)) : null,
        saintMetadataRows: window.saintMetadataRows ? JSON.parse(JSON.stringify(window.saintMetadataRows)) : null
    };
};

/**
 * Restore SAINT results table and globals without re-running the algorithm.
 * Relies on window.saintApplyResultsFilter (closure) to redraw the table after DOM is rebuilt.
 */
window.restoreSaintSessionSnapshot = function (bundle) {
    if (!bundle || !bundle.saintResults || !bundle.saintResults.scores) return false;
    window.saintResults = JSON.parse(JSON.stringify(bundle.saintResults));
    window.saintResultsSort = bundle.saintResultsSort
        ? JSON.parse(JSON.stringify(bundle.saintResultsSort))
        : { column: null, dir: 1 };
    if (bundle.saintIntegratedData) {
        window.saintIntegratedData = JSON.parse(JSON.stringify(bundle.saintIntegratedData));
    }
    if (bundle.saintMetadataRows) {
        window.saintMetadataRows = JSON.parse(JSON.stringify(bundle.saintMetadataRows));
    }
    var container = document.getElementById('saintResultsContainer');
    var downloadBtn = document.getElementById('saintDownloadResultsBtn');
    var constructBtn = document.getElementById('saintConstructNetworkBtn');
    if (!container) return false;
    var toolbarHtml = '<div id="saintResultsToolbar" style="margin-bottom: 12px;">' +
        '<label for="saintResultsSearchInput" style="margin-right: 8px;">Search (Bait or Prey):</label>' +
        '<input type="text" id="saintResultsSearchInput" placeholder="Type to filter..." style="padding: 6px 10px; width: 240px; border: 1px solid #ccc; border-radius: 4px;" oninput="if(window.saintApplyResultsFilter) window.saintApplyResultsFilter();">' +
        '</div>' +
        '<div id="saintResultsTableWrap"></div>';
    container.innerHTML = toolbarHtml;
    if (typeof window.saintApplyResultsFilter === 'function') window.saintApplyResultsFilter();
    if (downloadBtn) downloadBtn.style.display = 'block';
    if (constructBtn) constructBtn.disabled = false;
    if (typeof window.refreshEnrichrGeneSourceOptions === 'function') window.refreshEnrichrGeneSourceOptions();
    return true;
};
