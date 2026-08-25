/**
 * Data QC → Overall: matrix-wide dashboard (Plotly).
 * Per-column summary bars use payload from `window.getDataQcOverallPerColumnSummaryPayload` (index.html).
 * Expects window.currentDataMatrix (row-major) and window.currentData.columnHeaders.
 */
(function (global) {
    'use strict';

    const BOX_SAMPLE_CAP = 5000;

    /**
     * Pixel height for Overall charts: grows with sample count so horizontal layouts stay readable.
     * @param {number} nSamples
     * @param {{ perRow?: number, base?: number, minH?: number, maxH?: number }} [opts]
     */
    function overallDashHeightForSamples(nSamples, opts) {
        opts = opts || {};
        const per = opts.perRow != null ? opts.perRow : 20;
        const base = opts.base != null ? opts.base : 88;
        const minH = opts.minH != null ? opts.minH : 260;
        const maxH = opts.maxH != null ? opts.maxH : 2200;
        const n = Math.max(1, nSamples | 0);
        return Math.round(Math.min(maxH, Math.max(minH, base + n * per)));
    }

    function overallDashShortAxisLabel(label, maxLen) {
        const s = String(label == null ? '' : label);
        if (s.length <= maxLen) return s;
        return s.slice(0, Math.max(3, maxLen - 2)) + '…';
    }

    const OVERALL_PLOT_WIDTH_ATTR = 'data-nebula-overall-plot-width';

    /**
     * Usable outer width for Overall D3 charts when the host has no layout box (e.g. panel hidden while building Report).
     * Persists width on the three chart hosts so a later hidden refresh matches the last on-screen size.
     * @param {HTMLElement|null} host
     * @returns {number}
     */
    function resolveOverallChartOuterWidthPx(host) {
        const ids = ['dataQcOverallSummaryPlot', 'dataQcOverallChartTotalLog', 'dataQcOverallChartBox'];
        function readPeerStored() {
            for (let i = 0; i < ids.length; i++) {
                const el = document.getElementById(ids[i]);
                if (!el) continue;
                const a = el.getAttribute(OVERALL_PLOT_WIDTH_ATTR);
                if (a) {
                    const n = parseInt(a, 10);
                    if (Number.isFinite(n) && n >= 200) return n;
                }
            }
            return null;
        }
        function storeAll(wpx) {
            const r = Math.round(wpx);
            if (!Number.isFinite(r) || r < 200) return;
            for (let j = 0; j < ids.length; j++) {
                const el = document.getElementById(ids[j]);
                if (el) el.setAttribute(OVERALL_PLOT_WIDTH_ATTR, String(r));
            }
        }
        try {
            if (host) {
                const cw = host.clientWidth;
                if (Number.isFinite(cw) && cw >= 200) {
                    storeAll(cw);
                    return cw;
                }
            }
            const col = document.getElementById('dataQcOverallChartsCol');
            if (col) {
                const cw2 = col.clientWidth;
                if (Number.isFinite(cw2) && cw2 >= 200) {
                    storeAll(cw2);
                    return cw2;
                }
            }
            const main = document.querySelector('.data-qc-overall-main');
            if (main) {
                const cw3 = main.clientWidth;
                if (Number.isFinite(cw3) && cw3 >= 200) {
                    storeAll(cw3);
                    return cw3;
                }
            }
            const ws = document.querySelector('.data-qc-overall-workspace');
            if (ws) {
                const cww = ws.clientWidth;
                if (Number.isFinite(cww) && cww >= 200) {
                    const side = document.querySelector('.data-qc-overall-sidebar');
                    const sw = side && side.offsetWidth ? side.offsetWidth + 32 : 312;
                    const w4 = Math.max(360, cww - sw);
                    if (w4 >= 200) {
                        storeAll(w4);
                        return w4;
                    }
                }
            }
            const peer = readPeerStored();
            if (peer != null) return peer;
            const vw = typeof global.innerWidth === 'number' ? global.innerWidth : 1200;
            const w5 = Math.max(480, Math.min(1600, Math.round(vw - 320)));
            storeAll(w5);
            return w5;
        } catch (_) {
            const fallback = readPeerStored();
            return fallback != null ? fallback : 720;
        }
    }

    function quantileSorted(sorted, q) {
        if (!sorted.length) return NaN;
        const pos = (sorted.length - 1) * q;
        const lo = Math.floor(pos);
        const hi = Math.ceil(pos);
        if (lo === hi) return sorted[lo];
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    }

    function sampleRowStep(nRows) {
        if (nRows <= BOX_SAMPLE_CAP) return 1;
        return Math.ceil(nRows / BOX_SAMPLE_CAP);
    }

    /**
     * Per column: box stats from subsampled log10(1+I) for I>0; totalLog exact sum.
     */
    function computeColumnStats(matrix, headers) {
        const nRows = matrix ? matrix.length : 0;
        const nCols = headers ? headers.length : 0;
        const step = sampleRowStep(nRows);
        const out = [];
        let totalQuantifiedCells = 0;
        const matrixCells = nRows * nCols;
        for (let j = 0; j < nCols; j++) {
            const logs = [];
            let nQuant = 0;
            let totalLog = 0;
            for (let i = 0; i < nRows; i++) {
                const row = Array.isArray(matrix[i]) ? matrix[i] : [];
                const v = Number(row[j]);
                if (!Number.isFinite(v) || v <= 0) continue;
                nQuant++;
                const lv = Math.log10(1 + v);
                totalLog += lv;
                if (i % step === 0) logs.push(lv);
            }
            totalQuantifiedCells += nQuant;
            logs.sort((a, b) => a - b);
            const medLog = logs.length ? quantileSorted(logs, 0.5) : NaN;
            const q1 = logs.length ? quantileSorted(logs, 0.25) : NaN;
            const q3 = logs.length ? quantileSorted(logs, 0.75) : NaN;
            const lo = logs.length ? logs[0] : NaN;
            const hi = logs.length ? logs[logs.length - 1] : NaN;
            out.push({
                label: String(headers[j] == null ? '' : headers[j]),
                nQuant,
                medLog,
                q1,
                q3,
                minLog: lo,
                maxLog: hi,
                totalLog,
                /** Subsampled sorted log10(1+I) values (I>0); same subsampling as box stats. */
                logs: logs
            });
        }
        return {
            nRows,
            nCols,
            cols: out,
            boxNote: nRows > BOX_SAMPLE_CAP ? `Box/IQR uses up to ${BOX_SAMPLE_CAP} stratified rows per sample.` : 'Box/IQR from all quantified values per sample.',
            totalQuantifiedCells,
            matrixCells
        };
    }

    var OVERALL_PLOTLY_CONFIG = { displaylogo: false, scrollZoom: true };

    /** Reset a chart host and purge any previous Plotly graph so newPlot starts clean. */
    function purgeHost(host) {
        if (!host) return;
        host.style.height = '';
        host.style.minHeight = '';
        if (typeof global.Plotly !== 'undefined') {
            try {
                global.Plotly.purge(host);
            } catch (_) {
                /* ignore */
            }
        }
        host.innerHTML = '';
    }

    /** Horizontal box plots per column (log10(1+I), I>0) as Plotly traces with precomputed quartiles. */
    function drawBoxPlots(host, cols, caption) {
        purgeHost(host);
        const n = cols.length;
        if (!n) return;
        const w = Math.max(360, resolveOverallChartOuterWidthPx(host));
        const h = overallDashHeightForSamples(n, { perRow: 18, base: 100, minH: 280, maxH: 2200 });
        const tickLabs = cols.map((d) => overallDashShortAxisLabel(d.label, 44));
        const maxChars = tickLabs.reduce((m, t) => Math.max(m, t.length), 0) || 6;
        const marginL = Math.min(400, Math.round(34 + maxChars * 6.8));
        const traces = [];
        cols.forEach((d, i) => {
            if (!Number.isFinite(d.q1) || !Number.isFinite(d.q3)) return;
            traces.push({
                type: 'box',
                orientation: 'h',
                y: [tickLabs[i]],
                q1: [d.q1],
                median: [Number.isFinite(d.medLog) ? d.medLog : null],
                q3: [d.q3],
                lowerfence: [Number.isFinite(d.minLog) ? d.minLog : null],
                upperfence: [Number.isFinite(d.maxLog) ? d.maxLog : null],
                customdata: [String(d.label == null ? '' : d.label)],
                hovertemplate: '%{customdata}<br>log10(1+I), I>0<extra></extra>',
                boxpoints: false,
                fillcolor: '#c4b5a0',
                line: { color: '#78716c', width: 1 },
                marker: { color: '#1f2937' },
                whiskerwidth: 0.5,
                name: ''
            });
        });
        if (!traces.length) return;
        const finite = [];
        cols.forEach((d) => {
            [d.minLog, d.maxLog, d.q1, d.q3, d.medLog].forEach((v) => {
                if (Number.isFinite(v)) finite.push(v);
            });
        });
        const lo = finite.length ? Math.min.apply(null, finite) : 0;
        const hi = finite.length ? Math.max.apply(null, finite) : 1;
        const layout = {
            width: w,
            height: h,
            autosize: false,
            margin: { t: 14, r: 20, b: 56, l: marginL },
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#ffffff',
            font: { family: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif', size: 11, color: '#1f2937' },
            showlegend: false,
            xaxis: {
                title: { text: 'log10(1 + I), I > 0', font: { size: 11, color: '#4b5563' } },
                range: [lo - (hi - lo) * 0.08, hi + (hi - lo) * 0.1],
                gridcolor: '#e5e7eb',
                zerolinecolor: '#d1d5db',
                automargin: true
            },
            yaxis: { automargin: true, tickfont: { size: n > 48 ? 10 : n > 28 ? 11 : 12 } },
            annotations: caption
                ? [{ xref: 'paper', yref: 'paper', x: 0, y: -0.09, xanchor: 'left', showarrow: false, text: caption, font: { size: 10, color: '#6b7280' } }]
                : []
        };
        global.Plotly.newPlot(host, traces, layout, Object.assign({}, OVERALL_PLOTLY_CONFIG));
    }

    function drawTotalLogBar(host, cols, caption) {
        purgeHost(host);
        const n = cols.length;
        if (!n) return;
        const w = Math.max(360, resolveOverallChartOuterWidthPx(host));
        const h = overallDashHeightForSamples(n, { perRow: 20, base: 88, minH: 260, maxH: 2200 });
        const tickLabs = cols.map((d) => overallDashShortAxisLabel(d.label, 44));
        const maxChars = tickLabs.reduce((m, t) => Math.max(m, t.length), 0) || 6;
        const marginL = Math.min(400, Math.round(34 + maxChars * 6.8));
        const maxV = cols.reduce((m, d) => Math.max(m, Number.isFinite(d.totalLog) ? d.totalLog : 0), 0) || 1;
        const trace = {
            type: 'bar',
            orientation: 'h',
            y: tickLabs,
            x: cols.map((d) => (Number.isFinite(d.totalLog) ? d.totalLog : 0)),
            customdata: cols.map((d) => String(d.label == null ? '' : d.label)),
            width: 0.45,
            hovertemplate: '%{customdata}: Σ log10(1+I) over quantified IDs = %{x:.2f}<extra></extra>',
            marker: { color: '#8b9dc4' }
        };
        const layout = {
            width: w,
            height: h,
            autosize: false,
            margin: { t: 14, r: 20, b: 52, l: marginL },
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#ffffff',
            font: { family: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif', size: 11, color: '#1f2937' },
            showlegend: false,
            xaxis: {
                title: { text: 'Σ log10(1+I)', font: { size: 11, color: '#4b5563' } },
                range: [0, maxV * 1.05],
                gridcolor: '#e5e7eb',
                zerolinecolor: '#d1d5db',
                automargin: true
            },
            yaxis: { automargin: true, tickfont: { size: n > 48 ? 10 : n > 28 ? 11 : 12 } },
            annotations: caption
                ? [{ xref: 'paper', yref: 'paper', x: 0, y: -0.09, xanchor: 'left', showarrow: false, text: caption, font: { size: 10, color: '#6b7280' } }]
                : []
        };
        global.Plotly.newPlot(host, [trace], layout, Object.assign({}, OVERALL_PLOTLY_CONFIG));
    }

    /**
     * Horizontal bar chart: per-column summary metric.
     * @param {HTMLElement} host
     * @param {{ summVals: number[], yLabsUnique: string[], fullLabs: string[], sumYTitle: string, n: number, sumWhat: string }} p
     */
    function drawPerColumnSummaryBars(host, p) {
        purgeHost(host);
        const summVals = p.summVals;
        const yLabsUnique = p.yLabsUnique;
        const fullLabs = p.fullLabs;
        const sumYTitle = p.sumYTitle || '';
        const sumWhat = p.sumWhat || '';
        const n = summVals.length;
        if (!n || !Array.isArray(yLabsUnique) || yLabsUnique.length !== n || !Array.isArray(fullLabs) || fullLabs.length !== n) return;

        const tickLabs = yLabsUnique.map((lab) => overallDashShortAxisLabel(lab, 44));
        const maxChars = tickLabs.reduce((m, t) => Math.max(m, t.length), 0) || 6;
        const rowPx = maxChars > 140 ? 28 : maxChars > 80 ? 24 : 22;
        const h = overallDashHeightForSamples(n, { perRow: rowPx, base: 96, minH: 260, maxH: 2200 });
        const w = Math.max(360, resolveOverallChartOuterWidthPx(host));
        const marginL = Math.min(720, Math.round(40 + maxChars * 6.8));
        const finiteX = summVals.filter((v) => Number.isFinite(v));
        const maxV = finiteX.length ? Math.max.apply(null, finiteX) : 1;
        const minV = finiteX.length ? Math.min.apply(null, finiteX) : 0;
        let x0 = 0;
        let x1 = maxV * 1.05;
        if (!(x1 > 0) || !Number.isFinite(x1)) x1 = 1;
        if (sumWhat !== 'count_nz' && sumWhat !== 'detection' && Number.isFinite(minV) && minV < 0) {
            x0 = minV - (maxV - minV) * 0.08;
        }
        const countMode = sumWhat === 'count_nz';
        const trace = {
            type: 'bar',
            orientation: 'h',
            y: tickLabs,
            x: summVals,
            customdata: fullLabs,
            width: 0.45,
            hovertemplate: countMode
                ? '%{customdata}<br>' + sumYTitle + ': %{x:,}<extra></extra>'
                : '%{customdata}<br>' + sumYTitle + ': %{x:.4g}<extra></extra>',
            marker: { color: '#2e7d32' }
        };
        const foot = `Per-column summary (${p.n} column(s)). ${sumYTitle}.`;
        const layout = {
            width: w,
            height: h,
            autosize: false,
            margin: { t: 14, r: 24, b: 56, l: marginL },
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#ffffff',
            font: { family: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif', size: 11, color: '#1f2937' },
            showlegend: false,
            xaxis: {
                title: { text: sumYTitle, font: { size: 11, color: '#4b5563' } },
                range: [x0, x1],
                tickformat: countMode ? ',.0f' : '',
                nticks: Math.max(4, Math.min(8, Math.floor((w - marginL - 24) / 95))),
                gridcolor: '#e5e7eb',
                zerolinecolor: '#d1d5db',
                automargin: true
            },
            yaxis: { automargin: true, autorange: 'reversed', tickfont: { size: n > 48 ? 10 : n > 28 ? 11 : 12 } },
            annotations: [
                { xref: 'paper', yref: 'paper', x: 0, y: -0.09, xanchor: 'left', showarrow: false, text: foot, font: { size: 10, color: '#6b7280' } }
            ]
        };
        global.Plotly.newPlot(host, [trace], layout, Object.assign({}, OVERALL_PLOTLY_CONFIG));
    }

    /**
     * Same markup as `#dataQcOverallSummaryStrip` when the Overall dashboard has stats (for Report export when DOM not yet refreshed).
     * @param {{ nRows: number, nCols: number } | null} meta
     */
    function summaryStripHtmlFromStats(meta) {
        if (!meta) {
            return '<span class="nebula-report-muted">Load a matrix to see summary statistics.</span>';
        }
        return `<span class="dq-overall-pill"><strong>${meta.nRows.toLocaleString()}</strong> features (rows)</span>
            <span class="dq-overall-pill"><strong>${meta.nCols.toLocaleString()}</strong> samples (columns)</span>`;
    }

    function updateSummaryStrip(meta) {
        const el = document.getElementById('dataQcOverallSummaryStrip');
        if (!el) return;
        if (!meta) {
            el.textContent = 'Load a matrix to see summary statistics.';
            return;
        }
        el.innerHTML = summaryStripHtmlFromStats(meta);
    }

    function clearOverallSummaryHost() {
        const el = document.getElementById('dataQcOverallSummaryPlot');
        if (!el) return;
        if (typeof global.Plotly !== 'undefined') {
            try {
                global.Plotly.purge(el);
            } catch (_) {
                /* ignore */
            }
        }
        el.style.height = '';
        el.style.minHeight = '';
        el.innerHTML = '';
    }

    async function refresh() {
        const matrix = global.currentDataMatrix;
        const data = global.currentData;
        const headers = data && Array.isArray(data.columnHeaders) ? data.columnHeaders : null;
        const wrap = document.getElementById('dataQcOverallDashboardRoot');
        if (!wrap) return;
        const empty = document.getElementById('dataQcOverallEmpty');
        const charts = document.getElementById('dataQcOverallChartsCol');
        if (!matrix || !headers || !headers.length || !matrix.length) {
            ['dataQcOverallChartBox', 'dataQcOverallChartTotalLog'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '';
            });
            clearOverallSummaryHost();
            if (empty) empty.style.display = 'block';
            if (charts) charts.style.display = 'none';
            updateSummaryStrip(null);
            return;
        }
        if (typeof global.Plotly === 'undefined') {
            console.warn('Data QC → Overall: Plotly not loaded — skipping chart refresh.');
            return;
        }
        if (empty) empty.style.display = 'none';
        if (charts) charts.style.display = 'flex';
        const stats = computeColumnStats(matrix, headers);
        updateSummaryStrip(stats);
        const elBox = document.getElementById('dataQcOverallChartBox');
        const elTot = document.getElementById('dataQcOverallChartTotalLog');
        const elSum = document.getElementById('dataQcOverallSummaryPlot');
        if (elBox) drawBoxPlots(elBox, stats.cols, stats.boxNote + ' Whiskers: min/max of subsampled log values; box: Q1–Q3; line: median.');
        if (elTot) drawTotalLogBar(elTot, stats.cols, 'Total summed log10(1+I) over all quantified features — relative spectral load per sample.');
        if (elSum && typeof global.getDataQcOverallPerColumnSummaryPayload === 'function') {
            const sp = global.getDataQcOverallPerColumnSummaryPayload();
            if (sp && Array.isArray(sp.summVals) && sp.summVals.length) drawPerColumnSummaryBars(elSum, sp);
            else clearOverallSummaryHost();
        } else if (elSum) {
            clearOverallSummaryHost();
        }
    }

    let resizeTimer = null;
    function onResize() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            try {
                const p = document.getElementById('dataQcOverallPanel');
                if (!p || p.style.display === 'none') return;
                refresh();
            } catch (_) {}
        }, 200);
    }

    global.DataQcOverallDashboard = {
        refresh,
        onResize,
        computeColumnStats,
        overallDashHeightForSamples,
        overallDashShortAxisLabel
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('resize', onResize);
    }
})(typeof window !== 'undefined' ? window : this);
