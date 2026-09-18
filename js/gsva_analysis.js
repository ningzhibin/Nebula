/**
 * GSVA single-sample pathway analysis (Downstream → GSVA sub-tab).
 *
 * Method: Hanzelmann, Castelo & Guinney, BMC Bioinformatics 14:7 (2013).
 * Four variants: classic gsva (Gaussian-kernel log-odds + KS random walk),
 * ssgsea (Barbie et al. 2009, rank-weighted ECDF difference),
 * plage (Tomfohr et al. 2005, SVD eigengene) and zscore (Lee et al. 2008,
 * combined z-score). Heavy work runs
 * in js/gsva.worker.js. This module handles the DOM: method/parameter
 * controls, the MSigDB collection tree, run flow with progress, score heatmap
 * (Plotly), scores table (via TableDisplay), CSV export, and the
 * session-snapshot collect/restore pair.
 *
 * NOTE on duplication: the MSigDB tree picker + GMT parser + row-symbol
 * resolver mirror js/gsea_analysis.js on purpose. The tree shape, the lazy
 * file cache (window.NEBULA_GSEA_LIBRARIES) and the GMT format are shared;
 * only the checkbox state is per-tab. If a third consumer appears, extract a
 * shared js/msigdb_library.js module instead of copying again.
 *
 * Globals like `currentData` are lexical `let`s in index.html and are read
 * through `window` (they are bridged there), never redeclared here.
 */
(function (global) {
    'use strict';

    var worker = null;
    var jobSeq = 0;
    var running = false;

    var state = {
        rows: null,         // set names
        cols: null,         // sample labels
        values: null,       // rows x cols scores
        sizes: null,
        skipped: [],
        summary: null,
        params: null,
        customLibs: {}
    };
    if (!state.checkedLeaves) state.checkedLeaves = { 'h.all': true };
    if (!state.checkedCustom) state.checkedCustom = {};

    function el(id) { return document.getElementById(id); }
    function numVal(id, dflt) {
        var e = el(id);
        if (!e || e.value == null || String(e.value).trim() === '') return dflt;
        var v = parseFloat(e.value);
        return Number.isFinite(v) ? v : dflt;
    }
    function selVal(id, dflt) { var e = el(id); return (e && e.value) ? e.value : dflt; }
    function checkVal(id) { var e = el(id); return !!(e && e.checked); }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function progressShow(msg) { if (typeof global.showProgress === 'function') global.showProgress(msg, 0); }
    function progressUpdate(pct, msg) { if (typeof global.updateProgress === 'function') global.updateProgress(pct, msg); }
    function progressHide() { if (typeof global.hideProgress === 'function') global.hideProgress(); }
    function setStatus(msg, isErr) {
        var s = el('gsvaStatus');
        if (s) { s.textContent = msg; s.style.color = isErr ? '#c0392b' : ''; }
    }
    function appendLog(msg) {
        var box = el('gsvaAnalysisLogContent');
        if (!box) return;
        var line = document.createElement('div');
        var t = new Date();
        function p2(n) { return (n < 10 ? '0' : '') + n; }
        line.textContent = '[' + p2(t.getHours()) + ':' + p2(t.getMinutes()) + ':' + p2(t.getSeconds()) + '] ' + msg;
        box.appendChild(line);
        box.scrollTop = box.scrollHeight;
    }

    function ensureWorker() {
        if (worker) return worker;
        if (typeof Worker === 'undefined' || !global._gsvaWorkerSrc) {
            setStatus('Web Workers unavailable — GSVA cannot run in this browser.', true);
            return null;
        }
        try {
            var blob = new Blob([global._gsvaWorkerSrc], { type: 'application/javascript' });
            worker = new Worker(URL.createObjectURL(blob));
            worker.onerror = function (err) {
                console.error('GSVA worker error:', err);
                running = false;
                progressHide();
                setStatus('GSVA worker error. See console.', true);
                var btn = el('gsvaRunBtn');
                if (btn) btn.disabled = false;
            };
        } catch (e) {
            console.error('Failed to create GSVA worker:', e);
            worker = null;
        }
        return worker;
    }

    /* ---------------- MSigDB collection tree (see header note) ---------------- */

    var MSIGDB_VERSION = 'v2026.1';
    var MSIGDB_LEAVES = {
        'h.all': { file: 'js/msigdb/msigdb_h_all.js', sets: 50, sizeKb: 59 },
        'c1.all': { file: 'js/msigdb/msigdb_c1_all.js', sets: 302, sizeKb: 440 },
        'c2.cgp': { file: 'js/msigdb/msigdb_c2_cgp.js', sets: 3555, sizeKb: 3398 },
        'c2.cp.pid': { file: 'js/msigdb/msigdb_c2_cp_pid.js', sets: 196, sizeKb: 67 },
        'c2.cp.reactome': { file: 'js/msigdb/msigdb_c2_cp_reactome.js', sets: 1839, sizeKb: 905 },
        'c2.cp.wikipathways': { file: 'js/msigdb/msigdb_c2_cp_wikipathways.js', sets: 925, sizeKb: 363 },
        'c3.mir.mirdb': { file: 'js/msigdb/msigdb_c3_mir_mirdb.js', sets: 2377, sizeKb: 3073 },
        'c3.mir.mir_legacy': { file: 'js/msigdb/msigdb_c3_mir_mir_legacy.js', sets: 221, sizeKb: 282 },
        'c3.tft.gtrd': { file: 'js/msigdb/msigdb_c3_tft_gtrd.js', sets: 506, sizeKb: 2249 },
        'c3.tft.tft_legacy': { file: 'js/msigdb/msigdb_c3_tft_tft_legacy.js', sets: 610, sizeKb: 1258 },
        'c4.3ca': { file: 'js/msigdb/msigdb_c4_3ca.js', sets: 148, sizeKb: 66 },
        'c4.cgn': { file: 'js/msigdb/msigdb_c4_cgn.js', sets: 427, sizeKb: 343 },
        'c4.cm': { file: 'js/msigdb/msigdb_c4_cm.js', sets: 431, sizeKb: 389 },
        'c5.go.bp': { file: 'js/msigdb/msigdb_c5_go_bp.js', sets: 7538, sizeKb: 5277 },
        'c5.go.cc': { file: 'js/msigdb/msigdb_c5_go_cc.js', sets: 1080, sizeKb: 879 },
        'c5.go.mf': { file: 'js/msigdb/msigdb_c5_go_mf.js', sets: 1872, sizeKb: 986 },
        'c5.hpo': { file: 'js/msigdb/msigdb_c5_hpo.js', sets: 5793, sizeKb: 4400 },
        'c6.all': { file: 'js/msigdb/msigdb_c6_all.js', sets: 189, sizeKb: 249 },
        'c7.immunesigdb': { file: 'js/msigdb/msigdb_c7_immunesigdb.js', sets: 4872, sizeKb: 7890 },
        'c7.vax': { file: 'js/msigdb/msigdb_c7_vax.js', sets: 347, sizeKb: 388 },
        'c8.all': { file: 'js/msigdb/msigdb_c8_all.js', sets: 866, sizeKb: 1331 },
        'c9.all': { file: 'js/msigdb/msigdb_c9_all.js', sets: 62, sizeKb: 48 }
    };
    var MSIGDB_TREE = [
        { id: 'H', label: 'H: hallmark gene sets', leaves: ['h.all'] },
        { id: 'C1', label: 'C1: positional gene sets', leaves: ['c1.all'] },
        { id: 'C2', label: 'C2: curated gene sets', children: [
            { id: 'C2:CGP', label: 'CGP: chemical and genetic perturbations', leaves: ['c2.cgp'] },
            { id: 'C2:CP', label: 'CP: canonical pathways', children: [
                { id: 'C2:CP:BIOCARTA', label: 'CP:BIOCARTA: BioCarta gene sets', disabled: 'licence-restricted' },
                { id: 'C2:CP:KEGG_MEDICUS', label: 'CP:KEGG_MEDICUS: KEGG Medicus gene sets', disabled: 'licence-restricted' },
                { id: 'C2:CP:PID', label: 'CP:PID: PID gene sets', leaves: ['c2.cp.pid'] },
                { id: 'C2:CP:REACTOME', label: 'CP:REACTOME: Reactome gene sets', leaves: ['c2.cp.reactome'] },
                { id: 'C2:CP:WIKIPATHWAYS', label: 'CP:WIKIPATHWAYS: WikiPathways gene sets', leaves: ['c2.cp.wikipathways'] },
                { id: 'C2:CP:KEGG_LEGACY', label: 'CP:KEGG_LEGACY: KEGG Legacy gene sets', disabled: 'licence-restricted' }
            ]}
        ]},
        { id: 'C3', label: 'C3: regulatory target gene sets', children: [
            { id: 'C3:MIR', label: 'MIR: microRNA targets', children: [
                { id: 'C3:MIR:MIRDB', label: 'MIR:MIRDB: miRDB microRNA targets', leaves: ['c3.mir.mirdb'] },
                { id: 'C3:MIR:MIR_LEGACY', label: 'MIR:MIR_LEGACY: legacy microRNA targets', leaves: ['c3.mir.mir_legacy'] }
            ]},
            { id: 'C3:TFT', label: 'TFT: transcription factor targets', children: [
                { id: 'C3:TFT:GTRD', label: 'TFT:GTRD: GTRD transcription factor targets', leaves: ['c3.tft.gtrd'] },
                { id: 'C3:TFT:TFT_LEGACY', label: 'TFT:TFT_LEGACY: legacy transcription factor targets', leaves: ['c3.tft.tft_legacy'] }
            ]}
        ]},
        { id: 'C4', label: 'C4: computational gene sets', children: [
            { id: 'C4:3CA', label: '3CA: Curated Cancer Cell Atlas gene sets', leaves: ['c4.3ca'] },
            { id: 'C4:CGN', label: 'CGN: cancer gene neighborhoods', leaves: ['c4.cgn'] },
            { id: 'C4:CM', label: 'CM: cancer modules', leaves: ['c4.cm'] }
        ]},
        { id: 'C5', label: 'C5: ontology gene sets', children: [
            { id: 'C5:GO', label: 'GO: Gene Ontology', children: [
                { id: 'C5:GO:BP', label: 'GO:BP: GO biological process', leaves: ['c5.go.bp'] },
                { id: 'C5:GO:CC', label: 'GO:CC: GO cellular component', leaves: ['c5.go.cc'] },
                { id: 'C5:GO:MF', label: 'GO:MF: GO molecular function', leaves: ['c5.go.mf'] }
            ]},
            { id: 'C5:HPO', label: 'HPO: Human Phenotype Ontology', leaves: ['c5.hpo'] }
        ]},
        { id: 'C6', label: 'C6: oncogenic gene sets', leaves: ['c6.all'] },
        { id: 'C7', label: 'C7: immunologic gene sets', children: [
            { id: 'C7:IMMUNESIGDB', label: 'IMMUNESIGDB: ImmuneSigDB gene sets', leaves: ['c7.immunesigdb'] },
            { id: 'C7:VAX', label: 'VAX: vaccine response gene sets', leaves: ['c7.vax'] }
        ]},
        { id: 'C8', label: 'C8: cell type signature gene sets', leaves: ['c8.all'] },
        { id: 'C9', label: 'C9: computational perturbation signature gene sets', leaves: ['c9.all'] }
    ];

    function eachTreeNode(list, fn) {
        for (var i = 0; i < (list || []).length; i++) {
            fn(list[i]);
            if (list[i].children) eachTreeNode(list[i].children, fn);
        }
    }
    function enabledLeavesUnder(node) {
        var out = [];
        if (node.disabled) return out;
        if (node.leaves) {
            for (var i = 0; i < node.leaves.length; i++) {
                if (MSIGDB_LEAVES[node.leaves[i]]) out.push(node.leaves[i]);
            }
        }
        if (node.children) {
            for (var j = 0; j < node.children.length; j++) {
                out = out.concat(enabledLeavesUnder(node.children[j]));
            }
        }
        return out;
    }
    function findTreeNode(id) {
        var found = null;
        eachTreeNode(MSIGDB_TREE, function (n) { if (n.id === id) found = n; });
        return found;
    }
    function sizeFmt(kb) {
        if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
        return kb + ' KB';
    }
    function leafData(key) {
        var libs = global.NEBULA_GSEA_LIBRARIES || {};
        return libs[key] || null;
    }
    function selectedLeafKeys() {
        var out = [];
        eachTreeNode(MSIGDB_TREE, function (n) {
            if (n.leaves) {
                for (var i = 0; i < n.leaves.length; i++) {
                    var k = n.leaves[i];
                    if (state.checkedLeaves[k] && MSIGDB_LEAVES[k] && out.indexOf(k) === -1) out.push(k);
                }
            }
        });
        return out;
    }
    function selectedCustomLibs() {
        return Object.keys(state.customLibs).filter(function (lib) {
            return state.checkedCustom[lib] !== false;
        }).sort();
    }

    var libLoaders = {};
    function appVersionQuery() {
        try {
            var t = (document.getElementById('appVersion') || {}).textContent || '';
            var v = String(t).trim().replace(/^v/i, '');
            return v ? '?v=' + v : '';
        } catch (e) { return ''; }
    }
    function ensureLeafLoaded(key) {
        var def = MSIGDB_LEAVES[key];
        if (!def || !def.file) return Promise.resolve(true);
        if (leafData(key)) return Promise.resolve(true);
        if (libLoaders[key]) return libLoaders[key];
        libLoaders[key] = new Promise(function (resolve, reject) {
            setStatus('Loading ' + key + ' library…');
            var s = document.createElement('script');
            s.src = def.file + appVersionQuery();
            s.onload = function () {
                delete libLoaders[key];
                if (leafData(key)) { updateLibraryInfo(); resolve(true); }
                else reject(new Error('Library file loaded but no data found.'));
            };
            s.onerror = function () {
                delete libLoaders[key];
                reject(new Error('Could not load ' + def.file + '.'));
            };
            document.head.appendChild(s);
        });
        return libLoaders[key];
    }
    function ensureSelectedLibraries() {
        var keys = selectedLeafKeys().filter(function (k) { return !leafData(k); });
        if (!keys.length) return Promise.resolve(true);
        setStatus('Loading ' + keys.length + ' librar' + (keys.length === 1 ? 'y' : 'ies') + '…');
        return Promise.all(keys.map(ensureLeafLoaded)).then(function () { return true; });
    }

    function leafRowHtml(leafKey, leafTitle) {
        var def = MSIGDB_LEAVES[leafKey];
        var loaded = !!leafData(leafKey);
        var meta = def.sets + ' sets' + (loaded ? ' (loaded)' : ' (≈' + sizeFmt(def.sizeKb) + ')');
        return '<label style="display:flex;align-items:center;gap:6px;font-weight:normal;">' +
            '<input type="checkbox" data-gsva-leaf="' + esc(leafKey) + '"' +
            (state.checkedLeaves[leafKey] ? ' checked' : '') + ' onchange="GsvaAnalysis.onTreeCheck(this)">' +
            '<span>' + esc(leafTitle) + ' <span class="gsea-lib-leaf-count">' + esc(meta) + '</span></span></label>';
    }
    function treeNodeHtml(node) {
        var h = '<div class="gsea-lib-node">';
        if (node.disabled) {
            h += '<label class="gsea-lib-disabled" title="Excluded on licence grounds — upload your own .gmt instead">' +
                '<input type="checkbox" disabled> ' + esc(node.label) + ' <span class="gsea-lib-leaf-count">(excluded: ' + esc(node.disabled) + ')</span></label>';
        } else if (node.leaves && !node.children) {
            h += leafRowHtml(node.leaves[0], node.label);
        } else {
            h += '<label style="display:flex;align-items:center;gap:6px;font-weight:600;">' +
                '<input type="checkbox" data-gsva-branch="' + esc(node.id) + '" onchange="GsvaAnalysis.onTreeCheck(this)"> ' +
                esc(node.label) + '</label>';
            h += '<div class="gsea-lib-children">';
            node.children.forEach(function (ch) { h += treeNodeHtml(ch); });
            h += '</div>';
        }
        return h + '</div>';
    }
    function paintBranchStates() {
        var boxes = document.querySelectorAll('#gsvaLibraryTree input[data-gsva-branch]');
        for (var i = 0; i < boxes.length; i++) {
            (function (box) {
                var node = findTreeNode(box.getAttribute('data-gsva-branch'));
                if (!node) return;
                var leaves = enabledLeavesUnder(node);
                var n = 0;
                leaves.forEach(function (k) { if (state.checkedLeaves[k]) n++; });
                box.checked = leaves.length > 0 && n === leaves.length;
                box.indeterminate = n > 0 && n < leaves.length;
            })(boxes[i]);
        }
    }
    function refreshLibraryTree() {
        var host = el('gsvaLibraryTree');
        if (!host) return;
        var h = '';
        MSIGDB_TREE.forEach(function (n) { h += treeNodeHtml(n); });
        var customs = Object.keys(state.customLibs).sort();
        if (customs.length) {
            h += '<div class="gsea-lib-node" style="margin-top:6px;"><span style="font-weight:600;">Custom (.gmt uploads)</span></div>';
            customs.forEach(function (lib) {
                var n = Object.keys(state.customLibs[lib]).length;
                h += '<div class="gsea-lib-node"><label style="display:flex;align-items:center;gap:6px;font-weight:normal;">' +
                    '<input type="checkbox" data-gsva-custom="' + esc(lib) + '"' +
                    (state.checkedCustom[lib] !== false ? ' checked' : '') + ' onchange="GsvaAnalysis.onTreeCheck(this)">' +
                    '<span>' + esc(lib) + ' <span class="gsea-lib-leaf-count">(' + n + ' sets)</span></span></label></div>';
            });
        }
        host.innerHTML = h;
        paintBranchStates();
        updateLibraryInfo();
    }
    function onTreeCheck(box) {
        var leaf = box.getAttribute('data-gsva-leaf');
        var branch = box.getAttribute('data-gsva-branch');
        var custom = box.getAttribute('data-gsva-custom');
        if (leaf) {
            state.checkedLeaves[leaf] = !!box.checked;
        } else if (branch) {
            var node = findTreeNode(branch);
            if (node) {
                enabledLeavesUnder(node).forEach(function (k) { state.checkedLeaves[k] = !!box.checked; });
                refreshLibraryTree();
                return;
            }
        } else if (custom) {
            state.checkedCustom[custom] = !!box.checked;
        }
        paintBranchStates();
        updateLibraryInfo();
    }
    function selectedSetCount() {
        var n = 0;
        selectedLeafKeys().forEach(function (k) {
            n += (MSIGDB_LEAVES[k] && MSIGDB_LEAVES[k].sets) || 0;
        });
        selectedCustomLibs().forEach(function (lib) {
            n += Object.keys(state.customLibs[lib] || {}).length;
        });
        return n;
    }
    function libraryLabel() {
        var tops = [];
        MSIGDB_TREE.forEach(function (n) {
            var leaves = enabledLeavesUnder(n);
            var any = leaves.some(function (k) { return state.checkedLeaves[k]; });
            if (any) tops.push(n.id);
        });
        Array.prototype.push.apply(tops, selectedCustomLibs().map(function (lib) { return 'Custom:' + lib; }));
        var head = tops.slice(0, 3).join(', ') + (tops.length > 3 ? ' (+' + (tops.length - 3) + ' more)' : '');
        return 'MSigDB ' + MSIGDB_VERSION + ' human [' + (head || 'nothing selected') + ']';
    }
    function updateLibraryInfo() {
        var info = el('gsvaLibraryInfo');
        if (!info) return;
        var keys = selectedLeafKeys();
        var customs = selectedCustomLibs();
        if (!keys.length && !customs.length) {
            info.textContent = 'Nothing selected — tick a collection or branch.';
            return;
        }
        var pending = keys.filter(function (k) { return !leafData(k); });
        var pendingKb = 0;
        pending.forEach(function (k) { pendingKb += (MSIGDB_LEAVES[k] && MSIGDB_LEAVES[k].sizeKb) || 0; });
        info.textContent = selectedSetCount() + ' sets selected (' + libraryLabel() + ')' +
            (pending.length ? ' — ' + pending.length + ' file' + (pending.length === 1 ? '' : 's') +
                ' (≈' + sizeFmt(pendingKb) + ') load on first run.' : ' — all loaded.');
    }

    /** Parse GMT text (name <tab> description <tab> gene...). Returns {name:[genes]}. */
    function parseGmtText(text) {
        var out = {};
        var lines = String(text || '').split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line.charAt(0) === '#') continue;
            var parts = line.split('\t');
            if (parts.length < 3) continue;
            var name = parts[0].trim();
            if (!name || out[name]) continue;
            var genes = [];
            for (var j = 2; j < parts.length; j++) {
                var g = parts[j].trim();
                if (g) genes.push(g);
            }
            if (genes.length) out[name] = genes;
        }
        return out;
    }

    function onCustomGmtFile(input) {
        var f = input && input.files && input.files[0];
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
            try {
                var sets = parseGmtText(rd.result);
                var names = Object.keys(sets);
                if (!names.length) {
                    setStatus('No gene sets parsed from ' + f.name + '. Expect GMT: name <tab> description <tab> genes…', true);
                    return;
                }
                var lib = f.name.replace(/\.(gmt|txt)$/i, '').slice(0, 60) || 'upload';
                var base = lib, k = 2;
                while (state.customLibs[base]) base = lib + ' (' + (k++) + ')';
                state.customLibs[base] = sets;
                state.checkedCustom[base] = true;
                refreshLibraryTree();
                updateLibraryInfo();
                appendLog('Custom library "' + base + '": ' + names.length + ' sets loaded from ' + f.name + '.');
                setStatus('Custom library "' + base + '" ready (' + names.length + ' sets).');
            } catch (e) {
                setStatus('Failed to parse ' + f.name + ': ' + (e.message || e), true);
            }
            input.value = '';
        };
        rd.onerror = function () { setStatus('Could not read ' + f.name + '.', true); input.value = ''; };
        rd.readAsText(f);
    }

    /* ---------------- matrix + symbol resolution ---------------- */

    function workingMatrix() {
        var m = global.currentDataMatrix;
        if (Array.isArray(m) && m.length && Array.isArray(m[0])) return m;
        var cd = global.currentData;
        if (cd && Array.isArray(cd.dataMatrix) && cd.dataMatrix.length && Array.isArray(cd.dataMatrix[0])) return cd.dataMatrix;
        return null;
    }

    /** Per-matrix-row primary symbol (DIANN Genes → mapped symbol → label). */
    function matrixRowSymbols(cd) {
        var n = (cd && cd.rowIds) ? cd.rowIds.length : 0;
        var out = new Array(n);
        var norm = (typeof global.normalizeMatrixRowLabelTokenForEnrichr === 'function')
            ? global.normalizeMatrixRowLabelTokenForEnrichr
            : function (rid) { return String(rid == null ? '' : rid).split(/\t|;|\|/)[0].trim(); };
        var strip = (typeof global.stripMatrixRowLabelSpeciesSuffixForEnrichr === 'function')
            ? global.stripMatrixRowLabelSpeciesSuffixForEnrichr
            : function (t) { return t; };
        var gi = -1;
        if (cd && Array.isArray(cd.featureNameMapHeaders) && Array.isArray(cd.featureNameMapRows)) {
            gi = cd.featureNameMapHeaders.indexOf('gene_symbol');
        }
        var hasDiann = cd && Array.isArray(cd.diannPgGenesByRow);
        for (var i = 0; i < n; i++) {
            var sym = '';
            if (hasDiann && i < cd.diannPgGenesByRow.length) {
                var cell = cd.diannPgGenesByRow[i];
                if (cell != null && String(cell).trim()) {
                    var first = String(cell).split(/[,;|\s]+/)[0].trim();
                    if (first) sym = strip(first);
                }
            }
            if (!sym && gi >= 0 && cd.featureNameMapRows && cd.featureNameMapRows[i]) {
                var mapped = cd.featureNameMapRows[i][gi];
                if (mapped != null && String(mapped).trim()) sym = String(mapped).trim();
            }
            if (!sym) sym = strip(norm(cd.rowIds[i]));
            out[i] = sym || '';
        }
        return out;
    }

    /* ---------------- run flow ---------------- */

    function methodVal() {
        var r = document.querySelector('input[name="gsvaMethod"]:checked');
        var v = r ? r.value : 'gsva';
        return (v === 'ssgsea' || v === 'plage' || v === 'zscore') ? v : 'gsva';
    }

    function readOptions() {
        var kc = selVal('gsvaKcdf', 'auto');
        if (kc !== 'Gaussian' && kc !== 'Poisson' && kc !== 'none') kc = 'auto';
        return {
            method: methodVal(),
            tau: numVal('gsvaTau', 1),
            maxDiff: checkVal('gsvaMaxDiff'),
            absRanking: checkVal('gsvaAbsRanking'),
            kcdf: kc,
            kcdfNoneMinSampleSize: Math.max(1, Math.round(numVal('gsvaKcdfNoneMinSampleSize', 200))),
            alpha: numVal('gsvaAlpha', 0.25),
            normalize: checkVal('gsvaNormalize'),
            minSize: Math.round(numVal('gsvaMinSize', 5)),
            maxSize: Math.round(numVal('gsvaMaxSize', 500)),
            log2: checkVal('gsvaLog2'),
            heatMax: Math.round(numVal('gsvaHeatMax', 100))
        };
    }

    function runGsvaAnalysis() {
        if (running) { setStatus('GSVA already running…'); return; }
        var W = ensureWorker();
        if (!W) return;
        var m = workingMatrix();
        if (!m) { setStatus('No expression matrix. Load data in Data Preparation first.', true); return; }
        var keys = selectedLeafKeys();
        var customs = selectedCustomLibs();
        if (!keys.length && !customs.length) {
            setStatus('No gene sets selected — tick a collection or branch in the library tree.', true);
            return;
        }
        var cd = global.currentData || null;
        var doLog2 = checkVal('gsvaLog2');
        setStatus('Preparing matrix…');
        /* Build numeric matrix (optional log2(x+1)) + symbol→rows map. */
        var nCols = 0;
        for (var ci = 0; ci < m.length; ci++) {
            if (Array.isArray(m[ci]) && m[ci].length > nCols) nCols = m[ci].length;
        }
        var rowSyms = (cd && cd.rowIds && cd.rowIds.length === m.length) ? matrixRowSymbols(cd) : null;
        var X = [];
        var sym2rows = {};
        var droppedNF = 0;
        for (var i = 0; i < m.length; i++) {
            var row = m[i];
            if (!Array.isArray(row)) { droppedNF++; continue; }
            var vals = new Array(nCols);
            var ok = true;
            for (var j = 0; j < nCols; j++) {
                var v = parseFloat(row[j]);
                if (!Number.isFinite(v)) { ok = false; break; }
                if (doLog2) v = v <= 0 ? 0 : Math.log2(v + 1);
                vals[j] = v;
            }
            if (!ok) { droppedNF++; continue; }
            var sym = rowSyms ? (rowSyms[i] || '') : '';
            if (!sym && cd && Array.isArray(cd.rowIds) && cd.rowIds[i] != null) {
                sym = String(cd.rowIds[i]).split(/\t|;|\|/)[0].trim();
            }
            if (!sym) sym = 'row' + i;
            var up = sym.toUpperCase();
            if (!sym2rows[up]) sym2rows[up] = [];
            sym2rows[up].push(X.length);
            X.push(vals);
        }
        if (X.length < 10) { setStatus('Too few usable matrix rows (' + X.length + ').', true); return; }
        var colLabels = (cd && Array.isArray(cd.columnHeaders) && cd.columnHeaders.length === nCols)
            ? cd.columnHeaders.map(function (c) { return String(c); })
            : null;
        if (!colLabels) {
            colLabels = [];
            for (var lj = 0; lj < nCols; lj++) colLabels.push('S' + (lj + 1));
        }
        ensureSelectedLibraries().then(function () {
            /* Resolve selected sets to row indices. */
            var union = {};
            keys.forEach(function (k) {
                var sets = leafData(k) || {};
                Object.keys(sets).forEach(function (nm) { if (!union[nm]) union[nm] = sets[nm]; });
            });
            customs.forEach(function (lib) {
                var sets = state.customLibs[lib] || {};
                Object.keys(sets).forEach(function (nm) { if (!union[nm]) union[nm] = sets[nm]; });
            });
            var setRows = {};
            Object.keys(union).forEach(function (nm) {
                var members = union[nm];
                var rows = [];
                for (var q = 0; q < members.length; q++) {
                    var hit = sym2rows[String(members[q]).toUpperCase()];
                    if (hit) {
                        for (var t = 0; t < hit.length; t++) {
                            if (rows.indexOf(hit[t]) === -1) rows.push(hit[t]);
                        }
                    }
                }
                if (rows.length) setRows[nm] = rows;
            });
            startWorkerRun(X, colLabels, setRows, droppedNF);
        }, function (e) {
            setStatus((e && e.message) || String(e), true);
        });
    }

    function startWorkerRun(X, colLabels, setRows, droppedNF) {
        var W = ensureWorker();
        if (!W) return;
        var opts = readOptions();
        opts.minSize = Math.max(1, opts.minSize || 5);
        opts.maxSize = Math.max(opts.minSize, opts.maxSize || 500);
        if (!(opts.tau >= 0)) opts.tau = 1;
        if (!(opts.alpha > 0)) opts.alpha = 0.25;
        opts.heatMax = Math.max(10, opts.heatMax || 100);
        running = true;
        var btn = el('gsvaRunBtn');
        if (btn) btn.disabled = true;
        var jobId = ++jobSeq;
        state.params = {
            method: opts.method, tau: opts.tau, maxDiff: opts.maxDiff,
            absRanking: opts.absRanking, kcdf: opts.kcdf,
            kcdfNoneMinSampleSize: opts.kcdfNoneMinSampleSize,
            alpha: opts.alpha, normalize: opts.normalize,
            minSize: opts.minSize, maxSize: opts.maxSize, log2: checkVal('gsvaLog2'),
            heatMax: opts.heatMax,
            libraryKeys: selectedLeafKeys(), libraryCustom: selectedCustomLibs(),
            library: libraryLabel(), droppedNF: droppedNF || 0
        };
        state.rows = null; state.cols = null; state.values = null;
        var kcdfTag = (opts.method === 'gsva' && opts.kcdf) ? ', kcdf=' + opts.kcdf : '';
        setStatus('Running GSVA (' + opts.method + kcdfTag + ') on ' + X.length + ' genes × ' + colLabels.length + ' samples…');
        appendLog('Run started: ' + opts.method + kcdfTag + ', ' + X.length + ' genes × ' + colLabels.length +
            ' samples vs ' + state.params.library + (checkVal('gsvaLog2') ? ' [log2]' : ' [raw]') + '.');
        progressShow('GSVA running…');
        W.onmessage = function (ev) {
            var msg = ev.data || {};
            if (msg.jobId !== jobId) return;
            if (msg.type === 'progress') {
                var frac = msg.total ? msg.done / msg.total : 0;
                progressUpdate(Math.round(frac * 100), 'GSVA: ' + msg.done + '/' + msg.total);
            } else if (msg.type === 'done') {
                running = false;
                progressHide();
                if (btn) btn.disabled = false;
                onGsvaDone(msg);
            } else if (msg.type === 'error') {
                running = false;
                progressHide();
                if (btn) btn.disabled = false;
                setStatus('GSVA failed: ' + (msg.message || 'worker error'), true);
                appendLog('Run failed: ' + (msg.message || 'worker error'));
            }
        };
        W.postMessage({ type: 'run', jobId: jobId, X: X, samples: colLabels, sets: setRows, opts: opts });
    }

    function onGsvaDone(msg) {
        state.rows = msg.rows || [];
        state.cols = msg.cols || [];
        state.values = msg.values || [];
        state.sizes = msg.sizes || {};
        state.skipped = msg.filtered || msg.skipped || [];
        state.summary = msg.summary || null;
        var s = state.summary || {};
        setStatus('Done: ' + state.rows.length + ' sets × ' + state.cols.length + ' samples' +
            (state.skipped.length ? ' (' + state.skipped.length + ' size-filtered)' : '') + '.');
        appendLog('Done: ' + state.rows.length + ' sets scored (' + state.skipped.length + ' filtered); ' +
            s.nGenes + ' genes used' +
            (s.droppedConstant ? ', ' + s.droppedConstant + ' constant dropped' : '') +
            (s.droppedNonFinite ? ', ' + s.droppedNonFinite + ' non-finite dropped' : '') + '.');
        renderGsvaTable();
        plotGsvaHeatmap();
        if (typeof switchGsvaSubTab === 'function') switchGsvaSubTab('heatmap');
        if (typeof global.updateGsvaEmpty === 'function') global.updateGsvaEmpty();
    }

    /* ---------------- heatmap + table ---------------- */

    function rowVar(values, r) {
        var vec = values[r];
        var n = vec.length, m = 0, i;
        for (i = 0; i < n; i++) m += vec[i];
        m /= n;
        var q = 0;
        for (i = 0; i < n; i++) { var d = vec[i] - m; q += d * d; }
        return n > 1 ? q / (n - 1) : 0;
    }

    function heatRows() {
        var max = (state.params && state.params.heatMax) || 100;
        var idx = state.rows.map(function (_, i) { return i; });
        idx.sort(function (a, b) { return rowVar(state.values, b) - rowVar(state.values, a); });
        return idx.slice(0, Math.max(1, Math.min(max, idx.length)));
    }

    function plotGsvaHeatmap() {
        var host = el('gsvaScoreHeatmap');
        if (!host || !global.Plotly) return;
        if (!state.rows || !state.rows.length) { host.innerHTML = ''; return; }
        var order = heatRows();
        var z = order.map(function (r) { return state.values[r]; });
        var y = order.map(function (r) { return state.rows[r]; });
        var flat = [];
        z.forEach(function (row) { row.forEach(function (v) { if (Number.isFinite(v)) flat.push(Math.abs(v)); }); });
        var mx = flat.length ? Math.max.apply(null, flat) : 1;
        if (!(mx > 0)) mx = 1;
        var method = (state.params && state.params.method) || 'gsva';
        try {
            global.Plotly.react(host, [{
                type: 'heatmap', z: z, x: state.cols.slice(), y: y,
                colorscale: 'RdBu', reversescale: true,
                zmin: -mx, zmax: mx, zmid: 0,
                hovertemplate: '%{y}<br>%{x}<br>score %{z:.3f}<extra></extra>'
            }], {
                title: { text: 'GSVA scores (' + method + ', ' + order.length + ' of ' + state.rows.length + ' sets)', font: { size: 13 } },
                height: Math.max(380, Math.min(1100, 60 + order.length * 14)),
                margin: { l: 220, r: 16, t: 56, b: 90 },
                xaxis: { tickangle: -35, automargin: true },
                yaxis: { automargin: true }
            }, { responsive: true, displayModeBar: true });
        } catch (e) {
            console.error('GSVA heatmap:', e);
        }
    }

    function renderGsvaTable() {
        var host = el('gsvaScoresHost');
        if (!host) return;
        if (!state.rows || !state.rows.length) {
            host.innerHTML = '';
            return;
        }
        var cols = (state.cols || []).map(function (c, j) {
            return { key: 's' + j, title: String(c), className: 'dt-type-numeric' };
        });
        var data = state.rows.map(function (nm, r) {
            var o = { set: nm, size: (state.sizes && state.sizes[nm]) || 0, mean: NaN };
            var s = 0, n = 0;
            (state.cols || []).forEach(function (_, j) {
                var v = state.values[r][j];
                o['s' + j] = v;
                if (Number.isFinite(v)) { s += v; n++; }
            });
            o.mean = n ? s / n : NaN;
            return o;
        });
        function numRender(digits) {
            return function (data, type) {
                if (type === 'sort' || type === 'type' || type === 'filter') {
                    return Number.isFinite(data) ? data : null;
                }
                return Number.isFinite(data) ? Number(data).toFixed(digits) : '—';
            };
        }
        var tableCols = [{ key: 'set', title: 'Gene set', className: 'dt-type-string' },
            { key: 'size', title: 'Size', className: 'dt-type-numeric' },
            { key: 'mean', title: 'Mean', className: 'dt-type-numeric', render: numRender(3) }]
            .concat(cols.map(function (c) {
                return { key: c.key, title: c.title, className: c.className, render: numRender(3) };
            }));
        if (global.TableDisplay && typeof global.TableDisplay.renderGenericTable === 'function') {
            void global.TableDisplay.renderGenericTable(host, {
                data: data, columns: tableCols,
                tableClassName: 'gsva-results-table',
                rootClassName: 'gsva-results-table-root',
                pageLength: 25, numericBars: false
            }).catch(function (ex) { console.error('GSVA table:', ex); });
        } else {
            host.innerHTML = '<p class="small">TableDisplay unavailable.</p>';
        }
    }

    /* ---------------- export ---------------- */

    function downloadText(filename, text, mime) {
        var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            try { URL.revokeObjectURL(a.href); } catch (e) {}
            if (a.parentNode) a.parentNode.removeChild(a);
        }, 500);
    }

    function exportGsvaCsv() {
        if (!state.rows || !state.rows.length) { setStatus('Nothing to export — run GSVA first.', true); return; }
        function q(s) {
            s = String(s == null ? '' : s);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }
        var lines = [['gene_set', 'size'].concat(state.cols || []).join(',')];
        state.rows.forEach(function (nm, r) {
            var cells = [q(nm), (state.sizes && state.sizes[nm]) || 0];
            (state.cols || []).forEach(function (_, j) {
                var v = state.values[r][j];
                cells.push(Number.isFinite(v) ? Number(v).toFixed(4) : '');
            });
            lines.push(cells.join(','));
        });
        downloadText('nebula_gsva_scores.csv', lines.join('\n'), 'text/csv;charset=utf-8');
        appendLog('Scores exported to nebula_gsva_scores.csv (' + state.rows.length + ' sets × ' + (state.cols || []).length + ' samples).');
    }

    /* ---------------- session snapshot ---------------- */

    function collectGsvaSessionSnapshot() {
        if (!state.rows || !state.rows.length) return null;
        var snap = {
            v: 1, params: state.params,
            rows: state.rows, cols: state.cols,
            sizes: state.sizes, skipped: state.skipped
        };
        try {
            var approx = JSON.stringify(state.values).length;
            if (approx <= 1500000) snap.values = state.values;
            else {
                var order = heatRows();
                snap.values = order.slice(0, 2000).map(function (r) { return state.values[r]; });
                snap.rows = order.slice(0, 2000).map(function (r) { return state.rows[r]; });
                snap.capped = true;
            }
        } catch (e) { return null; }
        var customBytes = 0;
        try { customBytes = JSON.stringify(state.customLibs).length; } catch (e2) {}
        if (customBytes > 0 && customBytes <= 500000) snap.customLibs = state.customLibs;
        if (state.params && state.params.libraryKeys) snap.libraryKeys = state.params.libraryKeys;
        if (state.params && state.params.libraryCustom) snap.libraryCustom = state.params.libraryCustom;
        return snap;
    }

    function restoreGsvaSessionSnapshot(bundle) {
        if (!bundle || !bundle.rows || !bundle.rows.length || !bundle.values) return false;
        state.params = bundle.params || null;
        state.rows = bundle.rows;
        state.cols = bundle.cols || [];
        state.values = bundle.values;
        state.sizes = bundle.sizes || {};
        state.skipped = bundle.skipped || [];
        if (bundle.customLibs) {
            state.customLibs = bundle.customLibs;
            refreshLibraryTree();
        }
        if (bundle.libraryKeys && bundle.libraryKeys.length) {
            state.checkedLeaves = {};
            bundle.libraryKeys.forEach(function (k) {
                if (MSIGDB_LEAVES[k]) state.checkedLeaves[k] = true;
            });
        }
        if (bundle.libraryCustom && bundle.libraryCustom.length) {
            bundle.libraryCustom.forEach(function (lib) {
                if (state.customLibs[lib]) state.checkedCustom[lib] = true;
            });
        }
        refreshLibraryTree();
        try {
            if (state.params) {
                var m = el('gsvaMethodGsva');
                var ms = el('gsvaMethodSsgsea');
                var mp = el('gsvaMethodPlage');
                var mz = el('gsvaMethodZscore');
                if (m && ms && mp && mz) {
                    ms.checked = state.params.method === 'ssgsea';
                    mp.checked = state.params.method === 'plage';
                    mz.checked = state.params.method === 'zscore';
                    m.checked = !(ms.checked || mp.checked || mz.checked);
                }
                if (el('gsvaTau')) el('gsvaTau').value = state.params.tau;
                if (el('gsvaKcdf')) el('gsvaKcdf').value = state.params.kcdf || 'auto';
                if (el('gsvaKcdfNoneMinSampleSize')) el('gsvaKcdfNoneMinSampleSize').value = state.params.kcdfNoneMinSampleSize || 200;
                if (el('gsvaAlpha')) el('gsvaAlpha').value = state.params.alpha;
                if (el('gsvaMinSize')) el('gsvaMinSize').value = state.params.minSize;
                if (el('gsvaMaxSize')) el('gsvaMaxSize').value = state.params.maxSize;
                if (el('gsvaHeatMax')) el('gsvaHeatMax').value = state.params.heatMax;
                if (el('gsvaMaxDiff')) el('gsvaMaxDiff').checked = state.params.maxDiff !== false;
                if (el('gsvaAbsRanking')) el('gsvaAbsRanking').checked = !!state.params.absRanking;
                if (el('gsvaNormalize')) el('gsvaNormalize').checked = state.params.normalize !== false;
                var ml2 = el('gsvaLog2');
                if (ml2) ml2.checked = state.params.log2 !== false;
            }
        } catch (e) { /* best effort */ }
        updateMethodUi();
        renderGsvaTable();
        plotGsvaHeatmap();
        setStatus('Restored: ' + state.rows.length + ' sets × ' + state.cols.length + ' samples from session snapshot.' +
            (bundle.capped ? ' (large matrix capped to plotted rows)' : ''));
        if (typeof global.updateGsvaEmpty === 'function') global.updateGsvaEmpty();
        return true;
    }

    function clearGsvaResults() {
        state.rows = null; state.cols = null; state.values = null;
        state.sizes = null; state.skipped = []; state.params = null;
        var host = el('gsvaScoresHost');
        if (host) host.innerHTML = '';
        var plot = el('gsvaScoreHeatmap');
        if (plot) {
            try {
                if (global.Plotly && global.Plotly.purge) global.Plotly.purge(plot);
                else plot.innerHTML = '';
            } catch (e) { plot.innerHTML = ''; }
        }
        if (typeof global.updateGsvaEmpty === 'function') global.updateGsvaEmpty();
    }

    /* ---------------- method UI ---------------- */

    function updateMethodUi() {
        var method = methodVal();
        var gsvaRows = document.querySelectorAll('[data-gsva-param="gsva"]');
        var ssgseaRows = document.querySelectorAll('[data-gsva-param="ssgsea"]');
        var freeRows = document.querySelectorAll('[data-gsva-param="rankfree"]');
        var i;
        for (i = 0; i < gsvaRows.length; i++) gsvaRows[i].style.display = method === 'gsva' ? '' : 'none';
        for (i = 0; i < ssgseaRows.length; i++) ssgseaRows[i].style.display = method === 'ssgsea' ? '' : 'none';
        for (i = 0; i < freeRows.length; i++) freeRows[i].style.display = (method === 'plage' || method === 'zscore') ? '' : 'none';
        var noneRow = el('gsvaKcdfNoneRow');
        if (noneRow) noneRow.style.display = (method === 'gsva' && selVal('gsvaKcdf', 'auto') === 'auto') ? '' : 'none';
    }

    /* ---------------- sub-tab switching ---------------- */

    global.currentGsvaSubTab = 'heatmap';
    global.switchGsvaSubTab = function (name) {
        global.currentGsvaSubTab = (name === 'table') ? 'table' : 'heatmap';
        var btns = document.querySelectorAll('#gsvaTab .gsva-sub-tab');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', btns[i].getAttribute('data-gsva-sub') === global.currentGsvaSubTab);
        }
        var panels = document.querySelectorAll('#gsvaTab .gsva-sub-panel');
        for (var j = 0; j < panels.length; j++) {
            var p = panels[j].getAttribute('data-gsva-panel');
            panels[j].style.display = (p === global.currentGsvaSubTab) ? 'flex' : 'none';
        }
        if (global.currentGsvaSubTab === 'heatmap' && state.rows) {
            setTimeout(function () { plotGsvaHeatmap(); }, 80);
        }
        if (typeof global.updateGsvaEmpty === 'function') global.updateGsvaEmpty();
    };

    /* ---------------- public API ---------------- */

    global.GsvaAnalysis = {
        run: runGsvaAnalysis,
        exportCsv: exportGsvaCsv,
        clear: clearGsvaResults,
        refreshLibraries: function () { refreshLibraryTree(); },
        onTreeCheck: onTreeCheck,
        onCustomGmtFile: onCustomGmtFile,
        updateMethodUi: updateMethodUi,
        collectSnapshot: collectGsvaSessionSnapshot,
        restoreSnapshot: restoreGsvaSessionSnapshot,
        getState: function () { return state; }
    };
    global.runGsvaAnalysis = runGsvaAnalysis;
    global.refreshGsvaLibraries = refreshLibraryTree;
    global.collectGsvaSessionSnapshot = collectGsvaSessionSnapshot;
    global.restoreGsvaSessionSnapshot = restoreGsvaSessionSnapshot;
    global.clearGsvaResults = clearGsvaResults;
    global.exportGsvaCsv = exportGsvaCsv;
    global.onCustomGsvaGmtFile = onCustomGmtFile;
    global.updateGsvaMethodUi = updateMethodUi;

    /* Build the library tree once the DOM is ready. */
    function initGsvaLibraries() {
        if (!el('gsvaLibraryTree')) {
            setTimeout(initGsvaLibraries, 300);
            return;
        }
        refreshLibraryTree();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGsvaLibraries);
    } else {
        initGsvaLibraries();
    }

})(window);
