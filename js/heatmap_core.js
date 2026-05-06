/**
 * Heatmap-related constants shared with external scripts.
 * Enrichr → Heatmap sub-tab uses its own Plotly figure in enrichr_plots.js (term × metrics / matrix columns).
 */
(function (global) {
    'use strict';

    global.HeatmapCore = {
        MAIN_PLOT_DIV_ID: 'heatmapPlot'
    };
})(typeof window !== 'undefined' ? window : this);
