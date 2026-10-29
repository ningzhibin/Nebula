#!/usr/bin/env node
/**
 * Build a synthetic Nebula report for layout iteration.
 *
 * It calls the real `buildHtmlDocument()` from js/nebula_report.js (sliced out of
 * the module, not re-implemented), so the HTML it writes is exactly what
 * Report -> Save Report would produce for these three figures:
 *
 *   1. per-column summary  1558x272  (a fill section since v0.709)
 *   2. volcano             1558x700  (wider than the content column -> must shrink)
 *   3. PCA 2D               900x700  (fits -> must keep its locked size)
 *
 * Use it with scripts/report_browser_check.mjs to test report layout without
 * loading a matrix and clicking through the app:
 *
 *   node scripts/report_test_fixture.cjs out.html            # Plotly inlined (like a real export)
 *   node scripts/report_test_fixture.cjs out.html --cdn      # Plotly left on the CDN (pre-v0.710)
 *   node scripts/report_browser_check.mjs out.html --width=1440 --offline
 *
 * Usage: node scripts/report_test_fixture.cjs [out.html] [--cdn]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const PLOTLY_CDN_URL = 'https://cdn.plot.ly/plotly-2.27.0.min.js';
const args = process.argv.slice(2);
const inlineLibs = args.indexOf('--cdn') < 0;
const outArg = args.find(a => !a.startsWith('--'));

const modulePath = path.join(__dirname, '..', 'js', 'nebula_report.js');
const lines = fs.readFileSync(modulePath, 'utf8').split(/\r?\n/);

function slice(startMarker, endMarker) {
    const a = lines.findIndex(l => l.trim().startsWith(startMarker));
    const b = lines.findIndex((l, i) => i > a && l.trim().startsWith(endMarker));
    if (a < 0 || b < 0) throw new Error('cannot slice ' + startMarker + ' .. ' + endMarker + ' out of js/nebula_report.js');
    return lines.slice(a, b).join('\n');
}

async function fetchPlotlyText() {
    if (!inlineLibs) return '';
    const res = await fetch(PLOTLY_CDN_URL, { cache: 'force-cache' });
    const text = res.ok ? await res.text() : '';
    if (!text || text.length < 50000) throw new Error('could not fetch ' + PLOTLY_CDN_URL);
    return text;
}

async function main() {
    const plotlyText = await fetchPlotlyText();
    global.__FIXTURE_PLOTLY__ = plotlyText;

    const prelude = [
        'var global = globalThis;',
        'var REPORT_PLOTLY_DEFAULT_WIDTH = 800;',
        /* Mirrors the module state the real builder reads: the library text it inlines,
         * or empty strings so it falls back to the CDN script tag. */
        'var reportLibs = { plotly: global.__FIXTURE_PLOTLY__ || "", d3: "" };',
        slice('function inlineScriptSafe(', 'function fetchLibText('),
        String.raw`function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}`,
        slice('function isExportFillSection(', 'var REPORT_PREVIEW_SVG_SCALE'),
        String.raw`function getFigureCaptionForExport(id,title){return title + ' — caption shown under the figure in the exported report.';}`,
        slice('function plotlyHostInlineStyleFromLayout(', 'function utf8ToBase64('),
        String.raw`function utf8ToBase64(s){return Buffer.from(String(s),'utf8').toString('base64');}`,
        String.raw`function plotlyJsonReplacer(k,v){return v;}`,
        String.raw`var D3_CDN_URL='https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js'; var PLOTLY_CDN_URL='` + PLOTLY_CDN_URL + `';`
    ].join('\n');

    const build = new Function(
        prelude + '\n' +
        slice('function buildHtmlDocument(', 'function rebuildExportHtmlSnapshot(') +
        '\nreturn buildHtmlDocument;'
    )();

    const samples = Array.from({ length: 30 }, (_, i) => 'sample_' + String(i + 1).padStart(2, '0'));
    const values = samples.map((_, i) => 1800 + Math.round(Math.sin(i / 3) * 700) + i * 45);

    const blocks = [
        {
            title: 'Per-column summary (bar)',
            sectionId: 'per_column_summary',
            body: {
                kind: 'plotly_embed',
                data: [{
                    type: 'bar', orientation: 'h', x: values, y: samples,
                    marker: { color: '#c0582f' }, hovertemplate: '%{y}: %{x}<extra></extra>'
                }],
                layout: {
                    width: 1558, height: 272, margin: { l: 110, r: 20, t: 24, b: 36 }, bargap: 0.25,
                    xaxis: { title: { text: 'log10(1+I) sum' } }, yaxis: { automargin: true, tickfont: { size: 9 } },
                    showlegend: false, plot_bgcolor: '#fff', paper_bgcolor: '#fff'
                },
                config: {}
            }
        },
        {
            title: 'Differential — volcano plot',
            sectionId: 'diff_volcano',
            body: {
                kind: 'plotly_embed',
                data: [{
                    type: 'scattergl', mode: 'markers',
                    x: Array.from({ length: 600 }, (_, i) => (i % 40) / 12 - 1.6),
                    y: Array.from({ length: 600 }, (_, i) => ((i * 37) % 100) / 9),
                    marker: { size: 5, color: '#8b5cf6' }
                }],
                layout: {
                    width: 1558, height: 700, margin: { l: 60, r: 20, t: 30, b: 48 },
                    xaxis: { title: { text: 'log2 fold change' } }, yaxis: { title: { text: '-log10 p' } },
                    plot_bgcolor: '#fff', paper_bgcolor: '#fff'
                },
                config: {}
            }
        },
        {
            title: 'Clustering — PCA 2D plot',
            sectionId: 'pca_2d',
            body: {
                kind: 'plotly_embed',
                data: [{
                    type: 'scattergl', mode: 'markers',
                    x: Array.from({ length: 30 }, (_, i) => Math.cos(i) * 8),
                    y: Array.from({ length: 30 }, (_, i) => Math.sin(i) * 6),
                    marker: { size: 9, color: '#2563eb' }
                }],
                layout: {
                    width: 900, height: 700, margin: { l: 60, r: 20, t: 30, b: 48 },
                    xaxis: { title: { text: 'PC1' } }, yaxis: { title: { text: 'PC2' } },
                    plot_bgcolor: '#fff', paper_bgcolor: '#fff'
                },
                config: {}
            }
        }
    ];

    const out = outArg || path.join(os.tmpdir(), 'nebula_report_fixture.html');
    const html = build(blocks, { generatedAt: new Date().toISOString(), appVersion: 'synthetic layout fixture' }, {});
    fs.writeFileSync(out, html, 'utf8');
    console.log(
        'wrote ' + out + ' (' + (html.length / 1048576).toFixed(2) + ' MB, ' + blocks.length + ' figures, ' +
        (inlineLibs ? 'Plotly inlined' : 'Plotly on CDN') + ')'
    );
}

main().catch(err => {
    console.error('fixture build failed: ' + (err && err.message ? err.message : err));
    process.exit(1);
});

