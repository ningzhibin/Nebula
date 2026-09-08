/**
 * K-means exploratory clustering (Clustering → K-means sub-tab).
 *
 * Purpose: for matrices with no known sample grouping, cluster the SAMPLES
 * (columns) on their feature profiles to surface potential groups. "Advanced"
 * features: k-means++ seeding, multiple restarts, automatic k selection by
 * silhouette or elbow (with a full k-sweep shown as diagnostic plots), and a
 * 2D PCA projection colored by discovered cluster.
 *
 * Heavy numeric work runs in js/kmeans.worker.js. This module handles the DOM:
 * reading controls, preprocessing (log / z-score / sampling, mirroring PCA and
 * t-SNE), Plotly rendering, the assignments table (via TableDisplay), and CSV
 * export. Globals like `currentData` are lexical `let`s in index.html and are
 * therefore passed in through the `context` argument rather than read off window.
 */
(function (global) {
    'use strict';

    var SILHOUETTE_SAMPLE_CAP = 2000; // Silhouette is O(n^2); skip above this many samples.
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
        vizTab: 'cluster',
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
        if (typeof Worker === 'undefined' || !global._kmeansWorkerSrc) return null;
        try {
            var blob = new Blob([global._kmeansWorkerSrc], { type: 'application/javascript' });
            worker = new Worker(URL.createObjectURL(blob));
            worker.onerror = function (err) {
                console.error('K-means worker error:', err);
                progressHide();
            };
        } catch (e) {
            console.error('Failed to create k-means worker:', e);
            worker = null;
        }
        return worker;
    }

    /** Read every control that affects the clustering computation. */
    function readOptions() {
        return {
            mode: selVal('kmMode', 'auto'),
            kFixed: Math.round(numVal('kmKFixed', 3)),
            kMin: Math.round(numVal('kmKMin', 2)),
            kMax: Math.round(numVal('kmKMax', 10)),
            selMetric: selVal('kmSelMetric', 'silhouette'),
            nInit: Math.round(numVal('kmNInit', 10)),
            maxIter: Math.round(numVal('kmMaxIter', 300)),
            initMethod: selVal('kmInitMethod', 'kmeanspp'),
            seed: Math.round(numVal('kmSeed', 42)),
            applyLog: checkVal('kmApplyLog'),
            applyZScore: checkVal('kmApplyZScore'),
            applyZScoreRow: checkVal('kmApplyZScoreRow'),
            maxSamples: (function () { var v = numVal('kmMaxSamples', null); return v && v > 0 ? Math.round(v) : null; })(),
            maxFeatures: (function () { var v = numVal('kmMaxFeatures', null); return v && v > 0 ? Math.round(v) : null; })()
        };
    }

    /** Build the preprocessed samples×features matrix, mirroring PCA/t-SNE. */
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

    function computeSignature(currentData, opts) {
        return [
            currentData.columnHeaders.length, currentData.rowIds.length,
            opts.mode, opts.kFixed, opts.kMin, opts.kMax, opts.selMetric,
            opts.nInit, opts.maxIter, opts.initMethod, opts.seed,
            opts.applyLog, opts.applyZScore, opts.applyZScoreRow,
            opts.maxSamples, opts.maxFeatures
        ].join('|');
    }

    function showError(msg) {
        var host = el('kmClusterPlot');
        if (host) host.innerHTML = '<div style="padding:20px;color:#c0392b;">' + msg + '</div>';
        var ph = el('kmPlaceholder');
        if (ph) ph.style.display = 'none';
    }

    /** Public entry: run (or, if compute inputs are unchanged, just re-render). */
    function generate(context) {
        if (!context || !context.currentData) { alert('Please load data first!'); return; }
        var currentData = context.currentData;
        if (!Array.isArray(currentData.columnHeaders) || !Array.isArray(currentData.rowIds) ||
            !currentData.dataMatrix || currentData.columnHeaders.length < 3) {
            showError('K-means needs a loaded matrix with at least 3 samples (columns).');
            return;
        }
        state.context = context;
        var opts = readOptions();
        var sig = computeSignature(currentData, opts);

        // Display-only change (labels/centroids/size/title): reuse the cached result.
        if (state.result && sig === state.computeSig) {
            renderAll();
            return;
        }

        var w = ensureWorker();
        if (!w) { showError('Web Workers are not available; k-means cannot run in this browser context.'); return; }
        if (state.running) return;

        var built = buildMatrix(currentData, opts);
        if (!built.matrix.length || !built.matrix[0].length) {
            showError('No numeric data available to cluster after preprocessing.');
            return;
        }
        state.sampleLabels = built.sampleLabels;
        state.computeSig = sig;
        state.running = true;

        var n = built.matrix.length;
        var computeSilhouette = n <= SILHOUETTE_SAMPLE_CAP;

        progressShow('Running k-means…', 5);
        var ph = el('kmPlaceholder');
        if (ph) ph.style.display = 'none';

        w.onmessage = function (e) {
            var d = e.data || {};
            if (d.type === 'progress') {
                progressUpdate(d.progress, d.message || 'Clustering…');
            } else if (d.type === 'result') {
                state.running = false;
                progressHide();
                if (d.success) {
                    state.result = d.result;
                    renderAll();
                    if (context.onGenerated) context.onGenerated(true);
                } else {
                    showError('K-means error: ' + (d.error || 'unknown'));
                    if (context.onGenerated) context.onGenerated(false);
                }
            }
        };
        w.postMessage({
            type: 'run',
            X: built.matrix,
            opts: {
                mode: opts.mode, kFixed: opts.kFixed, kMin: opts.kMin, kMax: opts.kMax,
                selMetric: opts.selMetric, nInit: opts.nInit, maxIter: opts.maxIter,
                initMethod: opts.initMethod, seed: opts.seed, computeSilhouette: computeSilhouette
            }
        });
    }

    function plotSize(dfltW, dfltH) {
        var w = numVal('kmWidth', null);
        var h = numVal('kmHeight', null);
        return { width: (w && w > 0) ? w : dfltW, height: (h && h > 0) ? h : dfltH };
    }

    function renderAll() {
        renderClusterPlot();
        renderModelPlots();
        renderAssignments();
        renderSummary();
        setVizTab(state.vizTab, true);
    }

    function renderSummary() {
        var r = state.result;
        var box = el('kmSummary');
        if (!box || !r) return;
        var pieces = [];
        pieces.push('<strong>k = ' + r.k + '</strong> (' +
            (r.chosenBy === 'fixed' ? 'fixed by user' :
             r.chosenBy === 'silhouette' ? 'auto: best silhouette' : 'auto: elbow') + ')');
        pieces.push('Samples clustered: ' + (state.sampleLabels.length));
        if (r.silhouetteComputed && r.silhouetteMean != null) {
            pieces.push('Mean silhouette: ' + r.silhouetteMean.toFixed(3));
        }
        pieces.push('Cluster sizes: ' + r.sizes.map(function (s, i) { return 'C' + (i + 1) + '=' + s; }).join(', '));
        pieces.push('Iterations: ' + r.iterations);
        box.innerHTML = pieces.join(' &nbsp;•&nbsp; ');
        box.style.display = 'block';
    }

    function renderClusterPlot() {
        var Plotly = P();
        var r = state.result;
        var host = el('kmClusterPlot');
        if (!Plotly || !r || !host) return;
        var coords = r.coords2d;
        var labels = r.labels;
        var showLabels = checkVal('kmShowLabels');
        var showCentroids = checkVal('kmShowCentroids');
        var size = plotSize(null, 720);

        var traces = [];
        for (var c = 0; c < r.k; c++) {
            var xs = [], ys = [], txt = [];
            for (var i = 0; i < labels.length; i++) {
                if (labels[i] !== c) continue;
                xs.push(coords[i][0]); ys.push(coords[i][1]); txt.push(state.sampleLabels[i]);
            }
            traces.push({
                x: xs, y: ys,
                text: txt,
                mode: showLabels ? 'markers+text' : 'markers',
                type: 'scattergl',
                name: 'Cluster ' + (c + 1) + ' (n=' + r.sizes[c] + ')',
                textposition: 'top center',
                textfont: { size: 9, color: '#444' },
                marker: { size: 10, color: clusterColor(c), line: { width: 1, color: '#fff' }, opacity: 0.9 },
                hovertemplate: '%{text}<br>PC1 %{x:.3f}<br>PC2 %{y:.3f}<extra>Cluster ' + (c + 1) + '</extra>'
            });
        }
        if (showCentroids && r.centers2d) {
            traces.push({
                x: r.centers2d.map(function (p) { return p[0]; }),
                y: r.centers2d.map(function (p) { return p[1]; }),
                text: r.centers2d.map(function (_, i) { return 'Centroid ' + (i + 1); }),
                mode: 'markers',
                type: 'scattergl',
                name: 'Centroids',
                marker: { size: 16, color: '#111', symbol: 'x', line: { width: 1, color: '#fff' } },
                hovertemplate: '%{text}<extra></extra>'
            });
        }
        var ev = r.explained2d || [0, 0];
        var titleInput = (el('kmTitle') && el('kmTitle').value.trim()) || '';
        var layout = {
            title: titleInput || ('K-means clustering (k=' + r.k + ') — PCA projection'),
            xaxis: { title: 'PC1 (' + (ev[0] * 100).toFixed(1) + '%)', zeroline: false },
            yaxis: { title: 'PC2 (' + (ev[1] * 100).toFixed(1) + '%)', zeroline: false },
            hovermode: 'closest',
            legend: { orientation: 'v' },
            margin: { l: 70, r: 30, t: 60, b: 60 }
        };
        if (size.width) layout.width = size.width;
        if (size.height) layout.height = size.height;
        Plotly.react(host, traces, layout, { responsive: true, displaylogo: false });
    }

    function renderModelPlots() {
        var Plotly = P();
        var r = state.result;
        if (!Plotly || !r) return;
        var ks = r.sweep.map(function (s) { return s.k; });
        var inertias = r.sweep.map(function (s) { return s.inertia; });

        var elbowHost = el('kmElbowPlot');
        if (elbowHost) {
            var elbowTraces = [{
                x: ks, y: inertias, mode: 'lines+markers', type: 'scatter',
                line: { color: '#377eb8' }, marker: { size: 8, color: '#377eb8' },
                name: 'WCSS (inertia)', hovertemplate: 'k=%{x}<br>WCSS %{y:.2f}<extra></extra>'
            }];
            var elbowLayout = {
                title: 'Elbow — within-cluster sum of squares vs k',
                xaxis: { title: 'k (number of clusters)', dtick: 1 },
                yaxis: { title: 'WCSS (inertia)' },
                margin: { l: 70, r: 20, t: 50, b: 50 },
                shapes: [chosenKLine(r.k, inertias)],
                annotations: [chosenKAnnotation(r.k, 'chosen k=' + r.k)]
            };
            Plotly.react(elbowHost, elbowTraces, elbowLayout, { responsive: true, displaylogo: false });
        }

        var silHost = el('kmSilhouettePlot');
        if (silHost) {
            if (r.silhouetteComputed) {
                var sils = r.sweep.map(function (s) { return s.silhouetteMean; });
                var silTraces = [{
                    x: ks, y: sils, mode: 'lines+markers', type: 'scatter',
                    line: { color: '#4daf4a' }, marker: { size: 8, color: '#4daf4a' },
                    name: 'Mean silhouette', hovertemplate: 'k=%{x}<br>silhouette %{y:.3f}<extra></extra>'
                }];
                var silLayout = {
                    title: 'Silhouette — mean score vs k (higher = better separation)',
                    xaxis: { title: 'k (number of clusters)', dtick: 1 },
                    yaxis: { title: 'Mean silhouette', range: [Math.min(0, Math.min.apply(null, sils)) - 0.05, 1] },
                    margin: { l: 70, r: 20, t: 50, b: 50 },
                    shapes: [chosenKLine(r.k, sils)],
                    annotations: [chosenKAnnotation(r.k, 'chosen k=' + r.k)]
                };
                Plotly.react(silHost, silTraces, silLayout, { responsive: true, displaylogo: false });
            } else {
                silHost.innerHTML = '<div style="padding:24px;color:#666;font-size:var(--fs-md);">Silhouette analysis is skipped when there are more than ' +
                    SILHOUETTE_SAMPLE_CAP + ' samples (it grows with the square of the sample count). ' +
                    'k was chosen by the elbow method; reduce Max samples to enable silhouette.</div>';
            }
        }
    }

    function chosenKLine(k, yvals) {
        var lo = Math.min.apply(null, yvals);
        var hi = Math.max.apply(null, yvals);
        return { type: 'line', x0: k, x1: k, y0: lo, y1: hi, line: { color: '#e41a1c', width: 1.5, dash: 'dash' } };
    }
    function chosenKAnnotation(k, text) {
        return { x: k, y: 1, yref: 'paper', text: text, showarrow: false, font: { color: '#e41a1c', size: 11 }, yanchor: 'bottom' };
    }

    function renderAssignments() {
        var r = state.result;
        var ctx = state.context;
        var host = el('kmAssignHost');
        if (!host || !r) return;
        var hasSil = r.silhouetteComputed && Array.isArray(r.silhouette);
        var rows = [];
        for (var i = 0; i < state.sampleLabels.length; i++) {
            var row = {
                sample: state.sampleLabels[i],
                cluster: 'Cluster ' + (r.labels[i] + 1),
                pc1: Number(r.coords2d[i][0]),
                pc2: Number(r.coords2d[i][1])
            };
            if (hasSil) row.silhouette = Number(r.silhouette[i]);
            rows.push(row);
        }
        var columns = [
            { key: 'sample', title: 'Sample', className: 'dt-type-string' },
            { key: 'cluster', title: 'Cluster', className: 'dt-type-string' }
        ];
        if (hasSil) columns.push({ key: 'silhouette', title: 'Silhouette', className: 'dt-type-numeric' });
        columns.push({ key: 'pc1', title: 'PC1', className: 'dt-type-numeric' });
        columns.push({ key: 'pc2', title: 'PC2', className: 'dt-type-numeric' });

        if (ctx && ctx.TableDisplay && typeof ctx.TableDisplay.renderGenericTable === 'function') {
            ctx.TableDisplay.renderGenericTable(host, {
                data: rows,
                columns: columns,
                tableClassName: 'kmeans-assign-table',
                rootClassName: 'qc-kmeans-assign-root',
                numericBars: false,
                pageLength: 100,
                escapeHtml: (typeof global.escapeHtml === 'function') ? global.escapeHtml : undefined,
                language: { search: 'Search samples:', searchPlaceholder: 'Type to filter…' }
            }).catch(function (e) { console.error('K-means assignments table:', e); });
        }
    }

    function downloadCsv() {
        var r = state.result;
        if (!r) { alert('Run k-means first.'); return; }
        var hasSil = r.silhouetteComputed && Array.isArray(r.silhouette);
        var header = ['Sample', 'Cluster'];
        if (hasSil) header.push('Silhouette');
        header.push('PC1', 'PC2');
        var lines = [header.join(',')];
        function esc(v) {
            var s = String(v == null ? '' : v);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }
        for (var i = 0; i < state.sampleLabels.length; i++) {
            var cells = [esc(state.sampleLabels[i]), 'Cluster ' + (r.labels[i] + 1)];
            if (hasSil) cells.push(r.silhouette[i].toFixed(4));
            cells.push(r.coords2d[i][0].toFixed(6), r.coords2d[i][1].toFixed(6));
            lines.push(cells.join(','));
        }
        var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'kmeans_cluster_assignments_k' + r.k + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function setVizTab(which, keep) {
        var allowed = { cluster: 1, model: 1, assignments: 1 };
        state.vizTab = allowed[which] ? which : 'cluster';
        document.querySelectorAll('#kmeansTab [data-km-viz-tab]').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-km-viz-tab') === state.vizTab);
        });
        [['cluster', 'kmVizPanelCluster'], ['model', 'kmVizPanelModel'], ['assignments', 'kmVizPanelAssign']].forEach(function (pair) {
            var panel = el(pair[1]);
            if (panel) panel.classList.toggle('active', pair[0] === state.vizTab);
        });
        if (!keep) resize();
        else setTimeout(resize, 60);
    }

    function resize() {
        var Plotly = P();
        if (!Plotly) return;
        var ids = state.vizTab === 'cluster' ? ['kmClusterPlot']
            : state.vizTab === 'model' ? ['kmElbowPlot', 'kmSilhouettePlot'] : [];
        ids.forEach(function (id) {
            var host = el(id);
            if (host && host.data) { try { Plotly.Plots.resize(host); } catch (_) { /* ignore */ } }
        });
    }

    global.KMeansAnalysis = {
        generate: generate,
        switchVizTab: function (w) { setVizTab(w); },
        downloadCsv: downloadCsv,
        resize: resize,
        isGenerated: function () { return !!state.result; }
    };
}(typeof window !== 'undefined' ? window : this));
