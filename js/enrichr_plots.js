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
        var labels = rows.map(function (r) {
            var s = r.label || '';
            return s.length > 90 ? s.slice(0, 87) + '…' : s;
        });
        var trace = {
            type: 'bar',
            orientation: 'h',
            x: vals,
            y: labels,
            marker: { color: '#6366f1' }
        };
        var marginLeft = Math.min(480, 40 + Math.max.apply(null, labels.map(function (t) {
            return t.length;
        })) * 6.5);
        var layout = {
            title: 'Top enriched terms (' + barXAxisTitle(rankBy, Pparse) + ')',
            margin: { l: marginLeft, r: 24, t: 48, b: 56 },
            xaxis: { title: barXAxisTitle(rankBy, Pparse), zeroline: true },
            yaxis: {
                automargin: false,
                categoryorder: 'array',
                categoryarray: labels.slice(),
                autorange: 'reversed'
            },
            paper_bgcolor: '#fff',
            plot_bgcolor: '#fafafa'
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
        var labels = rows.map(function (r) {
            var s = r.label || '';
            return s.length > 70 ? s.slice(0, 67) + '…' : s;
        });
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
        var plotHeight = Math.min(1400, 320 + rows.length * 22);
        var layout = {
            title: 'Bubble plot (dotplot-style)',
            margin: { l: 56, r: 24, t: 48, b: 56 },
            xaxis: {
                title: bubbleX === 'odds' ? 'Odds ratio' : 'Overlap gene count',
                zeroline: true
            },
            yaxis: {
                tickmode: 'array',
                tickvals: idx,
                ticktext: labels,
                autorange: 'reversed'
            },
            height: plotHeight,
            paper_bgcolor: '#fff',
            plot_bgcolor: '#fafafa'
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
            var s = r.label || '';
            return s.length > 45 ? s.slice(0, 42) + '…' : s;
        });
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
            x: labels,
            y: labels,
            colorscale: 'Blues',
            reversescale: false,
            hovertemplate: '%{y} vs %{x}<br>Jaccard: %{z:.3f}<extra></extra>'
        };
        var layout = {
            title: 'Term–term similarity (Jaccard on overlapping genes)',
            margin: { l: 160, r: 80, t: 48, b: 160 },
            xaxis: { tickangle: -45 },
            yaxis: { autorange: 'reversed' },
            paper_bgcolor: '#fff'
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
