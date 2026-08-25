/*
 * Phosphoproteomics Normalization logic for Nebula
 * Implements Sequential KNN (SeqKNN) imputation and Phospho/Proteome Normalization (Log2 diff).
 */

var phosphoData = null;
var proteomeData = null;
var normalizedPhosphoData = null; // To store result before pushing to main

function onPhosphoFormatChange() {
    var fmt = document.getElementById('phosphoMatrixFormatSelect').value;
    var checkbox = document.getElementById('phosphoRemoveContam');
    if (fmt === 'mq_sites' || fmt === 'mq_pg') {
        checkbox.parentElement.style.display = 'flex';
    } else {
        checkbox.parentElement.style.display = 'none';
    }
}

function onProteomeFormatChange() {
    var fmt = document.getElementById('proteomeMatrixFormatSelect').value;
    var checkbox = document.getElementById('proteomeRemoveContam');
    if (fmt === 'mq_sites' || fmt === 'mq_pg') {
        checkbox.parentElement.style.display = 'flex';
    } else {
        checkbox.parentElement.style.display = 'none';
    }
}

function parseFileBasedOnFormat(fileContent, format, removeContam) {
    if (format === 'mq_sites') {
        return parseMaxQuantMatrix(fileContent, { kind: 'sites', removeContam: removeContam });
    } else if (format === 'mq_pg') {
        return parseMaxQuantMatrix(fileContent, { kind: 'proteinGroups', quant: 'lfq', removeContam: removeContam });
    } else if (format === 'diann_phospho') {
        return parseDIANNPhosphoSitesMatrix(fileContent);
    } else if (format === 'diann_pg') {
        return parseDIANNProteinGroupMatrix(fileContent, 'Protein.Names');
    } else if (format === 'plain') {
        // Plain matrix parser from index.html
        var parsed = Papa.parse(fileContent, { skipEmptyLines: true });
        if (parsed.errors.length && parsed.data.length === 0) throw new Error(parsed.errors[0].message);
        var data = parsed.data;
        var headers = data[0].slice(1);
        var metaHeaders = [data[0][0] || "ID"];
        var dataMatrix = [];
        var metaMatrix = [];
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            if (!row || row.length === 0) continue;
            var obj = {};
            obj[metaHeaders[0]] = row[0];
            metaMatrix.push(obj);
            var numRow = [];
            for (var j = 1; j < row.length; j++) {
                var v = parseFloat(row[j]);
                numRow.push(isNaN(v) ? null : v);
            }
            dataMatrix.push(numRow);
        }
        return {
            dataMatrix: dataMatrix,
            metaMatrix: metaMatrix,
            dataHeaders: headers,
            metaHeaders: metaHeaders
        };
    }
    throw new Error("Unknown format: " + format);
}

// The shared parsers (parseMaxQuantMatrix / parseDIANNProteinGroupMatrix) return
// the Nebula shape { rowIds, columnHeaders, dataMatrix, diannPgAnnotation* }.
// This adapts that output to the phospho module's expected shape
// { dataMatrix, dataHeaders, metaMatrix, metaHeaders }. Plain input already has it.
function toPhosphoShape(parsed) {
    if (parsed && parsed.dataHeaders && parsed.metaHeaders) return parsed;
    var annHeaders = (parsed && parsed.diannPgAnnotationHeaders) || [];
    var annRows = (parsed && parsed.diannPgAnnotationRows) || [];
    var metaMatrix = [];
    for (var i = 0; i < annRows.length; i++) {
        var obj = {};
        for (var c = 0; c < annHeaders.length; c++) {
            obj[annHeaders[c]] = annRows[i][c];
        }
        metaMatrix.push(obj);
    }
    return {
        dataMatrix: parsed.dataMatrix,
        dataHeaders: parsed.columnHeaders,
        metaMatrix: metaMatrix,
        metaHeaders: annHeaders
    };
}

function loadPhosphoMatrixFile(event) {
    var file = event.target.files[0];
    if (!file) return;
    var format = document.getElementById('phosphoMatrixFormatSelect').value;
    var removeContam = document.getElementById('phosphoRemoveContam').checked;
    var status = document.getElementById('phosphoFileStatus');
    
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            status.textContent = 'Parsing...';
            status.className = 'status';
            phosphoData = toPhosphoShape(parseFileBasedOnFormat(e.target.result, format, removeContam));
            status.textContent = 'Loaded ' + phosphoData.dataMatrix.length + ' rows, ' + phosphoData.dataHeaders.length + ' samples.';
            status.className = 'status success';
            populateMatchDropdowns();
        } catch (err) {
            status.textContent = 'Error: ' + err.message;
            status.className = 'status error';
        }
    };
    reader.readAsText(file);
}

function loadProteomeMatrixFile(event) {
    var file = event.target.files[0];
    if (!file) return;
    var format = document.getElementById('proteomeMatrixFormatSelect').value;
    var removeContam = document.getElementById('proteomeRemoveContam').checked;
    var status = document.getElementById('proteomeFileStatus');
    
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            status.textContent = 'Parsing...';
            status.className = 'status';
            proteomeData = toPhosphoShape(parseFileBasedOnFormat(e.target.result, format, removeContam));
            status.textContent = 'Loaded ' + proteomeData.dataMatrix.length + ' rows, ' + proteomeData.dataHeaders.length + ' samples.';
            status.className = 'status success';
            populateMatchDropdowns();
        } catch (err) {
            status.textContent = 'Error: ' + err.message;
            status.className = 'status error';
        }
    };
    reader.readAsText(file);
}

function populateMatchDropdowns() {
    var pSelect = document.getElementById('phosphoMatchCol');
    var prSelect = document.getElementById('proteomeMatchCol');
    
    if (phosphoData && phosphoData.metaHeaders) {
        var pVal = pSelect.value;
        pSelect.innerHTML = '';
        phosphoData.metaHeaders.forEach(function(h) {
            var opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            pSelect.appendChild(opt);
        });
        if (pVal && phosphoData.metaHeaders.indexOf(pVal) > -1) pSelect.value = pVal;
    }
    
    if (proteomeData && proteomeData.metaHeaders) {
        var prVal = prSelect.value;
        prSelect.innerHTML = '';
        proteomeData.metaHeaders.forEach(function(h) {
            var opt = document.createElement('option');
            opt.value = h;
            opt.textContent = h;
            prSelect.appendChild(opt);
        });
        if (prVal && proteomeData.metaHeaders.indexOf(prVal) > -1) prSelect.value = prVal;
    }
    refreshPhosphoDataView();
}

// ---- Shared Sequential KNN (SeqKNN) imputation ------------------------------------
// The phospho tab runs the EXACT same SeqKNN worker as Data PreProcess -> Imputation
// (js/imputation.worker.js, via runImputationKnnAsync in js/missing_value_imputation.js),
// so both KNN paths share one code path, one parameter set and one set of defaults and
// can never drift apart. Rows are imputed fewest-missing first and each imputed row is
// promoted into the donor pool; missing cells are the weighted mean of the K nearest
// donors. Metric / weighting / min. shared columns / fallback / neighbor axis and the
// max-missing-% cap carry the same meanings and defaults as the Imputation sub-tab.
// The matrices arrive already log2-transformed (values <= 0 are null), so
// zeroIsMissing is false here.

// Read the phospho SeqKNN settings (same fields and defaults as the Imputation
// sub-tab's SeqKNN block) into the worker opts used for one matrix. The per-group
// cap has no counterpart here: the phospho workspace's meta table is per-feature
// annotation (protein/gene/site), not per-sample metadata, so there are no sample
// groups to cap against (worker default = no per-group cap).
function buildPhosphoKnnOpts() {
    function pct(id, fallback) {
        var el = document.getElementById(id);
        var v = Number(el ? el.value : NaN);
        if (!isFinite(v)) v = fallback;
        return Math.max(0, Math.min(100, v));
    }
    function sel(id, fallback) {
        var el = document.getElementById(id);
        return (el && el.value) ? el.value : fallback;
    }
    return {
        metric: sel('phosphoKnnMetric', 'euclidean'),
        minShared: Number(sel('phosphoKnnMinShared', '1')) || 1,
        fallback: sel('phosphoKnnFallback', 'columnMedian'),
        weight: sel('phosphoKnnWeight', 'inverse'),
        axis: sel('phosphoKnnAxis', 'row'),
        maxMissingFrac: pct('phosphoKnnMaxMissing', 50) / 100
    };
}

// Run one matrix through the shared SeqKNN worker (the same code path the Imputation
// sub-tab uses), reporting its progress into the phospho status line.
function runPhosphoKnnImpute(matrix, k, status, label) {
    if (typeof runImputationKnnAsync !== 'function') {
        return Promise.reject(new Error('Shared imputation module not loaded (js/missing_value_imputation.js)'));
    }
    status.textContent = label + ': Sequential KNN...';
    status.className = 'status';
    return runImputationKnnAsync(matrix, k, false, buildPhosphoKnnOpts(), function (progress, msg) {
        status.textContent = label + ': ' + msg;
    });
}

// Log2 transform matrix (handles 0 by leaving them or treating as NaN, here we do log2(x) if x>0)
function log2Transform(matrix) {
    return matrix.map(row => row.map(val => {
        if (val === null || isNaN(val) || val <= 0) return null;
        return Math.log2(val);
    }));
}

function runPhosphoNormalization() {
    var status = document.getElementById('phosphoNormalizeStatus');
    if (!phosphoData) {
        status.textContent = 'Phosphosite matrix not loaded.';
        status.className = 'status error';
        return;
    }
    if (!proteomeData) {
        status.textContent = 'Proteome matrix not loaded.';
        status.className = 'status error';
        return;
    }
    
    var pCol = document.getElementById('phosphoMatchCol').value;
    var prCol = document.getElementById('proteomeMatchCol').value;
    if (!pCol || !prCol) {
        status.textContent = 'Please select matching columns for both datasets.';
        status.className = 'status error';
        return;
    }
    
    var doKnn = document.getElementById('phosphoEnableKnn').checked;
    var knnK = parseInt(document.getElementById('phosphoKnnK').value, 10) || 5;
    
    status.textContent = 'Processing (Log2 transform -> Sequential KNN Impute -> Normalize)...';
    status.className = 'status';
    
    // The KNN step runs in the shared SeqKNN worker (async), so the pipeline is a
    // Promise chain: log2 both -> KNN phospho -> KNN proteome -> normalize.
    function fail(err) {
        status.textContent = 'Error during normalization: ' + (err && err.message ? err.message : String(err));
        status.className = 'status error';
    }

    setTimeout(function () {
        var pMat, prMat;
        try {
            // 1. Log2 transform both (values <= 0 become null, i.e. missing)
            pMat = log2Transform(phosphoData.dataMatrix);
            prMat = log2Transform(proteomeData.dataMatrix);
        } catch (e) {
            fail(e);
            return;
        }

        // 2. KNN Impute - both matrices through the SAME SeqKNN worker the Imputation
        //    sub-tab uses (singleton worker -> the matrices run one after the other,
        //    per-matrix progress reported in the status line).
        var chain = Promise.resolve();
        if (doKnn) {
            chain = chain
                .then(function () { return runPhosphoKnnImpute(pMat, knnK, status, 'Phosphosite'); })
                .then(function (m) { pMat = m; })
                .then(function () { return runPhosphoKnnImpute(prMat, knnK, status, 'Proteome'); })
                .then(function (m) { prMat = m; });
        }

        chain.then(function () {
            // 3. Create mapping of Proteome ID to Row Index
            var prMap = {};
            for (var i = 0; i < proteomeData.metaMatrix.length; i++) {
                var id = String(proteomeData.metaMatrix[i][prCol] || "").trim();
                // If there are duplicate proteins, we just keep the first one or we could average. Keeping first is simplest.
                if (id && !prMap.hasOwnProperty(id)) {
                    prMap[id] = i;
                }
            }

            // 4. Map sample columns
            // We need to match Phospho samples to Proteome samples by exact string match
            var sampleMap = []; // index in phospho -> index in proteome
            for (var j = 0; j < phosphoData.dataHeaders.length; j++) {
                var sName = phosphoData.dataHeaders[j].trim();
                var prIdx = proteomeData.dataHeaders.findIndex(h => h.trim() === sName);
                sampleMap.push(prIdx); // could be -1 if not found
            }

            // 5. Normalization
            var normMat = [];
            for (var i = 0; i < phosphoData.metaMatrix.length; i++) {
                var rowId = String(phosphoData.metaMatrix[i][pCol] || "").trim();
                // Handle multiple proteins in MaxQuant (e.g. "GeneA;GeneB")
                var matchId = rowId.split(';')[0].trim();

                var prRowIdx = prMap[matchId];
                var newRow = [];

                for (var j = 0; j < phosphoData.dataHeaders.length; j++) {
                    var pVal = pMat[i][j];
                    if (pVal === null || isNaN(pVal)) {
                        newRow.push(null);
                        continue;
                    }

                    if (prRowIdx !== undefined && sampleMap[j] !== -1) {
                        var prVal = prMat[prRowIdx][sampleMap[j]];
                        if (prVal !== null && !isNaN(prVal)) {
                            // Normalize
                            newRow.push(pVal - prVal);
                        } else {
                            // Proteome value missing despite imputation, leave untouched
                            newRow.push(pVal);
                        }
                    } else {
                        // Protein not found or sample not found, leave untouched
                        newRow.push(pVal);
                    }
                }
                normMat.push(newRow);
            }

            // Save to global intermediate
            normalizedPhosphoData = {
                dataMatrix: normMat,
                metaMatrix: phosphoData.metaMatrix,
                dataHeaders: phosphoData.dataHeaders,
                metaHeaders: phosphoData.metaHeaders,
                // Store original log2 data for plotting
                origPhosphoMatrix: pMat,
                origProteomeMatrix: prMat,
                proteomeMap: prMap,
                sampleMap: sampleMap,
                phosphoMatchCol: pCol
            };

            status.textContent = 'Normalization complete. You can now view profiles or send to Main Analysis.';
            status.className = 'status success';

            // Populate profile select dropdown
            var select = document.getElementById('phosphoProfileSelect');
            select.innerHTML = '';
            // Build full option list for searching (no artificial 500 cap for search).
            // Labels include gene + residue + site (e.g. "GIMAP1-GIMAP5_S221") so
            // distinct phospho sites on the same protein are selectable separately.
            var siteRowIds = phosphoViewRowIds(normalizedPhosphoData);
            phosphoProfileOptions = [];
            for (var i = 0; i < normalizedPhosphoData.metaMatrix.length; i++) {
                phosphoProfileOptions.push({
                    idx: i,
                    label: siteRowIds[i] || normalizedPhosphoData.metaMatrix[i][pCol] || ('Row ' + i)
                });
            }
            applyPhosphoProfileFilter('');
            select.style.display = 'block';
            document.getElementById('phosphoProfileSearch').style.display = 'block';
            document.getElementById('phosphoSendBtn').style.display = 'block';

        }).catch(function (err) {
            fail(err);
        });
    }, 50);
}

// Full list of plot-selectable rows (searched + populated after normalization)
var phosphoProfileOptions = [];

function onPhosphoProfileSearch(query) {
    applyPhosphoProfileFilter(query);
    showPhosphoProfileDropdown();
    var select = document.getElementById('phosphoProfileSelect');
    if (select.options.length > 0) {
        select.selectedIndex = Math.min(0, select.options.length - 1);
    }
}

function showPhosphoProfileDropdown() {
    var select = document.getElementById('phosphoProfileSelect');
    if (select.options.length > 0 && select.options[0].value !== '') {
        select.style.display = 'block';
    }
}

function keepPhosphoProfileDropdown() {
    var select = document.getElementById('phosphoProfileSelect');
    select.style.display = 'block';
}

function hidePhosphoProfileDropdown() {
    // Small delay so selecting a row (mousedown) registers before blur hides it
    setTimeout(function() {
        var sel = document.getElementById('phosphoProfileSelect');
        var s = document.getElementById('phosphoProfileSearch');
        if (document.activeElement !== sel && document.activeElement !== s) {
            sel.style.display = 'none';
        }
    }, 150);
}

function applyPhosphoProfileFilter(query) {
    var select = document.getElementById('phosphoProfileSelect');
    // Keep current plot if user clears; store last selected value
    var cur = select.value;
    select.innerHTML = '';
    var q = (query || '').trim().toLowerCase();
    var matched = 0;
    for (var i = 0; i < phosphoProfileOptions.length; i++) {
        var o = phosphoProfileOptions[i];
        if (q && o.label.toLowerCase().indexOf(q) === -1) continue;
        var opt = document.createElement('option');
        opt.value = o.idx;
        opt.textContent = o.label;
        select.appendChild(opt);
        matched++;
    }
    // Restore prior selection if still visible
    if (cur && cur !== '' && select.querySelector('option[value="' + cur + '"]')) {
        select.value = cur;
    }
    // Cap rendering for huge lists to avoid freezes, but keep search valid
    if (matched > 500) {
        select.innerHTML = '';
        var ph = document.createElement('option');
        ph.value = '';
        ph.textContent = matched + ' matches — refine your search';
        select.appendChild(ph);
    }
}

function plotPhosphoProfile(rowIndexStr) {
    if (!rowIndexStr || !normalizedPhosphoData) {
        document.getElementById('phosphoProfilePlotContainer').style.display = 'none';
        return;
    }
    var idx = parseInt(rowIndexStr, 10);
    var pCol = normalizedPhosphoData.phosphoMatchCol;
    var rowId = String(normalizedPhosphoData.metaMatrix[idx][pCol] || "").trim();
    var matchId = rowId.split(';')[0].trim();
    // Prefer the site-aware label (gene + residue + site) over the bare protein name.
    var siteRowIds = phosphoViewRowIds(normalizedPhosphoData);
    var displayId = (siteRowIds && siteRowIds[idx]) ? siteRowIds[idx] : (rowId || ('Row ' + idx));
    var prRowIdx = normalizedPhosphoData.proteomeMap[matchId];
    
    var xVals = normalizedPhosphoData.dataHeaders;
    var pVals = normalizedPhosphoData.origPhosphoMatrix[idx];
    var nVals = normalizedPhosphoData.dataMatrix[idx];
    
    var prVals = [];
    for (var j = 0; j < xVals.length; j++) {
        var smap = normalizedPhosphoData.sampleMap[j];
        if (prRowIdx !== undefined && smap !== -1) {
            prVals.push(normalizedPhosphoData.origProteomeMatrix[prRowIdx][smap]);
        } else {
            prVals.push(null);
        }
}
    
    var traceP = {
        x: xVals, y: pVals,
        name: displayId + ' (Phosphosite, Log2)',
        type: 'scatter', mode: 'lines+markers',
        line: { color: 'blue' }
    };
    var tracePr = {
        x: xVals, y: prVals,
        name: 'Total Proteome (Log2)',
        type: 'scatter', mode: 'lines+markers',
        line: { color: 'red' }
    };
    var traceN = {
        x: xVals, y: nVals,
        name: 'Normalized (Phospho - Proteome)',
        type: 'scatter', mode: 'lines+markers',
        line: { color: 'green', dash: 'dot', width: 3 }
    };
    
    var layout = {
        title: 'Profile for ' + displayId,
        xaxis: { title: 'Samples', tickangle: -45 },
        yaxis: { title: 'Log2 Intensity / Diff' },
        margin: { b: 80, t: 30 },
        legend: { orientation: 'h', y: -0.3 }
    };
    
    document.getElementById('phosphoProfilePlotContainer').style.display = 'block';
    Plotly.newPlot('phosphoProfilePlotContainer', [traceP, tracePr, traceN], layout, {responsive: true});
}

function sendPhosphoToMain() {
    if (!normalizedPhosphoData) return;

    var rowIds = phosphoViewRowIds(normalizedPhosphoData);
    var columnHeaders = normalizedPhosphoData.dataHeaders;

    // Build the full state object structure used by Nebula (rowIds / columnHeaders
    // are the primary keys most tabs + Data QC actually read).
    var nextData = {
        rowIds: rowIds,
        columnHeaders: columnHeaders,
        dataMatrix: normalizedPhosphoData.dataMatrix,
        metaMatrix: normalizedPhosphoData.metaMatrix,
        dataHeaders: normalizedPhosphoData.dataHeaders,
        metaHeaders: normalizedPhosphoData.metaHeaders
    };
    if (window.currentData && window.currentData !== nextData) {
        window.currentData.rowIds = rowIds;
        window.currentData.columnHeaders = columnHeaders;
        window.currentData.dataMatrix = normalizedPhosphoData.dataMatrix;
        window.currentData.metaMatrix = normalizedPhosphoData.metaMatrix;
        window.currentData.dataHeaders = normalizedPhosphoData.dataHeaders;
        window.currentData.metaHeaders = normalizedPhosphoData.metaHeaders;
    } else {
        window.currentData = nextData;
    }

    // Bridge row-major matrix used by the Data QC overall dashboard.
    window.currentDataMatrix = normalizedPhosphoData.dataMatrix;

    // Expose legacy globals for downstream modules.
    window.dataMatrix = normalizedPhosphoData.dataMatrix;
    window.metaMatrix = normalizedPhosphoData.metaMatrix;
    window.dataHeaders = normalizedPhosphoData.dataHeaders;
    window.metaHeaders = normalizedPhosphoData.metaHeaders;

    // Populate the normalized matrix into the Data View (previous sub-tab).
    phosphoDataviewKind = 'normalized';
    refreshPhosphoDataView();

    if (typeof switchTab === 'function') {
        switchTab('dataQc');
    }
}

function loadPhosphoExampleData() {
    var pStatus = document.getElementById('phosphoFileStatus');
    var prStatus = document.getElementById('proteomeFileStatus');
    
    // Set format selectors
    document.getElementById('phosphoMatrixFormatSelect').value = 'mq_sites';
    onPhosphoFormatChange();
    document.getElementById('proteomeMatrixFormatSelect').value = 'mq_pg';
    onProteomeFormatChange();

    pStatus.textContent = 'Loading Phosphosite example...';
    pStatus.className = 'status';
    prStatus.textContent = 'Loading Proteome example...';
    prStatus.className = 'status';

    if (typeof ensureExampleMaxQuantSitesScriptLoaded === 'function' && typeof ensureExampleMaxQuantPgScriptLoaded === 'function') {
        ensureExampleMaxQuantSitesScriptLoaded(function() {
            if (window.exampleMaxQuantPhosphoSitesText) {
                try {
                    phosphoData = toPhosphoShape(parseFileBasedOnFormat(window.exampleMaxQuantPhosphoSitesText, 'mq_sites', true));
                    pStatus.textContent = 'Loaded ' + phosphoData.dataMatrix.length + ' rows, ' + phosphoData.dataHeaders.length + ' samples.';
                    pStatus.className = 'status success';
                } catch(e) {
                    pStatus.textContent = 'Error: ' + e.message;
                    pStatus.className = 'status error';
                }
            } else {
                pStatus.textContent = 'Example data not available.';
                pStatus.className = 'status error';
            }
            populateMatchDropdowns();
            
            // Now load proteome
            ensureExampleMaxQuantPgScriptLoaded(function() {
                if (window.exampleMaxQuantProteinGroupsText) {
                    try {
                        proteomeData = toPhosphoShape(parseFileBasedOnFormat(window.exampleMaxQuantProteinGroupsText, 'mq_pg', true));
                        prStatus.textContent = 'Loaded ' + proteomeData.dataMatrix.length + ' rows, ' + proteomeData.dataHeaders.length + ' samples.';
                        prStatus.className = 'status success';
                    } catch(e) {
                        prStatus.textContent = 'Error: ' + e.message;
                        prStatus.className = 'status error';
                    }
                } else {
                    prStatus.textContent = 'Example data not available.';
                    prStatus.className = 'status error';
                }
                populateMatchDropdowns();
                
                // Pre-select reasonable matching columns
                var pMatch = document.getElementById('phosphoMatchCol');
                var prMatch = document.getElementById('proteomeMatchCol');
                if (Array.from(pMatch.options).some(o => o.value === 'Protein names')) pMatch.value = 'Protein names';
                else if (Array.from(pMatch.options).some(o => o.value === 'Protein')) pMatch.value = 'Protein';
                
                if (Array.from(prMatch.options).some(o => o.value === 'Protein names')) prMatch.value = 'Protein names';
            });
        });
} else {
        alert("Example loader functions not found.");
    }
}

// ---- Data View (shared TableDisplay table module) ----

var phosphoDataviewKind = 'phospho'; // 'phospho' | 'proteome'
var phosphoCurrentSubTab = 'data';    // 'data' | 'normalize'

function switchPhosphoSubTab(subTab) {
    phosphoCurrentSubTab = (subTab === 'normalize') ? 'normalize' : 'data';
    var dataPanel = document.getElementById('phosphoDataPanel');
    var normPanel = document.getElementById('phosphoNormalizePanel');
    if (dataPanel) dataPanel.style.display = phosphoCurrentSubTab === 'data' ? 'block' : 'none';
    if (normPanel) normPanel.style.display = phosphoCurrentSubTab === 'normalize' ? 'block' : 'none';
    document.querySelectorAll('[data-phospho-subtab]').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-phospho-subtab') === phosphoCurrentSubTab);
    });
    if (phosphoCurrentSubTab === 'data') {
        setTimeout(refreshPhosphoDataView, 30);
    }
}

// Build human-readable row IDs for a dataset, appending amino-acid + position for
// phosphosite files where available (mirrors the gene_site convention).
function phosphoViewRowIds(data) {
    var ids = [];
    if (!data || !data.metaMatrix || !data.metaMatrix.length) return ids;
    var hdrs = data.metaHeaders || [];
    var lower = hdrs.map(function (h) { return String(h == null ? '' : h).toLowerCase(); });
    function findCol(names) {
        for (var i = 0; i < names.length; i++) {
            var ix = lower.indexOf(names[i]);
            if (ix >= 0) return hdrs[ix];
        }
        return null;
    }
    var geneCol = findCol(['gene names', 'gene.names', 'gene', 'genes', 'gene symbol']);
    var protCol = findCol(['protein names', 'protein.names', 'proteins', 'protein', 'protein ids', 'protein.group']);
    var aaCol = findCol(['amino acid', 'amino.acid', 'residue']);
    var posCol = findCol(['position', 'positions within proteins', 'position in protein', 'site']);
    var matchCol = (data.phosphoMatchCol && hdrs.indexOf(data.phosphoMatchCol) > -1) ? findCol([String(data.phosphoMatchCol).toLowerCase()]) : null;
    var seenIds = new Set();

    for (var r = 0; r < data.metaMatrix.length; r++) {
        var obj = data.metaMatrix[r] || {};
        // Residue + position suffix (e.g. "_S221"), built once and appended once.
        var siteSuffix = '';
        if (aaCol && posCol) {
            var aaTxt = String(obj[aaCol] == null ? '' : obj[aaCol]).trim();
            var posTxt = String(obj[posCol] == null ? '' : obj[posCol]).split(/[;,]/)[0].trim();
            if (aaTxt && posTxt) siteSuffix = '_' + aaTxt + posTxt;
        }
        var id = '';
        // When a phospho residue + site pair is present, prefer the gene name so
        // the ID follows the AKT1_S473 convention (keeps same-protein sites distinct).
        if (siteSuffix && geneCol) {
            var gPre = String(obj[geneCol] == null ? '' : obj[geneCol]).split(';')[0].trim();
            if (gPre) id = gPre;
        }
        if (!id && matchCol) id = String(obj[matchCol] == null ? '' : obj[matchCol]).split(';')[0].trim();
        if (!id && geneCol) id = String(obj[geneCol] == null ? '' : obj[geneCol]).split(';')[0].trim();
        if (!id && protCol) id = String(obj[protCol] == null ? '' : obj[protCol]).split(';')[0].trim();
        if (id && siteSuffix) id = id + siteSuffix;
        // Ensure uniqueness (e.g. two proteins sharing a gene can have the same site).
        if (id && seenIds.has(id)) {
            var n = 2;
            var candidate = id + '_' + n;
            while (seenIds.has(candidate)) candidate = id + '_' + (++n);
            id = candidate;
        }
        if (id) seenIds.add(id);
        ids.push(id || ('row_' + (r + 1)));
    }
    return ids;
}

function renderPhosphoDataview(data, hostId) {
    var host = document.getElementById(hostId);
    if (!host) return;
    if (!data || !data.dataMatrix || !data.dataMatrix.length) {
        host.innerHTML = '<p style="padding:14px; color:#555; font-size:12px;">No data loaded yet.</p>';
        return;
    }
    if (!window.TableDisplay || typeof window.TableDisplay.renderMatrixPreview !== 'function') {
        host.innerHTML = '<p style="padding:14px; color:#555; font-size:12px;">Table module not loaded.</p>';
        return;
    }
    var rowIds = phosphoViewRowIds(data);
    var sortedIndices = data.dataMatrix.map(function (_, i) { return i; });
    window.TableDisplay.renderMatrixPreview(host, {
        rowIds: rowIds,
        columnHeaders: data.dataHeaders,
        rows: data.dataMatrix,
        sortedIndices: sortedIndices,
        pageLength: 50,
        maxHeightPx: 400
    });
}

function showPhosphoDataview(kind) {
    phosphoDataviewKind = kind;
    var p = document.getElementById('phosphoDataviewPhospho');
    var pTab = document.getElementById('phosphoDataviewTabPhospho');
    var pr = document.getElementById('phosphoDataviewProteome');
    var prTab = document.getElementById('phosphoDataviewTabProteome');
    var n = document.getElementById('phosphoDataviewNormalized');
    var nTab = document.getElementById('phosphoDataviewTabNormalized');
    if (!p || !pr || !pTab || !prTab) return;
    if (n) n.style.display = kind === 'normalized' ? 'block' : 'none';
    if (nTab) nTab.style.display = kind === 'normalized' || normalizedPhosphoData ? 'inline-block' : 'none';
    p.style.display = kind === 'phospho' ? 'block' : 'none';
    pr.style.display = kind === 'proteome' ? 'block' : 'none';
    pTab.style.background = kind === 'phospho' ? '#007bff' : '#6c757d';
    prTab.style.background = kind === 'proteome' ? '#007bff' : '#6c757d';
    if (nTab) nTab.style.background = kind === 'normalized' ? '#28a745' : '#6c757d';
    pTab.classList.toggle('active', kind === 'phospho');
    prTab.classList.toggle('active', kind === 'proteome');
    if (nTab) nTab.classList.toggle('active', kind === 'normalized');
}

function refreshPhosphoDataView() {
    var section = document.getElementById('phosphoDataViewSection');
    if (!section) return;
    var hasData = (phosphoData && phosphoData.dataMatrix && phosphoData.dataMatrix.length) ||
        (proteomeData && proteomeData.dataMatrix && proteomeData.dataMatrix.length);
    section.style.display = hasData ? 'block' : 'none';
    renderPhosphoDataview(phosphoData, 'phosphoDataviewPhosphoHost');
    renderPhosphoDataview(proteomeData, 'phosphoDataviewProteomeHost');
    renderPhosphoDataview(normalizedPhosphoData, 'phosphoDataviewNormalizedHost');
    showPhosphoDataview(phosphoDataviewKind);
}
