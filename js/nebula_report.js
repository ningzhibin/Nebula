/**
 * Nebula Report (MVP): HTML export with user-selectable sections.
 * Depends on globals: Plotly, currentData, currentDataMatrix, metaData (optional).
 */
(function (global) {
    'use strict';

    var PLOTLY_IMG_WIDTH = 900;
    var SVG_EXPORT_SCALE = 2;
    /** Same major Plotly build as index.html (interactive report embeds). */
    var PLOTLY_CDN_URL = 'https://cdn.plot.ly/plotly-2.27.0.min.js';
    /** If serialized Plotly JSON exceeds this, fall back to static PNG for that figure. */
    var PLOTLY_EMBED_JSON_MAX_CHARS = 7000000;
    /** Inline SVG clone max size (PCA 3D D3); larger SVGs fall back to PNG raster of the same plot. */
    var SVG_EMBED_MAX_CHARS = 2500000;
    /** Max JSON size for interactive PCA 3D payload in report HTML. */
    var PCA3D_INTERACTIVE_JSON_MAX_CHARS = 6000000;
    var D3_CDN_URL = 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js';
    var PCA3D_EMBED_SCRIPT_URL = 'js/pca3d_report_embed.js?v=5.11';
    var PCA3D_EMBED_VERSION = '5.11';
    var pca3dEmbedScriptCache = null;

    /** Preload embed source so report HTML can inline it (blob iframe cannot load relative js/). */
    (function preloadPca3dEmbedScript() {
        if (global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__) {
            pca3dEmbedScriptCache = global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__;
            return;
        }
        if (typeof fetch !== 'function') return;
        fetch(PCA3D_EMBED_SCRIPT_URL, { cache: 'no-cache' })
            .then(function (r) { return r.ok ? r.text() : ''; })
            .then(function (t) {
                if (t) {
                    pca3dEmbedScriptCache = t;
                    global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__ = t;
                }
            })
            .catch(function () { /* ignore */ });
    })();
    /** Default plot width when layout has no width (synthetic + fallback). */
    var REPORT_PLOTLY_DEFAULT_WIDTH = 900;
    var REPORT_PLOTLY_MAX_LAYOUT_H = 3200;
    var REPORT_PLOTLY_MAX_LAYOUT_W = 2400;

    /** Default section ids when resetting UI: summary only; figures opt-in via Add to Report. */
    var REPORT_SECTIONS_DEFAULT = [
        'matrix_meta'
    ];

    /** Default figure descriptions (export caption / modal preset). User may override per section in `window.nebulaReportFigureCaptions`. */
    var FIGURE_CAPTION_DEFAULTS = {
        per_column_summary: 'Per-column QC summary (horizontal D3 bars, PNG in report): one row per sample; metric and transform follow Data QC → Column correlation. Same pixels as the on-screen chart.',
        total_log_signal: 'Total spectral load per sample: sum of log10(1 + intensity) over quantified features (finite values > 0). Useful for comparing run-scale intensity between samples.',
        column_boxplots: 'Distribution of log10(1 + intensity) for values > 0 per sample (horizontal box plots). Whiskers: min/max of subsampled log values; box: Q1–Q3; line: median.',
        top_features_bar: 'Ranked intensities for the selected sample column (top N features by intensity); optional log10(1+I) scale from Column profile settings.',
        column_profile_treemap: 'Treemap of relative intensity mass for the selected sample (top N features plus Other).',
        corr_scatter_matrix: 'Sample–sample correlation overview: lower triangle pairwise scatter, upper triangle correlation coefficients (subset of columns per sidebar cap).',
        corr_distance_heatmap: 'Distance among samples derived from pairwise correlations (subset of columns); transform and zero-handling match Column correlation settings.',
        heatmap: 'Clustered intensity heatmap of the matrix (or filtered subset); rows/features and samples as generated under Clustering → Heatmap.',
        pca_2d: 'PCA projection of samples (first two selected principal components); interactive Plotly embed with the same PC axes, groups, and zoom range as the Clustering tab at export time. Preprocessing matches Clustering → PCA.',
        pca_3d: 'PCA 3D projection (three selected principal components): interactive D3 replica of the Clustering 3D tab at export time — drag to rotate, wheel to zoom, legend show/hide and hover highlight, tooltips, and column labels.',
        pcoa_2d: 'PCoA (classical MDS) ordination of samples on the selected distance metric (e.g. Bray-Curtis); interactive Plotly embed with the same coordinates, groups, ellipses, and zoom range as the Clustering → PCoA tab at export time.',
        pcoa_3d: 'PCoA 3D ordination (three selected principal coordinates) on the chosen distance metric: interactive D3 replica of the Clustering → PCoA 3D tab at export time — drag to rotate, wheel to zoom, legend show/hide, tooltips, and column labels.'
    };

    if (!global.nebulaReportFigureCaptions) {
        global.nebulaReportFigureCaptions = {};
    }

    function getDefaultFigureCaption(sectionId) {
        return FIGURE_CAPTION_DEFAULTS[sectionId] || '';
    }

    /**
     * Caption text embedded below each exported figure (figcaption).
     * @param {string} sectionId
     * @param {string} sectionTitle fallback
     */
    function getFigureCaptionForExport(sectionId, sectionTitle) {
        var raw = global.nebulaReportFigureCaptions && global.nebulaReportFigureCaptions[sectionId];
        if (raw != null && String(raw).trim() !== '') return String(raw).trim();
        var d = getDefaultFigureCaption(sectionId);
        if (d) return d;
        return sectionTitle || '';
    }

    /** @type {{ id: string, title: string, group: string, capture: string, plotlyId?: string, svgHostId?: string, hostId?: string }[]} */
    var REPORT_SECTIONS = [
        { id: 'matrix_meta', title: 'Matrix (Overall stats) and meta summary', group: 'Summary', capture: 'html' },
        { id: 'per_column_summary', title: 'Per-column summary (bar)', group: 'Data QC → Overall', capture: 'svg_host', svgHostId: 'dataQcOverallSummaryPlot' },
        { id: 'total_log_signal', title: 'Total log10(1+I) per sample', group: 'Data QC → Overall', capture: 'svg_host', svgHostId: 'dataQcOverallChartTotalLog' },
        { id: 'column_boxplots', title: 'Per-column box plot (log10(1+I))', group: 'Data QC → Overall', capture: 'svg_host', svgHostId: 'dataQcOverallChartBox' },
        { id: 'top_features_bar', title: 'Column profile — top features bar (current sample)', group: 'Data QC → Column profile', capture: 'plotly', plotlyId: 'colProfileBarPlot' },
        { id: 'column_profile_treemap', title: 'Column profile — treemap (current sample)', group: 'Data QC → Column profile', capture: 'plotly', plotlyId: 'colProfileTreePlot' },
        { id: 'corr_scatter_matrix', title: 'Column correlation — scatter / lower matrix', group: 'Data QC → Column correlation', capture: 'plotly', plotlyId: 'colCorrScatterMatrixMixed' },
        { id: 'corr_distance_heatmap', title: 'Column correlation — distance heatmap', group: 'Data QC → Column correlation', capture: 'plotly', plotlyId: 'colCorrDistHeatmap' },
        { id: 'heatmap', title: 'Clustering — heatmap', group: 'Clustering', capture: 'plotly', plotlyId: 'heatmapPlot' },
        { id: 'pca_2d', title: 'Clustering — PCA 2D plot', group: 'Clustering', capture: 'pca_plotly' },
        { id: 'pca_3d', title: 'Clustering — PCA 3D plot', group: 'Clustering', capture: 'pca_3d_interactive' },
        { id: 'pcoa_2d', title: 'Clustering — PCoA 2D plot', group: 'Clustering', capture: 'pcoa_plotly' },
        { id: 'pcoa_3d', title: 'Clustering — PCoA 3D plot', group: 'Clustering', capture: 'pcoa_3d_interactive' }
    ];

    /**
     * Match index.html patterns (e.g. column profile): prefer window.currentDataMatrix, else currentData.dataMatrix.
     * @returns {any[]|null}
     */
    function getCurrentMatrixForReport() {
        var m = global.currentDataMatrix;
        if (m && Array.isArray(m) && m.length) return m;
        var d = global.currentData;
        if (d && Array.isArray(d.dataMatrix) && d.dataMatrix.length) return d.dataMatrix;
        return null;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtLogCell(x) {
        if (!Number.isFinite(x)) return '—';
        return x.toFixed(3);
    }

    function fmtTotalLogCell(x) {
        if (!Number.isFinite(x)) return '—';
        return x.toFixed(2);
    }

    function metaRowSampleId(row, sampleIdHeader) {
        if (row == null || !sampleIdHeader) return '';
        var v = row[sampleIdHeader];
        return v == null ? '' : String(v).trim();
    }

    function collectMetaTableSummaryHtml(meta, columnHeaders) {
        if (!meta || !Array.isArray(meta.headers) || !meta.headers.length) {
            return '<p class="nebula-report-muted">No meta table loaded.</p>';
        }
        var nHdr = meta.headers.length;
        var nRows = Array.isArray(meta.rows) ? meta.rows.length : 0;
        var sidHeader = null;
        for (var h = 0; h < meta.headers.length; h++) {
            if (String(meta.headers[h]).trim().toLowerCase() === 'sample_id') {
                sidHeader = meta.headers[h];
                break;
            }
        }
        var parts = [];
        parts.push('<table class="nebula-report-table"><tbody>');
        parts.push('<tr><th>Meta rows</th><td>' + nRows.toLocaleString() + '</td></tr>');
        parts.push('<tr><th>Meta columns</th><td>' + nHdr.toLocaleString() + '</td></tr>');
        parts.push('</tbody></table>');
        parts.push('<p class="nebula-report-small"><strong>Column names:</strong> ' + escapeHtml(meta.headers.join(' · ')) + '</p>');

        if (sidHeader && Array.isArray(columnHeaders) && columnHeaders.length) {
            var idSet = {};
            if (Array.isArray(meta.rows)) {
                for (var r = 0; r < meta.rows.length; r++) {
                    var id = metaRowSampleId(meta.rows[r], sidHeader);
                    if (id) idSet[id] = true;
                }
            }
            var matched = 0;
            for (var c = 0; c < columnHeaders.length; c++) {
                var col = String(columnHeaders[c] == null ? '' : columnHeaders[c]).trim();
                if (col && idSet[col]) matched++;
            }
            parts.push(
                '<p><strong>Sample_ID ↔ matrix columns:</strong> ' +
                matched.toLocaleString() + ' of ' + columnHeaders.length.toLocaleString() +
                ' matrix column headers match a <code>Sample_ID</code> value in the meta table (trimmed exact match).</p>'
            );
            parts.push('<p><strong>Distinct Sample_ID in meta:</strong> ' + Object.keys(idSet).length.toLocaleString() + '</p>');
        } else if (!sidHeader) {
            parts.push('<p class="nebula-report-muted">No <code>Sample_ID</code> column in meta — skipping column↔meta match summary.</p>');
        }

        var annCols = meta.headers.filter(function (x) {
            return x && String(x).trim() !== '' && String(x).trim().toLowerCase() !== 'sample_id';
        });
        if (annCols.length) {
            parts.push('<h4 class="nebula-report-subh2">Annotation columns</h4>');
            parts.push('<p class="nebula-report-small">' + escapeHtml(annCols.join(', ')) + '</p>');
            var maxAnn = Math.min(12, annCols.length);
            parts.push(
                '<table class="nebula-report-table nebula-report-matrix-table"><thead><tr>' +
                '<th>Column</th><th>Non-empty cells</th><th>Distinct values</th></tr></thead><tbody>'
            );
            for (var a = 0; a < maxAnn; a++) {
                var colName = annCols[a];
                var nonEmpty = 0;
                var seen = {};
                if (Array.isArray(meta.rows)) {
                    for (var rr = 0; rr < meta.rows.length; rr++) {
                        var row2 = meta.rows[rr];
                        var cell = row2 && row2[colName];
                        var t = cell == null ? '' : String(cell).trim();
                        if (t !== '') {
                            nonEmpty++;
                            seen[t] = true;
                        }
                    }
                }
                var distinct = Object.keys(seen).length;
                parts.push(
                    '<tr><td>' + escapeHtml(String(colName)) + '</td><td>' + nonEmpty.toLocaleString() + '</td><td>' +
                    distinct.toLocaleString() + '</td></tr>'
                );
            }
            parts.push('</tbody></table>');
            if (annCols.length > maxAnn) {
                parts.push('<p class="nebula-report-muted">(' + (annCols.length - maxAnn) + ' more annotation columns not tabulated.)</p>');
            }
        }
        return parts.join('');
    }

    function collectMatrixMetaHtml() {
        try {
        var data = global.currentData;
        var matrix = getCurrentMatrixForReport();
        var meta = global.metaData;
        if (!data || !Array.isArray(data.columnHeaders) || !data.columnHeaders.length) {
            return '<p class="nebula-report-muted">No matrix loaded.</p>';
        }
        if (!matrix || !Array.isArray(matrix) || !matrix.length) {
            return '<p class="nebula-report-muted">Matrix is empty (no row data in <code>currentDataMatrix</code> or <code>currentData.dataMatrix</code>).</p>';
        }

        var headers = data.columnHeaders;
        var rowIds = Array.isArray(data.rowIds) ? data.rowIds : null;
        var stats = null;
        if (global.DataQcOverallDashboard && typeof global.DataQcOverallDashboard.computeColumnStats === 'function') {
            stats = global.DataQcOverallDashboard.computeColumnStats(matrix, headers);
        }

        var parts = [];
        parts.push('<h3 class="nebula-report-subh">Intensity matrix (Data QC → Overall)</h3>');
        parts.push(
            '<p class="nebula-report-small">Same <strong>current matrix</strong> as <strong>Data QC → Overall</strong>: a <em>quantified</em> cell is a finite intensity <strong>&gt; 0</strong>. ' +
            'Medians / quartiles / whiskers use <code>log10(1 + I)</code> on quantified cells, with the same row subsampling rule as the Overall box plots when there are many features.</p>'
        );
        if (rowIds && rowIds.length && rowIds.length !== matrix.length) {
            parts.push(
                '<p class="nebula-report-muted">Note: <code>rowIds.length</code> (' + rowIds.length.toLocaleString() +
                ') differs from matrix row count (' + matrix.length.toLocaleString() + '); stats use the matrix rows.</p>'
            );
        }

        if (stats) {
            var matrixCells = stats.matrixCells != null ? stats.matrixCells : stats.nRows * stats.nCols;
            var tq = stats.totalQuantifiedCells != null ? stats.totalQuantifiedCells : 0;
            var pct = matrixCells > 0 ? (100 * tq) / matrixCells : 0;
            parts.push('<table class="nebula-report-table"><tbody>');
            parts.push('<tr><th>Features (rows)</th><td>' + stats.nRows.toLocaleString() + '</td></tr>');
            parts.push('<tr><th>Samples (columns)</th><td>' + stats.nCols.toLocaleString() + '</td></tr>');
            parts.push(
                '<tr><th>Quantified cells</th><td>' + tq.toLocaleString() + ' / ' + matrixCells.toLocaleString() +
                ' (' + (Number.isFinite(pct) ? pct.toFixed(1) : '0') + '%)</td></tr>'
            );
            parts.push('<tr><th>Box / IQR note</th><td>' + escapeHtml(stats.boxNote || '') + '</td></tr>');
            parts.push('</tbody></table>');

            var maxSampleRows = 250;
            var cols = stats.cols || [];
            parts.push('<h4 class="nebula-report-subh2">Per-sample summary</h4>');
            parts.push(
                '<table class="nebula-report-table nebula-report-matrix-table"><thead><tr>' +
                '<th>Sample</th><th>Quantified (I&gt;0)</th><th>Median log<sub>10</sub>(1+I)</th><th>Q1</th><th>Q3</th><th>Min log</th><th>Max log</th><th>Σ log<sub>10</sub>(1+I)</th>' +
                '</tr></thead><tbody>'
            );
            for (var j = 0; j < cols.length && j < maxSampleRows; j++) {
                var d = cols[j];
                var nq = d.nQuant != null && Number.isFinite(d.nQuant) ? d.nQuant : null;
                parts.push(
                    '<tr><td>' + escapeHtml(d.label) + '</td><td>' + (nq != null ? nq.toLocaleString() : '—') + '</td>' +
                    '<td>' + fmtLogCell(d.medLog) + '</td><td>' + fmtLogCell(d.q1) + '</td><td>' + fmtLogCell(d.q3) + '</td>' +
                    '<td>' + fmtLogCell(d.minLog) + '</td><td>' + fmtLogCell(d.maxLog) + '</td><td>' + fmtTotalLogCell(d.totalLog) + '</td></tr>'
                );
            }
            parts.push('</tbody></table>');
            if (cols.length > maxSampleRows) {
                parts.push(
                    '<p class="nebula-report-muted">(' + (cols.length - maxSampleRows).toLocaleString() + ' additional samples omitted from this table.)</p>'
                );
            }
        } else {
            parts.push('<p class="nebula-report-muted">Data QC Overall module unavailable (<code>DataQcOverallDashboard.computeColumnStats</code>).</p>');
        }

        parts.push('<h3 class="nebula-report-subh">Meta table</h3>');
        parts.push(collectMetaTableSummaryHtml(meta, headers));

        return parts.join('');
        } catch (eRep) {
            return '<p class="nebula-report-muted">Matrix/meta summary error: ' + escapeHtml(eRep && eRep.message ? eRep.message : String(eRep)) + '</p>';
        }
    }

    function collectHtmlFragment(hostId) {
        var el = document.getElementById(hostId);
        if (!el) return { kind: 'skip', reason: 'Element not found: ' + hostId };
        var html = el.innerHTML || '';
        if (!html.trim()) return { kind: 'skip', reason: 'Empty: ' + hostId };
        return { kind: 'html', html: '<div class="nebula-report-fragment">' + html + '</div>' };
    }

    function plotlyJsonReplacer(key, val) {
        if (typeof val === 'function' || typeof val === 'undefined') return undefined;
        if (val && typeof val === 'object') {
            if (val instanceof Date) return val.toISOString();
            if (typeof val.length === 'number' && val.buffer && val.buffer instanceof ArrayBuffer && typeof val.BYTES_PER_ELEMENT === 'number') {
                try {
                    return Array.prototype.slice.call(val);
                } catch (eArr) {
                    return undefined;
                }
            }
        }
        return val;
    }

    /**
     * Lock exported Plotly layout height/width to match the live chart (or sensible defaults).
     * Sets autosize false and explicit dimensions so standalone HTML does not shrink tall figures.
     * @param {HTMLElement|null} el plot div or null for synthetic layouts
     * @param {object} sLayout cloned layout (mutated)
     * @param {{ defaultWidth?: number, defaultHeight?: number }} [opts]
     */
    function stabilizeExportPlotlyLayout(el, sLayout, opts) {
        opts = opts || {};
        var defW = opts.defaultWidth != null ? opts.defaultWidth : REPORT_PLOTLY_DEFAULT_WIDTH;
        var defH = opts.defaultHeight != null ? opts.defaultHeight : 400;
        if (!sLayout || typeof sLayout !== 'object') return;
        var fl = el && el._fullLayout;
        function pickH() {
            if (fl && Number.isFinite(Number(fl.height)) && Number(fl.height) >= 40) return Number(fl.height);
            var xh = Number(sLayout.height);
            if (Number.isFinite(xh) && xh >= 80) return xh;
            if (el) {
                try {
                    var oh = el.offsetHeight;
                    if (Number.isFinite(oh) && oh >= 80) return oh;
                    var r = el.getBoundingClientRect();
                    if (r && Number.isFinite(r.height) && r.height >= 80) return r.height;
                } catch (e0) {
                    /* ignore */
                }
            }
            return defH;
        }
        function pickW() {
            if (fl && Number.isFinite(Number(fl.width)) && Number(fl.width) >= 40) return Number(fl.width);
            var x = Number(sLayout.width);
            if (Number.isFinite(x) && x >= 40) return x;
            if (el) {
                try {
                    var ow = el.offsetWidth;
                    if (Number.isFinite(ow) && ow >= 40) return ow;
                    var r2 = el.getBoundingClientRect();
                    if (r2 && Number.isFinite(r2.width) && r2.width >= 40) return r2.width;
                } catch (e1) {
                    /* ignore */
                }
            }
            return defW;
        }
        var h = Math.round(Math.min(REPORT_PLOTLY_MAX_LAYOUT_H, Math.max(120, pickH())));
        var w = Math.round(Math.min(REPORT_PLOTLY_MAX_LAYOUT_W, Math.max(80, pickW())));
        sLayout.height = h;
        sLayout.width = w;
        sLayout.autosize = false;
        if (sLayout.paper_bgcolor == null) sLayout.paper_bgcolor = '#ffffff';
        if (sLayout.plot_bgcolor == null) sLayout.plot_bgcolor = '#fafafa';
        if (!sLayout.font || typeof sLayout.font !== 'object') sLayout.font = {};
        if (sLayout.font.family == null) sLayout.font.family = 'Segoe UI, Roboto, Helvetica, Arial, sans-serif';
        if (sLayout.font.color == null) sLayout.font.color = '#1f2937';
    }

    /**
     * Inline host sizing so the export page reserves the same vertical space as layout.height before Plotly runs.
     * @param {object} sLayout
     * @returns {string} empty or ' style="..."'
     */
    function plotlyHostInlineStyleFromLayout(sLayout) {
        if (!sLayout || typeof sLayout !== 'object') return '';
        var h = Number(sLayout.height);
        var w = Number(sLayout.width);
        if (!Number.isFinite(h) || h < 1) return '';
        if (!Number.isFinite(w) || w < 1) w = REPORT_PLOTLY_DEFAULT_WIDTH;
        h = Math.round(h);
        w = Math.round(w);
        return (
            ' style="height:' +
            h +
            'px;min-height:' +
            h +
            'px;width:' +
            w +
            'px;min-width:' +
            w +
            'px;max-width:none;box-sizing:border-box;flex-shrink:0;overflow:hidden"'
        );
    }

    /**
     * Outer &lt;figure&gt; shell for Plotly: keeps chart width when captions sit below or beside preview controls.
     */
    function plotlyFigureShellStyleFromLayout(sLayout) {
        if (!sLayout || typeof sLayout !== 'object') return '';
        var h = Number(sLayout.height);
        var w = Number(sLayout.width);
        if (!Number.isFinite(h) || h < 1) return '';
        if (!Number.isFinite(w) || w < 1) w = REPORT_PLOTLY_DEFAULT_WIDTH;
        h = Math.round(h);
        w = Math.round(w);
        return (
            ' style="display:inline-block;width:' +
            w +
            'px;min-width:' +
            w +
            'px;max-width:none;box-sizing:border-box;vertical-align:top"'
        );
    }

    function utf8ToBase64(str) {
        try {
            return global.btoa(unescape(encodeURIComponent(str)));
        } catch (eB) {
            return '';
        }
    }

    /**
     * Serialize Plotly data/layout/config for report embed (shared by DOM snapshot and synthetic PCA).
     * @param {object[]} data
     * @param {object} layout
     * @param {object} [config]
     * @param {string} sourceDivId
     * @param {HTMLElement|null} [elForLayout] optional live div for size hints
     * @returns {Promise<{ kind: string, data?: object[], layout?: object, config?: object, sourceDivId?: string, reason?: string }>}
     */
    function serializePlotlyPayloadForEmbed(data, layout, config, sourceDivId, elForLayout) {
        return new Promise(function (resolve) {
            if (typeof global.Plotly === 'undefined') {
                resolve({ kind: 'skip', reason: 'Plotly not available' });
                return;
            }
            if (!data || !Array.isArray(data) || !data.length || !layout || typeof layout !== 'object') {
                if (sourceDivId) {
                    plotlyToImage(sourceDivId).then(resolve);
                } else {
                    resolve({ kind: 'skip', reason: 'Empty Plotly payload' });
                }
                return;
            }
            try {
                var rawCfg = config && typeof config === 'object' ? config : {};
                var cfg = JSON.parse(JSON.stringify(rawCfg, plotlyJsonReplacer));
                if (!cfg || typeof cfg !== 'object') cfg = {};
                if (cfg.scrollZoom == null) cfg.scrollZoom = true;
                if (cfg.displayModeBar == null) cfg.displayModeBar = true;
                if (cfg.displaylogo == null) cfg.displaylogo = false;
                cfg.responsive = false;
                var sData = JSON.parse(JSON.stringify(data, plotlyJsonReplacer));
                var sLayout = JSON.parse(JSON.stringify(layout, plotlyJsonReplacer));
                stabilizeExportPlotlyLayout(elForLayout || null, sLayout, {
                    defaultWidth: REPORT_PLOTLY_DEFAULT_WIDTH,
                    defaultHeight: Number(layout.height) >= 120 ? Number(layout.height) : 760
                });
                var probe = JSON.stringify({ d: sData, l: sLayout, c: cfg }, plotlyJsonReplacer);
                if (!probe || probe.length > PLOTLY_EMBED_JSON_MAX_CHARS) {
                    if (sourceDivId) {
                        plotlyToImage(sourceDivId).then(resolve);
                    } else {
                        resolve({ kind: 'skip', reason: 'Plotly payload too large for embed' });
                    }
                    return;
                }
                resolve({
                    kind: 'plotly_embed',
                    data: sData,
                    layout: sLayout,
                    config: cfg,
                    sourceDivId: sourceDivId || ''
                });
            } catch (eSer) {
                if (sourceDivId) {
                    plotlyToImage(sourceDivId).then(resolve);
                } else {
                    resolve({ kind: 'skip', reason: eSer && eSer.message ? eSer.message : 'Plotly serialize failed' });
                }
            }
        });
    }

    /**
     * Snapshot current Plotly figure (data + layout + config) so export keeps interactivity and view (ranges, legend toggles, etc.).
     * Falls back to PNG if the graph is empty or JSON is too large / invalid.
     * @param {string} plotlyDivId
     */
    function collectPlotlyEmbedForReport(plotlyDivId) {
        return new Promise(function (resolve) {
            var el = document.getElementById(plotlyDivId);
            if (!el || typeof global.Plotly === 'undefined') {
                resolve({ kind: 'skip', reason: 'Plotly or #' + plotlyDivId + ' not available' });
                return;
            }
            var data = el.data;
            if ((!data || !Array.isArray(data) || !data.length) && el._fullData) {
                data = el._fullData;
            }
            var layout = el.layout;
            if (!data || !Array.isArray(data) || !data.length || !layout || typeof layout !== 'object') {
                plotlyToImage(plotlyDivId).then(resolve);
                return;
            }
            var rawCfg = typeof el.config === 'object' && el.config ? el.config : {};
            serializePlotlyPayloadForEmbed(data, layout, rawCfg, plotlyDivId, el).then(resolve);
        });
    }

    /** PCA 2D (D3 on screen): build interactive Plotly from app state; PNG fallback if embed fails. */
    function collectPca2dPlotlyForReport() {
        return new Promise(function (resolve) {
            var prep = global.nebulaPcaPrepareForReportCapture;
            function runBuild() {
                var build = global.nebulaPcaBuildPlotlyEmbedForReport;
                if (typeof build !== 'function') {
                    capturePca2dSvgHost(PCA_2D_REPORT_HOST_ID).then(resolve);
                    return;
                }
                var payload;
                try {
                    payload = build();
                } catch (eBuild) {
                    capturePca2dSvgHost(PCA_2D_REPORT_HOST_ID).then(resolve);
                    return;
                }
                if (!payload || !payload.data || !payload.data.length) {
                    capturePca2dSvgHost(PCA_2D_REPORT_HOST_ID).then(resolve);
                    return;
                }
                serializePlotlyPayloadForEmbed(payload.data, payload.layout, payload.config, 'pcaPlot', null)
                    .then(function (emb) {
                        if (emb && emb.kind === 'plotly_embed') resolve(emb);
                        else capturePca2dSvgHost(PCA_2D_REPORT_HOST_ID).then(resolve);
                    })
                    .catch(function () {
                        capturePca2dSvgHost(PCA_2D_REPORT_HOST_ID).then(resolve);
                    });
            }
            if (typeof prep === 'function') {
                Promise.resolve(prep()).then(runBuild).catch(runBuild);
            } else {
                runBuild();
            }
        });
    }

    function plotlyToImage(plotlyDivId) {
        return new Promise(function (resolve) {
            var el = document.getElementById(plotlyDivId);
            if (!el || typeof global.Plotly === 'undefined' || typeof global.Plotly.toImage !== 'function') {
                resolve({ kind: 'skip', reason: 'Plotly or #' + plotlyDivId + ' not available' });
                return;
            }
            var tw = PLOTLY_IMG_WIDTH;
            var th = Math.round(PLOTLY_IMG_WIDTH * 0.55);
            try {
                var fl = el._fullLayout;
                if (fl && Number.isFinite(Number(fl.width)) && Number.isFinite(Number(fl.height))) {
                    tw = Math.round(Math.max(120, Number(fl.width)));
                    th = Math.round(Math.max(80, Number(fl.height)));
                } else {
                    var rr = el.getBoundingClientRect();
                    if (rr && rr.width >= 40 && rr.height >= 40) {
                        tw = Math.round(rr.width);
                        th = Math.round(rr.height);
                    }
                }
            } catch (eDim) {
                /* ignore */
            }
            global.Plotly.toImage(el, {
                format: 'png',
                width: tw,
                height: th,
                scale: 1
            }).then(function (dataUrl) {
                resolve({
                    kind: 'image',
                    mime: 'image/png',
                    dataUrl: dataUrl,
                    cssWidth: tw,
                    cssHeight: th
                });
            }).catch(function () {
                resolve({ kind: 'skip', reason: 'Plotly.toImage failed for #' + plotlyDivId });
            });
        });
    }

    function getSvgReportDimensions(svgEl) {
        var w = 900;
        var h = 520;
        if (!svgEl) return { cssWidth: w, cssHeight: h };
        try {
            if (svgEl.width && svgEl.width.baseVal && svgEl.height && svgEl.height.baseVal) {
                var aw = svgEl.width.baseVal.value;
                var ah = svgEl.height.baseVal.value;
                if (Number.isFinite(aw) && aw >= 1 && Number.isFinite(ah) && ah >= 1) {
                    return { cssWidth: Math.round(aw), cssHeight: Math.round(ah) };
                }
            }
        } catch (eSz) { /* ignore */ }
        try {
            if (svgEl.getBBox) {
                var bbox = svgEl.getBBox();
                w = Math.max(1, Math.ceil(bbox.width));
                h = Math.max(1, Math.ceil(bbox.height));
            }
        } catch (eBb) { /* ignore */ }
        return { cssWidth: w, cssHeight: h };
    }

    function svgHostNeedsOffscreenClone(svgNode) {
        try {
            var r = svgNode.getBoundingClientRect();
            if (!r || r.width < 2 || r.height < 2) return true;
        } catch (e0) {
            return true;
        }
        var p = svgNode;
        for (var d = 0; d < 24 && p; d++) {
            try {
                var st = global.getComputedStyle(p);
                if (st && (st.display === 'none' || st.visibility === 'hidden')) return true;
            } catch (e1) { /* ignore */ }
            p = p.parentElement;
        }
        return false;
    }

    function attachOffscreenSvgClone(svg) {
        var cloneWrap = null;
        var target = svg;
        if (svgHostNeedsOffscreenClone(svg)) {
            try {
                cloneWrap = document.createElement('div');
                cloneWrap.setAttribute('data-nebula-report-svg-clone', '1');
                cloneWrap.setAttribute('aria-hidden', 'true');
                cloneWrap.style.cssText = 'position:fixed;left:-12000px;top:0;margin:0;padding:0;border:0;overflow:visible;visibility:visible;opacity:1;z-index:2147483646;pointer-events:none;background:#ffffff;';
                cloneWrap.appendChild(svg.cloneNode(true));
                if (document.body) {
                    document.body.appendChild(cloneWrap);
                    target = cloneWrap.querySelector('svg') || svg;
                }
            } catch (eCl) {
                cloneWrap = null;
                target = svg;
            }
        }
        return {
            target: target,
            cleanup: function () {
                if (cloneWrap && cloneWrap.parentNode) {
                    try {
                        cloneWrap.parentNode.removeChild(cloneWrap);
                    } catch (eRm) { /* ignore */ }
                }
            }
        };
    }

    function sanitizeSvgForReportEmbed(root) {
        if (!root || !root.querySelectorAll) return;
        var scripts = root.querySelectorAll('script');
        for (var s = 0; s < scripts.length; s++) {
            try {
                scripts[s].parentNode.removeChild(scripts[s]);
            } catch (eS) { /* ignore */ }
        }
        var all = root.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (!el.attributes) continue;
            for (var k = el.attributes.length - 1; k >= 0; k--) {
                var nm = el.attributes[k].name;
                if (/^on/i.test(nm)) el.removeAttribute(nm);
            }
        }
    }

    /**
     * Clone on-screen SVG markup for report (vector copy of D3 PCA 3D, etc.).
     * @param {SVGSVGElement} svgEl
     * @returns {{ markup: string, cssWidth: number, cssHeight: number }|null}
     */
    function serializeSvgElementForEmbed(svgEl) {
        if (!svgEl || typeof global.XMLSerializer === 'undefined') return null;
        try {
            var dims = getSvgReportDimensions(svgEl);
            var clone = svgEl.cloneNode(true);
            sanitizeSvgForReportEmbed(clone);
            if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
            var markup = new global.XMLSerializer().serializeToString(clone);
            if (!markup || markup.length > SVG_EMBED_MAX_CHARS) return null;
            return { markup: markup, cssWidth: dims.cssWidth, cssHeight: dims.cssHeight };
        } catch (eSer) {
            return null;
        }
    }

    function svgToPngDataUrl(svgEl) {
        return new Promise(function (resolve) {
            if (!svgEl || !svgEl.getBBox) {
                resolve(null);
                return;
            }
            try {
                var dims = getSvgReportDimensions(svgEl);
                var w = dims.cssWidth;
                var h = dims.cssHeight;
                var bbox = svgEl.getBBox();
                var xml = new global.XMLSerializer().serializeToString(svgEl);
                var svg64 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
                var img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = function () {
                    var canvas = document.createElement('canvas');
                    canvas.width = Math.min(2400, Math.ceil(w * SVG_EXPORT_SCALE));
                    canvas.height = Math.min(2400, Math.ceil(h * SVG_EXPORT_SCALE));
                    var ctx = canvas.getContext('2d');
                    if (!ctx) {
                        resolve(null);
                        return;
                    }
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.setTransform(SVG_EXPORT_SCALE, 0, 0, SVG_EXPORT_SCALE, -bbox.x * SVG_EXPORT_SCALE, -bbox.y * SVG_EXPORT_SCALE);
                    ctx.drawImage(img, 0, 0);
                    try {
                        resolve({
                            dataUrl: canvas.toDataURL('image/png'),
                            cssWidth: w,
                            cssHeight: h
                        });
                    } catch (e) {
                        resolve(null);
                    }
                };
                img.onerror = function () { resolve(null); };
                img.src = svg64;
            } catch (e) {
                resolve(null);
            }
        });
    }

    /** Data QC → Overall D3 hosts (per-column summary, total log, box): refresh dashboard then capture SVG as PNG. Serialized so parallel sections do not interleave clears. */
    var overallD3CaptureChain = Promise.resolve();
    var OVERALL_D3_REPORT_HOST_IDS = ['dataQcOverallSummaryPlot', 'dataQcOverallChartTotalLog', 'dataQcOverallChartBox'];
    /** Clustering → PCA 2D / 3D (D3 in #pcaPlot / #pcaPlot3d). */
    var pca2dCaptureChain = Promise.resolve();
    var pca3dCaptureChain = Promise.resolve();
    var PCA_2D_REPORT_HOST_ID = 'pcaPlot';
    var PCA_3D_REPORT_HOST_ID = 'pcaPlot3d';

    function isOverallD3ReportHost(hostId) {
        return OVERALL_D3_REPORT_HOST_IDS.indexOf(hostId) >= 0;
    }

    function isPca2dReportHost(hostId) {
        return hostId === PCA_2D_REPORT_HOST_ID;
    }

    function isPca3dReportHost(hostId) {
        return hostId === PCA_3D_REPORT_HOST_ID;
    }

    function captureOverallD3SvgHost(hostId) {
        var next = overallD3CaptureChain.then(function () {
            return new Promise(function (resolve) {
                var dash = global.DataQcOverallDashboard;
                function runCapture() {
                    captureSvgHost(hostId).then(resolve);
                }
                if (dash && typeof dash.refresh === 'function') {
                    Promise.resolve(dash.refresh())
                        .then(function () {
                            if (typeof global.requestAnimationFrame === 'function') {
                                global.requestAnimationFrame(function () {
                                    setTimeout(runCapture, 0);
                                });
                            } else {
                                setTimeout(runCapture, 40);
                            }
                        })
                        .catch(function () {
                            runCapture();
                        });
                } else {
                    runCapture();
                }
            });
        });
        overallD3CaptureChain = next.catch(function () {
            return null;
        });
        return next;
    }

    /** PCA 2D D3: redraw 2D view then rasterize SVG (works when PCA tab/panel is hidden). */
    function capturePca2dSvgHost(hostId) {
        var next = pca2dCaptureChain.then(function () {
            return new Promise(function (resolve) {
                function runCapture() {
                    captureSvgHost(hostId).then(resolve);
                }
                var prep = global.nebulaPcaPrepareForReportCapture;
                if (typeof prep === 'function') {
                    Promise.resolve(prep())
                        .then(function () {
                            if (typeof global.requestAnimationFrame === 'function') {
                                global.requestAnimationFrame(function () {
                                    setTimeout(runCapture, 0);
                                });
                            } else {
                                setTimeout(runCapture, 50);
                            }
                        })
                        .catch(runCapture);
                } else {
                    runCapture();
                }
            });
        });
        pca2dCaptureChain = next.catch(function () {
            return null;
        });
        return next;
    }

    /** PCA 3D D3: show 3D panel then rasterize SVG (PNG fallback). */
    function capturePca3dSvgHost(hostId) {
        var next = pca3dCaptureChain.then(function () {
            return new Promise(function (resolve) {
                function runCapture() {
                    captureSvgHost(hostId).then(resolve);
                }
                var prep = global.nebulaPcaPrepareForReportCapture3d;
                if (typeof prep === 'function') {
                    Promise.resolve(prep())
                        .then(function () {
                            if (typeof global.requestAnimationFrame === 'function') {
                                global.requestAnimationFrame(function () {
                                    setTimeout(runCapture, 0);
                                });
                            } else {
                                setTimeout(runCapture, 50);
                            }
                        })
                        .catch(runCapture);
                } else {
                    runCapture();
                }
            });
        });
        pca3dCaptureChain = next.catch(function () {
            return null;
        });
        return next;
    }

    function loadPca3dEmbedScriptSync() {
        if (pca3dEmbedScriptCache) return pca3dEmbedScriptCache;
        if (global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__) {
            pca3dEmbedScriptCache = global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__;
            return pca3dEmbedScriptCache;
        }
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', PCA3D_EMBED_SCRIPT_URL, false);
            xhr.send(null);
            if (xhr.status === 200 && xhr.responseText) {
                pca3dEmbedScriptCache = xhr.responseText;
                global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__ = xhr.responseText;
                return pca3dEmbedScriptCache;
            }
        } catch (eSync) { /* ignore */ }
        return null;
    }

    function loadPca3dEmbedScriptText() {
        if (pca3dEmbedScriptCache) return Promise.resolve(pca3dEmbedScriptCache);
        if (global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__) {
            pca3dEmbedScriptCache = global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__;
            return Promise.resolve(pca3dEmbedScriptCache);
        }
        if (typeof fetch !== 'function') return Promise.resolve(null);
        return fetch(PCA3D_EMBED_SCRIPT_URL, { cache: 'no-cache' })
            .then(function (r) {
                if (!r.ok) throw new Error('fetch failed');
                return r.text();
            })
            .then(function (t) {
                if (t) {
                    pca3dEmbedScriptCache = t;
                    global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__ = t;
                }
                return t || null;
            })
            .catch(function () {
                return null;
            });
    }

    /** Wait briefly for async preload before falling back to static SVG. */
    function loadPca3dEmbedScriptTextForReport() {
        return loadPca3dEmbedScriptText().then(function (t) {
            if (t) return t;
            return new Promise(function (resolve) {
                var elapsed = 0;
                var step = 80;
                var maxWait = 2400;
                function poll() {
                    if (pca3dEmbedScriptCache || global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__) {
                        pca3dEmbedScriptCache = pca3dEmbedScriptCache || global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__;
                        resolve(pca3dEmbedScriptCache);
                        return;
                    }
                    if (elapsed >= maxWait) {
                        loadPca3dEmbedScriptText().then(resolve);
                        return;
                    }
                    elapsed += step;
                    setTimeout(poll, step);
                }
                poll();
            });
        });
    }

    function pca3dInteractiveFallbackChain() {
        return capturePca3dSvgHost(PCA_3D_REPORT_HOST_ID);
    }

    /** PCA 3D: remount interactive D3 plot in report; PNG only if interactive payload/script fails. */
    function collectPca3dInteractiveForReport() {
        return new Promise(function (resolve) {
            var prep = global.nebulaPcaPrepareForReportCapture3d;
            function finishInteractive(payload, scriptText) {
                var embedReady = !!(global.NebulaPca3dReportEmbed && typeof global.NebulaPca3dReportEmbed.mount === 'function');
                if (!scriptText) {
                    scriptText = loadPca3dEmbedScriptSync() || pca3dEmbedScriptCache || global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__ || null;
                }
                if (!embedReady && !scriptText) {
                    resolve({
                        kind: 'skip',
                        reason: 'PCA 3D interactive embed script could not be loaded (serve over http://localhost and hard-refresh)'
                    });
                    return;
                }
                resolve({
                    kind: 'pca3d_interactive',
                    payload: payload,
                    embedScript: scriptText || null,
                    embedVersion: PCA3D_EMBED_VERSION
                });
            }
            function runBuild() {
                var build = global.nebulaPcaBuild3dInteractiveEmbedForReport;
                if (typeof build !== 'function') {
                    pca3dInteractiveFallbackChain().then(resolve);
                    return;
                }
                var payload;
                try {
                    payload = build();
                } catch (eBuild) {
                    pca3dInteractiveFallbackChain().then(resolve);
                    return;
                }
                if (!payload || !payload.points || !payload.points.length) {
                    pca3dInteractiveFallbackChain().then(resolve);
                    return;
                }
                var probe = '';
                try {
                    probe = JSON.stringify(payload);
                } catch (eJson) {
                    pca3dInteractiveFallbackChain().then(resolve);
                    return;
                }
                if (!probe || probe.length > PCA3D_INTERACTIVE_JSON_MAX_CHARS) {
                    pca3dInteractiveFallbackChain().then(resolve);
                    return;
                }
                var embedReady = !!(global.NebulaPca3dReportEmbed && typeof global.NebulaPca3dReportEmbed.mount === 'function');
                if (embedReady) {
                    finishInteractive(
                        payload,
                        loadPca3dEmbedScriptSync() || pca3dEmbedScriptCache || global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__ || null
                    );
                    return;
                }
                var syncScript = loadPca3dEmbedScriptSync();
                if (syncScript) {
                    finishInteractive(payload, syncScript);
                    return;
                }
                loadPca3dEmbedScriptTextForReport().then(function (scriptText) {
                    if (scriptText) finishInteractive(payload, scriptText);
                    else pca3dInteractiveFallbackChain().then(resolve);
                });
            }
            if (typeof prep === 'function') {
                Promise.resolve(prep()).then(runBuild).catch(runBuild);
            } else {
                runBuild();
            }
        });
    }

    function collectPcoa2dPlotlyForReport() {
        return new Promise(function (resolve) {
            var prep = global.nebulaPcoaPrepareForReportCapture;
            function runBuild() {
                var build = global.nebulaPcoaBuild2dPlotlyEmbedForReport;
                if (typeof build !== 'function') {
                    captureSvgHostAsEmbed('pcoaPlot').then(resolve);
                    return;
                }
                var payload;
                try {
                    payload = build();
                } catch (eBuild) {
                    captureSvgHostAsEmbed('pcoaPlot').then(resolve);
                    return;
                }
                if (!payload || !payload.data || !payload.data.length) {
                    captureSvgHostAsEmbed('pcoaPlot').then(resolve);
                    return;
                }
                serializePlotlyPayloadForEmbed(payload.data, payload.layout, payload.config, 'pcoaPlot', null)
                    .then(function (emb) {
                        if (emb && emb.kind === 'plotly_embed') resolve(emb);
                        else captureSvgHostAsEmbed('pcoaPlot').then(resolve);
                    })
                    .catch(function () {
                        captureSvgHostAsEmbed('pcoaPlot').then(resolve);
                    });
            }
            if (typeof prep === 'function') {
                Promise.resolve(prep()).then(runBuild).catch(runBuild);
            } else {
                runBuild();
            }
        });
    }

    function collectPcoa3dInteractiveForReport() {
        return new Promise(function (resolve) {
            var prep = global.nebulaPcoaPrepareForReportCapture3d;
            function finishInteractive(payload, scriptText) {
                var embedReady = !!(global.NebulaPca3dReportEmbed && typeof global.NebulaPca3dReportEmbed.mount === 'function');
                if (!scriptText) {
                    scriptText = loadPca3dEmbedScriptSync() || pca3dEmbedScriptCache || global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__ || null;
                }
                if (!embedReady && !scriptText) {
                    captureSvgHostAsEmbed('pcoaPlot3d').then(resolve);
                    return;
                }
                resolve({
                    kind: 'pca3d_interactive',
                    payload: payload,
                    embedScript: scriptText || null,
                    embedVersion: PCA3D_EMBED_VERSION
                });
            }
            function runBuild() {
                var build = global.nebulaPcoaBuild3dInteractiveEmbedForReport;
                if (typeof build !== 'function') {
                    captureSvgHostAsEmbed('pcoaPlot3d').then(resolve);
                    return;
                }
                var payload;
                try {
                    payload = build();
                } catch (eBuild) {
                    captureSvgHostAsEmbed('pcoaPlot3d').then(resolve);
                    return;
                }
                if (!payload || !payload.points || !payload.points.length) {
                    captureSvgHostAsEmbed('pcoaPlot3d').then(resolve);
                    return;
                }
                var probe = '';
                try {
                    probe = JSON.stringify(payload);
                } catch (eJson) {
                    captureSvgHostAsEmbed('pcoaPlot3d').then(resolve);
                    return;
                }
                if (!probe || probe.length > PCA3D_INTERACTIVE_JSON_MAX_CHARS) {
                    captureSvgHostAsEmbed('pcoaPlot3d').then(resolve);
                    return;
                }
                var embedReady = !!(global.NebulaPca3dReportEmbed && typeof global.NebulaPca3dReportEmbed.mount === 'function');
                if (embedReady) {
                    finishInteractive(payload, loadPca3dEmbedScriptSync() || pca3dEmbedScriptCache || global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__ || null);
                    return;
                }
                var syncScript = loadPca3dEmbedScriptSync();
                if (syncScript) {
                    finishInteractive(payload, syncScript);
                    return;
                }
                loadPca3dEmbedScriptTextForReport().then(function (scriptText) {
                    if (scriptText) finishInteractive(payload, scriptText);
                    else captureSvgHostAsEmbed('pcoaPlot3d').then(resolve);
                });
            }
            if (typeof prep === 'function') {
                Promise.resolve(prep()).then(runBuild).catch(runBuild);
            } else {
                runBuild();
            }
        });
    }

    function captureSvgHostAsEmbed(hostId) {
        return new Promise(function (resolve) {
            var host = document.getElementById(hostId);
            if (!host) {
                resolve({ kind: 'skip', reason: 'Host not found: ' + hostId });
                return;
            }
            var svg = host.querySelector('svg');
            if (!svg) {
                resolve({ kind: 'skip', reason: 'No SVG in #' + hostId });
                return;
            }
            var prep = attachOffscreenSvgClone(svg);
            var ser = serializeSvgElementForEmbed(prep.target);
            prep.cleanup();
            if (!ser || !ser.markup) {
                resolve({ kind: 'skip', reason: 'SVG clone failed for #' + hostId });
                return;
            }
            resolve({
                kind: 'svg_embed',
                svgMarkup: ser.markup,
                cssWidth: ser.cssWidth,
                cssHeight: ser.cssHeight
            });
        });
    }

    function captureSvgHost(hostId) {
        return new Promise(function (resolve) {
            var host = document.getElementById(hostId);
            if (!host) {
                resolve({ kind: 'skip', reason: 'Host not found: ' + hostId });
                return;
            }
            var svg = host.querySelector('svg');
            if (!svg) {
                resolve({ kind: 'skip', reason: 'No SVG in #' + hostId + ' (open Data QC → Overall and refresh dashboard)' });
                return;
            }

            var prep = attachOffscreenSvgClone(svg);

            svgToPngDataUrl(prep.target).then(function (png) {
                prep.cleanup();
                if (!png || !png.dataUrl) resolve({ kind: 'skip', reason: 'SVG rasterize failed for #' + hostId });
                else {
                    resolve({
                        kind: 'image',
                        mime: 'image/png',
                        dataUrl: png.dataUrl,
                        cssWidth: png.cssWidth,
                        cssHeight: png.cssHeight
                    });
                }
            });
        });
    }

    function collectSection(def) {
        if (def.capture === 'html' && def.id === 'matrix_meta') {
            return Promise.resolve({ kind: 'html', html: collectMatrixMetaHtml() });
        }
        if (def.capture === 'html_fragment') {
            return Promise.resolve(collectHtmlFragment(def.hostId));
        }
        if (def.capture === 'plotly') {
            return collectPlotlyEmbedForReport(def.plotlyId);
        }
        if (def.capture === 'pca_plotly') {
            return collectPca2dPlotlyForReport();
        }
        if (def.capture === 'pca_3d_interactive') {
            return collectPca3dInteractiveForReport();
        }
        if (def.capture === 'pcoa_plotly') {
            return collectPcoa2dPlotlyForReport();
        }
        if (def.capture === 'pcoa_3d_interactive') {
            return collectPcoa3dInteractiveForReport();
        }
        if (def.capture === 'svg_host') {
            if (isOverallD3ReportHost(def.svgHostId)) {
                return captureOverallD3SvgHost(def.svgHostId);
            }
            if (isPca2dReportHost(def.svgHostId)) {
                return capturePca2dSvgHost(def.svgHostId);
            }
            if (isPca3dReportHost(def.svgHostId)) {
                return capturePca3dSvgHost(def.svgHostId);
            }
            return captureSvgHost(def.svgHostId);
        }
        return Promise.resolve({ kind: 'skip', reason: 'Unknown capture' });
    }

    function runPool(tasks, limit) {
        limit = limit || 3;
        var results = new Array(tasks.length);
        var nextIndex = 0;
        var running = 0;
        return new Promise(function (resolve) {
            if (!tasks.length) {
                resolve(results);
                return;
            }
            function pump() {
                while (running < limit && nextIndex < tasks.length) {
                    /* let: new binding per iteration so .then closures keep the correct index (var would share one slot). */
                    let taskIdx = nextIndex++;
                    running++;
                    tasks[taskIdx]().then(function (r) {
                        results[taskIdx] = r;
                        running--;
                        if (nextIndex >= tasks.length && running === 0) resolve(results);
                        else pump();
                    }).catch(function (e) {
                        results[taskIdx] = { kind: 'skip', reason: e && e.message ? e.message : String(e) };
                        running--;
                        if (nextIndex >= tasks.length && running === 0) resolve(results);
                        else pump();
                    });
                }
            }
            pump();
        });
    }

    /** Fixed layout size for PNG figures so the report matches on-screen chart dimensions (CSS px). */
    function reportRasterImgTagAttrs(body) {
        var w = Number(body.cssWidth);
        var h = Number(body.cssHeight);
        if (!Number.isFinite(w) || w < 1 || !Number.isFinite(h) || h < 1) return '';
        var wi = Math.round(w);
        var hi = Math.round(h);
        return (
            ' width="' +
            wi +
            '" height="' +
            hi +
            '" style="width:' +
            wi +
            'px;height:' +
            hi +
            'px;min-width:' +
            wi +
            'px;max-width:none;display:block;vertical-align:top;image-rendering:-webkit-optimize-contrast;image-rendering:crisp-edges"'
        );
    }

    /** Outer &lt;figure&gt; shell for raster PNG: same width as the captured chart. */
    function rasterFigureShellStyleFromImageBody(body) {
        var w = Number(body.cssWidth);
        if (!Number.isFinite(w) || w < 1) return '';
        var wi = Math.round(w);
        return ' style="display:inline-block;width:' + wi + 'px;min-width:' + wi + 'px;max-width:none;box-sizing:border-box;vertical-align:top"';
    }

    /** Inline host for cloned SVG (fixed layout size matching the Clustering tab). */
    function reportSvgHostInlineStyle(body) {
        var w = Number(body.cssWidth);
        var h = Number(body.cssHeight);
        if (!Number.isFinite(w) || w < 1 || !Number.isFinite(h) || h < 1) return '';
        var wi = Math.round(w);
        var hi = Math.round(h);
        return (
            ' style="width:' +
            wi +
            'px;height:' +
            hi +
            'px;min-width:' +
            wi +
            'px;min-height:' +
            hi +
            'px;max-width:none"'
        );
    }

    function appendPca3dPreviewBootScript(parts, pca3dInteractiveSpecs) {
        if (!pca3dInteractiveSpecs.length) return;
        var pca3dPayloadObj = { v: 1, plots: pca3dInteractiveSpecs };
        var pca3dJsonStr = '';
        try {
            pca3dJsonStr = JSON.stringify(pca3dPayloadObj);
        } catch (eP3dJson) {
            pca3dJsonStr = '';
        }
        var b64P3d = pca3dJsonStr ? utf8ToBase64(pca3dJsonStr) : '';
        if (!b64P3d) return;
        var bootPreviewP3d =
            '(function(){var P=' +
            JSON.stringify(b64P3d) +
            ';var tries=0;var MAX=150;' +
            'function u8(d){try{return decodeURIComponent(escape(atob(d)))}catch(e){return null}}' +
            'function mountAll(d3mod){var par=window.parent||window;var embed=par.NebulaPca3dReportEmbed;if(!d3mod||!embed||typeof embed.mount!=="function")return;' +
            'var j=u8(P);if(!j)return;var o;try{o=JSON.parse(j)}catch(e){return}' +
            'var L=o&&o.plots?o.plots:[];for(var i=0;i<L.length;i++){var p=L[i],el=document.getElementById(p.id);' +
            'if(el&&p.payload){try{embed.mount(el,p.payload,d3mod);}catch(err){el.setAttribute("data-nebula-pca3d-failed","1");}}}' +
            '}' +
            'function run(){tries++;var par=window.parent||window;' +
            'if(!par.NebulaPca3dReportEmbed||typeof par.NebulaPca3dReportEmbed.mount!=="function"){if(tries<MAX){setTimeout(run,80);return;}return;}' +
            'if(par.__d3ForPca){mountAll(par.__d3ForPca);return;}' +
            'if(typeof par.ensureD3ForPca==="function"){par.ensureD3ForPca().then(mountAll).catch(function(){if(par.d3)mountAll(par.d3);else if(tries<MAX)setTimeout(run,80);});return;}' +
            'if(par.d3){mountAll(par.d3);return;}' +
            'if(tries<MAX)setTimeout(run,80);}' +
            'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run);else run();})();';
        parts.push('<script>' + bootPreviewP3d + '<\/script>');
        return b64P3d;
    }

    /** Self-contained PCA 3D boot inside iframe (D3 CDN + inlined embed script). Used when parent mount is unavailable. */
    function appendPca3dSelfContainedBoot(parts, pca3dInteractiveSpecs) {
        if (!pca3dInteractiveSpecs.length) return false;
        var scriptText = loadPca3dEmbedScriptSync() || pca3dEmbedScriptCache || global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__ || '';
        if (!scriptText) return false;
        var pca3dJsonStr = '';
        try {
            pca3dJsonStr = JSON.stringify({ v: 1, plots: pca3dInteractiveSpecs });
        } catch (eJson) {
            return false;
        }
        var b64P3d = pca3dJsonStr ? utf8ToBase64(pca3dJsonStr) : '';
        if (!b64P3d) return false;
        parts.push('<script src="' + D3_CDN_URL + '"><\/script>');
        parts.push('<script>' + scriptText + '<\/script>');
        var bootP3d =
            '(function(){var P=' +
            JSON.stringify(b64P3d) +
            ';var tries=0;var MAX=120;' +
            'function u8(d){try{return decodeURIComponent(escape(atob(d)))}catch(e){return null}}' +
            'function run(){tries++;' +
            'if(typeof d3==="undefined"||!window.NebulaPca3dReportEmbed){if(tries<MAX){setTimeout(run,80);return;}return;}' +
            'var j=u8(P);if(!j)return;var o;try{o=JSON.parse(j)}catch(e){return}' +
            'var L=o&&o.plots?o.plots:[];for(var i=0;i<L.length;i++){var p=L[i],el=document.getElementById(p.id);' +
            'if(el&&p.payload){try{NebulaPca3dReportEmbed.mount(el,p.payload,d3);}catch(err){el.setAttribute("data-nebula-pca3d-failed","1");}}}' +
            '}' +
            'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run);else run();})();';
        parts.push('<script>' + bootP3d + '<\/script>');
        return true;
    }

    function applyExportStyleString(el, styleStr) {
        if (!el || !styleStr) return;
        var s = String(styleStr).trim();
        if (!s) return;
        if (s.indexOf('style=') === 0) {
            s = s.slice(5).trim();
            if ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
                (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'")) {
                s = s.slice(1, -1);
            }
        }
        el.setAttribute('style', s);
    }

    function createPreviewCaptionEditor(sectionId, captionText, title) {
        var wrap = document.createElement('div');
        wrap.className = 'nebula-report-preview-caption';
        var label = document.createElement('label');
        label.className = 'nebula-report-cap-label';
        label.setAttribute('for', 'nebula-rcap-' + sectionId);
        label.textContent = 'Figure caption (export)';
        var ta = document.createElement('textarea');
        ta.id = 'nebula-rcap-' + sectionId;
        ta.className = 'nebula-report-caption-edit';
        ta.rows = 3;
        ta.setAttribute('data-nebula-section', sectionId);
        if (title) ta.title = title;
        ta.value = captionText == null ? '' : String(captionText);
        ta.addEventListener('input', function () {
            global.nebulaReportPreviewCaptionInput(sectionId, ta.value);
        });
        wrap.appendChild(label);
        wrap.appendChild(ta);
        return wrap;
    }

    function mountReportPreviewInteractives(pendingPlotly, pendingPca3d) {
        var pi;
        if (pendingPlotly && pendingPlotly.length && typeof global.Plotly !== 'undefined') {
            for (pi = 0; pi < pendingPlotly.length; pi++) {
                var pl = pendingPlotly[pi];
                if (!pl.host) continue;
                try {
                    global.Plotly.newPlot(pl.host, pl.data, pl.layout || {}, pl.config || {});
                } catch (ePl) {
                    pl.host.innerHTML = '<p class="nebula-report-muted">Plotly mount failed: ' + escapeHtml(String(ePl && ePl.message ? ePl.message : ePl)) + '</p>';
                }
            }
        }
        if (!pendingPca3d || !pendingPca3d.length || !global.NebulaPca3dReportEmbed) return;
        function mountPca3dAll(d3mod) {
            if (!d3mod) return;
            for (pi = 0; pi < pendingPca3d.length; pi++) {
                var p3 = pendingPca3d[pi];
                if (!p3.host || !p3.payload) continue;
                try {
                    global.NebulaPca3dReportEmbed.mount(p3.host, p3.payload, d3mod);
                } catch (e3d) {
                    p3.host.innerHTML = '<p class="nebula-report-muted">PCA 3D mount failed: ' + escapeHtml(String(e3d && e3d.message ? e3d.message : e3d)) + '</p>';
                }
            }
        }
        if (global.__d3ForPca) {
            mountPca3dAll(global.__d3ForPca);
            return;
        }
        if (typeof global.ensureD3ForPca === 'function') {
            global.ensureD3ForPca().then(mountPca3dAll).catch(function () {
                if (typeof global.d3 !== 'undefined') mountPca3dAll(global.d3);
            });
            return;
        }
        import('https://cdn.jsdelivr.net/npm/d3@7/+esm').then(mountPca3dAll).catch(function () {
            if (typeof global.d3 !== 'undefined') mountPca3dAll(global.d3);
        });
    }

    /**
     * Render report preview directly in the app DOM (no iframe). Same mount path as Clustering for Plotly + PCA 3D.
     * @param {HTMLElement|null|undefined} root
     * @param {{ sectionId: string, title: string, body: object }[]} blocks
     * @param {{ generatedAt: string, appVersion?: string }} meta
     */
    function renderReportPreviewInDom(root, blocks, meta) {
        if (!root) return;
        root.innerHTML = '';
        root.style.display = 'block';
        meta = meta || { generatedAt: '', appVersion: '' };

        var h1 = document.createElement('h1');
        h1.className = 'nebula-report-preview-title';
        h1.textContent = 'Nebula report';
        root.appendChild(h1);

        var metaP = document.createElement('p');
        metaP.className = 'nebula-report-muted';
        metaP.textContent = 'Generated ' + (meta.generatedAt || '') + ' · ' + (meta.appVersion || '');
        root.appendChild(metaP);

        var pendingPlotly = [];
        var pendingPca3d = [];
        var b;
        for (b = 0; b < blocks.length; b++) {
            var blk = blocks[b];
            var h2 = document.createElement('h2');
            h2.className = 'nebula-report-preview-section-title';
            h2.textContent = blk.title || blk.sectionId || '';
            root.appendChild(h2);

            var body = blk.body || { kind: 'skip' };
            if (body.kind === 'html') {
                var htmlWrap = document.createElement('div');
                htmlWrap.className = 'nebula-report-fragment';
                htmlWrap.innerHTML = body.html || '';
                root.appendChild(htmlWrap);
            } else if (body.kind === 'plotly_embed') {
                var capP = blk.sectionId
                    ? getFigureCaptionForExport(blk.sectionId, blk.title)
                    : (blk.caption != null && String(blk.caption).trim() !== '' ? String(blk.caption).trim() : blk.title);
                var plotFig = document.createElement('figure');
                plotFig.className = 'nebula-report-figure nebula-report-figure--preview nebula-report-figure--plotly';
                plotFig.setAttribute('data-nebula-section', blk.sectionId || '');
                applyExportStyleString(plotFig, plotlyFigureShellStyleFromLayout(body.layout));
                var plotHost = document.createElement('div');
                plotHost.className = 'nebula-report-plotly-host';
                applyExportStyleString(plotHost, plotlyHostInlineStyleFromLayout(body.layout));
                plotFig.appendChild(plotHost);
                plotFig.appendChild(createPreviewCaptionEditor(
                    blk.sectionId,
                    capP,
                    'This text becomes the figcaption in the downloaded HTML. The Plotly view is frozen from when the report was built.'
                ));
                root.appendChild(plotFig);
                pendingPlotly.push({
                    host: plotHost,
                    data: body.data,
                    layout: body.layout,
                    config: body.config || {}
                });
            } else if (body.kind === 'pca3d_interactive') {
                var cap3d = blk.sectionId
                    ? getFigureCaptionForExport(blk.sectionId, blk.title)
                    : (blk.caption != null && String(blk.caption).trim() !== '' ? String(blk.caption).trim() : blk.title);
                var fig3d = document.createElement('figure');
                fig3d.className = 'nebula-report-figure nebula-report-figure--preview nebula-report-figure--pca3d';
                fig3d.setAttribute('data-nebula-section', blk.sectionId || '');
                applyExportStyleString(fig3d, rasterFigureShellStyleFromImageBody({
                    cssWidth: body.payload && body.payload.width,
                    cssHeight: body.payload && body.payload.height
                }));
                var host3d = document.createElement('div');
                host3d.className = 'nebula-report-pca3d-host';
                applyExportStyleString(host3d, reportSvgHostInlineStyle({
                    cssWidth: body.payload && body.payload.width,
                    cssHeight: body.payload && body.payload.height
                }));
                fig3d.appendChild(host3d);
                var hint3d = document.createElement('p');
                hint3d.className = 'nebula-report-pca3d-hint';
                hint3d.textContent = 'Interactive D3 — drag plot area to rotate, wheel to zoom (legend on the right).';
                fig3d.appendChild(hint3d);
                fig3d.appendChild(createPreviewCaptionEditor(
                    blk.sectionId,
                    cap3d,
                    'Interactive D3 PCA 3D (rotate, zoom, legend) — same as Clustering tab at export.'
                ));
                root.appendChild(fig3d);
                pendingPca3d.push({ host: host3d, payload: body.payload });
            } else if (body.kind === 'svg_embed') {
                var capSvg = blk.sectionId
                    ? getFigureCaptionForExport(blk.sectionId, blk.title)
                    : (blk.caption != null && String(blk.caption).trim() !== '' ? String(blk.caption).trim() : blk.title);
                var figSvg = document.createElement('figure');
                figSvg.className = 'nebula-report-figure nebula-report-figure--preview nebula-report-figure--svg';
                figSvg.setAttribute('data-nebula-section', blk.sectionId || '');
                applyExportStyleString(figSvg, rasterFigureShellStyleFromImageBody(body));
                var svgHost = document.createElement('div');
                svgHost.className = 'nebula-report-svg-host';
                applyExportStyleString(svgHost, reportSvgHostInlineStyle(body));
                svgHost.innerHTML = body.svgMarkup || '';
                figSvg.appendChild(svgHost);
                figSvg.appendChild(createPreviewCaptionEditor(blk.sectionId, capSvg, 'Exact SVG copy at export time.'));
                var staticNote = document.createElement('p');
                staticNote.className = 'nebula-report-pca3d-static-note';
                staticNote.textContent = 'Static snapshot — rotation/zoom unavailable.';
                figSvg.appendChild(staticNote);
                root.appendChild(figSvg);
            } else if (body.kind === 'image') {
                var capImg = blk.sectionId
                    ? getFigureCaptionForExport(blk.sectionId, blk.title)
                    : (blk.caption != null && String(blk.caption).trim() !== '' ? String(blk.caption).trim() : blk.title);
                var figImg = document.createElement('figure');
                figImg.className = 'nebula-report-figure nebula-report-figure--preview nebula-report-figure--raster';
                figImg.setAttribute('data-nebula-section', blk.sectionId || '');
                applyExportStyleString(figImg, rasterFigureShellStyleFromImageBody(body));
                var img = document.createElement('img');
                img.src = body.dataUrl || '';
                img.alt = blk.title || '';
                applyExportStyleString(img, reportRasterImgTagAttrs(body));
                figImg.appendChild(img);
                figImg.appendChild(createPreviewCaptionEditor(blk.sectionId, capImg, 'Shown as figcaption in downloaded HTML.'));
                if (blk.sectionId === 'pca_3d') {
                    var pngNote = document.createElement('p');
                    pngNote.className = 'nebula-report-pca3d-static-note';
                    pngNote.textContent = 'Static PNG snapshot — interactive capture failed. Hard-refresh and regenerate report.';
                    figImg.appendChild(pngNote);
                }
                root.appendChild(figImg);
            } else {
                var skipP = document.createElement('p');
                skipP.className = 'nebula-report-muted';
                skipP.textContent = body.reason || 'Skipped';
                root.appendChild(skipP);
            }
        }

        mountReportPreviewInteractives(pendingPlotly, pendingPca3d);
    }

    function clearReportPreviewRoot(root) {
        if (!root) return;
        root.innerHTML = '';
        root.style.display = 'none';
    }

    function buildHtmlDocument(blocks, meta, buildOpts) {
        buildOpts = buildOpts || {};
        var previewEd = !!buildOpts.previewCaptionEditors;
        var title = 'Nebula report';
        var styleParts = [
            'body{font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:24px;color:#1f2937;background:#fff;}',
            'h1{font-size:1.35rem;border-bottom:1px solid #e5e7eb;padding-bottom:8px;}',
            'h2{font-size:1.05rem;margin-top:28px;color:#374151;}',
            '.nebula-report-subh{font-size:1rem;margin:20px 0 8px;color:#1f2937;border-bottom:1px solid #e5e7eb;padding-bottom:4px;}',
            '.nebula-report-subh2{font-size:0.92rem;margin:14px 0 6px;color:#374151;}',
            '.nebula-report-small,.nebula-report-meta-hint{font-size:0.88rem;line-height:1.45;color:#4b5563;margin:6px 0;}',
            '.nebula-report-muted{color:#6b7280;font-size:0.95rem;}',
            '.nebula-report-table{border-collapse:collapse;margin:8px 0;}',
            '.nebula-report-table th,.nebula-report-table td{border:1px solid #e5e7eb;padding:6px 10px;text-align:left;}',
            '.nebula-report-table th{background:#f3f4f6;width:200px;}',
            '.nebula-report-matrix-table{font-size:0.8rem;}',
            '.nebula-report-matrix-table th{background:#eef2ff;}',
            '.nebula-report-matrix-table td{vertical-align:top;word-break:break-word;}',
            'figure{margin:12px 0;padding:8px;border:1px solid #e5e7eb;border-radius:6px;background:#fafafa;}',
            'figure.nebula-report-figure--plotly{margin:16px 0;padding:0;border:0;background:#fff;border-radius:0;display:inline-block;max-width:none;}',
            'figure.nebula-report-figure--raster{margin:16px 0;padding:0;border:0;background:#fff;border-radius:0;display:inline-block;max-width:none;}',
            'figure.nebula-report-figure--raster img{max-width:none;}',
            'figure.nebula-report-figure--svg{margin:16px 0;padding:0;border:0;background:#fff;border-radius:0;display:inline-block;max-width:none;}',
            'figure.nebula-report-figure--pca3d{margin:16px 0;padding:0;border:0;background:#fff;border-radius:0;display:inline-block;max-width:none;}',
            '.nebula-report-svg-host{line-height:0;overflow:hidden;background:#fff;box-sizing:border-box;}',
            '.nebula-report-svg-host svg{display:block;max-width:none;}',
            '.nebula-report-pca3d-host svg{display:block;max-width:none;}',
            '.nebula-report-pca3d-host{line-height:0;overflow:hidden;background:#fff;box-sizing:border-box;position:relative;}',
            '.nebula-report-pca3d-hint{font-size:0.82rem;color:#4338ca;margin:4px 0 0;padding:0;}',
            '.nebula-report-pca3d-static-note{font-size:0.82rem;color:#b45309;margin:4px 0 0;}',
            '.nebula-pca3d-tooltip{position:fixed;z-index:99999;pointer-events:none;background:rgba(17,24,39,0.95);color:#f8fafc;border:1px solid rgba(99,102,241,0.35);border-radius:6px;padding:8px 10px;font-size:12px;line-height:1.35;max-width:min(420px,45vw);box-shadow:0 8px 24px rgba(2,6,23,0.35);display:none;white-space:normal;}',
            'figcaption{font-size:0.85rem;color:#4b5563;margin-top:6px;white-space:pre-wrap;}',
            'img{max-width:100%;height:auto;}',
            '.nebula-report-fragment{font-size:0.9rem;}',
            '.dq-overall-pill{display:inline-block;margin:4px 8px 4px 0;padding:4px 10px;background:#eef2ff;border-radius:999px;font-size:0.88rem;}',
            '.nebula-report-figure--plotly .nebula-report-plotly-host{min-height:0;max-width:none;box-sizing:border-box;}'
        ];
        if (previewEd) {
            styleParts.push(
                '.nebula-report-figure--preview{margin:12px 0;padding:10px;border:1px solid #d1d5db;border-radius:8px;background:#fff;}',
                '.nebula-report-figure--preview.nebula-report-figure--plotly,.nebula-report-figure--preview.nebula-report-figure--raster,.nebula-report-figure--preview.nebula-report-figure--svg,.nebula-report-figure--preview.nebula-report-figure--pca3d{max-width:none;}',
                '.nebula-report-preview-caption{margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb;}',
                '.nebula-report-cap-label{display:block;font-size:0.78rem;font-weight:600;color:#374151;margin-bottom:4px;}',
                '.nebula-report-caption-edit{width:100%;box-sizing:border-box;font-size:0.82rem;line-height:1.4;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-family:inherit;resize:vertical;min-height:4.5em;}'
            );
        }
        var style = styleParts.join('');
        var parts = [
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>', escapeHtml(title), '</title><style>', style, '</style></head><body>',
            '<h1>', escapeHtml(title), '</h1>',
            '<p class="nebula-report-muted">Generated ', escapeHtml(meta.generatedAt), ' · ', escapeHtml(meta.appVersion || ''), '</p>'
        ];
        var plotlyEmbedSpecs = [];
        var pca3dInteractiveSpecs = [];
        var pca3dEmbedScriptOnce = '';
        for (var b = 0; b < blocks.length; b++) {
            var blk = blocks[b];
            parts.push('<h2>', escapeHtml(blk.title), '</h2>');
            if (blk.body.kind === 'html') {
                parts.push(blk.body.html);
            } else if (blk.body.kind === 'plotly_embed') {
                var capP = blk.sectionId
                    ? getFigureCaptionForExport(blk.sectionId, blk.title)
                    : (blk.caption != null && String(blk.caption).trim() !== '' ? String(blk.caption).trim() : blk.title);
                var plotDomId = 'nebula-report-plot-' + blk.sectionId;
                var hostDimStyle = plotlyHostInlineStyleFromLayout(blk.body.layout);
                var plotFigShell = plotlyFigureShellStyleFromLayout(blk.body.layout);
                plotlyEmbedSpecs.push({
                    id: plotDomId,
                    data: blk.body.data,
                    layout: blk.body.layout,
                    config: blk.body.config || {}
                });
                if (previewEd && blk.sectionId) {
                    parts.push(
                        '<figure class="nebula-report-figure nebula-report-figure--preview nebula-report-figure--plotly" data-nebula-section="',
                        escapeHtml(blk.sectionId),
                        '"',
                        plotFigShell,
                        '><div id="', escapeHtml(plotDomId), '" class="nebula-report-plotly-host"', hostDimStyle, '></div><div class="nebula-report-preview-caption"><label for="nebula-rcap-',
                        escapeHtml(blk.sectionId),
                        '" class="nebula-report-cap-label">Figure caption (export)</label><textarea id="nebula-rcap-',
                        escapeHtml(blk.sectionId),
                        '" class="nebula-report-caption-edit" rows="3" data-nebula-section="',
                        escapeHtml(blk.sectionId),
                        '" title="This text becomes the figcaption in the downloaded HTML. The Plotly view (zoom, pan, ranges) is frozen from when the report was built.">',
                        escapeHtml(capP),
                        '</textarea></div></figure>'
                    );
                } else {
                    parts.push(
                        '<figure class="nebula-report-figure nebula-report-figure--plotly"',
                        plotFigShell,
                        '><div id="',
                        escapeHtml(plotDomId),
                        '" class="nebula-report-plotly-host"',
                        hostDimStyle,
                        '></div><figcaption>',
                        escapeHtml(capP),
                        '</figcaption></figure>'
                    );
                }
            } else if (blk.body.kind === 'pca3d_interactive') {
                var cap3d = blk.sectionId
                    ? getFigureCaptionForExport(blk.sectionId, blk.title)
                    : (blk.caption != null && String(blk.caption).trim() !== '' ? String(blk.caption).trim() : blk.title);
                var host3dId = 'nebula-report-pca3d-' + blk.sectionId;
                var host3dStyle = reportSvgHostInlineStyle({
                    cssWidth: blk.body.payload && blk.body.payload.width,
                    cssHeight: blk.body.payload && blk.body.payload.height
                });
                var fig3dShell = rasterFigureShellStyleFromImageBody({
                    cssWidth: blk.body.payload && blk.body.payload.width,
                    cssHeight: blk.body.payload && blk.body.payload.height
                });
                if (blk.body.embedScript && !pca3dEmbedScriptOnce) {
                    pca3dEmbedScriptOnce = blk.body.embedScript;
                }
                pca3dInteractiveSpecs.push({
                    id: host3dId,
                    payload: blk.body.payload
                });
                if (previewEd && blk.sectionId) {
                    parts.push(
                        '<figure class="nebula-report-figure nebula-report-figure--preview nebula-report-figure--pca3d" data-nebula-section="',
                        escapeHtml(blk.sectionId),
                        '"',
                        fig3dShell,
                        '><div id="',
                        escapeHtml(host3dId),
                        '" class="nebula-report-pca3d-host"',
                        host3dStyle,
                        '></div><p class="nebula-report-pca3d-hint">Interactive D3 — drag plot area to rotate, wheel to zoom (legend on the right).</p><div class="nebula-report-preview-caption"><label for="nebula-rcap-',
                        escapeHtml(blk.sectionId),
                        '" class="nebula-report-cap-label">Figure caption (export)</label><textarea id="nebula-rcap-',
                        escapeHtml(blk.sectionId),
                        '" class="nebula-report-caption-edit" rows="3" data-nebula-section="',
                        escapeHtml(blk.sectionId),
                        '" title="Interactive D3 PCA 3D (rotate, zoom, legend) — same as Clustering tab at export.">',
                        escapeHtml(cap3d),
                        '</textarea></div></figure>'
                    );
                } else {
                    parts.push(
                        '<figure class="nebula-report-figure nebula-report-figure--pca3d"',
                        fig3dShell,
                        '><div id="',
                        escapeHtml(host3dId),
                        '" class="nebula-report-pca3d-host"',
                        host3dStyle,
                        '></div><p class="nebula-report-pca3d-hint">Interactive D3 — drag plot area to rotate, wheel to zoom.</p><figcaption>',
                        escapeHtml(cap3d),
                        '</figcaption></figure>'
                    );
                }
            } else if (blk.body.kind === 'svg_embed') {
                var capSvg = blk.sectionId
                    ? getFigureCaptionForExport(blk.sectionId, blk.title)
                    : (blk.caption != null && String(blk.caption).trim() !== '' ? String(blk.caption).trim() : blk.title);
                var svgHostStyle = reportSvgHostInlineStyle(blk.body);
                var svgFigShell = rasterFigureShellStyleFromImageBody(blk.body);
                if (previewEd && blk.sectionId) {
                    parts.push(
                        '<figure class="nebula-report-figure nebula-report-figure--preview nebula-report-figure--svg" data-nebula-section="',
                        escapeHtml(blk.sectionId),
                        '"',
                        svgFigShell,
                        '><div class="nebula-report-svg-host"',
                        svgHostStyle,
                        '>',
                        blk.body.svgMarkup,
                        '</div><div class="nebula-report-preview-caption"><label for="nebula-rcap-',
                        escapeHtml(blk.sectionId),
                        '" class="nebula-report-cap-label">Figure caption (export)</label><textarea id="nebula-rcap-',
                        escapeHtml(blk.sectionId),
                        '" class="nebula-report-caption-edit" rows="3" data-nebula-section="',
                        escapeHtml(blk.sectionId),
                        '" title="Exact SVG copy of the Clustering 3D plot at export time.">',
                        escapeHtml(capSvg),
                        '</textarea></div><p class="nebula-report-pca3d-static-note">Static snapshot — rotation/zoom unavailable. Regenerate report over http://localhost after hard refresh.</p></figure>'
                    );
                } else {
                    parts.push(
                        '<figure class="nebula-report-figure nebula-report-figure--svg"',
                        svgFigShell,
                        '><div class="nebula-report-svg-host"',
                        svgHostStyle,
                        '>',
                        blk.body.svgMarkup,
                        '</div><p class="nebula-report-pca3d-static-note">Static PCA 3D snapshot (interactive embed unavailable).</p><figcaption>',
                        escapeHtml(capSvg),
                        '</figcaption></figure>'
                    );
                }
            } else if (blk.body.kind === 'image') {
                var cap = blk.sectionId
                    ? getFigureCaptionForExport(blk.sectionId, blk.title)
                    : (blk.caption != null && String(blk.caption).trim() !== '' ? String(blk.caption).trim() : blk.title);
                var imgDim = reportRasterImgTagAttrs(blk.body);
                var rasterFigShell = rasterFigureShellStyleFromImageBody(blk.body);
                if (previewEd && blk.sectionId) {
                    parts.push(
                        '<figure class="nebula-report-figure nebula-report-figure--preview nebula-report-figure--raster" data-nebula-section="',
                        escapeHtml(blk.sectionId),
                        '"',
                        rasterFigShell,
                        '><img src="',
                        blk.body.dataUrl,
                        '" alt="',
                        escapeHtml(blk.title),
                        '"',
                        imgDim,
                        '><div class="nebula-report-preview-caption"><label for="nebula-rcap-',
                        escapeHtml(blk.sectionId),
                        '" class="nebula-report-cap-label">Figure caption (export)</label><textarea id="nebula-rcap-',
                        escapeHtml(blk.sectionId),
                        '" class="nebula-report-caption-edit" rows="3" data-nebula-section="',
                        escapeHtml(blk.sectionId),
                        '" title="Shown as figcaption under this image in the downloaded HTML; clear to use Nebula default.">',
                        escapeHtml(cap),
                        '</textarea></div>',
                        (blk.sectionId === 'pca_3d'
                            ? '<p class="nebula-report-pca3d-static-note">Static PNG snapshot — rotation/zoom unavailable. Hard-refresh and regenerate report (interactive D3 failed to load).</p>'
                            : ''),
                        '</figure>'
                    );
                } else {
                    parts.push(
                        '<figure class="nebula-report-figure nebula-report-figure--raster"',
                        rasterFigShell,
                        '><img src="',
                        blk.body.dataUrl,
                        '" alt="',
                        escapeHtml(blk.title),
                        '"',
                        imgDim,
                        '><figcaption>',
                        escapeHtml(cap),
                        '</figcaption></figure>'
                    );
                }
            } else {
                parts.push('<p class="nebula-report-muted">', escapeHtml(blk.body.reason || 'Skipped'), '</p>');
            }
        }
        var b64P3d = null;
        if (pca3dInteractiveSpecs.length) {
            if (previewEd) {
                if (!appendPca3dSelfContainedBoot(parts, pca3dInteractiveSpecs)) {
                    b64P3d = appendPca3dPreviewBootScript(parts, pca3dInteractiveSpecs);
                } else {
                    b64P3d = true;
                }
            }
            if (!previewEd) {
                if (!pca3dEmbedScriptOnce) {
                    pca3dEmbedScriptOnce = loadPca3dEmbedScriptSync() || pca3dEmbedScriptCache || global.__NEBULA_PCA3D_EMBED_SCRIPT_TEXT__ || '';
                }
            }
        }
        if (pca3dInteractiveSpecs.length && pca3dEmbedScriptOnce && !previewEd) {
            parts.splice(
                3,
                0,
                '<p class="nebula-report-small">The <strong>PCA 3D</strong> figure is an <strong>interactive D3</strong> replica of the Clustering tab (drag to rotate, wheel to zoom, legend and tooltips). It loads D3 from the CDN below.</p>'
            );
            parts.push('<script src="' + D3_CDN_URL + '"><\/script>');
            parts.push('<script>' + pca3dEmbedScriptOnce + '<\/script>');
            if (!b64P3d && pca3dInteractiveSpecs.length) {
                var pca3dPayloadObjExp = { v: 1, plots: pca3dInteractiveSpecs };
                try {
                    b64P3d = utf8ToBase64(JSON.stringify(pca3dPayloadObjExp));
                } catch (eB64) {
                    b64P3d = null;
                }
            }
            if (b64P3d) {
                    var bootP3d =
                        '(function(){var P=' +
                        JSON.stringify(b64P3d) +
                        ';var tries=0;var MAX=120;' +
                        'function u8(d){try{return decodeURIComponent(escape(atob(d)))}catch(e){return null}}' +
                        'function run(){tries++;' +
                        'if(typeof d3==="undefined"||!window.NebulaPca3dReportEmbed){if(tries<MAX){setTimeout(run,80);return;}return;}' +
                        'var j=u8(P);if(!j)return;var o;try{o=JSON.parse(j)}catch(e){return}' +
                        'var L=o&&o.plots?o.plots:[];for(var i=0;i<L.length;i++){var p=L[i],el=document.getElementById(p.id);' +
                        'if(el&&p.payload){NebulaPca3dReportEmbed.mount(el,p.payload,d3);if(el.getAttribute("data-nebula-pca3d-interactive")!=="1"){el.setAttribute("data-nebula-pca3d-failed","1");}}}}' +
                        'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run);else run();})();';
                    parts.push('<script>' + bootP3d + '<\/script>');
            }
        }
        if (plotlyEmbedSpecs.length) {
            parts.splice(
                3,
                0,
                '<p class="nebula-report-small">Plotly figures in this report are <strong>interactive</strong> (zoom, pan, legend). The view matches the app when the report was generated. The page loads Plotly from the CDN URL in the script tag below.</p>'
            );
            var payloadObj = { v: 1, plots: plotlyEmbedSpecs };
            var jsonStr = '';
            try {
                jsonStr = JSON.stringify(payloadObj, plotlyJsonReplacer);
            } catch (ePay) {
                jsonStr = '';
            }
            if (jsonStr) {
                var b64leg = utf8ToBase64(jsonStr);
                if (b64leg) {
                    parts.push('<script src="' + PLOTLY_CDN_URL + '"><\/script>');
                    var boot =
                        '(function(){var P=' +
                        JSON.stringify(b64leg) +
                        ';function u8(d){try{return decodeURIComponent(escape(atob(d)))}catch(e){return null}}' +
                        'function run(){if(typeof Plotly===\'undefined\'){setTimeout(run,60);return;}' +
                        'var j=u8(P);if(!j)return;var o;try{o=JSON.parse(j)}catch(e){return}' +
                        'var L=o&&o.plots?o.plots:[];for(var i=0;i<L.length;i++){var p=L[i],el=document.getElementById(p.id);' +
                        'if(el&&p.data)Plotly.newPlot(el,p.data,p.layout||{},p.config||{});}}' +
                        'if(document.readyState===\'loading\')document.addEventListener(\'DOMContentLoaded\',run);else run();})();';
                    parts.push('<script>' + boot + '<\/script>');
                }
            }
        }
        if (previewEd) {
            parts.push(
                '<script>(function(){function w(){var a=document.querySelectorAll("textarea.nebula-report-caption-edit");for(var i=0;i<a.length;i++){(function(t){t.addEventListener("input",function(){var id=t.getAttribute("data-nebula-section");try{if(window.parent&&window.parent.nebulaReportPreviewCaptionInput)window.parent.nebulaReportPreviewCaptionInput(id,t.value);}catch(e){}});})(a[i]);}}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",w);else w();})();<\/script>'
            );
        }
        parts.push('</body></html>');
        return parts.join('');
    }

    function rebuildExportHtmlSnapshot() {
        if (!lastReportBlocks || !lastReportBlocks.length || !lastReportMeta) return null;
        lastReportHtml = buildHtmlDocument(lastReportBlocks, lastReportMeta, null);
        return lastReportHtml;
    }

    function flushCaptionExportSync() {
        if (captionExportTimer) {
            clearTimeout(captionExportTimer);
            captionExportTimer = null;
        }
        return rebuildExportHtmlSnapshot();
    }

    function scheduleCaptionExportSync() {
        if (captionExportTimer) clearTimeout(captionExportTimer);
        captionExportTimer = setTimeout(function () {
            captionExportTimer = null;
            rebuildExportHtmlSnapshot();
        }, 400);
    }

    function downloadHtml(filename, html) {
        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }

    /** @deprecated Preview no longer uses an iframe; kept for compatibility. */
    function setPreviewIframe(iframe, html) {
        if (!iframe) return;
        try {
            if (iframe._nebulaReportBlobUrl) {
                URL.revokeObjectURL(iframe._nebulaReportBlobUrl);
                iframe._nebulaReportBlobUrl = null;
            }
        } catch (eRev) { /* ignore */ }
        iframe.src = 'about:blank';
    }

    /** @deprecated Preview no longer uses an iframe; kept for compatibility. */
    function clearPreviewIframe(iframe) {
        setPreviewIframe(iframe, '');
    }

    /** Last successful HTML (same bytes as Save would write). */
    var lastReportHtml = null;
    /** Snapshot of last built sections (for caption-only rebuild without re-capturing images). */
    var lastReportBlocks = null;
    var lastReportMeta = null;
    var captionExportTimer = null;
    /** Monotonic counter so stale async preview updates do not overwrite the iframe. */
    var reportPreviewGeneration = 0;
    /** Promise for the in-flight preview refresh (Save waits on this). */
    var currentPreviewPromise = null;

    global.nebulaReportPreviewCaptionInput = function (sectionId, value) {
        if (!sectionId) return;
        global.nebulaReportFigureCaptions = global.nebulaReportFigureCaptions || {};
        var v = value == null ? '' : String(value);
        if (v.trim() === '') delete global.nebulaReportFigureCaptions[sectionId];
        else global.nebulaReportFigureCaptions[sectionId] = v;
        scheduleCaptionExportSync();
    };

    function makeReportFilename() {
        var now = new Date();
        function pad2(n) { return (n < 10 ? '0' : '') + n; }
        return 'nebula_report_' + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) + '_' + pad2(now.getHours()) + pad2(now.getMinutes()) + '.html';
    }

    function getEnabledSectionIdsFromDom(prefix) {
        prefix = prefix || 'reportSec_';
        var out = [];
        for (var i = 0; i < REPORT_SECTIONS.length; i++) {
            var id = prefix + REPORT_SECTIONS[i].id;
            var el = document.getElementById(id);
            if (el && el.type === 'checkbox' && el.checked) out.push(REPORT_SECTIONS[i].id);
        }
        return out;
    }

    /**
     * Rebuild report HTML, update in-app preview DOM, and cache for Save. Does not download.
     * @param {{ enabledIds?: string[], prefix?: string, statusEl?: HTMLElement|null, appVersion?: string, previewRoot?: HTMLElement|null, previewIframe?: HTMLElement|null }} opts
     */
    function refreshReportPreview(opts) {
        opts = opts || {};
        var enabled = opts.enabledIds != null ? opts.enabledIds : getEnabledSectionIdsFromDom(opts.prefix);
        var statusEl = opts.statusEl || null;
        var appVersion = opts.appVersion || '';
        var previewRoot = opts.previewRoot || null;
        var setStatus = function (t, err) {
            if (!statusEl) return;
            statusEl.textContent = t;
            statusEl.className = 'status ' + (err ? 'error' : 'success');
        };

        var gen = ++reportPreviewGeneration;

        var dataGate = global.currentData;
        var matrixGate = getCurrentMatrixForReport();
        if (!dataGate || !Array.isArray(dataGate.columnHeaders) || !dataGate.columnHeaders.length || !matrixGate || !matrixGate.length) {
            lastReportHtml = null;
            lastReportBlocks = null;
            lastReportMeta = null;
            if (previewRoot) clearReportPreviewRoot(previewRoot);
            setStatus('Load a matrix first.', true);
            return Promise.resolve(null);
        }

        var defs = REPORT_SECTIONS.filter(function (d) { return enabled.indexOf(d.id) >= 0; });
        if (!defs.length) {
            lastReportHtml = null;
            lastReportBlocks = null;
            lastReportMeta = null;
            if (previewRoot) clearReportPreviewRoot(previewRoot);
            setStatus('Select at least one section.', true);
            return Promise.resolve(null);
        }

        setStatus('Updating preview…', false);

        var tasks = defs.map(function (d) {
            return function () { return collectSection(d); };
        });

        var p = runPool(tasks, 3).then(function (bodies) {
            if (gen !== reportPreviewGeneration) {
                return lastReportHtml;
            }
            var blocks = [];
            for (var i = 0; i < defs.length; i++) {
                blocks.push({
                    sectionId: defs[i].id,
                    title: defs[i].title,
                    body: bodies[i] || { kind: 'skip', reason: 'No data' }
                });
            }
            var now = new Date();
            lastReportMeta = {
                generatedAt: now.toISOString(),
                appVersion: appVersion || 'Nebula'
            };
            lastReportBlocks = blocks.map(function (b) {
                return { sectionId: b.sectionId, title: b.title, body: b.body };
            });
            lastReportHtml = buildHtmlDocument(blocks, lastReportMeta, null);
            var pca3dKind = 'none';
            for (var bi = 0; bi < blocks.length; bi++) {
                if (blocks[bi].sectionId === 'pca_3d' && blocks[bi].body && blocks[bi].body.kind) {
                    pca3dKind = blocks[bi].body.kind;
                }
            }
            if (previewRoot) {
                renderReportPreviewInDom(previewRoot, blocks, lastReportMeta);
            }
            var statusSuffix = '';
            if (pca3dKind === 'pca3d_interactive') {
                statusSuffix = ' · PCA 3D: interactive';
            } else if (pca3dKind === 'image') {
                statusSuffix = ' · PCA 3D: static PNG fallback (interactive capture failed)';
            } else if (pca3dKind === 'svg_embed') {
                statusSuffix = ' · PCA 3D: static SVG snapshot';
            }
            setStatus('Preview ready (' + blocks.length + ' section(s))' + statusSuffix + '.', false);
            return lastReportHtml;
        }).catch(function (e) {
            if (gen === reportPreviewGeneration) {
                lastReportHtml = null;
                lastReportBlocks = null;
                lastReportMeta = null;
                if (previewRoot) clearReportPreviewRoot(previewRoot);
                setStatus('Preview failed: ' + (e && e.message ? e.message : String(e)), true);
            }
            return null;
        });

        currentPreviewPromise = p;
        return p.finally(function () {
            if (currentPreviewPromise === p) {
                currentPreviewPromise = null;
            }
        });
    }

    /**
     * Download the cached preview HTML. Waits for any in-flight preview refresh to finish.
     * @param {{ statusEl?: HTMLElement|null }} opts
     */
    function saveReport(opts) {
        opts = opts || {};
        var statusEl = opts.statusEl || null;
        var setStatus = function (t, err) {
            if (!statusEl) return;
            statusEl.textContent = t;
            statusEl.className = 'status ' + (err ? 'error' : 'success');
        };
        var wait = currentPreviewPromise || Promise.resolve();
        return wait.then(function () {
            flushCaptionExportSync();
            if (!lastReportHtml) {
                setStatus('Nothing to save: load a matrix and wait for the preview to finish.', true);
                return null;
            }
            var fname = makeReportFilename();
            downloadHtml(fname, lastReportHtml);
            setStatus('Saved ' + fname + '.', false);
            return lastReportHtml;
        });
    }

    /** @deprecated Use refreshReportPreview + saveReport */
    function generateHtmlReport(opts) {
        return refreshReportPreview(opts).then(function (html) {
            if (html) {
                downloadHtml(makeReportFilename(), html);
            }
            return html;
        });
    }

    global.NebulaReport = {
        REPORT_SECTIONS: REPORT_SECTIONS,
        REPORT_SECTIONS_DEFAULT: REPORT_SECTIONS_DEFAULT,
        FIGURE_CAPTION_DEFAULTS: FIGURE_CAPTION_DEFAULTS,
        getDefaultFigureCaption: getDefaultFigureCaption,
        getFigureCaptionForExport: getFigureCaptionForExport,
        getEnabledSectionIdsFromDom: getEnabledSectionIdsFromDom,
        refreshReportPreview: refreshReportPreview,
        saveReport: saveReport,
        generateHtmlReport: generateHtmlReport,
        renderReportPreviewInDom: renderReportPreviewInDom,
        clearReportPreviewRoot: clearReportPreviewRoot,
        setPreviewIframe: setPreviewIframe,
        clearPreviewIframe: clearPreviewIframe,
        downloadHtml: downloadHtml
    };
})(typeof window !== 'undefined' ? window : this);
