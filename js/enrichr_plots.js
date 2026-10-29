/**
 * Downstream Plotly visualizations for Enrichr term tables (after enrichr_results_parse.js).
 */
(function (global) {
    'use strict';

    var P = global.EnrichrResultsParse;
    if (!P) {
        console.warn('enrichr_plots.js: EnrichrResultsParse missing; load enrichr_results_parse.js first.');
    }

    function readPlotOptionsFromDom() {
        function num(id, def, min, max) {
            var el = document.getElementById(id);
            var v = el ? parseInt(el.value, 10) : NaN;
            if (!Number.isFinite(v)) return def;
            return Math.min(max, Math.max(min, v));
        }
        function val(id, allowed, def) {
            var el = document.getElementById(id);
            var s = el ? String(el.value || '').trim() : '';
            return allowed.indexOf(s) >= 0 ? s : def;
        }
        return {
            topN: num('enrichrPlotTopN', 25, 5, 100),
            minOverlap: num('enrichrPlotMinOverlap', 0, 0, 500),
            rankBy: val('enrichrPlotRankBy', ['padj', 'p', 'combined'], 'padj'),
            colorMetric: val('enrichrPlotColorMetric', ['neglogpadj', 'padj'], 'neglogpadj'),
            bubbleX: val('enrichrPlotBubbleX', ['overlap', 'odds'], 'overlap')
        };
    }

    function plotlyConfig(filenameStem) {
        return {
            responsive: true,
            scrollZoom: false,
            editable: false,
            displayModeBar: true,
            displaylogo: false,
            toImageButtonOptions: { filename: filenameStem || 'enrichr_plot', height: null, width: null, scale: 2 }
        };
    }

    /**
     * Wrap a long term label at word boundaries instead of truncating it with "…".
     * Plotly renders "<br>" in tick labels, so the whole name stays readable even when
     * the axis is narrow (the margins are then sized from the wrapped result).
     */
    function wrapTermLabel(text, perLine) {
        var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
        if (!s) return '';
        var limit = Math.max(12, perLine || 40);
        var words = s.split(' ');
        var lines = [];
        var cur = '';
        var i;
        for (i = 0; i < words.length; i++) {
            var w = words[i];
            if (!cur) { cur = w; continue; }
            if ((cur + ' ' + w).length <= limit) cur += ' ' + w;
            else { lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);
        /* A single token longer than the limit (e.g. a long accession) still has to fit. */
        var hard = Math.ceil(limit * 1.6);
        var out = [];
        for (i = 0; i < lines.length; i++) {
            var ln = lines[i];
            while (ln.length > hard) {
                out.push(ln.slice(0, hard));
                ln = ln.slice(hard);
            }
            out.push(ln);
        }
        return out.join('<br>');
    }

    /** Line count / longest line of an already wrapped label ("a<br>b"). */
    function labelLineStats(wrapped) {
        var lines = String(wrapped == null ? '' : wrapped).split('<br>');
        var maxLen = 0;
        var i;
        for (i = 0; i < lines.length; i++) maxLen = Math.max(maxLen, lines[i].length);
        return { lines: lines.length, maxLen: maxLen };
    }

    function maxOf(arr, fallback) {
        var m = fallback;
        var i;
        for (i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
        return m;
    }

    function barMetric(rows, rankBy, Pparse) {
        var nl = Pparse.negLog10;
        return rows.map(function (r) {
            if (rankBy === 'combined') {
                return Number.isFinite(r.combinedScore) ? r.combinedScore : 0;
            }
            if (rankBy === 'p') return nl(r.p);
            return nl(r.padj);
        });
    }

    function barXAxisTitle(rankBy, Pparse) {
        if (rankBy === 'combined') return 'Combined score';
        if (rankBy === 'p') return '-log10(P)';
        return '-log10(adjusted P)';
    }

    function renderBarPlot(domId, rows, options, Pparse) {
        var el = document.getElementById(domId);
        if (!el || typeof Plotly === 'undefined') return;
        if (!rows.length) {
            el.innerHTML = '<p class="small" style="color:#888;padding:12px;">No rows after filters.</p>';
            return;
        }
        var rankBy = options.rankBy || 'padj';
        var vals = barMetric(rows, rankBy, Pparse);
        /* Full term names, wrapped over as many lines as needed (never truncated). */
        var labels = rows.map(function (r) {
            return wrapTermLabel(r.label || '', 52);
        });
        var stats = labels.map(labelLineStats);
        var maxLines = maxOf(stats.map(function (s) { return s.lines; }), 1);
        var marginLeft = Math.min(640, Math.max(90, 24 + maxOf(stats.map(function (s) { return s.maxLen; }), 10) * 6.6));
        /* Size the plot div, not the layout: Plotly then autosizes into it (and Plots.resize
         * keeps working), while the host scrolls when the wrapped labels need more room. */
        var plotHeight = Math.max(300, 140 + rows.length * (16 + 10 * (maxLines - 1)));
        el.style.height = plotHeight + 'px';
        el.style.minHeight = plotHeight + 'px';
        el.style.flex = '0 0 auto';
        var trace = {
            type: 'bar',
            orientation: 'h',
            x: vals,
            y: labels,
            marker: { color: '#6366f1' },
            text: rows.map(function (r) { return r.label || ''; }),
            hovertemplate: '%{text}<br>%{x:.2f}<extra></extra>'
        };
        var layout = {
            title: 'Top enriched terms (' + barXAxisTitle(rankBy, Pparse) + ')',
            margin: { l: marginLeft, r: 24, t: 48, b: 56 },
            xaxis: { title: barXAxisTitle(rankBy, Pparse), zeroline: true },
            yaxis: {
                automargin: true,
                categoryorder: 'array',
                categoryarray: labels.slice(),
                autorange: 'reversed',
                tickfont: { size: 11 }
            },
            paper_bgcolor: nebulaFigBg(),
            plot_bgcolor: nebulaFigBg()
        };
        Plotly.newPlot(el, [trace], layout, plotlyConfig('enrichr_bar'));
    }

    function bubbleColorValues(rows, colorMetric, Pparse) {
        var nl = Pparse.negLog10;
        return rows.map(function (r) {
            if (colorMetric === 'padj') return Number.isFinite(r.padj) ? r.padj : 1;
            return nl(r.padj);
        });
    }

    function bubbleColorTitle(colorMetric, Pparse) {
        return colorMetric === 'padj' ? 'Adjusted P' : '-log10(adjusted P)';
    }

    function renderBubblePlot(domId, rows, options, Pparse) {
        var el = document.getElementById(domId);
        if (!el || typeof Plotly === 'undefined') return;
        if (!rows.length) {
            el.innerHTML = '<p class="small" style="color:#888;padding:12px;">No rows after filters.</p>';
            return;
        }
        var colorMetric = options.colorMetric || 'neglogpadj';
        var bubbleX = options.bubbleX || 'overlap';
        var xVals = rows.map(function (r) {
            return bubbleX === 'odds'
                ? (Number.isFinite(r.oddsRatio) ? r.oddsRatio : 0)
                : r.overlapCount;
        });
        var sizes = rows.map(function (r) {
            var o = r.overlapCount;
            return Math.max(8, Math.min(48, 8 + o * 2));
        });
        var colors = bubbleColorValues(rows, colorMetric, Pparse);
        /* Full term names on the y axis, wrapped — the old code cut them at 70 chars and
         * kept a fixed 56px left margin, so long names were clipped. */
        var labels = rows.map(function (r) {
            return wrapTermLabel(r.label || '', 40);
        });
        var stats = labels.map(labelLineStats);
        var maxLines = maxOf(stats.map(function (s) { return s.lines; }), 1);
        var marginLeft = Math.min(560, Math.max(90, 24 + maxOf(stats.map(function (s) { return s.maxLen; }), 10) * 6.4));
        var idx = rows.map(function (_, i) {
            return i;
        });
        var trace = {
            type: 'scatter',
            mode: 'markers',
            x: xVals,
            y: idx,
            marker: {
                size: sizes,
                color: colors,
                colorscale: colorMetric === 'padj' ? 'Reds' : 'Viridis',
                reversescale: colorMetric === 'padj',
                colorbar: { title: bubbleColorTitle(colorMetric, Pparse) },
                line: { width: 0.5, color: '#ccc' }
            },
            text: rows.map(function (r) {
                return (r.label || '') + '<br>Overlap: ' + r.overlapCount + '<br>Adj.P: ' +
                    (Number.isFinite(r.padj) ? r.padj.toExponential(2) : 'NA');
            }),
            hovertemplate: '%{text}<extra></extra>'
        };
        var plotHeight = Math.min(2400, 300 + rows.length * (16 + 10 * (maxLines - 1)));
        el.style.height = plotHeight + 'px';
        el.style.minHeight = plotHeight + 'px';
        el.style.flex = '0 0 auto';
        var layout = {
            title: 'Bubble plot (dotplot-style)',
            margin: { l: marginLeft, r: 24, t: 48, b: 56 },
            xaxis: {
                title: bubbleX === 'odds' ? 'Odds ratio' : 'Overlap gene count',
                zeroline: true
            },
            yaxis: {
                automargin: true,
                tickmode: 'array',
                tickvals: idx,
                ticktext: labels,
                autorange: 'reversed',
                tickfont: { size: 11 }
            },
            paper_bgcolor: nebulaFigBg(),
            plot_bgcolor: nebulaFigBg()
        };
        Plotly.newPlot(el, [trace], layout, plotlyConfig('enrichr_bubble'));
    }

    function jaccard(genesA, genesB) {
        var setA = {};
        var setB = {};
        var i;
        for (i = 0; i < genesA.length; i++) setA[String(genesA[i]).toUpperCase()] = true;
        var inter = 0;
        for (i = 0; i < genesB.length; i++) {
            var k = String(genesB[i]).toUpperCase();
            setB[k] = true;
            if (setA[k]) inter++;
        }
        var ua = Object.keys(setA).length;
        var ub = Object.keys(setB).length;
        var uni = ua + ub - inter;
        return uni > 0 ? inter / uni : 0;
    }

    function renderTermSimilarityHeatmap(domId, rows, Pparse) {
        var el = document.getElementById(domId);
        if (!el || typeof Plotly === 'undefined') return;
        var n = rows.length;
        if (n < 2) {
            el.innerHTML = '<p class="small" style="color:#888;padding:12px;">Need at least two terms with overlapping genes for similarity.</p>';
            return;
        }
        var labels = rows.map(function (r) {
            return wrapTermLabel(r.label || '', 34);
        });
        var xLabels = rows.map(function (r) {
            return wrapTermLabel(r.label || '', 26);
        });
        var yStats = labels.map(labelLineStats);
        var xStats = xLabels.map(labelLineStats);
        var yMaxLines = maxOf(yStats.map(function (s) { return s.lines; }), 1);
        var yMaxLen = maxOf(yStats.map(function (s) { return s.maxLen; }), 10);
        var xMaxLines = maxOf(xStats.map(function (s) { return s.lines; }), 1);
        var xMaxLen = maxOf(xStats.map(function (s) { return s.maxLen; }), 10);
        /* Margins are sized from the wrapped labels (automargin still has the last word),
         * and the figure grows with the label stack so rows stay readable; the host scrolls. */
        var marginLeft = Math.min(430, Math.max(120, 24 + yMaxLen * 6.4));
        var marginBottom = Math.min(360, Math.max(150, 56 + xMaxLen * 4.8 + xMaxLines * 11));
        var plotHeight = Math.max(430, 150 + n * (14 + 8 * yMaxLines) + marginBottom);
        el.style.height = plotHeight + 'px';
        el.style.minHeight = plotHeight + 'px';
        el.style.flex = '0 0 auto';
        var z = [];
        for (var i = 0; i < n; i++) {
            z[i] = [];
            for (var j = 0; j < n; j++) {
                z[i][j] = i === j ? 1 : jaccard(rows[i].genes, rows[j].genes);
            }
        }
        var trace = {
            type: 'heatmap',
            z: z,
            x: xLabels,
            y: labels,
            colorscale: 'Blues',
            reversescale: false,
            hovertemplate: '%{y} vs %{x}<br>Jaccard: %{z:.3f}<extra></extra>'
        };
        var layout = {
            title: 'Term–term similarity (Jaccard on overlapping genes)',
            margin: { l: marginLeft, r: 80, t: 48, b: marginBottom },
            xaxis: { tickangle: -45, automargin: true, tickfont: { size: 10 } },
            yaxis: { autorange: 'reversed', automargin: true, tickfont: { size: 10 } },
            paper_bgcolor: nebulaFigBg()
        };
        Plotly.newPlot(el, [trace], layout, plotlyConfig('enrichr_term_similarity'));
    }

    function exportEnrichrResultsTsv() {
        var terms = global._enrichrTerms;
        if (!terms || !terms.length) {
            alert('No Enrichr results to export.');
            return;
        }
        if (!P) return;
        var rows = P.parseEnrichrTermRows(terms);
        var matCols = 0;
        rows.forEach(function (r) {
            if (r.matrixColSums && r.matrixColSums.length > matCols) matCols = r.matrixColSums.length;
        });
        var cd = global.currentData;
        var matHeaders = [];
        var mh;
        for (mh = 0; mh < matCols; mh++) {
            if (cd && Array.isArray(cd.columnHeaders) && mh < cd.columnHeaders.length) {
                matHeaders.push(String(cd.columnHeaders[mh] == null ? '' : cd.columnHeaders[mh]).replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
            } else {
                matHeaders.push('Column_' + (mh + 1));
            }
        }
        var header = 'term\tp_value\tadjusted_p\todds_ratio\tcombined_score\toverlap_count\tgenes';
        for (mh = 0; mh < matCols; mh++) header += '\t' + matHeaders[mh];
        var lines = [header];
        rows.forEach(function (r) {
            var genesJoined = (r.genes || []).join(';');
            var row = [
                '"' + String(r.label || '').replace(/"/g, '""') + '"',
                Number.isFinite(r.p) ? r.p : '',
                Number.isFinite(r.padj) ? r.padj : '',
                Number.isFinite(r.oddsRatio) ? r.oddsRatio : '',
                Number.isFinite(r.combinedScore) ? r.combinedScore : '',
                r.overlapCount,
                '"' + genesJoined.replace(/"/g, '""') + '"'
            ];
            for (mh = 0; mh < matCols; mh++) {
                var cell = (r.matrixColSums && mh < r.matrixColSums.length) ? r.matrixColSums[mh] : '';
                row.push(Number.isFinite(cell) ? cell : '');
            }
            lines.push(row.join('\t'));
        });
        var blob = new Blob([lines.join('\n')], { type: 'text/tab-separated-values;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'enrichr_results.tsv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }

    function enrichrRefreshDownstreamPlots() {
        if (!P || typeof Plotly === 'undefined') return;
        var terms = global._enrichrTerms;
        var emptyMsg = '<p class="small" style="color:#888;padding:12px;">Run enrichment to see plots.</p>';
        ['enrichrPlotBar', 'enrichrPlotBubble', 'enrichrPlotTermSim'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        if (!terms || !terms.length) {
            ['enrichrPlotBar', 'enrichrPlotBubble', 'enrichrPlotTermSim'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.innerHTML = emptyMsg;
            });
            return;
        }
        var allRows = P.parseEnrichrTermRows(terms);
        var opts = readPlotOptionsFromDom();
        var filtered = P.filterAndTopN(allRows, opts);

        renderBarPlot('enrichrPlotBar', filtered, opts, P);
        renderBubblePlot('enrichrPlotBubble', filtered, opts, P);
        renderTermSimilarityHeatmap('enrichrPlotTermSim', filtered, P);
        setTimeout(function () {
            if (typeof window.onEnrichrPlotsLayoutRefresh === 'function') {
                try {
                    window.onEnrichrPlotsLayoutRefresh();
                } catch (ex) { /* ignore */ }
            }
        }, 80);
    }

    function readResultHeatmapOptionsFromDom() {
        function num(id, def, min, max) {
            var el = document.getElementById(id);
            var v = el ? parseInt(el.value, 10) : NaN;
            if (!Number.isFinite(v)) return def;
            return Math.min(max, Math.max(min, v));
        }
        function val(id, allowed, def) {
            var el = document.getElementById(id);
            var s = el ? String(el.value || '').trim() : '';
            return allowed.indexOf(s) >= 0 ? s : def;
        }
        /** Empty field = no filter. */
        function optFloat(id) {
            var el = document.getElementById(id);
            if (!el) return null;
            var s = String(el.value || '').trim();
            if (s === '') return null;
            var v = parseFloat(s);
            return Number.isFinite(v) ? v : null;
        }
        return {
            topN: num('enrichrResultHmTopN', 40, 5, 150),
            minOverlap: num('enrichrResultHmMinOverlap', 0, 0, 500),
            rankBy: val('enrichrResultHmRankBy', ['padj', 'p', 'combined'], 'padj'),
            maxPadj: optFloat('enrichrResultHmMaxPadj'),
            maxP: optFloat('enrichrResultHmMaxP'),
            minCombined: optFloat('enrichrResultHmMinCombined'),
            minOdds: optFloat('enrichrResultHmMinOdds')
        };
    }

    /**
     * Apply sidebar row filters (P, adj.P, combined score, odds ratio, overlap), then sort and cap at topN.
     */
    function filterRowsForEnrichrHeatmap(rows, options) {
        if (!rows || !rows.length) return [];
        var maxPadj = options.maxPadj;
        var maxP = options.maxP;
        var minCombined = options.minCombined;
        var minOdds = options.minOdds;
        var minOv = parseInt(options.minOverlap, 10);
        if (!Number.isFinite(minOv) || minOv < 0) minOv = 0;
        var filtered = rows.filter(function (r) {
            if (!r.label) return false;
            if ((r.overlapCount || 0) < minOv) return false;
            if (maxPadj != null) {
                if (!Number.isFinite(r.padj) || r.padj > maxPadj) return false;
            }
            if (maxP != null) {
                if (!Number.isFinite(r.p) || r.p > maxP) return false;
            }
            if (minCombined != null) {
                if (!Number.isFinite(r.combinedScore) || r.combinedScore < minCombined) return false;
            }
            if (minOdds != null) {
                if (!Number.isFinite(r.oddsRatio) || r.oddsRatio < minOdds) return false;
            }
            return true;
        });
        var rankBy = options.rankBy || 'padj';
        filtered.sort(function (a, b) {
            if (rankBy === 'combined') {
                var ca = Number.isFinite(a.combinedScore) ? a.combinedScore : -Infinity;
                var cb = Number.isFinite(b.combinedScore) ? b.combinedScore : -Infinity;
                return cb - ca;
            }
            var va = rankBy === 'p' ? a.p : a.padj;
            var vb = rankBy === 'p' ? b.p : b.padj;
            if (!Number.isFinite(va)) va = 1;
            if (!Number.isFinite(vb)) vb = 1;
            return va - vb;
        });
        var topN = parseInt(options.topN, 10);
        if (!Number.isFinite(topN) || topN < 5) topN = 40;
        topN = Math.min(200, Math.max(5, topN));
        return filtered.slice(0, topN);
    }

    /**
     * Build **ontology term × sample** numeric matrix from the Enrichr **Results** table for the shared heatmap pipeline.
     * Rows = filtered/ranked terms (libraries / GO terms, etc.); values = per-sample intensity sums attached on each term
     * (`_enrichrMatrixColSums`). P-value, adj.P, combined score, odds ratio, overlap are **not** columns here—they are
     * applied only via {@link filterRowsForEnrichrHeatmap} + {@link readResultHeatmapOptionsFromDom}.
     * @returns {{ ok: true, data: number[][], rowIds: string[], colIds: string[], rowOriginalIndices: number[], displayRowLabels: string[] } | { ok: false, message: string }}
     */
    function buildEnrichrTermIntensityMatrixForClustering() {
        if (!P) {
            return { ok: false, message: 'Enrichr parser not loaded.' };
        }
        var terms = global._enrichrTerms;
        if (!terms || !terms.length) {
            return { ok: false, message: 'No Enrichr results. Run enrichment first.' };
        }
        var opts = readResultHeatmapOptionsFromDom();
        var allRows = P.parseEnrichrTermRows(terms);
        var filtered = filterRowsForEnrichrHeatmap(allRows, opts);
        if (!filtered.length) {
            return { ok: false, message: 'No terms pass the current row filters.' };
        }
        var nMat = 0;
        var mh;
        for (mh = 0; mh < filtered.length; mh++) {
            var mc = filtered[mh].matrixColSums;
            if (Array.isArray(mc) && mc.length > nMat) {
                nMat = mc.length;
            }
        }
        if (nMat < 1) {
            return { ok: false, message: 'No per-sample intensity columns on the Enrichr results. Load a matrix, run enrichment (or open Results after run) so terms get intensity columns, then try again.' };
        }
        var cd = global.currentData;
        var colIds = [];
        for (mh = 0; mh < nMat; mh++) {
            if (cd && Array.isArray(cd.columnHeaders) && mh < cd.columnHeaders.length) {
                colIds.push(String(cd.columnHeaders[mh] == null ? '' : cd.columnHeaders[mh]).replace(/\r?\n/g, ' '));
            } else {
                colIds.push('Sample_' + (mh + 1));
            }
        }
        var data = [];
        var rowIds = [];
        var displayRowLabels = [];
        var rowOriginalIndices = [];
        for (var ri = 0; ri < filtered.length; ri++) {
            rowIds.push('enrichr_term_' + ri);
            rowOriginalIndices.push(ri);
            var lab = String(filtered[ri].label || '');
            displayRowLabels.push(lab.length > 80 ? lab.slice(0, 77) + '\u2026' : lab);
            var mcs = filtered[ri].matrixColSums;
            var row = [];
            var cj;
            for (cj = 0; cj < nMat; cj++) {
                var rawV = (Array.isArray(mcs) && cj < mcs.length) ? mcs[cj] : null;
                var numV = typeof rawV === 'number' && !isNaN(rawV) && isFinite(rawV) ? rawV : NaN;
                row.push(numV);
            }
            data.push(row);
        }
        return {
            ok: true,
            data: data,
            rowIds: rowIds,
            colIds: colIds,
            rowOriginalIndices: rowOriginalIndices,
            displayRowLabels: displayRowLabels
        };
    }

    global.exportEnrichrResultsTsv = exportEnrichrResultsTsv;
    global.enrichrRefreshDownstreamPlots = enrichrRefreshDownstreamPlots;
    global.buildEnrichrTermIntensityMatrixForClustering = buildEnrichrTermIntensityMatrixForClustering;
    global.buildEnrichrIntensityMatrixForClustering = buildEnrichrTermIntensityMatrixForClustering;
})(typeof window !== 'undefined' ? window : this);
