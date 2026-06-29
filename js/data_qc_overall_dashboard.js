/**
 * Data QC → Overall: matrix-wide dashboard (D3 v7).
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

    async function getD3() {
        if (global.__d3ForPca && global.__d3ForPca.scaleBand) return global.__d3ForPca;
        const mod = await import('https://cdn.jsdelivr.net/npm/d3@7/+esm');
        global.__d3ForPca = mod;
        return mod;
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

    function clear(el) {
        if (!el) return;
        el.innerHTML = '';
    }

    function drawBoxPlots(d3, host, cols, caption) {
        clear(host);
        const n = cols.length;
        if (!n) return;
        const w = Math.max(360, resolveOverallChartOuterWidthPx(host));
        const h = overallDashHeightForSamples(n, { perRow: 18, base: 100, minH: 280, maxH: 2200 });
        const idx = cols.map((_, i) => i);
        const tickLabs = cols.map((d) => overallDashShortAxisLabel(d.label, 44));
        const maxChars = d3.max(tickLabs, (t) => t.length) || 6;
        const margin = { t: 14, r: 20, b: 56, l: Math.min(400, Math.round(34 + maxChars * 6.4)) };
        const innerW = w - margin.l - margin.r;
        const innerH = h - margin.t - margin.b;
        const svg = d3.select(host).append('svg').attr('width', w).attr('height', h);
        const g = svg.append('g').attr('transform', `translate(${margin.l},${margin.t})`);
        const y = d3.scaleBand().domain(idx).range([0, innerH]).padding(0.22);
        const finite = cols.flatMap((d) => [d.minLog, d.maxLog, d.q1, d.q3, d.medLog]).filter((v) => Number.isFinite(v));
        const lo = d3.min(finite) ?? 0;
        const hi = d3.max(finite) ?? 1;
        const x = d3.scaleLinear().domain([lo - (hi - lo) * 0.08, hi + (hi - lo) * 0.1]).nice().range([0, innerW]);
        const tickFs = n > 48 ? '8px' : n > 28 ? '9px' : '10px';
        const gy = g.append('g').call(d3.axisLeft(y).tickFormat((i) => tickLabs[i]).tickSizeOuter(0));
        gy.selectAll('text').attr('font-size', tickFs);
        gy.selectAll('.domain').attr('stroke', '#d1d5db');
        gy.selectAll('.tick line').attr('stroke', '#e5e7eb');
        const gx = g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(Math.min(8, Math.max(4, Math.floor(innerW / 95)))));
        gx.selectAll('.domain').attr('stroke', '#d1d5db');
        gx.selectAll('.tick line').attr('stroke', '#e5e7eb');
        cols.forEach((d, i) => {
            if (!Number.isFinite(d.q1) || !Number.isFinite(d.q3)) return;
            const yi = y(i);
            const bw = y.bandwidth();
            const cy = yi + bw / 2;
            const xMin = x(d.minLog);
            const xQ1 = x(d.q1);
            const xQ3 = x(d.q3);
            const xMax = x(d.maxLog);
            g.append('line').attr('x1', xMin).attr('x2', xQ1).attr('y1', cy).attr('y2', cy).attr('stroke', '#94a3b8').attr('stroke-width', 1);
            g.append('line').attr('x1', xQ3).attr('x2', xMax).attr('y1', cy).attr('y2', cy).attr('stroke', '#94a3b8').attr('stroke-width', 1);
            const rx = Math.min(xQ1, xQ3);
            const rw = Math.max(1, Math.abs(xQ3 - xQ1));
            const fullLab = String(d.label == null ? '' : d.label);
            const rct = g.append('rect').attr('x', rx).attr('y', yi + bw * 0.12).attr('width', rw).attr('height', Math.max(1, bw * 0.76)).attr('fill', '#c4b5a0').attr('stroke', '#78716c').attr('rx', 2);
            rct.append('title').text(fullLab + ' — log10(1+I), I>0');
            if (Number.isFinite(d.medLog)) {
                const xm = x(d.medLog);
                g.append('line').attr('x1', xm).attr('x2', xm).attr('y1', yi + bw * 0.1).attr('y2', yi + bw * 0.9).attr('stroke', '#1f2937').attr('stroke-width', 1.5);
            }
        });
        g.append('text').attr('x', innerW / 2).attr('y', innerH + 40).attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', '#4b5563').text('log10(1 + I), I > 0');
        if (caption) {
            svg.append('text').attr('x', margin.l).attr('y', h - 6).attr('font-size', '10px').attr('fill', '#6b7280').text(caption);
        }
    }

    function drawTotalLogBar(d3, host, cols, caption) {
        clear(host);
        const n = cols.length;
        if (!n) return;
        const w = Math.max(360, resolveOverallChartOuterWidthPx(host));
        const h = overallDashHeightForSamples(n, { perRow: 20, base: 88, minH: 260, maxH: 2200 });
        const idx = cols.map((_, i) => i);
        const tickLabs = cols.map((d) => overallDashShortAxisLabel(d.label, 44));
        const maxChars = d3.max(tickLabs, (t) => t.length) || 6;
        const margin = { t: 14, r: 20, b: 52, l: Math.min(400, Math.round(34 + maxChars * 6.4)) };
        const innerW = w - margin.l - margin.r;
        const innerH = h - margin.t - margin.b;
        const svg = d3.select(host).append('svg').attr('width', w).attr('height', h);
        const g = svg.append('g').attr('transform', `translate(${margin.l},${margin.t})`);
        const y = d3.scaleBand().domain(idx).range([0, innerH]).padding(0.2);
        const maxV = d3.max(cols, (d) => d.totalLog) || 1;
        const x = d3.scaleLinear().domain([0, maxV * 1.05]).nice().range([0, innerW]);
        const tickFs = n > 48 ? '8px' : n > 28 ? '9px' : '10px';
        const gy = g.append('g').call(d3.axisLeft(y).tickFormat((i) => tickLabs[i]).tickSizeOuter(0));
        gy.selectAll('text').attr('font-size', tickFs);
        gy.selectAll('.domain').attr('stroke', '#d1d5db');
        gy.selectAll('.tick line').attr('stroke', '#e5e7eb');
        const gx = g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(5));
        gx.selectAll('.domain').attr('stroke', '#d1d5db');
        gx.selectAll('.tick line').attr('stroke', '#e5e7eb');
        g.selectAll('rect.tlbar').data(cols).join('rect').attr('class', 'tlbar')
            .attr('x', 0)
            .attr('y', (_, i) => y(i))
            .attr('width', (d) => Math.max(1, x(d.totalLog)))
            .attr('height', y.bandwidth())
            .attr('fill', '#8b9dc4')
            .attr('rx', 2)
            .each(function (d) {
                const t = `${d.label}: Σ log10(1+I) over quantified IDs = ${Number.isFinite(d.totalLog) ? d.totalLog.toFixed(2) : '—'}`;
                d3.select(this).append('title').text(t);
            });
        g.append('text').attr('x', innerW / 2).attr('y', innerH + 36).attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', '#4b5563').text('Σ log10(1+I)');
        if (caption) {
            svg.append('text').attr('x', margin.l).attr('y', h - 6).attr('font-size', '10px').attr('fill', '#6b7280').text(caption);
        }
    }

    /**
     * Horizontal bar chart: per-column summary metric (same data as former Plotly card).
     * @param {import('d3')} d3
     * @param {HTMLElement} host
     * @param {{ summVals: number[], yLabsUnique: string[], fullLabs: string[], sumYTitle: string, n: number, sumWhat: string }} p
     */
    function drawPerColumnSummaryBars(d3, host, p) {
        if (typeof global.Plotly !== 'undefined') {
            try {
                global.Plotly.purge(host);
            } catch (_) {
                /* ignore */
            }
        }
        host.style.height = '';
        host.style.minHeight = '';
        clear(host);
        const summVals = p.summVals;
        const yLabsUnique = p.yLabsUnique;
        const fullLabs = p.fullLabs;
        const sumYTitle = p.sumYTitle || '';
        const sumWhat = p.sumWhat || '';
        const n = summVals.length;
        if (!n || !Array.isArray(yLabsUnique) || yLabsUnique.length !== n || !Array.isArray(fullLabs) || fullLabs.length !== n) return;

        const tickLabs = yLabsUnique.map((lab) => overallDashShortAxisLabel(lab, 44));
        const maxChars = d3.max(tickLabs, (t) => t.length) || 6;
        const rowPx = maxChars > 140 ? 28 : maxChars > 80 ? 24 : 22;
        const h = overallDashHeightForSamples(n, { perRow: rowPx, base: 96, minH: 260, maxH: 2200 });
        const w = Math.max(360, resolveOverallChartOuterWidthPx(host));
        const marginL = Math.min(720, Math.round(40 + maxChars * 5.6));
        const margin = { t: 14, r: 24, b: 56, l: marginL };
        const innerW = w - margin.l - margin.r;
        const innerH = h - margin.t - margin.b;
        const svg = d3.select(host).append('svg').attr('width', w).attr('height', h);
        const g = svg.append('g').attr('transform', `translate(${margin.l},${margin.t})`);
        const idx = summVals.map((_, i) => i);
        const y = d3.scaleBand().domain(idx).range([0, innerH]).padding(0.2);
        const finiteX = summVals.filter((v) => Number.isFinite(v));
        const maxVraw = d3.max(finiteX);
        const maxV = Number.isFinite(maxVraw) ? maxVraw : 1;
        const minVraw = d3.min(finiteX);
        const minV = Number.isFinite(minVraw) ? minVraw : 0;
        let x0 = 0;
        let x1 = maxV * 1.05;
        if (!(x1 > 0) || !Number.isFinite(x1)) x1 = 1;
        if (sumWhat !== 'count_nz' && sumWhat !== 'detection' && Number.isFinite(minV) && minV < 0) {
            x0 = minV - (maxV - minV) * 0.08;
        }
        const x = d3.scaleLinear().domain([x0, x1]).nice().range([0, innerW]);
        const tickFs = n > 48 ? '8px' : n > 28 ? '9px' : '10px';
        const gy = g.append('g').call(d3.axisLeft(y).tickFormat((i) => tickLabs[i]).tickSizeOuter(0));
        gy.selectAll('text').attr('font-size', tickFs);
        gy.selectAll('.domain').attr('stroke', '#d1d5db');
        gy.selectAll('.tick line').attr('stroke', '#e5e7eb');
        const xFmt = sumWhat === 'count_nz' ? d3.format(',.0f') : d3.format('.4g');
        const gx = g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(Math.min(8, Math.max(4, Math.floor(innerW / 95)))).tickFormat(xFmt));
        gx.selectAll('.domain').attr('stroke', '#d1d5db');
        gx.selectAll('.tick line').attr('stroke', '#e5e7eb');
        g.selectAll('rect.pcsbar')
            .data(idx)
            .join('rect')
            .attr('class', 'pcsbar')
            .attr('x', (i) => Math.min(x(0), x(summVals[i])))
            .attr('y', (i) => y(i))
            .attr('width', (i) => {
                const v = summVals[i];
                if (!Number.isFinite(v)) return 0;
                return Math.max(1, Math.abs(x(v) - x(0)));
            })
            .attr('height', y.bandwidth())
            .attr('fill', '#2e7d32')
            .attr('rx', 2)
            .each(function (i) {
                const v = summVals[i];
                const full = String(fullLabs[i] == null ? '' : fullLabs[i]);
                const t = `${full}\n${sumYTitle}: ${Number.isFinite(v) ? (sumWhat === 'count_nz' ? String(Math.round(v)) : v.toPrecision(6)) : '—'}`;
                d3.select(this).append('title').text(t);
            });
        g.append('text').attr('x', innerW / 2).attr('y', innerH + 40).attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', '#4b5563').text(sumYTitle);
        const foot = `Per-column summary (${p.n} column(s)). ${sumYTitle}.`;
        svg.append('text').attr('x', margin.l).attr('y', h - 6).attr('font-size', '10px').attr('fill', '#6b7280').text(foot);
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
            <span class="dq-overall-pill"><strong>${meta.nCols.toLocaleString()}</strong> samples (columns)</span>
            <span class="dq-overall-pill">Per-column bars: <strong>Data QC → Overall</strong> sidebar</span>`;
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
        if (empty) empty.style.display = 'none';
        if (charts) charts.style.display = 'flex';
        const d3 = await getD3();
        const stats = computeColumnStats(matrix, headers);
        updateSummaryStrip(stats);
        const elBox = document.getElementById('dataQcOverallChartBox');
        const elTot = document.getElementById('dataQcOverallChartTotalLog');
        const elSum = document.getElementById('dataQcOverallSummaryPlot');
        if (elBox) drawBoxPlots(d3, elBox, stats.cols, stats.boxNote + ' Whiskers: min/max of subsampled log values; box: Q1–Q3; line: median.');
        if (elTot) drawTotalLogBar(d3, elTot, stats.cols, 'Total summed log10(1+I) over all quantified features — relative spectral load per sample.');
        if (elSum && typeof global.getDataQcOverallPerColumnSummaryPayload === 'function') {
            const sp = global.getDataQcOverallPerColumnSummaryPayload();
            if (sp && Array.isArray(sp.summVals) && sp.summVals.length) drawPerColumnSummaryBars(d3, elSum, sp);
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
