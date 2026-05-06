/**
 * Data QC → Overall: matrix-wide dashboard (D3 v7) + Plotly summary from index.html.
 * Expects window.currentDataMatrix (row-major) and window.currentData.columnHeaders.
 */
(function (global) {
    'use strict';

    const BOX_SAMPLE_CAP = 5000;
    const AXIS_PAD = { t: 14, r: 12, b: 88, l: 52 };

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
        for (let j = 0; j < nCols; j++) {
            const logs = [];
            for (let i = 0; i < nRows; i++) {
                const row = Array.isArray(matrix[i]) ? matrix[i] : [];
                const v = Number(row[j]);
                if (!Number.isFinite(v) || v <= 0) continue;
                const lv = Math.log10(1 + v);
                if (i % step === 0) logs.push(lv);
            }
            logs.sort((a, b) => a - b);
            const medLog = logs.length ? quantileSorted(logs, 0.5) : NaN;
            const q1 = logs.length ? quantileSorted(logs, 0.25) : NaN;
            const q3 = logs.length ? quantileSorted(logs, 0.75) : NaN;
            const lo = logs.length ? logs[0] : NaN;
            const hi = logs.length ? logs[logs.length - 1] : NaN;
            let totalLog = 0;
            for (let i = 0; i < nRows; i++) {
                const row = Array.isArray(matrix[i]) ? matrix[i] : [];
                const v = Number(row[j]);
                if (Number.isFinite(v) && v > 0) totalLog += Math.log10(1 + v);
            }
            out.push({
                label: String(headers[j] == null ? '' : headers[j]),
                medLog,
                q1,
                q3,
                minLog: lo,
                maxLog: hi,
                totalLog
            });
        }
        return { nRows, nCols, cols: out, boxNote: nRows > BOX_SAMPLE_CAP ? `Box/IQR uses up to ${BOX_SAMPLE_CAP} stratified rows per sample.` : 'Box/IQR from all quantified values per sample.' };
    }

    function clear(el) {
        if (!el) return;
        el.innerHTML = '';
    }

    function drawBoxPlots(d3, host, cols, caption) {
        clear(host);
        const w = Math.max(320, host.clientWidth || 400);
        const h = 300;
        const margin = { ...AXIS_PAD, b: Math.min(160, 56 + Math.min(cols.length, 24) * 3) };
        const innerW = w - margin.l - margin.r;
        const innerH = h - margin.t - margin.b;
        const svg = d3.select(host).append('svg').attr('width', w).attr('height', h);
        const g = svg.append('g').attr('transform', `translate(${margin.l},${margin.t})`);
        const x = d3.scaleBand().domain(cols.map((d) => d.label)).range([0, innerW]).padding(0.25);
        const finite = cols.flatMap((d) => [d.minLog, d.maxLog, d.q1, d.q3, d.medLog]).filter((v) => Number.isFinite(v));
        const lo = d3.min(finite) ?? 0;
        const hi = d3.max(finite) ?? 1;
        const y = d3.scaleLinear().domain([lo - (hi - lo) * 0.08, hi + (hi - lo) * 0.1]).nice().range([innerH, 0]);
        g.append('g').call(d3.axisLeft(y).ticks(6)).selectAll('line').attr('stroke', '#e5e7eb');
        g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x)).selectAll('text')
            .attr('transform', 'rotate(-38)')
            .style('text-anchor', 'end')
            .attr('dx', '-0.35em')
            .attr('dy', '0.45em')
            .attr('font-size', '9px');
        const bw = x.bandwidth();
        const cx = (d) => x(d.label) + bw / 2;
        cols.forEach((d) => {
            if (!Number.isFinite(d.q1) || !Number.isFinite(d.q3)) return;
            const x0 = x(d.label);
            g.append('line').attr('x1', cx(d)).attr('x2', cx(d)).attr('y1', y(d.minLog)).attr('y2', y(d.q1)).attr('stroke', '#94a3b8').attr('stroke-width', 1);
            g.append('line').attr('x1', cx(d)).attr('x2', cx(d)).attr('y1', y(d.q3)).attr('y2', y(d.maxLog)).attr('stroke', '#94a3b8').attr('stroke-width', 1);
            g.append('rect').attr('x', x0 + bw * 0.12).attr('y', y(d.q3)).attr('width', bw * 0.76).attr('height', Math.max(1, y(d.q1) - y(d.q3))).attr('fill', '#c4b5a0').attr('stroke', '#78716c').attr('rx', 2);
            if (Number.isFinite(d.medLog)) {
                g.append('line').attr('x1', x0 + bw * 0.08).attr('x2', x0 + bw * 0.92).attr('y1', y(d.medLog)).attr('y2', y(d.medLog)).attr('stroke', '#1f2937').attr('stroke-width', 1.5);
            }
        });
        g.append('text').attr('x', -40).attr('y', innerH / 2).attr('transform', `rotate(-90 -40,${innerH / 2})`).attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', '#4b5563').text('log10(1 + I), I > 0');
        if (caption) {
            svg.append('text').attr('x', margin.l).attr('y', h - 6).attr('font-size', '10px').attr('fill', '#6b7280').text(caption);
        }
    }

    function drawTotalLogBar(d3, host, cols, caption) {
        clear(host);
        const w = Math.max(320, host.clientWidth || 400);
        const h = Math.max(220, Math.min(360, 120 + cols.length * 8));
        const margin = { ...AXIS_PAD, b: Math.min(160, 56 + Math.min(cols.length, 24) * 3) };
        const innerW = w - margin.l - margin.r;
        const innerH = h - margin.t - margin.b;
        const svg = d3.select(host).append('svg').attr('width', w).attr('height', h);
        const g = svg.append('g').attr('transform', `translate(${margin.l},${margin.t})`);
        const x = d3.scaleBand().domain(cols.map((d) => d.label)).range([0, innerW]).padding(0.18);
        const maxV = d3.max(cols, (d) => d.totalLog) || 1;
        const y = d3.scaleLinear().domain([0, maxV * 1.05]).nice().range([innerH, 0]);
        g.append('g').call(d3.axisLeft(y).ticks(5)).selectAll('line').attr('stroke', '#e5e7eb');
        g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x)).selectAll('text')
            .attr('transform', 'rotate(-38)')
            .style('text-anchor', 'end')
            .attr('dx', '-0.35em')
            .attr('dy', '0.45em')
            .attr('font-size', '9px');
        g.selectAll('rect').data(cols).join('rect')
            .attr('x', (d) => x(d.label))
            .attr('y', (d) => y(d.totalLog))
            .attr('width', x.bandwidth())
            .attr('height', (d) => innerH - y(d.totalLog))
            .attr('fill', '#8b9dc4')
            .attr('rx', 2)
            .attr('title', (d) => `${d.label}: Σ log10(1+I) over quantified IDs = ${d.totalLog.toFixed(2)}`);
        g.append('text').attr('x', -36).attr('y', innerH / 2).attr('transform', `rotate(-90 -36,${innerH / 2})`).attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', '#4b5563').text('Σ log10(1+I)');
        if (caption) {
            svg.append('text').attr('x', margin.l).attr('y', h - 6).attr('font-size', '10px').attr('fill', '#6b7280').text(caption);
        }
    }

    function updateSummaryStrip(meta) {
        const el = document.getElementById('dataQcOverallSummaryStrip');
        if (!el) return;
        if (!meta) {
            el.textContent = 'Load a matrix to see summary statistics.';
            return;
        }
        el.innerHTML = `<span class="dq-overall-pill"><strong>${meta.nRows.toLocaleString()}</strong> features (rows)</span>
            <span class="dq-overall-pill"><strong>${meta.nCols.toLocaleString()}</strong> samples (columns)</span>
            <span class="dq-overall-pill">Per-column bars: <strong>Data QC → Overall</strong> sidebar</span>`;
    }

    function purgeOverallSummaryPlotly() {
        const el = document.getElementById('dataQcOverallSummaryPlot');
        if (!el || typeof global.Plotly === 'undefined') return;
        try {
            global.Plotly.purge(el);
        } catch (_) { /* ignore */ }
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
            purgeOverallSummaryPlotly();
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
        if (elBox) drawBoxPlots(d3, elBox, stats.cols, stats.boxNote + ' Whiskers: min/max of subsampled log values; box: Q1–Q3; line: median.');
        if (elTot) drawTotalLogBar(d3, elTot, stats.cols, 'Total summed log10(1+I) over all quantified features — relative spectral load per sample.');
    }

    let resizeTimer = null;
    function onResize() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            try {
                const p = document.getElementById('dataQcOverallPanel');
                if (!p || p.style.display === 'none') return;
                refresh();
                if (typeof global.renderDataQcOverallSummaryPlotly === 'function') global.renderDataQcOverallSummaryPlotly();
            } catch (_) {}
        }, 200);
    }

    global.DataQcOverallDashboard = {
        refresh,
        onResize
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('resize', onResize);
    }
})(typeof window !== 'undefined' ? window : this);
