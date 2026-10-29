/**
 * Self-organizing map (SOM) clustering (Clustering → SOM sub-tab).
 *
 * Purpose: an unsupervised, topology-preserving alternative to K-means for
 * matrices with no known sample grouping. Samples (columns) are projected onto
 * a 2D lattice of units trained on their feature profiles; neighbouring units
 * hold similar samples, so the map itself shows the shape of the data. The
 * trained units are then grouped into a small number of meta-clusters so the
 * samples get a compact cluster label, exactly like the K-means sub-tab.
 *
 * Heavy numeric work runs in js/som.worker.js. This module handles the DOM:
 * reading controls, preprocessing (log / z-score / sampling, mirroring PCA,
 * t-SNE and K-means), Plotly rendering (sample map, U-matrix, hit counts),
 * the assignments table (via TableDisplay), and CSV export. Globals like
 * `currentData` are lexical `let`s in index.html and are therefore passed in
 * through the `context` argument rather than read off window.
 */
(function (global) {
    'use strict';

    var PALETTE = [
        '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628',
        '#f781bf', '#00b3b3', '#999999', '#66c2a5', '#fc8d62', '#8da0cb',
        '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b15928', '#1f78b4'
    ];

    var worker = null;
    var state = {
        result: null,
        context: null,
        sampleLabels: [],
        computeSig: '',
        vizTab: 'map',
        running: false
    };

    function clusterColor(idx) { return PALETTE[idx % PALETTE.length]; }

    function P() { return global.Plotly; }

    function progressShow(msg, pct) { if (typeof global.showProgress === 'function') global.showProgress(msg, pct); }
    function progressUpdate(pct, msg) { if (typeof global.updateProgress === 'function') global.updateProgress(pct, msg); }
    function progressHide() { if (typeof global.hideProgress === 'function') global.hideProgress(); }

    function el(id) { return document.getElementById(id); }
    function numVal(id, dflt) {
        var e = el(id);
        if (!e || e.value == null || String(e.value).trim() === '') return dflt;
        var v = parseFloat(e.value);
        return Number.isFinite(v) ? v : dflt;
    }
    function checkVal(id) { var e = el(id); return !!(e && e.checked); }
    function selVal(id, dflt) { var e = el(id); return e && e.value ? e.value : dflt; }

    function ensureWorker() {
        if (worker) return worker;
        if (typeof Worker === 'undefined' || !global._somWorkerSrc) return null;
        try {
            var blob = new Blob([global._somWorkerSrc], { type: 'application/javascript' });
            worker = new Worker(URL.createObjectURL(blob));
            worker.onerror = function (err) {
                console.error('SOM worker error:', err);
                progressHide();
            };
        } catch (e) {
            console.error('Failed to create SOM worker:', e);
            worker = null;
        }
        return worker;
    }

    /** Default lattice side from the sample count (Kohonen's ~5*sqrt(n) units). */
    function autoSide(numSamples) {
        var units = 5 * Math.sqrt(Math.max(3, numSamples));
        var side = Math.round(Math.sqrt(units));
        return Math.max(3, Math.min(12, side));
    }

    /** Read every control that affects the map computation. */
    function readOptions(numSamples) {
        var side = autoSide(numSamples);
        var gx = numVal('somGridX', null);
        var gy = numVal('somGridY', null);
        return {
            gridCols: (gx && gx > 0) ? Math.round(gx) : side,
            gridRows: (gy && gy > 0) ? Math.round(gy) : side,
            topology: selVal('somTopology', 'hex'),
            neighborhood: selVal('somNeighborhood', 'gaussian'),
            initMethod: selVal('somInit', 'pca'),
            alpha: numVal('somAlpha', 0.5),
            sigma: numVal('somSigma', null),
            epochs: Math.round(numVal('somEpochs', 40)),
            seed: Math.round(numVal('somSeed', 42)),
            unitClusterMode: selVal('somMetaMode', 'auto'),
            unitK: Math.round(numVal('somMetaK', 4)),
            applyLog: checkVal('somApplyLog'),
            applyZScore: checkVal('somApplyZScore'),
            applyZScoreRow: checkVal('somApplyZScoreRow'),
            maxSamples: (function () { var v = numVal('somMaxSamples', null); return v && v > 0 ? Math.round(v) : null; })(),
            maxFeatures: (function () { var v = numVal('somMaxFeatures', null); return v && v > 0 ? Math.round(v) : null; })()
        };
    }

    /** Build the preprocessed samples×features matrix, mirroring PCA/t-SNE/K-means. */
    function buildMatrix(currentData, opts) {
        var numSamples = currentData.columnHeaders.length;
        var numFeatures = currentData.rowIds.length;

        var sampleIndices = [];
        if (opts.maxSamples && numSamples > opts.maxSamples) {
            var stepS = numSamples / opts.maxSamples;
            for (var i = 0; i < opts.maxSamples; i++) sampleIndices.push(Math.floor(i * stepS));
        } else {
            for (var s = 0; s < numSamples; s++) sampleIndices.push(s);
        }

        var featureIndices = [];
        if (opts.maxFeatures && numFeatures > opts.maxFeatures) {
            var stepF = numFeatures / opts.maxFeatures;
            for (var f = 0; f < opts.maxFeatures; f++) featureIndices.push(Math.floor(f * stepF));
        } else {
            for (var g = 0; g < numFeatures; g++) featureIndices.push(g);
        }

        var mat = [];
        for (var si = 0; si < sampleIndices.length; si++) {
            var col = sampleIndices[si];
            var row = [];
            for (var fi = 0; fi < featureIndices.length; fi++) {
                var val = currentData.dataMatrix[featureIndices[fi]][col];
                row.push(Number.isFinite(val) ? val : 0);
            }
            mat.push(row);
        }

        if (opts.applyLog) {
            mat = mat.map(function (r) { return r.map(function (v) { return Math.log10(v + 1); }); });
        }
        if (opts.applyZScore) {
            var nCols = mat[0] ? mat[0].length : 0;
            for (var j = 0; j < nCols; j++) {
                var sum = 0;
                for (var a = 0; a < mat.length; a++) sum += mat[a][j];
                var mean = sum / mat.length;
                var sq = 0;
                for (var b = 0; b < mat.length; b++) { var d = mat[b][j] - mean; sq += d * d; }
                var std = Math.sqrt(sq / mat.length) || 1e-8;
                for (var c = 0; c < mat.length; c++) mat[c][j] = (mat[c][j] - mean) / std;
            }
        }
        if (opts.applyZScoreRow) {
            mat = mat.map(function (r) {
                var mean = r.reduce(function (x, y) { return x + y; }, 0) / r.length;
                var std = Math.sqrt(r.reduce(function (sm, v) { return sm + (v - mean) * (v - mean); }, 0) / r.length);
                return r.map(function (v) { return std > 0 ? (v - mean) / std : 0; });
            });
        }

        var labels = sampleIndices.map(function (idx) { return String(currentData.columnHeaders[idx]); });
        return { matrix: mat, sampleLabels: labels, sampleIndices: sampleIndices, featureIndices: featureIndices };
    }

    /**
     * Identity of the data actually being mapped: matrix shape, the first column
     * name, and a strided checksum. Without the checksum a freshly loaded matrix
     * of exactly the same shape would reuse the previous map.
     */
    function dataSignature(currentData) {
        var m = currentData.dataMatrix;
        var sum = 0, seen = 0;
        var rows = m.length;
        var stepR = Math.max(1, Math.floor(rows / 17));
        for (var r = 0; r < rows; r += stepR) {
            var row = m[r];
            if (!row) continue;
            var stepC = Math.max(1, Math.floor(row.length / 17));
            for (var c = 0; c < row.length; c += stepC) {
                var v = row[c];
                if (Number.isFinite(v)) { sum += v * (seen % 7 + 1); seen++; }
            }
        }
        return [currentData.columnHeaders.length, currentData.rowIds.length,
            String(currentData.columnHeaders[0] || ''), seen, Math.round(sum * 1000) / 1000].join('~');
    }

    function computeSignature(currentData, opts) {
        return [
            dataSignature(currentData),
            opts.gridCols, opts.gridRows, opts.topology, opts.neighborhood,
            opts.initMethod, opts.alpha, opts.sigma, opts.epochs, opts.seed,
            opts.unitClusterMode, opts.unitK,
            opts.applyLog, opts.applyZScore, opts.applyZScoreRow,
            opts.maxSamples, opts.maxFeatures
        ].join('|');
    }

    function showError(msg) {
        var host = el('somMapPlot');
        if (host) host.innerHTML = '<div style="padding:20px;color:#c0392b;">' + msg + '</div>';
        var ph = el('somPlaceholder');
        if (ph) ph.style.display = 'none';
    }

    /** Public entry: run (or, if only display options changed, just re-render). */
    function generate(context) {
        if (!context || !context.currentData) { alert('Please load data first!'); return; }
        var currentData = context.currentData;
        if (!Array.isArray(currentData.columnHeaders) || !Array.isArray(currentData.rowIds) ||
            !currentData.dataMatrix || currentData.columnHeaders.length < 3) {
            showError('SOM needs a loaded matrix with at least 3 samples (columns).');
            return;
        }
        state.context = context;
        var opts = readOptions(currentData.columnHeaders.length);
        var sig = computeSignature(currentData, opts);

        // Display-only change (labels/lattice/size/title): reuse the cached result.
        if (state.result && sig === state.computeSig) {
            renderAll();
            return;
        }

        var w = ensureWorker();
        if (!w) { showError('Web Workers are not available; the SOM cannot run in this browser context.'); return; }
        if (state.running) return;

        var built = buildMatrix(currentData, opts);
        if (!built.matrix.length || !built.matrix[0].length) {
            showError('No numeric data available to map after preprocessing.');
            return;
        }
        state.sampleLabels = built.sampleLabels;
        state.computeSig = sig;
        state.running = true;

        progressShow('Training the self-organizing map…', 4);
        var ph = el('somPlaceholder');
        if (ph) ph.style.display = 'none';

        w.onmessage = function (e) {
            var d = e.data || {};
            if (d.type === 'progress') {
                progressUpdate(d.progress, d.message || 'Training…');
            } else if (d.type === 'result') {
                state.running = false;
                progressHide();
                if (d.success) {
                    state.result = d.result;
                    renderAll();
                    if (context.onGenerated) context.onGenerated(true);
                } else {
                    showError('SOM error: ' + (d.error || 'unknown'));
                    if (context.onGenerated) context.onGenerated(false);
                }
            }
        };
        w.postMessage({
            type: 'run',
            X: built.matrix,
            opts: {
                gridCols: opts.gridCols, gridRows: opts.gridRows,
                topology: opts.topology, neighborhood: opts.neighborhood,
                initMethod: opts.initMethod, alpha: opts.alpha, sigma: opts.sigma,
                epochs: opts.epochs, seed: opts.seed,
                unitClusterMode: opts.unitClusterMode, unitK: opts.unitK
            }
        });
    }

    function plotSize(dfltW, dfltH) {
        var w = numVal('somWidth', null);
        var h = numVal('somHeight', null);
        return { width: (w && w > 0) ? w : dfltW, height: (h && h > 0) ? h : dfltH };
    }

    function renderAll() {
        renderSummary();
        renderMap();
        renderUMatrix();
        renderHits();
        renderAssignments();
        setVizTab(state.vizTab, true);
    }

    function renderSummary() {
        var r = state.result;
        var box = el('somSummary');
        if (!box || !r) return;
        var pieces = [];
        pieces.push('<strong>' + r.gridRows + ' × ' + r.gridCols + ' ' + r.topology + ' map</strong> (' + r.units + ' units)');
        pieces.push('Samples mapped: ' + state.sampleLabels.length + ' × ' + r.featureCount + ' features');
        pieces.push('Quantization error: ' + r.quantizationError.toFixed(3));
        pieces.push('Topographic error: ' + r.topographicError.toFixed(3));
        if (r.clusterK > 1) {
            pieces.push('Clusters: k = ' + r.clusterK + ' (' +
                (r.clusterChosenBy === 'fixed' ? 'fixed by user' : 'auto: best silhouette') +
                (r.clusterSilhouette != null ? ', silhouette ' + r.clusterSilhouette.toFixed(3) : '') + ')');
            pieces.push('Cluster sizes: ' + r.clusterSizes.map(function (s, i) { return 'C' + (i + 1) + '=' + s; }).join(', '));
        } else {
            pieces.push('Clusters: single map (too few units to group)');
        }
        box.innerHTML = pieces.join(' &nbsp;•&nbsp; ');
        box.style.display = 'block';
    }

    /** Sample map: the lattice (dot size ∝ hits) with samples coloured by cluster. */
    function renderMap() {
        var Plotly = P();
        var r = state.result;
        var host = el('somMapPlot');
        if (!Plotly || !r || !host) return;
        var showLabels = checkVal('somShowLabels');
        var showLattice = checkVal('somShowLattice');
        var size = plotSize(null, 720);
        var traces = [];

        if (showLattice) {
            var hitValues = [];
            var unitText = [];
            for (var u = 0; u < r.units; u++) {
                var hr = Math.floor(u / r.gridCols), hc = u % r.gridCols;
                var h = r.hits[hr][hc];
                hitValues.push(h);
                unitText.push('Unit (' + (hr + 1) + ', ' + (hc + 1) + ') — ' + h + ' sample' + (h === 1 ? '' : 's'));
            }
            traces.push({
                x: r.unitX, y: r.unitY,
                text: unitText,
                mode: 'markers',
                type: 'scatter',
                name: 'Map units',
                marker: {
                    size: hitValues.map(function (h) { return Math.min(34, 7 + h * 5); }),
                    color: hitValues,
                    colorscale: [[0, '#e9edf3'], [1, '#9aa7b8']],
                    showscale: false,
                    line: { width: 1, color: '#c9d1da' },
                    opacity: 0.95
                },
                hovertemplate: '%{text}<extra></extra>'
            });
        }

        var clusters = Math.max(1, r.clusterK);
        var byCluster = [];
        for (var c = 0; c < clusters; c++) byCluster.push([]);
        for (var i = 0; i < r.sampleCluster.length; i++) {
            byCluster[Math.min(r.sampleCluster[i], clusters - 1)].push(i);
        }
        for (var c = 0; c < clusters; c++) {
            var idxs = byCluster[c];
            if (!idxs.length) continue;
            traces.push({
                x: idxs.map(function (k) { return r.sampleX[k]; }),
                y: idxs.map(function (k) { return r.sampleY[k]; }),
                text: idxs.map(function (k) { return state.sampleLabels[k]; }),
                customdata: idxs.map(function (k) { return [r.sampleRow[k], r.sampleCol[k], r.sampleDist[k]]; }),
                mode: showLabels ? 'markers+text' : 'markers',
                type: 'scattergl',
                name: (clusters > 1 ? 'Cluster ' + (c + 1) : 'Samples') + ' (n=' + idxs.length + ')',
                textposition: 'top center',
                textfont: { size: 9, color: '#444' },
                marker: { size: 10, color: clusterColor(c), line: { width: 1, color: '#fff' }, opacity: 0.92 },
                hovertemplate: '%{text}<br>unit (%{customdata[0]}, %{customdata[1]})<br>distance %{customdata[2]:.3f}<extra>Cluster ' + (c + 1) + '</extra>'
            });
        }

        // Lattice geometry: keep the hex row spacing square on screen.
        var rowGap = r.topology === 'hex' ? 0.8660254037844386 : 1;
        var yRange = [-r.gridRows * rowGap - 0.4, 0.6];
        var yTicks = [], yText = [];
        for (var rr = 0; rr < r.gridRows; rr++) {
            yTicks.push(-rr * rowGap);
            yText.push(String(rr + 1));
        }
        var xTicks = [], xText = [];
        for (var cc = 0; cc < r.gridCols; cc++) {
            xTicks.push(cc);
            xText.push(String(cc + 1));
        }

        var titleInput = (el('somTitle') && el('somTitle').value.trim()) || '';
        var layout = {
            title: titleInput || ('Self-organizing map (' + r.gridRows + ' × ' + r.gridCols + ' ' + r.topology +
                ', k=' + r.clusterK + ')'),
            xaxis: {
                title: 'Map column',
                zeroline: false,
                range: [-0.9, r.gridCols + 0.4],
                tickvals: xTicks,
                ticktext: xText
            },
            yaxis: {
                title: 'Map row',
                zeroline: false,
                range: yRange,
                tickvals: yTicks,
                ticktext: yText,
                scaleanchor: 'x',
                constrain: 'domain'
            },
            hovermode: 'closest',
            legend: { orientation: 'v' },
            margin: { l: 70, r: 30, t: 60, b: 60 }
        };
        if (size.width) layout.width = size.width;
        if (size.height) layout.height = size.height;
        Plotly.react(host, traces, layout, { responsive: true, displaylogo: false });
    }

    function unitAxisLabels(r) {
        var cols = [], rows = [];
        for (var c = 0; c < r.gridCols; c++) cols.push(String(c + 1));
        for (var rr = 0; rr < r.gridRows; rr++) rows.push(String(rr + 1));
        return { cols: cols, rows: rows };
    }

    function renderUMatrix() {
        var Plotly = P();
        var r = state.result;
        var host = el('somUMatrixPlot');
        if (!Plotly || !r || !host) return;
        var labels = unitAxisLabels(r);
        var texts = r.uMatrix.map(function (row) {
            return row.map(function (v) { return v.toFixed(2); });
        });
        var withText = r.units <= 100;
        var trace = {
            z: r.uMatrix,
            x: labels.cols,
            y: labels.rows,
            type: 'heatmap',
            colorscale: 'Viridis',
            colorbar: { title: 'dist.', thickness: 12 },
            hovertemplate: 'unit (%{y}, %{x})<br>mean neighbour distance %{z:.3f}<extra></extra>'
        };
        if (withText) {
            trace.text = texts;
            trace.texttemplate = '%{text}';
            trace.textfont = { size: 9 };
        }
        Plotly.react(host, [trace], {
            title: 'U-matrix — mean distance between neighbouring units',
            xaxis: { title: 'Map column', type: 'category', ticks: '' },
            yaxis: { title: 'Map row', type: 'category', autorange: 'reversed', ticks: '' },
            margin: { l: 60, r: 20, t: 50, b: 50 }
        }, { responsive: true, displaylogo: false });
    }

    function renderHits() {
        var Plotly = P();
        var r = state.result;
        var host = el('somHitPlot');
        if (!Plotly || !r || !host) return;
        var labels = unitAxisLabels(r);
        var trace = {
            z: r.hits,
            x: labels.cols,
            y: labels.rows,
            type: 'heatmap',
            // Plotly 2.27's built-in "Blues" runs dark -> light; reverse it so a
            // busier unit is the darker cell (0 = empty, max = densest).
            colorscale: 'Blues',
            reversescale: true,
            colorbar: { title: 'n', thickness: 12 },
            hovertemplate: 'unit (%{y}, %{x})<br>%{z} samples<extra></extra>'
        };
        if (r.units <= 100) {
            trace.text = r.hits.map(function (row) { return row.map(function (v) { return String(v); }); });
            trace.texttemplate = '%{text}';
            trace.textfont = { size: 9 };
        }
        Plotly.react(host, [trace], {
            title: 'Sample density — samples per unit',
            xaxis: { title: 'Map column', type: 'category', ticks: '' },
            yaxis: { title: 'Map row', type: 'category', autorange: 'reversed', ticks: '' },
            margin: { l: 60, r: 20, t: 50, b: 50 }
        }, { responsive: true, displaylogo: false });
    }

    function renderAssignments() {
        var r = state.result;
        var ctx = state.context;
        var host = el('somAssignHost');
        if (!host || !r) return;
        var rows = [];
        for (var i = 0; i < state.sampleLabels.length; i++) {
            rows.push({
                sample: state.sampleLabels[i],
                cluster: r.clusterK > 1 ? 'Cluster ' + (r.sampleCluster[i] + 1) : 'Map',
                unit: r.sampleRow[i] + ', ' + r.sampleCol[i],
                dist: Number(r.sampleDist[i])
            });
        }
        var columns = [
            { key: 'sample', title: 'Sample', className: 'dt-type-string' },
            { key: 'cluster', title: 'Cluster', className: 'dt-type-string' },
            { key: 'unit', title: 'Map unit (row, col)', className: 'dt-type-string' },
            { key: 'dist', title: 'Distance to unit', className: 'dt-type-numeric' }
        ];
        if (ctx && ctx.TableDisplay && typeof ctx.TableDisplay.renderGenericTable === 'function') {
            ctx.TableDisplay.renderGenericTable(host, {
                data: rows,
                columns: columns,
                tableClassName: 'som-assign-table',
                rootClassName: 'qc-som-assign-root',
                numericBars: false,
                pageLength: 100,
                escapeHtml: (typeof global.escapeHtml === 'function') ? global.escapeHtml : undefined,
                language: { search: 'Search samples:', searchPlaceholder: 'Type to filter…' }
            }).catch(function (e) { console.error('SOM assignments table:', e); });
        }
    }

    function downloadCsv() {
        var r = state.result;
        if (!r) { alert('Run the SOM first.'); return; }
        var header = ['Sample', 'Cluster', 'Map unit row', 'Map unit col', 'Distance to unit'];
        var lines = [header.join(',')];
        function esc(v) {
            var s = String(v == null ? '' : v);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }
        for (var i = 0; i < state.sampleLabels.length; i++) {
            lines.push([
                esc(state.sampleLabels[i]),
                esc(r.clusterK > 1 ? 'Cluster ' + (r.sampleCluster[i] + 1) : 'Map'),
                r.sampleRow[i], r.sampleCol[i], r.sampleDist[i].toFixed(6)
            ].join(','));
        }
        var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'som_cluster_assignments_' + r.gridRows + 'x' + r.gridCols + '_k' + r.clusterK + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function setVizTab(which, keep) {
        var allowed = { map: 1, umatrix: 1, assignments: 1 };
        state.vizTab = allowed[which] ? which : 'map';
        document.querySelectorAll('#somTab [data-som-viz-tab]').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-som-viz-tab') === state.vizTab);
        });
        [['map', 'somVizPanelMap'], ['umatrix', 'somVizPanelUMatrix'], ['assignments', 'somVizPanelAssign']].forEach(function (pair) {
            var panel = el(pair[1]);
            if (panel) panel.classList.toggle('active', pair[0] === state.vizTab);
        });
        if (!keep) resize();
        else setTimeout(resize, 60);
    }

    function resize() {
        var Plotly = P();
        if (!Plotly) return;
        var ids = state.vizTab === 'map' ? ['somMapPlot']
            : state.vizTab === 'umatrix' ? ['somUMatrixPlot', 'somHitPlot'] : [];
        ids.forEach(function (id) {
            var host = el(id);
            if (host && host.data) { try { Plotly.Plots.resize(host); } catch (_) { /* ignore */ } }
        });
    }

    global.SomAnalysis = {
        generate: generate,
        switchVizTab: function (w) { setVizTab(w); },
        downloadCsv: downloadCsv,
        resize: resize,
        isGenerated: function () { return !!state.result; }
    };
}(typeof window !== 'undefined' ? window : this));
