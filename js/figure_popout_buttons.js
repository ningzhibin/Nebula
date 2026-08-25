/**
 * Labeled "Pop out" header buttons for every data figure.
 *
 * The app already auto-adds a small pop-out icon to each Plotly figure's modebar
 * (see installPlotlyPopoutButton in index.html). This module complements that by
 * placing a visible, labeled "Pop out" button in a heading row directly ABOVE each
 * figure — the same affordance the Data QC → Overall and UpSet charts already have —
 * so every figure across Data QC, Clustering, and Downstream is consistent.
 *
 * It reuses the global popout helpers defined in index.html:
 *   openPlotlyPopout / openSvgPopout / openImagePopout / openAutoPopout.
 *
 * Placement rules per figure container:
 *   1. If the element directly before it is a `.nebula-graph-headrow`, the button is
 *      inserted there (before any Add to Report / Download CSV / Export CSV button, so
 *      order stays "Pop out" then the others, matching the app convention).
 *   2. Else if the preceding element is a heading (h2–h6), it is wrapped into a headrow.
 *   3. Else a fresh headrow (with the figure's title) is created above the figure —
 *      or, when `headParent`/`headBefore` are given, at a specified location (used for
 *      the Enrichr results heatmap, whose plot fills an overflow:hidden card).
 *
 * Idempotent: safe to call more than once (guards via a data attribute).
 */
(function (global) {
    'use strict';

    // Figures that already ship with a visible Pop out button are intentionally omitted:
    // Data QC → Overall (3), Heatmap + Clustergrammer (sidebar buttons), UpSet/Venn/Karnaugh.
    var FIGURES = [
        // Data QC → Row Profile
        { id: 'rowProfileEmbeddedPlot', type: 'plotly', title: 'Row profile', report: 'row_profile' },
        // Data QC → Column profile
        { id: 'colProfileBarPlot', type: 'plotly', title: 'Ranked intensity' },
        { id: 'colProfileCumPlot', type: 'plotly', title: 'Cumulative % of total' },
        { id: 'colProfileTreePlot', type: 'plotly', title: 'Treemap (top N + Other)' },
        { id: 'colProfilePiePlot', type: 'plotly', title: 'Pie chart (top N + Other)' },
        { id: 'colProfileHistPlot', type: 'plotly', title: 'Intensity distribution (log10)' },
        // Data QC → Column correlation
        { id: 'colCorrScatterMatrixMixed', type: 'plotly', title: 'Scatter-correlation matrix' },
        { id: 'colCorrDistHeatmap', type: 'plotly', title: 'Distance matrix (subset)' },
        { id: 'colCorrScatterPlot', type: 'plotly', title: 'Pair scatter (Y vs X)' },
        { id: 'colCorrQQPlot', type: 'plotly', title: 'QQ plot' },
        { id: 'colCorrBlandPlot', type: 'plotly', title: 'Bland–Altman' },
        { id: 'colCorrRefCorrPlot', type: 'plotly', title: 'Correlation with column X' },
        // Clustering → Heatmap (Plotly; its headrow already has an Add to Report button,
        // so the injector just adds Pop out before it — same layout as the other figures)
        { id: 'heatmapPlot', type: 'plotly', title: 'Clustering — heatmap' },
        // Clustering → PCA (in-app views render as D3/SVG or canvas; popout converts to Plotly for interactivity)
        { id: 'pcaPlot', type: 'auto', title: 'PCA 2D' },
        { id: 'pcaPlot3d', type: 'auto', title: 'PCA 3D' },
        { id: 'pcaDetailsScreePlot', type: 'svg', title: 'Variance explained (scree)', report: 'pca_scree' },
        // Clustering → PCoA
        { id: 'pcoaPlot', type: 'auto', title: 'PCoA 2D' },
        { id: 'pcoaPlot3d', type: 'auto', title: 'PCoA 3D' },
        // Clustering → t-SNE
        { id: 'tsnePlot', type: 'plotly', title: 't-SNE', report: 'tsne' },
        // Clustering → K-means
        { id: 'kmClusterPlot', type: 'plotly', title: 'K-means clusters', report: 'kmeans_clusters' },
        { id: 'kmElbowPlot', type: 'plotly', title: 'Elbow (WCSS vs k)' },
        { id: 'kmSilhouettePlot', type: 'plotly', title: 'Silhouette (mean vs k)' },
        // Downstream → Differential
        { id: 'diffVolcanoPlot', type: 'plotly', title: 'Volcano plot', report: 'diff_volcano' },
        { id: 'diffMaPlot', type: 'plotly', title: 'MA plot', report: 'diff_ma' },
        { id: 'diffPhistPlot', type: 'plotly', title: 'P-value histogram' },
        { id: 'diffGroupHeatmapPlot', type: 'plotly', title: 'Group heatmap', report: 'diff_group_heatmap' },
        // Downstream → SAINT (D3/SVG surfaces)
        { id: 'saintVolcanoPlotSurface', type: 'svg', title: 'SAINT scatter plot', report: 'saint_scatter' },
        { id: 'saintNetworkContainer', type: 'svg', title: 'SAINT bait–prey network', report: 'saint_network' },
        // Downstream → Enrichr
        { id: 'enrichrPlotBar', type: 'plotly', title: 'Enrichr bar chart', report: 'enrichr_bar' },
        { id: 'enrichrPlotBubble', type: 'plotly', title: 'Enrichr bubble plot', report: 'enrichr_bubble' },
        { id: 'enrichrPlotTermSim', type: 'plotly', title: 'Term similarity (Jaccard) heatmap' },
        { id: 'enrichrHeatmapPlot', type: 'plotly', title: 'Enrichr results heatmap', report: 'enrichr_heatmap',
          headParent: '.enrichr-heatmap-main', headBefore: '.enrichr-heatmap-plot-card' }
    ];

    var POPOUT_SVG =
        '<svg class="viz-popout-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
        '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
        '<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

    function fnFor(type) {
        if (type === 'svg') return 'openSvgPopout';
        if (type === 'image') return 'openImagePopout';
        if (type === 'auto') return 'openAutoPopout';
        return 'openPlotlyPopout';
    }

    function buildButton(cfg) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'example-btn viz-popout-btn';
        btn.title = 'Open this figure full-size in a new window';
        btn.innerHTML = POPOUT_SVG + '<span>Pop out</span>';
        var fn = fnFor(cfg.type);
        btn.addEventListener('click', function () {
            var f = global[fn];
            if (typeof f === 'function') f(cfg.id, cfg.title);
            else console.error('Popout helper not available:', fn);
        });
        return btn;
    }

    function buildAddReportButton(sectionId) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'example-btn nebula-add-report-btn';
        btn.title = 'Include this figure in the exported Report (generate it first)';
        btn.textContent = 'Add to Report';
        btn.addEventListener('click', function () {
            if (typeof global.addFigureToReport === 'function') global.addFigureToReport(sectionId);
            else console.error('addFigureToReport not available');
        });
        return btn;
    }

    function makeHeadrow(titleText) {
        var hr = document.createElement('div');
        hr.className = 'nebula-graph-headrow';
        hr.style.padding = '4px 4px 0';
        var h = document.createElement('h4');
        h.className = 'nebula-graph-head-title';
        h.textContent = titleText;
        hr.appendChild(h);
        return hr;
    }

    function resolveHeadrow(cfg, container) {
        var prev = container.previousElementSibling;
        // Case 1: existing headrow immediately above.
        if (prev && prev.classList && prev.classList.contains('nebula-graph-headrow')) return prev;
        // Case 2: a bare heading above — promote it into a headrow.
        if (prev && /^H[2-6]$/.test(prev.tagName)) {
            var hr = document.createElement('div');
            hr.className = 'nebula-graph-headrow';
            container.parentNode.insertBefore(hr, prev);
            if (!prev.classList.contains('nebula-graph-head-title')) prev.classList.add('nebula-graph-head-title');
            hr.appendChild(prev);
            return hr;
        }
        // Case 3: create a fresh headrow, at a custom location if requested.
        var headrow = makeHeadrow(cfg.title);
        if (cfg.headParent) {
            var parent = document.querySelector(cfg.headParent);
            if (parent) {
                var before = cfg.headBefore ? parent.querySelector(cfg.headBefore) : null;
                parent.insertBefore(headrow, before || null);
                return headrow;
            }
        }
        container.parentNode.insertBefore(headrow, container);
        return headrow;
    }

    function injectOne(cfg) {
        var container = document.getElementById(cfg.id);
        if (!container) return; // figure not present in this build/state
        if (container.getAttribute('data-qc-popout-injected') === '1') return;
        var headrow = resolveHeadrow(cfg, container);
        if (!headrow) return;
        container.setAttribute('data-qc-popout-injected', '1');
        var popBtn = headrow.querySelector('.viz-popout-btn');
        if (!popBtn) {
            popBtn = buildButton(cfg);
            // Keep order "Pop out" then Add to Report / Download CSV / Export CSV.
            var ref = headrow.querySelector('.nebula-add-report-btn');
            if (!ref) {
                var btns = headrow.querySelectorAll('button');
                for (var i = 0; i < btns.length; i++) {
                    if (/Add to Report|Download CSV|Export CSV/i.test(btns[i].textContent)) { ref = btns[i]; break; }
                }
            }
            if (ref) headrow.insertBefore(popBtn, ref);
            else headrow.appendChild(popBtn);
        }
        // Optionally add an "Add to Report" button (right after Pop out) for figures wired
        // into the report pipeline that do not already have one.
        if (cfg.report && !headrow.querySelector('.nebula-add-report-btn')) {
            var addBtn = buildAddReportButton(cfg.report);
            if (popBtn && popBtn.parentNode === headrow) {
                headrow.insertBefore(addBtn, popBtn.nextSibling);
            } else {
                headrow.appendChild(addBtn);
            }
        }
    }

    function init() {
        for (var i = 0; i < FIGURES.length; i++) {
            try { injectOne(FIGURES[i]); } catch (e) { console.error('Popout button inject failed for', FIGURES[i] && FIGURES[i].id, e); }
        }
    }

    global.FigurePopoutButtons = { init: init, figures: FIGURES };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}(typeof window !== 'undefined' ? window : this));
