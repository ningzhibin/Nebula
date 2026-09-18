/**
 * GSEA preranked analysis (Downstream → GSEA sub-tab).
 *
 * Method: Subramanian et al., PNAS 102(43):15545-15550 (2005), preranked mode.
 * Heavy statistics run in js/gsea.worker.js (weighted running-sum ES,
 * gene-set permutation null, same-sign NES, Laplace nominal p, official-style
 * permutation FDR, leading edge). This module handles the DOM: ranked-list
 * sources (Differential results / paste / .rnk upload), gene-set libraries
 * (embedded Hallmark / custom .gmt upload), run flow with progress, results
 * table (via TableDisplay), enrichment plot (Plotly), CSV export, and the
 * session-snapshot collect/restore pair.
 *
 * Globals like `currentData` are lexical `let`s in index.html and are
 * therefore read through `window` (they are bridged there) or passed in —
 * never redeclared here.
 */
(function (global) {
    'use strict';

    var worker = null;
    var jobSeq = 0;
    var running = false;

    var state = {
        results: null,
        filtered: [],
        summary: null,
        ranked: null,       // { genes:[], scores:[], metric, sourceLabel }
        params: null,
        selectedSet: null,
        customLibs: {}      // libName -> { name: [genes] }
    };

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
        var s = el('gseaStatus');
        if (s) { s.textContent = msg; s.style.color = isErr ? '#c0392b' : ''; }
    }
    function appendLog(msg) {
        var box = el('gseaAnalysisLogContent');
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
        if (typeof Worker === 'undefined' || !global._gseaWorkerSrc) {
            setStatus('Web Workers unavailable — GSEA cannot run in this browser.', true);
            return null;
        }
        try {
            var blob = new Blob([global._gseaWorkerSrc], { type: 'application/javascript' });
            worker = new Worker(URL.createObjectURL(blob));
            worker.onerror = function (err) {
                console.error('GSEA worker error:', err);
                running = false;
                progressHide();
                setStatus('GSEA worker error. See console.', true);
                var btn = el('gseaRunBtn');
                if (btn) btn.disabled = false;
            };
        } catch (e) {
            console.error('Failed to create GSEA worker:', e);
            worker = null;
        }
        return worker;
    }

    /* ---------------- gene-set libraries: MSigDB collection tree ---------------- */

    var MSIGDB_VERSION = 'v2026.1';
    /* Leaf file registry: leafKey -> { file, sets, sizeKb }. Files lazy-load
       on first selection (keeps boot fast; works on file://, unlike fetch). */
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
    /* Official collection hierarchy (human). A branch selection = union of its
       enabled descendant leaves. Licence-restricted leaves render disabled. */
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
    if (!state.checkedLeaves) state.checkedLeaves = { 'h.all': true };
    if (!state.checkedCustom) state.checkedCustom = {};

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
    function librarySetsForLeaf(key) {
        var libs = global.NEBULA_GSEA_LIBRARIES || {};
        return libs[key] || null;
    }
    function librarySetsFor(key) {
        if (key.indexOf('custom:') === 0) {
            var lib = key.slice(7);
            return state.customLibs[lib] || null;
        }
        return librarySetsForLeaf(key);
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
    /** Union of checked leaves + checked custom libs (first wins on name clash). */
    function librarySets() {
        var out = {};
        selectedLeafKeys().forEach(function (k) {
            var sets = librarySetsForLeaf(k) || {};
            Object.keys(sets).forEach(function (nm) {
                if (!out[nm]) out[nm] = sets[nm];
            });
        });
        selectedCustomLibs().forEach(function (lib) {
            var sets = state.customLibs[lib] || {};
            Object.keys(sets).forEach(function (nm) {
                if (!out[nm]) out[nm] = sets[nm];
            });
        });
        return out;
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

    var libLoaders = {};
    function appVersionQuery() {
        try {
            var t = (document.getElementById('appVersion') || {}).textContent || '';
            var v = String(t).trim().replace(/^v/i, '');
            return v ? '?v=' + v : '';
        } catch (e) { return ''; }
    }
    function ensureLibraryLoaded(key) {
        var def = MSIGDB_LEAVES[key];
        if (!def || !def.file) return Promise.resolve(true);
        if (librarySetsForLeaf(key)) return Promise.resolve(true);
        if (libLoaders[key]) return libLoaders[key];
        libLoaders[key] = new Promise(function (resolve, reject) {
            setStatus('Loading ' + key + ' library…');
            var s = document.createElement('script');
            s.src = def.file + appVersionQuery();
            s.onload = function () {
                delete libLoaders[key];
                if (librarySetsForLeaf(key)) { updateLibraryInfo(); resolve(true); }
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
        var keys = selectedLeafKeys().filter(function (k) { return !librarySetsForLeaf(k); });
        if (!keys.length) return Promise.resolve(true);
        setStatus('Loading ' + keys.length + ' librar' + (keys.length === 1 ? 'y' : 'ies') + '…');
        return Promise.all(keys.map(ensureLibraryLoaded)).then(function () { return true; });
    }

    function leafRowHtml(leafKey, leafTitle) {
        var def = MSIGDB_LEAVES[leafKey];
        var loaded = !!librarySetsForLeaf(leafKey);
        var meta = def.sets + ' sets' + (loaded ? ' (loaded)' : ' (≈' + sizeFmt(def.sizeKb) + ')');
        return '<label style="display:flex;align-items:center;gap:6px;font-weight:normal;">' +
            '<input type="checkbox" data-gsea-leaf="' + esc(leafKey) + '"' +
            (state.checkedLeaves[leafKey] ? ' checked' : '') + ' onchange="GseaAnalysis.onTreeCheck(this)">' +
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
                '<input type="checkbox" data-gsea-branch="' + esc(node.id) + '" onchange="GseaAnalysis.onTreeCheck(this)"> ' +
                esc(node.label) + '</label>';
            h += '<div class="gsea-lib-children">';
            node.children.forEach(function (ch) { h += treeNodeHtml(ch); });
            h += '</div>';
        }
        return h + '</div>';
    }
    function paintBranchStates() {
        var boxes = document.querySelectorAll('#gseaLibraryTree input[data-gsea-branch]');
        for (var i = 0; i < boxes.length; i++) {
            (function (box) {
                var node = findTreeNode(box.getAttribute('data-gsea-branch'));
                if (!node) return;
                var leaves = enabledLeavesUnder(node);
                var n = 0;
                leaves.forEach(function (k) { if (state.checkedLeaves[k]) n++; });
                box.checked = leaves.length > 0 && n === leaves.length;
                box.indeterminate = n > 0 && n < leaves.length;
            })(boxes[i]);
        }
    }
    function refreshLibraryDropdown() {
        var host = el('gseaLibraryTree');
        if (!host) return;
        var h = '';
        MSIGDB_TREE.forEach(function (n) { h += treeNodeHtml(n); });
        var customs = Object.keys(state.customLibs).sort();
        if (customs.length) {
            h += '<div class="gsea-lib-node" style="margin-top:6px;"><span style="font-weight:600;">Custom (.gmt uploads)</span></div>';
            customs.forEach(function (lib) {
                var n = Object.keys(state.customLibs[lib]).length;
                h += '<div class="gsea-lib-node"><label style="display:flex;align-items:center;gap:6px;font-weight:normal;">' +
                    '<input type="checkbox" data-gsea-custom="' + esc(lib) + '"' +
                    (state.checkedCustom[lib] !== false ? ' checked' : '') + ' onchange="GseaAnalysis.onTreeCheck(this)">' +
                    '<span>' + esc(lib) + ' <span class="gsea-lib-leaf-count">(' + n + ' sets)</span></span></label></div>';
            });
        }
        host.innerHTML = h;
        paintBranchStates();
        updateLibraryInfo();
    }
    function onTreeCheck(box) {
        var leaf = box.getAttribute('data-gsea-leaf');
        var branch = box.getAttribute('data-gsea-branch');
        var custom = box.getAttribute('data-gsea-custom');
        if (leaf) {
            state.checkedLeaves[leaf] = !!box.checked;
        } else if (branch) {
            var node = findTreeNode(branch);
            if (node) {
                enabledLeavesUnder(node).forEach(function (k) { state.checkedLeaves[k] = !!box.checked; });
                refreshLibraryDropdown();
                return;
            }
        } else if (custom) {
            state.checkedCustom[custom] = !!box.checked;
        }
        paintBranchStates();
        updateLibraryInfo();
    }

    function updateLibraryInfo() {
        var info = el('gseaLibraryInfo');
        if (!info) return;
        var keys = selectedLeafKeys();
        var customs = selectedCustomLibs();
        if (!keys.length && !customs.length) {
            info.textContent = 'Nothing selected — tick a collection or branch.';
            return;
        }
        var pending = keys.filter(function (k) { return !librarySetsForLeaf(k); });
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
                refreshLibraryDropdown();
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

    /* ---------------- ranked-list sources ---------------- */

    /** Per-matrix-row primary gene symbol (DIANN Genes → mapped symbol → label). */
    function matrixRowPrimarySymbols(cd) {
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

    /** Collapse duplicate symbols keeping max |score|; returns sorted-desc {genes, scores}. */
    function collapseAndSort(pairs) {
        var best = {};
        for (var i = 0; i < pairs.length; i++) {
            var sym = String(pairs[i][0] || '').trim().toUpperCase();
            var sc = pairs[i][1];
            if (!sym || !Number.isFinite(sc)) continue;
            if (best[sym] === undefined || Math.abs(sc) > Math.abs(best[sym])) best[sym] = sc;
        }
        var genes = Object.keys(best);
        genes.sort(function (a, b) { return best[b] - best[a]; });
        return { genes: genes, scores: genes.map(function (g) { return best[g]; }) };
    }

    /* diffAnalysisLastResult is a lexical let in index.html (not on window);
       read it through the bridged getter (other modules receive it via args). */
    function getDiffResult() {
        if (typeof global.getDiffAnalysisLastResult === 'function') {
            try { return global.getDiffAnalysisLastResult(); } catch (e) { return null; }
        }
        return global.diffAnalysisLastResult || null;
    }

    /* Hybrid Differential result lives on window.hybridState.result
       ({ proteins: [{ protein, log2FC, T, pBin, pInt, fdr, ... }], ... }).
       It counts as a "differential result" for the first radio option. */
    function getHybridResult() {
        try {
            var hs = global.hybridState || null;
            var res = hs ? hs.result : null;
            if (res && Array.isArray(res.proteins) && res.proteins.length) return res;
        } catch (e) { /* ignore */ }
        return null;
    }

    function hasHybridResults() {
        return !!getHybridResult();
    }

    function diffScoreFor(R, i, metric) {
        if (R.mode === 'anova') {
            var p = R.p ? R.p[i] : NaN;
            if (!Number.isFinite(p) || p <= 0) return NaN;
            return -Math.log10(Math.max(p, 1e-300));
        }
        if (metric === 't') return (R.t && Number.isFinite(R.t[i])) ? R.t[i] : NaN;
        if (metric === 'signedP' || metric === 'signedFDR') {
            var pv = metric === 'signedP' ? (R.p ? R.p[i] : NaN) : (R.padj ? R.padj[i] : NaN);
            var fc = (R.log2fc && Number.isFinite(R.log2fc[i])) ? R.log2fc[i] : NaN;
            if (!Number.isFinite(pv) || pv <= 0 || !Number.isFinite(fc)) return NaN;
            var s = -Math.log10(Math.max(pv, 1e-300));
            return fc < 0 ? -s : s;
        }
        var lf = (R.log2fc && Number.isFinite(R.log2fc[i])) ? R.log2fc[i] : NaN;
        return lf;
    }

    function metricLabel(R, metric) {
        if (R.mode === 'anova') return '-log10(p) [ANOVA, unsigned]';
        if (metric === 't') return 't-statistic';
        if (metric === 'signedP') return 'signed -log10(p)';
        if (metric === 'signedFDR') return 'signed -log10(FDR)';
        return 'log2FC';
    }

    function buildRankedFromHybrid(metric) {
        var H = getHybridResult();
        if (!H || !Array.isArray(H.proteins) || !H.proteins.length) {
            throw new Error('No Differential results. Run Downstream → Differential or Hybrid Differential first (or use expression matrix/paste/upload).');
        }
        var pairs = [];
        for (var i = 0; i < H.proteins.length; i++) {
            var x = H.proteins[i] || {};
            var sym = String(x.protein == null ? '' : x.protein).split(/\t|;|\|/)[0].trim();
            if (!sym) continue;
            var sc = NaN;
            if (metric === 't') {
                sc = Number.isFinite(x.T) ? x.T : NaN;
            } else if (metric === 'signedP' || metric === 'signedFDR') {
                var pv = metric === 'signedP'
                    ? Math.min(x.pBin, Number.isFinite(x.pInt) ? x.pInt : 1)
                    : (Number.isFinite(x.fdr) ? x.fdr : NaN);
                var fc = Number.isFinite(x.log2FC) ? x.log2FC : NaN;
                if (!Number.isFinite(pv) || pv <= 0 || !Number.isFinite(fc)) continue;
                var s = -Math.log10(Math.max(pv, 1e-300));
                sc = fc < 0 ? -s : s;
            } else {
                sc = Number.isFinite(x.log2FC) ? x.log2FC : NaN;
            }
            if (!Number.isFinite(sc)) continue;
            pairs.push([sym, sc]);
        }
        var collapsed = collapseAndSort(pairs);
        if (collapsed.genes.length < 50) {
            throw new Error('Only ' + collapsed.genes.length + ' scored genes from Hybrid differential results — need ≥ 50.');
        }
        var grp = 'hybrid';
        try {
            var ds = (global.hybridState && global.hybridState.dataset) ? global.hybridState.dataset : null;
            var gl = (ds && ds.groupLabels) || (H.groupLabels) || null;
            if (gl && gl.length >= 2) grp = 'hybrid ' + gl[0] + ' vs ' + gl[1];
        } catch (e) { /* keep default label */ }
        return {
            genes: collapsed.genes, scores: collapsed.scores,
            metric: metricLabel({ mode: 'two_group' }, metric) + ' [hybrid]',
            sourceLabel: 'Hybrid differential results [' + grp + ']'
        };
    }

    function buildRankedFromDiff(metric) {
        var R = getDiffResult();
        if (!R || !Array.isArray(R.labels) || !R.labels.length) {
            if (hasHybridResults()) return buildRankedFromHybrid(metric);
            throw new Error('No Differential results. Run Downstream → Differential or Hybrid Differential first (or use expression matrix/paste/upload).');
        }
        var cd = global.currentData || null;
        var rowSyms = (cd && cd.rowIds && cd.rowIds.length) ? matrixRowPrimarySymbols(cd) : null;
        var pairs = [];
        var n = R.labels.length;
        for (var i = 0; i < n; i++) {
            var sc = diffScoreFor(R, i, metric);
            if (!Number.isFinite(sc)) continue;
            var sym = '';
            if (rowSyms && R.rowFeatureIdx && i < R.rowFeatureIdx.length) {
                var ri = R.rowFeatureIdx[i];
                if (ri != null && ri >= 0 && ri < rowSyms.length) sym = rowSyms[ri];
            }
            if (!sym) sym = String(R.labels[i] == null ? '' : R.labels[i]).split(/\t|;|\|/)[0].trim();
            if (sym) pairs.push([sym, sc]);
        }
        var collapsed = collapseAndSort(pairs);
        if (collapsed.genes.length < 50) {
            throw new Error('Only ' + collapsed.genes.length + ' scored genes from Differential results — need ≥ 50.');
        }
        var grp = R.mode === 'anova'
            ? ('ANOVA' + (R.multiTest ? ' (' + R.multiTest + ')' : ''))
            : ('two-group ' + (R.groupA || '?') + ' vs ' + (R.groupB || '?'));
        return {
            genes: collapsed.genes, scores: collapsed.scores,
            metric: metricLabel(R, metric),
            sourceLabel: 'Differential results [' + grp + ']'
        };
    }

    /** Parse pasted/uploaded ranked text: "GENE<sep>score" per line (header-tolerant). */
    function parseRankedText(text) {
        var pairs = [];
        var lines = String(text || '').split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line.charAt(0) === '#') continue;
            var parts = line.split(/[\t,;]+/);
            if (parts.length < 2) {
                parts = line.split(/\s+/);
            }
            if (parts.length < 2) continue;
            var gene = parts[0].trim();
            var sc = parseFloat(parts[1]);
            if (!gene || !Number.isFinite(sc)) continue;
            pairs.push([gene, sc]);
        }
        return pairs;
    }

    function buildRankedFromPaste() {
        var ta = el('gseaPasteGenes');
        var pairs = parseRankedText(ta ? ta.value : '');
        if (!pairs.length) throw new Error('Paste at least "GENE <tab> score" lines (one per line).');
        var collapsed = collapseAndSort(pairs);
        if (collapsed.genes.length < 50) {
            throw new Error('Only ' + collapsed.genes.length + ' scored genes parsed — need ≥ 50.');
        }
        return { genes: collapsed.genes, scores: collapsed.scores, metric: 'user-supplied score', sourceLabel: 'Pasted list' };
    }

    function buildRankedFromFile() {
        var input = el('gseaRankedFile');
        var f = input && input.files && input.files[0];
        if (!f) throw new Error('Choose a ranked-list file (.rnk / .tsv / .csv: gene + score).');
        return new Promise(function (resolve, reject) {
            var rd = new FileReader();
            rd.onload = function () {
                try {
                    var pairs = parseRankedText(rd.result);
                    if (!pairs.length) throw new Error('No "gene + score" rows parsed from ' + f.name + '.');
                    var collapsed = collapseAndSort(pairs);
                    if (collapsed.genes.length < 50) throw new Error('Only ' + collapsed.genes.length + ' scored genes — need ≥ 50.');
                    resolve({
                        genes: collapsed.genes, scores: collapsed.scores,
                        metric: 'user-supplied score', sourceLabel: 'File: ' + f.name
                    });
                } catch (e) { reject(e); }
            };
            rd.onerror = function () { reject(new Error('Could not read ' + f.name + '.')); };
            rd.readAsText(f);
        });
    }

    /* ---------------- gene-source UI ---------------- */

    function hasDiffResults() {
        var R = getDiffResult();
        if (R && Array.isArray(R.labels) && R.labels.length) return true;
        return hasHybridResults();
    }

    function hasMatrixData() {
        var m = matrixValues();
        return !!(m && m.length);
    }

    function refreshGseaGeneSourceOptions() {
        var rPaste = el('gseaGeneSourcePaste');
        var rDiff = el('gseaGeneSourceDiff');
        var rFile = el('gseaGeneSourceFile');
        var rMatrix = el('gseaGeneSourceMatrix');
        if (!rPaste || !rDiff || !rFile) return;
        var hasDiff = hasDiffResults();
        var hasMatrix = hasMatrixData();
        rDiff.disabled = !hasDiff;
        if (rMatrix) rMatrix.disabled = !hasMatrix;
        var sel = document.querySelector('input[name="gseaGeneSource"]:checked');
        if (!sel || sel.disabled) {
            if (hasDiff) rDiff.checked = true;
            else if (rMatrix && hasMatrix) rMatrix.checked = true;
            else rPaste.checked = true;
        } else if (hasDiff && window._gseaPrevHadDiff === false &&
                   (sel.value === 'paste' || sel.value === 'matrix')) {
            rDiff.checked = true;
        } else if (hasMatrix && window._gseaPrevHadMatrix === false &&
                   !hasDiff && sel.value === 'paste' && rMatrix) {
            rMatrix.checked = true;
        }
        window._gseaPrevHadDiff = hasDiff;
        window._gseaPrevHadMatrix = hasMatrix;
        if (typeof updateGseaGeneSourceUi === 'function') updateGseaGeneSourceUi();
    }

    function updateGseaGeneSourceUi() {
        var sel = document.querySelector('input[name="gseaGeneSource"]:checked');
        var v = sel ? sel.value : 'paste';
        var pasteRow = el('gseaPasteRow');
        var fileRow = el('gseaFileRow');
        var metricRow = el('gseaMetricRow');
        var matrixRow = el('gseaMatrixRow');
        if (pasteRow) pasteRow.style.display = v === 'paste' ? '' : 'none';
        if (fileRow) fileRow.style.display = v === 'file' ? '' : 'none';
        if (metricRow) metricRow.style.display = v === 'diff' ? '' : 'none';
        if (matrixRow) matrixRow.style.display = v === 'matrix' ? '' : 'none';
        if (v === 'matrix') populateGseaMatrixGroups();
    }

    /* ---------------- expression-matrix direct source ---------------- */

    /** Working matrix as rows of numbers (features × samples). */
    function matrixValues() {
        var m = global.currentDataMatrix;
        if (Array.isArray(m) && m.length && Array.isArray(m[0])) return m;
        var cd = global.currentData;
        if (cd && Array.isArray(cd.dataMatrix) && cd.dataMatrix.length && Array.isArray(cd.dataMatrix[0])) return cd.dataMatrix;
        return null;
    }

    function gseaMetaHeaders() {
        var md = global.metaData;
        if (md && Array.isArray(md.headers)) {
            return md.headers.filter(function (h) { return h && String(h).trim() !== '' && h !== 'Sample_ID'; });
        }
        return [];
    }

    function populateGseaMatrixGroups() {
        var mc = el('gseaMatrixMetaCol');
        var ga = el('gseaMatrixGroupA');
        var gb = el('gseaMatrixGroupB');
        if (!mc || !ga || !gb) return;
        var prevCol = mc.value, prevA = ga.value, prevB = gb.value;
        var cols = gseaMetaHeaders();
        mc.innerHTML = '';
        if (!cols.length) {
            var o = document.createElement('option');
            o.value = ''; o.textContent = '(No meta table)';
            mc.appendChild(o);
        } else {
            cols.forEach(function (c) {
                var op = document.createElement('option');
                op.value = c; op.textContent = c;
                mc.appendChild(op);
            });
            if (prevCol && cols.indexOf(prevCol) >= 0) mc.value = prevCol;
        }
        refreshGseaMatrixLevels(prevA, prevB);
    }

    function refreshGseaMatrixLevels(prevA, prevB) {
        var mc = el('gseaMatrixMetaCol');
        var ga = el('gseaMatrixGroupA');
        var gb = el('gseaMatrixGroupB');
        if (!mc || !ga || !gb) return;
        ga.innerHTML = ''; gb.innerHTML = '';
        var levels = [];
        if (mc.value && typeof global.listGseaMatrixGroupLevels === 'function') {
            try { levels = global.listGseaMatrixGroupLevels(mc.value) || []; } catch (e) { levels = []; }
        }
        levels.forEach(function (v) {
            var oa = document.createElement('option');
            oa.value = v; oa.textContent = v;
            var ob = oa.cloneNode(true);
            ga.appendChild(oa); gb.appendChild(ob);
        });
        if (levels.length >= 1) {
            if (prevA && levels.indexOf(prevA) >= 0) ga.value = prevA;
            else ga.selectedIndex = 0;
            if (prevB && levels.indexOf(prevB) >= 0) gb.value = prevB;
            else gb.selectedIndex = levels.length >= 2 ? 1 : 0;
        }
        updateGseaMatrixCounts();
    }

    function updateGseaMatrixCounts() {
        var box = el('gseaMatrixGroupCounts');
        if (!box) return;
        var mc = el('gseaMatrixMetaCol');
        var ga = el('gseaMatrixGroupA');
        var gb = el('gseaMatrixGroupB');
        if (!mc || !mc.value || !ga || !gb || typeof global.resolveGseaMatrixGroupIndices !== 'function') {
            box.textContent = '';
            return;
        }
        var r = global.resolveGseaMatrixGroupIndices(mc.value, ga.value, gb.value);
        box.textContent = 'Group A ' + (ga.value || '?') + ': n=' + r.idxA.length +
            '  |  Group B ' + (gb.value || '?') + ': n=' + r.idxB.length;
    }

    function meanSd(vals) {
        var n = vals.length;
        if (n === 0) return { mean: NaN, sd: NaN, n: 0 };
        var s = 0, i;
        for (i = 0; i < n; i++) s += vals[i];
        var mean = s / n;
        if (n < 2) return { mean: mean, sd: NaN, n: n };
        var q = 0;
        for (i = 0; i < n; i++) { var d = vals[i] - mean; q += d * d; }
        return { mean: mean, sd: Math.sqrt(q / (n - 1)), n: n };
    }

    function matrixMetricLabel(metric) {
        if (metric === 't') return 't-statistic (Welch)';
        if (metric === 'z') return 'z-statistic (std. mean diff.)';
        if (metric === 's2n') return 'signal-to-noise';
        return 'log2FC';
    }

    /** Ranked list straight from the expression matrix (no Differential run).
        Metrics mirror the two-group Differential preprocessing. */
    function buildRankedFromMatrix() {
        var m = matrixValues();
        if (!m) throw new Error('No expression matrix. Load data in Data Preparation first.');
        var mc = el('gseaMatrixMetaCol');
        var ga = el('gseaMatrixGroupA');
        var gb = el('gseaMatrixGroupB');
        var metaCol = mc ? mc.value : '';
        var valA = ga ? ga.value : '';
        var valB = gb ? gb.value : '';
        if (!metaCol) throw new Error('Pick a Group-by meta column.');
        if (!valA || !valB) throw new Error('Pick Group A and Group B levels.');
        if (valA === valB) throw new Error('Group A and Group B must differ.');
        if (typeof global.resolveGseaMatrixGroupIndices !== 'function') {
            throw new Error('Matrix group join unavailable.');
        }
        var g = global.resolveGseaMatrixGroupIndices(metaCol, valA, valB);
        if (g.idxA.length < 2 || g.idxB.length < 2) {
            throw new Error('Need ≥2 samples per group (A: ' + g.idxA.length + ', B: ' + g.idxB.length + ').');
        }
        var metric = selVal('gseaMatrixMetric', 'log2fc');
        var log2on = checkVal('gseaMatrixLog2');
        var zeroMissing = checkVal('gseaMatrixZeroMissing');
        var cd = global.currentData || null;
        var rowSyms = (cd && cd.rowIds && cd.rowIds.length === m.length) ? matrixRowPrimarySymbols(cd) : null;
        var rowIds = (cd && Array.isArray(cd.rowIds)) ? cd.rowIds : null;
        var pairs = [];
        var skipped = 0;
        for (var i = 0; i < m.length; i++) {
            var row = m[i];
            if (!Array.isArray(row)) { skipped++; continue; }
            var va = [], vb = [], j, v;
            for (j = 0; j < g.idxA.length; j++) {
                v = parseFloat(row[g.idxA[j]]);
                if (!Number.isFinite(v)) continue;
                if (zeroMissing && v === 0) continue;
                if (log2on) {
                    if (v <= 0) continue;
                    v = Math.log2(v + 1);
                }
                va.push(v);
            }
            for (j = 0; j < g.idxB.length; j++) {
                v = parseFloat(row[g.idxB[j]]);
                if (!Number.isFinite(v)) continue;
                if (zeroMissing && v === 0) continue;
                if (log2on) {
                    if (v <= 0) continue;
                    v = Math.log2(v + 1);
                }
                vb.push(v);
            }
            var sa = meanSd(va), sb = meanSd(vb);
            if (sa.n < 2 || sb.n < 2 || !Number.isFinite(sa.sd) || !Number.isFinite(sb.sd)) { skipped++; continue; }
            var sc = NaN;
            var md = sb.mean - sa.mean;
            if (metric === 't') {
                var se = Math.sqrt(sb.sd * sb.sd / sb.n + sa.sd * sa.sd / sa.n);
                if (se > 0 && Number.isFinite(se)) sc = md / se;
                else if (md === 0) sc = 0;
                else sc = md > 0 ? 1e12 : -1e12;
            } else if (metric === 'z') {
                var pooled = Math.sqrt(((sb.n - 1) * sb.sd * sb.sd + (sa.n - 1) * sa.sd * sa.sd) / (sb.n + sa.n - 2));
                if (pooled > 0) sc = md / pooled;
            } else if (metric === 's2n') {
                var denom = sb.sd + sa.sd;
                if (denom > 0) sc = md / denom;
            } else if (log2on) {
                sc = md;
            } else {
                var pc = numVal('gseaMatrixPseudocount', 1);
                if (!(pc >= 0)) pc = 1;
                sc = Math.log2((sb.mean + pc) / (sa.mean + pc));
            }
            if (!Number.isFinite(sc)) { skipped++; continue; }
            var sym = (rowSyms && rowSyms[i]) ? rowSyms[i] :
                (rowIds && rowIds[i] != null ? String(rowIds[i]).split(/\t|;|\|/)[0].trim() : ('row' + i));
            if (sym) pairs.push([sym, sc]);
        }
        var collapsed = collapseAndSort(pairs);
        if (collapsed.genes.length < 50) {
            throw new Error('Only ' + collapsed.genes.length + ' scored genes — need ≥ 50 (' + skipped + ' rows skipped).');
        }
        return {
            genes: collapsed.genes, scores: collapsed.scores,
            metric: matrixMetricLabel(metric) + (log2on ? ' [log2]' : ' [raw]'),
            sourceLabel: 'Expression matrix [' + valA + ' (n=' + g.idxA.length + ') vs ' + valB + ' (n=' + g.idxB.length + ')]'
        };
    }

    /* ---------------- run flow ---------------- */

    function readOptions() {
        return {
            weightP: numVal('gseaWeightP', 1),
            nPerm: Math.round(numVal('gseaNPerm', 1000)),
            minSize: Math.round(numVal('gseaMinSize', 15)),
            maxSize: Math.round(numVal('gseaMaxSize', 500)),
            seed: Math.round(numVal('gseaSeed', 42)),
            metric: selVal('gseaMetric', 'log2fc')
        };
    }

    function runGseaAnalysis() {
        if (running) { setStatus('GSEA already running…'); return; }
        var W = ensureWorker();
        if (!W) return;
        var sel = document.querySelector('input[name="gseaGeneSource"]:checked');
        var source = sel ? sel.value : 'paste';
        var metric = selVal('gseaMetric', 'log2fc');

        function startWith(ranked) {
            var keys = selectedLeafKeys();
            var customs = selectedCustomLibs();
            if (!keys.length && !customs.length) {
                setStatus('No gene sets selected — tick a collection or branch in the library tree.', true);
                return;
            }
            ensureSelectedLibraries().then(function () {
                if (!Object.keys(librarySets()).length) { setStatus('Selected libraries failed to load.', true); return; }
                startWithLoaded(ranked);
            }, function (e) { setStatus((e && e.message) || String(e), true); });
        }

        function startWithLoaded(ranked) {
            var sets = librarySets();
            if (!sets) { setStatus('Gene-set library missing.', true); return; }
            var names = Object.keys(sets);
            if (!names.length) { setStatus('Selected library is empty.', true); return; }
            if (names.length > 2500) {
                appendLog('Large library (' + names.length + ' sets): expect a long run — consider fewer permutations or a higher Min set size.');
            }
            var opts = readOptions();
            opts.nPerm = Math.max(100, Math.min(10000, opts.nPerm || 1000));
            opts.minSize = Math.max(1, opts.minSize || 15);
            opts.maxSize = Math.max(opts.minSize, opts.maxSize || 500);
            if (!(opts.weightP >= 0)) opts.weightP = 1;
            running = true;
            var btn = el('gseaRunBtn');
            if (btn) btn.disabled = true;
            var jobId = ++jobSeq;
            state.ranked = ranked;
            state.params = {
                source: source, metric: ranked.metric, sourceLabel: ranked.sourceLabel,
                library: libraryLabel(),
                libraryKeys: selectedLeafKeys(),
                libraryCustom: selectedCustomLibs(),
                matrixGroup: source === 'matrix' ? {
                    metaCol: (el('gseaMatrixMetaCol') || {}).value || '',
                    valA: (el('gseaMatrixGroupA') || {}).value || '',
                    valB: (el('gseaMatrixGroupB') || {}).value || '',
                    metric: selVal('gseaMatrixMetric', 'log2fc'),
                    log2: checkVal('gseaMatrixLog2'),
                    zeroMissing: checkVal('gseaMatrixZeroMissing'),
                    pseudo: numVal('gseaMatrixPseudocount', 1)
                } : null,
                weightP: opts.weightP, nPerm: opts.nPerm,
                minSize: opts.minSize, maxSize: opts.maxSize, seed: opts.seed
            };
            state.results = null; state.filtered = []; state.selectedSet = null;
            setStatus('Running GSEA on ' + ranked.genes.length + ' ranked genes × ' + names.length + ' sets (' + opts.nPerm + ' perms)…');
            appendLog('Run started: ' + ranked.sourceLabel + ' [' + ranked.metric + ', n=' + ranked.genes.length + '] vs ' + state.params.library + '.');
            progressShow('GSEA running…');
            W.onmessage = function (ev) {
                var msg = ev.data || {};
                if (msg.jobId !== jobId) return;
                if (msg.type === 'progress') {
                    var frac = msg.total ? msg.done / msg.total : 0;
                    progressUpdate(Math.round(frac * 100), 'GSEA: ' + msg.done + '/' + msg.total + ' sets');
                } else if (msg.type === 'done') {
                    running = false;
                    progressHide();
                    if (btn) btn.disabled = false;
                    onGseaDone(msg);
                } else if (msg.type === 'error') {
                    running = false;
                    progressHide();
                    if (btn) btn.disabled = false;
                    setStatus('GSEA failed: ' + (msg.message || 'worker error'), true);
                    appendLog('Run failed: ' + (msg.message || 'worker error'));
                }
            };
            W.postMessage({
                type: 'run', jobId: jobId,
                genes: ranked.genes, scores: ranked.scores,
                sets: sets, opts: opts
            });
        }

        try {
            if (source === 'diff') {
                startWith(buildRankedFromDiff(metric));
            } else if (source === 'matrix') {
                startWith(buildRankedFromMatrix());
            } else if (source === 'file') {
                var p = buildRankedFromFile();
                if (p && typeof p.then === 'function') {
                    p.then(startWith, function (e) { setStatus(e.message || String(e), true); });
                } else startWith(p);
            } else {
                startWith(buildRankedFromPaste());
            }
        } catch (e) {
            setStatus(e.message || String(e), true);
        }
    }

    function onGseaDone(msg) {
        state.results = msg.results || [];
        state.filtered = msg.filtered || [];
        state.summary = msg.summary || null;
        var p = state.params || {};
        var sig = state.results.filter(function (r) { return r.fdr < 0.25; }).length;
        setStatus('Done: ' + state.results.length + ' sets tested (' + state.filtered.length + ' filtered by size), ' + sig + ' with FDR < 0.25.');
        appendLog('Done: ' + state.results.length + ' tested, ' + state.filtered.length + ' size-filtered, ' + sig + ' FDR<0.25. ES range [' +
            (state.results.length ? Math.min.apply(null, state.results.map(function (r) { return r.es; })).toFixed(3) : '—') + ', ' +
            (state.results.length ? Math.max.apply(null, state.results.map(function (r) { return r.es; })).toFixed(3) : '—') + '].');
        renderGseaResultsTable();
        refreshPlotSetDropdown();
        if (state.results.length) {
            plotSetEnrichment(state.results[0].name);
        }
        if (typeof switchGseaSubTab === 'function') switchGseaSubTab('results');
        if (typeof global.updateGseaEmpty === 'function') global.updateGseaEmpty();
    }

    /* ---------------- results table ---------------- */

    function fmtP(x) {
        if (!Number.isFinite(x)) return '—';
        if (x === 0) return '<1e-300';
        if (x < 0.001) return x.toExponential(1);
        return x.toFixed(4);
    }

    function renderGseaResultsTable() {
        var host = el('gseaResultsHost');
        if (!host) return;
        if (!state.results || !state.results.length) {
            host.innerHTML = '';
            return;
        }
        var rows = state.results.map(function (r) {
            var le = r.leadingEdge || [];
            return {
                set: r.name,
                size: r.size,
                es: r.es, nes: r.nes, p: r.p, fdr: r.fdr,
                leN: le.length,
                dir: r.es >= 0 ? 'Up' : 'Down',
                leGenes: le.join(', ')
            };
        });
        function numRender(key, digits) {
            return function (data, type) {
                if (type === 'sort' || type === 'type' || type === 'filter') {
                    return Number.isFinite(data) ? data : null;
                }
                if (!Number.isFinite(data)) return '—';
                return digits != null ? Number(data).toFixed(digits) : String(data);
            };
        }
        var cols = [
            { key: 'set', title: 'Gene set', className: 'dt-type-string' },
            { key: 'size', title: 'Size', className: 'dt-type-numeric' },
            { key: 'es', title: 'ES', className: 'dt-type-numeric', render: numRender('es', 3) },
            { key: 'nes', title: 'NES', className: 'dt-type-numeric', render: numRender('nes', 3) },
            {
                key: 'p', title: 'p', className: 'dt-type-numeric',
                render: function (data, type) {
                    if (type === 'sort' || type === 'type' || type === 'filter') return Number.isFinite(data) ? data : null;
                    return esc(fmtP(data));
                }
            },
            {
                key: 'fdr', title: 'FDR', className: 'dt-type-numeric',
                render: function (data, type, row) {
                    if (type === 'sort' || type === 'type' || type === 'filter') return Number.isFinite(data) ? data : null;
                    var bg = Number.isFinite(data) && data < 0.25 ? 'rgba(46,160,67,0.25)' : 'transparent';
                    return '<span style="display:block;background:' + bg + ';padding:2px 4px;border-radius:4px;">' + esc(fmtP(data)) + '</span>';
                }
            },
            {
                key: 'leN', title: 'Leading edge', className: 'dt-type-numeric',
                render: function (data, type, row) {
                    if (type === 'sort' || type === 'type' || type === 'filter') return Number.isFinite(data) ? data : null;
                    return '<span title="' + esc(row.leGenes || '').slice(0, 400) + '">' + esc(String(data)) + ' genes</span>';
                }
            },
            { key: 'dir', title: 'Dir', className: 'dt-type-string' }
        ];
        if (global.TableDisplay && typeof global.TableDisplay.renderGenericTable === 'function') {
            void global.TableDisplay.renderGenericTable(host, {
                data: rows, columns: cols,
                tableClassName: 'gsea-results-table',
                rootClassName: 'gsea-results-table-root',
                pageLength: 25, numericBars: false,
                onInit: function (inst, rootEl, tableEl) {
                    try {
                        var tbodyEl = tableEl && tableEl.querySelector('tbody');
                        if (tbodyEl && !tbodyEl._gseaPlotWired) {
                            tbodyEl._gseaPlotWired = true;
                            tbodyEl.addEventListener('click', function (e) {
                                var tr = e.target && e.target.closest ? e.target.closest('tr') : null;
                                if (!tr) return;
                                var d = null;
                                try { d = inst.row(tr).data(); } catch (_) { d = null; }
                                if (!d || !d.set) return;
                                var prev = tbodyEl.querySelectorAll('tr.gsea-row-selected');
                                for (var pi = 0; pi < prev.length; pi++) prev[pi].classList.remove('gsea-row-selected');
                                tr.classList.add('gsea-row-selected');
                                plotSetEnrichment(d.set);
                            });
                        }
                        var target = state.selectedSet || ((state.results || [])[0] || {}).name;
                        if (target && tbodyEl) {
                            var rows = tbodyEl.querySelectorAll('tr');
                            for (var ri = 0; ri < rows.length; ri++) {
                                var rd = null;
                                try { rd = inst.row(rows[ri]).data(); } catch (_) { rd = null; }
                                if (rd && rd.set === target) { rows[ri].classList.add('gsea-row-selected'); break; }
                            }
                        }
                    } catch (_) { /* row-click wiring is best effort */ }
                }
            }).catch(function (ex) { console.error('GSEA table:', ex); });
        } else {
            var html = '<p class="small">TableDisplay unavailable.</p>';
            host.innerHTML = html;
        }
    }

    function refreshPlotSetDropdown() {
        var sel = el('gseaPlotSet');
        if (!sel) return;
        sel.innerHTML = '';
        (state.results || []).forEach(function (r) {
            var o = document.createElement('option');
            o.value = r.name;
            o.textContent = r.name + ' (FDR ' + fmtP(r.fdr) + ')';
            sel.appendChild(o);
        });
        if (state.selectedSet) sel.value = state.selectedSet;
        else if (state.results && state.results.length) sel.value = state.results[0].name;
    }

    /* ---------------- enrichment plot (official 3-panel) ---------------- */

    function isDark() {
        try {
            if (typeof global.nebulaIsDarkTheme === 'function') return global.nebulaIsDarkTheme();
            return document.documentElement.getAttribute('data-theme') === 'dark';
        } catch (e) { return false; }
    }

    function plotSetEnrichment(name) {
        var host = el('gseaPlotEnrichment');
        if (!host || !global.Plotly) return;
        var res = null, i;
        for (i = 0; i < (state.results || []).length; i++) {
            if (state.results[i].name === name) { res = state.results[i]; break; }
        }
        if (!res) { host.innerHTML = ''; return; }
        state.selectedSet = name;
        var sel = el('gseaPlotSet');
        if (sel) sel.value = name;
        var ranked = state.ranked;
        var N = ranked ? ranked.genes.length : 0;
        var cx = res.curveX || [], cy = res.curveY || [];
        var dark = isDark();
        var tickCol = dark ? '#94a3b8' : '#333333';
        var leSet = {};
        (res.leadingEdge || []).forEach(function (g) { leSet[g] = true; });

        /* Hit rug: leading-edge vs rest. Need rank positions of hits. */
        var posOf = {};
        if (ranked) {
            for (var pi = 0; pi < ranked.genes.length; pi++) {
                var k = String(ranked.genes[pi]).toUpperCase();
                if (posOf[k] === undefined) posOf[k] = pi;
            }
        }
        var leX = [], restX = [];
        /* Recover hit positions: leading edge + matched genes. Worker sends
           leadingEdge symbols; non-LE hit ranks are not sent, so re-derive
           all hit ranks from the ranked list via the gene-set membership. */
        var setMembers = currentSetMembers(res.name);
        for (var mi = 0; mi < setMembers.length; mi++) {
            var px = posOf[String(setMembers[mi]).toUpperCase()];
            if (px === undefined) continue;
            if (leSet[String(setMembers[mi]).toUpperCase()]) leX.push(px);
            else restX.push(px);
        }
        /* Metric bars (downsampled). */
        var barX = [], barY = [], barC = [];
        if (ranked && ranked.scores.length) {
            var stride = Math.max(1, Math.ceil(ranked.scores.length / 1200));
            for (var bi = 0; bi < ranked.scores.length; bi += stride) {
                var v = ranked.scores[bi];
                if (!Number.isFinite(v)) continue;
                barX.push(bi); barY.push(v);
                barC.push(v >= 0 ? '#d62728' : '#1f77b4');
            }
        }
        var metricName = (state.params && state.params.metric) || 'score';
        var title = esc(res.name) + '<br><sub>ES ' + res.es.toFixed(3) +
            ' · NES ' + res.nes.toFixed(3) +
            ' · p ' + fmtP(res.p) + ' · FDR ' + fmtP(res.fdr) + '</sub>';
        var data = [
            {
                x: cx, y: cy, type: 'scatter', mode: 'lines', name: 'Running ES',
                line: { color: '#2ca02c', width: 2 }, xaxis: 'x', yaxis: 'y',
                hovertemplate: 'rank %{x}<br>ES %{y:.3f}<extra></extra>'
            },
            {
                x: restX, y: restX.map(function () { return 0.5; }),
                type: 'scatter', mode: 'markers', name: 'Hits',
                marker: { symbol: 'line-ns-open', size: 9, color: tickCol },
                xaxis: 'x2', yaxis: 'y2', hoverinfo: 'skip', showlegend: false
            },
            {
                x: leX, y: leX.map(function () { return 0.5; }),
                type: 'scatter', mode: 'markers', name: 'Leading edge',
                marker: { symbol: 'line-ns-open', size: 11, color: '#c0392b', line: { width: 1.5 } },
                xaxis: 'x2', yaxis: 'y2', hoverinfo: 'skip', showlegend: false
            },
            {
                x: barX, y: barY, type: 'bar', name: metricName,
                marker: { color: barC }, xaxis: 'x3', yaxis: 'y3',
                hovertemplate: 'rank %{x}<br>' + metricName + ' %{y:.3f}<extra></extra>', showlegend: false
            }
        ];
        var peakShape = {
            type: 'line', xref: 'x', yref: 'paper',
            x0: res.peakRank, x1: res.peakRank, y0: 0.64, y1: 1,
            line: { color: tickCol, width: 1, dash: 'dash' }
        };
        var layout = {
            title: { text: title, font: { size: 13 } },
            height: 560,
            margin: { l: 56, r: 16, t: 64, b: 36 },
            showlegend: false,
            shapes: [peakShape],
            xaxis: { domain: [0, 1], showticklabels: false, zeroline: false, title: '' },
            yaxis: { domain: [0.64, 1], title: 'Enrichment score', zeroline: true, zerolinecolor: tickCol },
            xaxis2: { domain: [0, 1], matches: 'x', showticklabels: false, zeroline: false },
            yaxis2: { domain: [0.5, 0.6], showticklabels: false, zeroline: false, fixedrange: true },
            xaxis3: { domain: [0, 1], matches: 'x', title: 'Rank in ordered gene list' },
            yaxis3: { domain: [0, 0.42], title: metricName, zeroline: true, zerolinecolor: tickCol }
        };
        try {
            global.Plotly.react(host, data, layout, { responsive: true, displayModeBar: true });
        } catch (e) {
            console.error('GSEA plot:', e);
        }
    }

    function currentSetMembers(name) {
        var sets = librarySets();
        if (sets && sets[name]) return sets[name];
        return [];
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

    function exportGseaCsv() {
        if (!state.results || !state.results.length) { setStatus('Nothing to export — run GSEA first.', true); return; }
        function q(s) {
            s = String(s == null ? '' : s);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }
        var lines = ['gene_set,size,ES,NES,p,FDR,direction,n_leading_edge,leading_edge_genes'];
        state.results.forEach(function (r) {
            lines.push([q(r.name), r.size, r.es.toFixed(4), r.nes.toFixed(4),
                r.p.toExponential(3), r.fdr.toExponential(3),
                r.es >= 0 ? 'up' : 'down',
                (r.leadingEdge || []).length, q((r.leadingEdge || []).join(';'))].join(','));
        });
        downloadText('nebula_gsea_results.csv', lines.join('\n'), 'text/csv;charset=utf-8');
        appendLog('Results exported to nebula_gsea_results.csv (' + state.results.length + ' sets).');
    }

    /* ---------------- session snapshot ---------------- */

    function collectGseaSessionSnapshot() {
        if (!state.results || !state.results.length) return null;
        var snap = {
            v: 1,
            params: state.params,
            summary: state.summary,
            results: state.results,
            filtered: state.filtered,
            selectedSet: state.selectedSet,
            rankedMeta: state.ranked ? {
                n: state.ranked.genes.length,
                metric: state.ranked.metric,
                sourceLabel: state.ranked.sourceLabel
            } : null
        };
        if (state.ranked && state.ranked.genes.length <= 60000) {
            snap.ranked = { genes: state.ranked.genes, scores: state.ranked.scores };
        }
        var customBytes = 0;
        try { customBytes = JSON.stringify(state.customLibs).length; } catch (e) {}
        if (customBytes > 0 && customBytes <= 500000) snap.customLibs = state.customLibs;
        return snap;
    }

    function restoreGseaSessionSnapshot(bundle) {
        if (!bundle || !bundle.results || !bundle.results.length) return false;
        state.params = bundle.params || null;
        state.summary = bundle.summary || null;
        state.results = bundle.results;
        state.filtered = bundle.filtered || [];
        state.selectedSet = bundle.selectedSet || null;
        if (bundle.customLibs) {
            state.customLibs = bundle.customLibs;
            refreshLibraryDropdown(true);
        }
        if (bundle.ranked && bundle.ranked.genes && bundle.ranked.genes.length) {
            state.ranked = {
                genes: bundle.ranked.genes, scores: bundle.ranked.scores,
                metric: (bundle.rankedMeta && bundle.rankedMeta.metric) || '',
                sourceLabel: ((bundle.rankedMeta && bundle.rankedMeta.sourceLabel) || 'session') + ' (restored)'
            };
        } else {
            state.ranked = null;
        }
        /* Restore sidebar controls from params. */
        try {
            if (state.params) {
                var src = document.querySelector('input[name="gseaGeneSource"][value="' + state.params.source + '"]');
                if (src && !src.disabled) src.checked = true;
                if (state.params.source === 'matrix' && state.params.matrixGroup) {
                    var mg = state.params.matrixGroup;
                    populateGseaMatrixGroups();
                    var mmc = el('gseaMatrixMetaCol');
                    if (mmc && mg.metaCol) {
                        var hasCol = false;
                        for (var ci = 0; ci < mmc.options.length; ci++) {
                            if (mmc.options[ci].value === mg.metaCol) { hasCol = true; break; }
                        }
                        if (hasCol) mmc.value = mg.metaCol;
                    }
                    refreshGseaMatrixLevels(mg.valA, mg.valB);
                    var mmet = el('gseaMatrixMetric');
                    if (mmet && mg.metric) mmet.value = mg.metric;
                    var ml2 = el('gseaMatrixLog2');
                    if (ml2) ml2.checked = mg.log2 !== false;
                    var mzm = el('gseaMatrixZeroMissing');
                    if (mzm) mzm.checked = mg.zeroMissing !== false;
                    var mpc = el('gseaMatrixPseudocount');
                    if (mpc && Number.isFinite(mg.pseudo)) mpc.value = mg.pseudo;
                    updateGseaMatrixCounts();
                }
                var m = el('gseaMetric');
                if (m && state.params.metric) {
                    for (var i = 0; i < m.options.length; i++) {
                        if (m.options[i].text === state.params.metric ||
                            m.options[i].value === state.params.metric) { m.value = m.options[i].value; break; }
                    }
                }
                if (state.params.libraryKeys && state.params.libraryKeys.length) {
                    state.checkedLeaves = {};
                    state.params.libraryKeys.forEach(function (k) {
                        if (k === 'hallmark') k = 'h.all';
                        if (MSIGDB_LEAVES[k]) state.checkedLeaves[k] = true;
                    });
                } else if (state.params.libraryKey) {
                    var legacyKey = state.params.libraryKey === 'hallmark' ? 'h.all' : state.params.libraryKey;
                    if (legacyKey.indexOf('custom:') === 0) {
                        state.checkedCustom[legacyKey.slice(7)] = true;
                    } else if (MSIGDB_LEAVES[legacyKey]) {
                        state.checkedLeaves = {};
                        state.checkedLeaves[legacyKey] = true;
                    }
                }
                if (state.params.libraryCustom && state.params.libraryCustom.length) {
                    state.params.libraryCustom.forEach(function (lib) {
                        if (state.customLibs[lib]) state.checkedCustom[lib] = true;
                    });
                }
                refreshLibraryDropdown();
                if (el('gseaWeightP')) el('gseaWeightP').value = state.params.weightP;
                if (el('gseaNPerm')) el('gseaNPerm').value = state.params.nPerm;
                if (el('gseaMinSize')) el('gseaMinSize').value = state.params.minSize;
                if (el('gseaMaxSize')) el('gseaMaxSize').value = state.params.maxSize;
                if (el('gseaSeed')) el('gseaSeed').value = state.params.seed;
            }
        } catch (e) { /* best effort */ }
        updateGseaGeneSourceUi();
        updateLibraryInfo();
        renderGseaResultsTable();
        refreshPlotSetDropdown();
        plotRestoredSet();
        var n = state.results.length;
        var sig = state.results.filter(function (r) { return r.fdr < 0.25; }).length;
        setStatus('Restored: ' + n + ' sets (' + sig + ' FDR < 0.25) from session snapshot.');
        if (typeof global.updateGseaEmpty === 'function') global.updateGseaEmpty();
        return true;
    }

    function plotRestoredSet() {
        var target = state.selectedSet ||
            (state.results && state.results.length ? state.results[0].name : null);
        if (!target) return;
        ensureSelectedLibraries().then(function () {
            plotSetEnrichment(target);
        }, function () {
            plotSetEnrichment(target);
        });
    }

    function clearGseaResults() {
        state.results = null; state.filtered = []; state.summary = null;
        state.ranked = null; state.params = null; state.selectedSet = null;
        var host = el('gseaResultsHost');
        if (host) host.innerHTML = '';
        var plot = el('gseaPlotEnrichment');
        if (plot) {
            try {
                if (global.Plotly && global.Plotly.purge) global.Plotly.purge(plot);
                else plot.innerHTML = '';
            } catch (e) { plot.innerHTML = ''; }
        }
        var sel = el('gseaPlotSet');
        if (sel) sel.innerHTML = '';
        if (typeof global.updateGseaEmpty === 'function') global.updateGseaEmpty();
    }

    /* ---------------- sub-tab switching ---------------- */

    global.currentGseaSubTab = 'results';
    global.switchGseaSubTab = function (name) {
        global.currentGseaSubTab = (name === 'plot') ? 'plot' : 'results';
        var btns = document.querySelectorAll('#gseaTab .gsea-sub-tab');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', btns[i].getAttribute('data-gsea-sub') === global.currentGseaSubTab);
        }
        var panels = document.querySelectorAll('#gseaTab .gsea-sub-panel');
        for (var j = 0; j < panels.length; j++) {
            var p = panels[j].getAttribute('data-gsea-panel');
            panels[j].style.display = (p === global.currentGseaSubTab) ? 'flex' : 'none';
        }
        if (global.currentGseaSubTab === 'plot' && state.selectedSet) {
            setTimeout(function () { plotSetEnrichment(state.selectedSet); }, 80);
        }
        if (typeof global.updateGseaEmpty === 'function') global.updateGseaEmpty();
    }

    /* ---------------- public API ---------------- */

    global.GseaAnalysis = {
        run: runGseaAnalysis,
        plotSet: plotSetEnrichment,
        exportCsv: exportGseaCsv,
        clear: clearGseaResults,
        refreshSources: refreshGseaGeneSourceOptions,
        updateSourceUi: updateGseaGeneSourceUi,
        refreshLibraries: function () { refreshLibraryDropdown(); },
        onTreeCheck: onTreeCheck,
        onCustomGmtFile: onCustomGmtFile,
        collectSnapshot: collectGseaSessionSnapshot,
        restoreSnapshot: restoreGseaSessionSnapshot,
        getState: function () { return state; }
    };
    global.runGseaAnalysis = runGseaAnalysis;
    global.populateGseaMatrixGroups = populateGseaMatrixGroups;
    global.updateGseaMatrixCounts = updateGseaMatrixCounts;
    global.refreshGseaGeneSourceOptions = refreshGseaGeneSourceOptions;
    global.updateGseaGeneSourceUi = updateGseaGeneSourceUi;
    global.collectGseaSessionSnapshot = collectGseaSessionSnapshot;
    global.restoreGseaSessionSnapshot = restoreGseaSessionSnapshot;
    global.clearGseaResults = clearGseaResults;
    global.exportGseaCsv = exportGseaCsv;
    global.plotGseaSet = plotSetEnrichment;
    global.onCustomGmtFile = onCustomGmtFile;

    /* Build the library tree once the DOM is ready. */
    function initGseaLibraries() {
        if (!el('gseaLibraryTree')) {
            setTimeout(initGseaLibraries, 300);
            return;
        }
        refreshLibraryDropdown();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGseaLibraries);
    } else {
        initGseaLibraries();
    }

})(window);
