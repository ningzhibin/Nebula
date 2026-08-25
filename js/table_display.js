/**
 * DataTables.net-based matrix preview for Data Filter → Passed (#tablePreview).
 * Loads jQuery + DataTables 2 from CDN once; exposes window.TableDisplay.
 *
 * Scrolling: DataTables scrollX/scrollY (split header/body tables) is NOT used —
 * it causes cross-browser header/column misalignment. Instead we use one DOM table,
 * a max-height scroll shell around the table layout cell, and sticky thead (CSS).
 */
(function (global) {
    'use strict';

    var LIB_JQUERY = 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js';
    var LIB_DT_CSS = 'https://cdn.datatables.net/2.1.8/css/dataTables.dataTables.min.css';
    var LIB_DT_JS = 'https://cdn.datatables.net/2.1.8/js/dataTables.min.js';

    var libsPromise = null;

    function loadCssOnce(href) {
        if (document.querySelector('link[data-qc-dt-css="1"]')) return;
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        l.setAttribute('data-qc-dt-css', '1');
        document.head.appendChild(l);
    }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('Failed to load script: ' + src)); };
            document.head.appendChild(s);
        });
    }

    function ensureLibsLoaded() {
        if (libsPromise) return libsPromise;
        libsPromise = new Promise(function (resolve, reject) {
            if (global.jQuery && global.jQuery.fn && global.jQuery.fn.DataTable && global.DataTable) {
                resolve();
                return;
            }
            loadCssOnce(LIB_DT_CSS);
            var chain = Promise.resolve();
            if (!global.jQuery || !global.jQuery.fn) {
                chain = chain.then(function () { return loadScript(LIB_JQUERY); });
            }
            chain = chain.then(function () { return loadScript(LIB_DT_JS); });
            chain.then(function () {
                if (!global.jQuery || !global.jQuery.fn || !global.jQuery.fn.DataTable) {
                    reject(new Error('DataTables failed to attach to jQuery'));
                    return;
                }
                resolve();
            }).catch(reject);
        });
        return libsPromise;
    }

    function destroy(container) {
        if (!container) return;
        container.classList.remove('qc-dt-preview-host');
        if (container._qcDtResizeObserver) {
            try { container._qcDtResizeObserver.disconnect(); } catch (_) { /* ignore */ }
            container._qcDtResizeObserver = null;
        }
        if (container._qcMatrixScrollBox) {
            try {
                container._qcMatrixScrollBox.classList.remove('qc-dt-matrix-scrollbox');
                container._qcMatrixScrollBox.style.maxHeight = '';
                container._qcMatrixScrollBox.style.overflow = '';
                container._qcMatrixScrollBox.style.flex = '';
                container._qcMatrixScrollBox.style.minHeight = '';
                container._qcMatrixScrollBox.style.minWidth = '';
            } catch (_) { /* ignore */ }
            container._qcMatrixScrollBox = null;
        }
        if (container._qcMatrixTableLayoutRow) {
            try { container._qcMatrixTableLayoutRow.classList.remove('qc-dt-matrix-table-row'); } catch (_) { /* ignore */ }
            container._qcMatrixTableLayoutRow = null;
        }
        try { delete container._qcLastMatrixScrollMaxPx; } catch (_) { container._qcLastMatrixScrollMaxPx = undefined; }
        try { delete container._qcFixedMatrixMaxPx; } catch (_) { container._qcFixedMatrixMaxPx = 0; }
        var wrap = container.querySelector('#qcDtMatrixRoot');
        var $ = global.jQuery;
        if ($ && $.fn && $.fn.DataTable) {
            var dtTables = container.querySelectorAll('table');
            for (var ti = 0; ti < dtTables.length; ti++) {
                var tEl = dtTables[ti];
                if (!$.fn.DataTable.isDataTable(tEl)) continue;
                try {
                    $(tEl).DataTable().destroy(true);
                } catch (_) { /* ignore */ }
            }
        }
        if (wrap && wrap.parentNode === container) {
            container.removeChild(wrap);
        }
        var genericRoots = container.querySelectorAll('[data-qc-table-root="1"]');
        for (var gi = 0; gi < genericRoots.length; gi++) {
            var node = genericRoots[gi];
            if (node && node.parentNode === container) container.removeChild(node);
        }
        /* Plain messages (e.g. empty-state <p>) are not under data-qc-table-root; remove leftovers so re-render does not stack. */
        while (container.firstChild) {
            try { container.removeChild(container.firstChild); } catch (_) { break; }
        }
        container._qcMatrixDtApi = null;
        container._qcGenericDtApi = null;
    }

    function debounce(fn, ms) {
        var t = null;
        return function () {
            var self = this;
            var args = arguments;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(self, args); }, ms);
        };
    }

    function buildRowObjects(rowIds, columnHeaders, rows, sortedIndices) {
        var colMax = columnHeaders.map(function () { return 0; });
        var rowMax = sortedIndices.map(function () { return 0; });
        var globalMax = 0;
        var ri, j, v, origIdx, row, nv;
        for (ri = 0; ri < sortedIndices.length; ri++) {
            origIdx = sortedIndices[ri];
            row = rows[origIdx] || [];
            for (j = 0; j < columnHeaders.length; j++) {
                v = row[j];
                nv = v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null;
                if (nv !== null) {
                    var absNv = Math.abs(nv);
                    colMax[j] = Math.max(colMax[j], absNv);
                    rowMax[ri] = Math.max(rowMax[ri], absNv);
                    globalMax = Math.max(globalMax, absNv);
                }
            }
        }
        for (j = 0; j < colMax.length; j++) {
            if (colMax[j] === 0) colMax[j] = 1;
        }
        for (ri = 0; ri < rowMax.length; ri++) {
            if (rowMax[ri] === 0) rowMax[ri] = 1;
        }
        if (globalMax === 0) globalMax = 1;
        var data = [];
        for (ri = 0; ri < sortedIndices.length; ri++) {
            origIdx = sortedIndices[ri];
            var o = {
                _origRowIndex: origIdx,
                _rowAbsMax: rowMax[ri],
                id: String(rowIds[origIdx] == null ? '' : rowIds[origIdx])
            };
            row = rows[origIdx] || [];
            for (j = 0; j < columnHeaders.length; j++) {
                v = row[j];
                nv = v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null;
                o['c' + j] = nv;
            }
            data.push(o);
        }
        return { data: data, colMax: colMax, globalMax: globalMax };
    }

    function barCellHtml(escapeHtml, value, denom, scaleModeLabel, highlight) {
        if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
            return '<span class="qc-dt-cell-na">N/A</span>';
        }
        var safeDenom = Number.isFinite(denom) && denom > 0 ? denom : 1;
        var pct = Math.min(100, Math.round((Math.abs(value) / safeDenom) * 100));
        var label = escapeHtml(String(value.toFixed(2)));
        var cls = highlight ? 'qc-dt-bar-cell qc-dt-imputed-cell' : 'qc-dt-bar-cell';
        var tip = highlight
            ? 'Imputed value (this cell was missing before imputation).'
            : 'Bar width = |value| / ' + escapeHtml(scaleModeLabel) + ' max among all rows in the current matrix.';
        return (
            '<div class="' + cls + '" title="' + tip + '">' +
            '<div class="qc-dt-bar-fill" style="width:' + pct + '%"></div>' +
            '<span class="qc-dt-bar-val">' + label + '</span>' +
            '</div>'
        );
    }

    function attachControlTooltips(root) {
        if (!root || !root.querySelector) return;
        var inp = root.querySelector('.dt-search input');
        if (inp) inp.setAttribute('title', 'Filter rows by text across all visible columns (global search).');
        var sel = root.querySelector('.dt-length select');
        if (sel) sel.setAttribute('title', 'Rows per page for the current table.');
        var scaleSel = root.querySelector('.qc-dt-scale-mode-select');
        if (scaleSel) scaleSel.setAttribute('title', 'Set bar scaling baseline: by column, by row, or by full table.');
        var pag = root.querySelector('.dt-paging');
        if (pag) pag.setAttribute('title', 'Pagination controls for the current table.');
    }

    function installScaleModeControl(root, getMode, setMode) {
        if (!root || !root.querySelector) return null;
        var lengthWrap = root.querySelector('.dt-length');
        if (!lengthWrap) return null;
        var existing = root.querySelector('.qc-dt-scale-mode-wrap');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var wrap = document.createElement('label');
        wrap.className = 'qc-dt-scale-mode-wrap';
        wrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-left:12px;font-size:12px;';
        wrap.innerHTML =
            '<span>Bar scale:</span>' +
            '<select class="qc-dt-scale-mode-select">' +
            '<option value="column">Column</option>' +
            '<option value="row">Row</option>' +
            '<option value="table">Table</option>' +
            '</select>';
        var selectEl = wrap.querySelector('select');
        if (selectEl) {
            selectEl.value = getMode();
            selectEl.addEventListener('change', function () {
                setMode(selectEl.value || 'column');
            });
        }
        lengthWrap.appendChild(wrap);
        return wrap;
    }

    function refreshBarCells(api) {
        if (!api) return;
        try {
            api.rows().invalidate('data');
            api.draw(false);
        } catch (_) {
            try { api.draw(false); } catch (_) { /* ignore */ }
        }
    }

    /* ---- CSV export (default Export CSV button on every TableDisplay table) ---- */

    function csvEscape(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) return '';
            return String(value);
        }
        var s = String(value);
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function defaultExportTimestamp() {
        var d = new Date();
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
            '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    }

    function downloadCsvFile(headerCells, rowCells, filename) {
        var lines = [headerCells.map(csvEscape).join(',')];
        for (var i = 0; i < rowCells.length; i++) {
            lines.push(rowCells[i].map(csvEscape).join(','));
        }
        var csv = lines.join('\r\n');
        /* BOM so Excel opens UTF-8 CSV correctly. */
        var blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ } }, 0);
    }

    function ensureExportCss() {
        if (document.getElementById('qc-dt-export-css')) return;
        var st = document.createElement('style');
        st.id = 'qc-dt-export-css';
        st.textContent =
            '.qc-dt-export-btn{font-size:11px;line-height:1.4;padding:3px 10px;margin:0 0 0 10px;' +
            'border:1px solid var(--md-accent,#98927c);border-radius:6px;' +
            'background:transparent;color:var(--md-accent-dark,#6e6a5d);' +
            'font-family:inherit;cursor:pointer;flex-shrink:0;white-space:nowrap;' +
            'display:inline-block;vertical-align:middle;align-self:center;}' +
            '.qc-dt-export-btn:hover{background:var(--md-accent-soft-bg,#ebe8df);border-color:var(--md-accent,#98927c);color:var(--md-accent-dark,#6e6a5d);}' +
            '.qc-dt-export-btn:active{transform:translateY(1px);}';
        document.head.appendChild(st);
    }

    function makeExportButton(buildCsv, fileNameBase) {
        ensureExportCss();
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'qc-dt-export-btn';
        btn.textContent = 'Export CSV';
        btn.title = 'Download the current view (all filtered and sorted rows, across all pages) as a CSV file.';
        btn.addEventListener('click', function () {
            try {
                var payload = typeof buildCsv === 'function' ? buildCsv() : null;
                if (!payload || !payload.rows) return;
                var base = (typeof fileNameBase === 'string' && fileNameBase) ? fileNameBase : 'table-export';
                downloadCsvFile(payload.headers || [], payload.rows, base + '-' + defaultExportTimestamp() + '.csv');
            } catch (e) {
                if (global.console) global.console.error('TableDisplay export CSV failed:', e);
                if (global.alert) global.alert('Could not export CSV:\n' + (e && e.message ? e.message : String(e)));
            }
        });
        return btn;
    }

    /** Place the Export CSV button in the DataTables top-right controls (next to the search box). */
    function installExportCsvControl(root, buildCsv, fileNameBase) {
        if (!root || !root.querySelector) return null;
        var host = root.querySelector('.dt-layout-cell.dt-layout-end') || root.querySelector('.dt-length');
        if (!host) return null;
        var existing = root.querySelector('.qc-dt-export-btn');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        var btn = makeExportButton(buildCsv, fileNameBase);
        host.appendChild(btn);
        return btn;
    }

    function renderStaticTable(container, options) {
        if (!container) return null;
        var opt = options || {};
        var columns = Array.isArray(opt.columns) ? opt.columns : [];
        var rows = Array.isArray(opt.rows) ? opt.rows : [];
        var escapeHtml = typeof opt.escapeHtml === 'function' ? opt.escapeHtml : function (s) { return String(s); };
        destroy(container);
        container.classList.add('qc-dt-preview-host');
        var root = document.createElement('div');
        root.setAttribute('data-qc-table-root', '1');
        root.className = opt.rootClassName || 'qc-static-table-root app-table-scroll';
        var table = document.createElement('table');
        table.className = opt.tableClassName || '';
        var thead = document.createElement('thead');
        var trh = document.createElement('tr');
        for (var ci = 0; ci < columns.length; ci++) {
            var c = columns[ci] || {};
            var th = document.createElement('th');
            th.innerHTML = escapeHtml(String(c.title == null ? '' : c.title));
            trh.appendChild(th);
        }
        thead.appendChild(trh);
        var tbody = document.createElement('tbody');
        for (var ri = 0; ri < rows.length; ri++) {
            var tr = document.createElement('tr');
            var row = rows[ri] || {};
            for (var cj = 0; cj < columns.length; cj++) {
                var col = columns[cj] || {};
                var td = document.createElement('td');
                var val = typeof col.getValue === 'function' ? col.getValue(row, ri) : row[col.key];
                td.innerHTML = escapeHtml(String(val == null ? '' : val));
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(thead);
        table.appendChild(tbody);
        function buildStaticCsv() {
            var head = columns.map(function (c) {
                return (c && c.title != null) ? String(c.title) : '';
            });
            var out = [];
            for (var sri = 0; sri < rows.length; sri++) {
                var srow = rows[sri] || {};
                out.push(columns.map(function (col, cj) {
                    return (typeof col.getValue === 'function') ? col.getValue(srow, sri) : srow[col.key];
                }));
            }
            return { headers: head, rows: out };
        }
        var toolbar = document.createElement('div');
        toolbar.className = 'qc-dt-static-toolbar';
        toolbar.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;padding:2px 0 6px;';
        toolbar.appendChild(makeExportButton(buildStaticCsv, 'qc-static-export'));
        root.appendChild(toolbar);
        root.appendChild(table);
        container.appendChild(root);
        return table;
    }

    function normalizeGenericColumnsWithBars(columns, escapeHtml, getDenominator, getScaleLabel, enableNumericBars) {
        var out = [];
        for (var i = 0; i < columns.length; i++) {
            (function (col, idx) {
                var key = col.key != null ? col.key : ('c' + idx);
                var numericBarsForCol = !!(enableNumericBars && col.numericBars !== false);
                out.push({
                    data: key,
                    title: escapeHtml(String(col.title == null ? '' : col.title)),
                    className: col.className || '',
                    orderable: col.orderable !== false,
                    searchable: col.searchable !== false,
                    render: function (data, type, row, meta) {
                        if (typeof col.render === 'function') return col.render(data, type, row, meta);
                        var isNum = data !== null && data !== undefined && data !== '' && Number.isFinite(Number(data));
                        if ((type === 'sort' || type === 'type') && isNum) return Number(data);
                        if (type === 'display' && numericBarsForCol && isNum) {
                            var denom = Number(getDenominator(row, key)) || 1;
                            var value = Number(data);
                            var pct = Math.min(100, Math.round((Math.abs(value) / denom) * 100));
                            var label = escapeHtml(String(value.toFixed(4).replace(/\.?0+$/, '')));
                            return (
                                '<div class="qc-dt-bar-cell" title="Bar width = |value| / ' + escapeHtml(getScaleLabel()) + ' max in current table.">' +
                                '<div class="qc-dt-bar-fill" style="width:' + pct + '%"></div>' +
                                '<span class="qc-dt-bar-val">' + label + '</span>' +
                                '</div>'
                            );
                        }
                        if (data == null) return type === 'display' ? '' : data;
                        return data;
                    }
                });
            })(columns[i] || {}, i);
        }
        return out;
    }

    function computeGenericBarStats(columns, data) {
        var colMax = {};
        var rowMax = [];
        var globalMax = 0;
        for (var i = 0; i < columns.length; i++) {
            var col = columns[i] || {};
            var key = col.key != null ? col.key : ('c' + i);
            colMax[key] = 0;
        }
        for (var r = 0; r < data.length; r++) {
            var row = data[r] || {};
            rowMax[r] = 0;
            for (var c = 0; c < columns.length; c++) {
                var colDef = columns[c] || {};
                var k = colDef.key != null ? colDef.key : ('c' + c);
                var v = row[k];
                if (v === null || v === undefined || v === '') continue;
                var n = Number(v);
                if (!Number.isFinite(n)) continue;
                var absN = Math.abs(n);
                colMax[k] = Math.max(colMax[k] || 0, absN);
                rowMax[r] = Math.max(rowMax[r] || 0, absN);
                globalMax = Math.max(globalMax, absN);
            }
        }
        if (!Number.isFinite(globalMax) || globalMax <= 0) globalMax = 1;
        for (var j = 0; j < columns.length; j++) {
            var cdef = columns[j] || {};
            var kk = cdef.key != null ? cdef.key : ('c' + j);
            if (!Number.isFinite(colMax[kk]) || colMax[kk] <= 0) colMax[kk] = 1;
        }
        for (var ri = 0; ri < rowMax.length; ri++) {
            if (!Number.isFinite(rowMax[ri]) || rowMax[ri] <= 0) rowMax[ri] = 1;
            if (data[ri] && typeof data[ri] === 'object') data[ri]._qcRowAbsMax = rowMax[ri];
        }
        return { colMax: colMax, globalMax: globalMax };
    }

    function renderGenericTable(container, options) {
        if (!container) return Promise.reject(new Error('TableDisplay: missing container'));
        var opt = options || {};
        var data = Array.isArray(opt.data) ? opt.data : [];
        var columns = Array.isArray(opt.columns) ? opt.columns : [];
        var tableClassName = opt.tableClassName || '';
        var rootClassName = opt.rootClassName || 'qc-generic-table-root';
        var escapeHtml = typeof opt.escapeHtml === 'function' ? opt.escapeHtml : function (s) { return String(s); };
        var pageLength = typeof opt.pageLength === 'number' ? opt.pageLength : 100;
        var lengthMenu = opt.lengthMenu || [[50, 100, 250, 500, -1], [50, 100, 250, 500, 'All']];
        var displayStart = typeof opt.displayStart === 'number' ? opt.displayStart : 0;
        var onSync = typeof opt.onSync === 'function' ? opt.onSync : function () {};
        var onInit = typeof opt.onInit === 'function' ? opt.onInit : function () {};
        var enableNumericBars = opt.numericBars !== false;
        var scaleMode = (opt.barScaleMode === 'column' || opt.barScaleMode === 'table') ? opt.barScaleMode : 'row';
        var topStart = opt.topStart == null ? 'pageLength' : opt.topStart;
        var topEnd = opt.topEnd == null ? 'search' : opt.topEnd;
        var bottomStart = opt.bottomStart == null ? 'info' : opt.bottomStart;
        var bottomEnd = opt.bottomEnd == null ? 'paging' : opt.bottomEnd;

        return ensureLibsLoaded().then(function () {
            destroy(container);
            container.classList.add('qc-dt-preview-host');
            var root = document.createElement('div');
            root.setAttribute('data-qc-table-root', '1');
            root.className = rootClassName;
            var host = document.createElement('div');
            host.className = 'app-table-scroll';
            host.style.overflow = 'visible';
            host.style.minWidth = '0';
            host.style.minHeight = '0';
            var table = document.createElement('table');
            table.className = tableClassName;
            table.style.width = '100%';
            host.appendChild(table);
            root.appendChild(host);
            container.appendChild(root);

            var barStats = computeGenericBarStats(columns, data);
            function getGenericDenominator(row, key) {
                if (scaleMode === 'table') return barStats.globalMax;
                if (scaleMode === 'row') return row && Number.isFinite(row._qcRowAbsMax) ? row._qcRowAbsMax : 1;
                return barStats.colMax[key];
            }
            function getGenericScaleLabel() {
                if (scaleMode === 'table') return 'table';
                if (scaleMode === 'row') return 'row';
                return 'column';
            }
            var dtCols = normalizeGenericColumnsWithBars(columns, escapeHtml, getGenericDenominator, getGenericScaleLabel, enableNumericBars);
            var DataTable = global.DataTable;
            var api = new DataTable(table, {
                data: data,
                columns: dtCols,
                deferRender: true,
                processing: false,
                paging: opt.paging !== false,
                pageLength: pageLength,
                lengthMenu: lengthMenu,
                searching: opt.searching !== false,
                ordering: opt.ordering !== false,
                orderMulti: false,
                order: Array.isArray(opt.order) ? opt.order : [[0, 'asc']],
                displayStart: displayStart,
                info: opt.info !== false,
                autoWidth: true,
                layout: { topStart: topStart, topEnd: topEnd, bottomStart: bottomStart, bottomEnd: bottomEnd },
                language: opt.language || { search: 'Search:', searchPlaceholder: 'Type to filter rows…' },
                initComplete: function () {
                    var $ = global.jQuery;
                    var inst = null;
                    try { inst = $ && $(table).DataTable(); } catch (_) { inst = null; }
                    if (inst) {
                        var mh = (opt.maxHeightPx && Number.isFinite(opt.maxHeightPx)) ? Math.max(120, Math.floor(opt.maxHeightPx)) : 560;
                        installUnifiedScrollShell(table, mh);
                        enforceStickyHeaderCells(table);
                        if (enableNumericBars) {
                            installScaleModeControl(root, function () { return scaleMode; }, function (newMode) {
                                if (newMode !== 'column' && newMode !== 'row' && newMode !== 'table') return;
                                if (newMode === scaleMode) return;
                                scaleMode = newMode;
                                refreshBarCells(inst);
                            });
                        }
                        attachControlTooltips(root);
                        installExportCsvControl(root, buildGenericCsv, 'qc-table-export');
                        try { inst.columns.adjust(); } catch (_) { /* ignore */ }
                        onInit(inst, root, table);
                    }
                }
            });
            container._qcGenericDtApi = api;

            function buildGenericCsv() {
                var keys = columns.map(function (c, idx) {
                    return (c && c.key != null) ? c.key : ('c' + idx);
                });
                var head = columns.map(function (c) {
                    return (c && c.title != null) ? String(c.title) : '';
                });
                var out = [];
                try {
                    var arr = api.rows({ search: 'applied', order: 'applied' }).data().toArray();
                    for (var gi = 0; gi < arr.length; gi++) {
                        var gro = arr[gi] || {};
                        out.push(keys.map(function (k) { return gro[k]; }));
                    }
                } catch (e) {
                    for (var gj = 0; gj < data.length; gj++) {
                        out.push(keys.map(function (k) { return data[gj][k]; }));
                    }
                }
                return { headers: head, rows: out };
            }
            function emitSync() {
                var info = api.page.info();
                onSync({
                    page: info.page + 1,
                    pageLength: info.length,
                    order: (api.order && api.order()) ? api.order().slice() : [],
                    searchActive: !!((api.search && api.search()) || '').trim()
                });
            }
            api.on('draw', function () { enforceStickyHeaderCells(table); attachControlTooltips(root); emitSync(); });
            api.on('order', emitSync);
            api.on('page', emitSync);
            api.on('length', emitSync);
            api.on('search', emitSync);
            requestAnimationFrame(function () {
                var mh = (opt.maxHeightPx && Number.isFinite(opt.maxHeightPx)) ? Math.max(120, Math.floor(opt.maxHeightPx)) : 560;
                installUnifiedScrollShell(table, mh);
                enforceStickyHeaderCells(table);
                if (enableNumericBars) {
                    installScaleModeControl(root, function () { return scaleMode; }, function (newMode) {
                        if (newMode !== 'column' && newMode !== 'row' && newMode !== 'table') return;
                        if (newMode === scaleMode) return;
                        scaleMode = newMode;
                        refreshBarCells(api);
                    });
                }
                attachControlTooltips(root);
                installExportCsvControl(root, buildGenericCsv, 'qc-table-export');
                emitSync();
                try { api.columns.adjust(); } catch (_) { /* ignore */ }
            });
            return api;
        });
    }

    /** Max pixel height for the scroll shell around the matrix table (panel minus fixed chrome). */
    function computeMatrixScrollMaxPx(container, rootEl) {
        var panel = container && container.closest ? container.closest('.table-data-matrix-preview') : null;
        var h = (panel && panel.clientHeight) || (container && container.clientHeight) || 0;
        if (h < 80) h = 400;
        /* Keep more vertical space for rows (about +20% vs earlier table viewport). */
        var overhead = 168;
        if (rootEl && rootEl.querySelector) {
            var notice = rootEl.querySelector('#qcDtSearchNotice');
            if (notice && global.getComputedStyle) {
                var cs = global.getComputedStyle(notice);
                if (cs && cs.display !== 'none') overhead += notice.offsetHeight || 36;
            }
        }
        return Math.max(240, Math.floor(h - overhead - 10));
    }

    function findMatrixScrollBoxEl(table) {
        var el = table.parentElement;
        var i = 0;
        while (el && i++ < 10) {
            if (el.classList) {
                if (el.classList.contains('dt-layout-full') || el.classList.contains('dt-layout-cell')) return el;
                if (el.classList.contains('dt-layout-table')) return el;
            }
            el = el.parentElement;
        }
        return table.parentElement;
    }

    function installMatrixScrollShell(container, table) {
        var cell = findMatrixScrollBoxEl(table);
        var row = table.closest('.dt-layout-row');
        if (!cell) return;
        cell.classList.add('qc-dt-matrix-scrollbox');
        cell.style.flex = '1';
        cell.style.minHeight = '0';
        cell.style.minWidth = '0';
        cell.style.overflow = 'auto';
        if (row) {
            row.classList.add('qc-dt-matrix-table-row');
            container._qcMatrixTableLayoutRow = row;
        } else {
            container._qcMatrixTableLayoutRow = null;
        }
        container._qcMatrixScrollBox = cell;
    }

    function installUnifiedScrollShell(table, maxHeightPx) {
        var cell = findMatrixScrollBoxEl(table);
        var row = table.closest('.dt-layout-row');
        if (!cell) return;
        cell.classList.add('qc-dt-unified-scrollbox');
        cell.classList.add('qc-dt-matrix-scrollbox');
        cell.style.flex = '1';
        cell.style.minHeight = '0';
        cell.style.minWidth = '0';
        cell.style.overflow = 'auto';
        if (Number.isFinite(maxHeightPx) && maxHeightPx > 0) cell.style.maxHeight = Math.floor(maxHeightPx) + 'px';
        if (row) {
            row.classList.add('qc-dt-unified-table-row');
            row.classList.add('qc-dt-matrix-table-row');
        }
    }

    function enforceStickyHeaderCells(table) {
        if (!table || !table.querySelectorAll) return;
        var ths = table.querySelectorAll('thead th');
        for (var i = 0; i < ths.length; i++) {
            var th = ths[i];
            th.style.position = 'sticky';
            th.style.top = '0';
            th.style.zIndex = '30';
            th.style.background = '#667eea';
            th.style.color = '#fff';
            th.style.boxShadow = '0 2px 2px -1px rgba(0, 0, 0, 0.12)';
        }
    }

    function applyMatrixScrollMax(container, root) {
        var box = container._qcMatrixScrollBox;
        if (!box) return;
        if (container._qcFixedMatrixMaxPx) {
            box.style.maxHeight = container._qcFixedMatrixMaxPx + 'px';
            return;
        }
        var px = computeMatrixScrollMaxPx(container, root);
        var prev = container._qcLastMatrixScrollMaxPx;
        if (prev != null && Math.abs(prev - px) < 8) return;
        container._qcLastMatrixScrollMaxPx = px;
        box.style.maxHeight = px + 'px';
    }

    function renderMatrixPreview(container, options) {
        if (!container) return Promise.reject(new Error('TableDisplay: missing container'));
        var opt = options || {};
        var rowIds = opt.rowIds || [];
        var columnHeaders = opt.columnHeaders || [];
        var rows = opt.rows || [];
        var sortedIndices = opt.sortedIndices || [];
        var escapeHtml = typeof opt.escapeHtml === 'function' ? opt.escapeHtml : function (s) { return String(s); };
        var getIdTooltip = typeof opt.getIdTooltip === 'function' ? opt.getIdTooltip : function () { return ''; };
        var getIdLink = typeof opt.getIdLink === 'function' ? opt.getIdLink : function () { return ''; };
        var onSync = typeof opt.onSync === 'function' ? opt.onSync : function () {};
        var initialOrder = opt.initialOrder || [[0, 'asc']];
        var displayStart = typeof opt.displayStart === 'number' ? opt.displayStart : 0;
        var pageLength = typeof opt.pageLength === 'number' ? opt.pageLength : 100;
        var lengthMenu = opt.lengthMenu || [[50, 100, 250, 500, -1], [50, 100, 250, 500, 'All']];
        var fixedMaxHeightPx = (opt.maxHeightPx && Number.isFinite(opt.maxHeightPx)) ? Math.max(120, Math.floor(opt.maxHeightPx)) : 0;

        return ensureLibsLoaded().then(function () {
            destroy(container);
            container.classList.add('qc-dt-preview-host');

            var built = buildRowObjects(rowIds, columnHeaders, rows, sortedIndices);
            var rowData = built.data;
            var colMax = built.colMax;
            var globalMax = built.globalMax;
            var scaleMode = (opt.barScaleMode === 'column' || opt.barScaleMode === 'table') ? opt.barScaleMode : 'row';

            function getBarDenominator(row, colIdx) {
                if (scaleMode === 'row') return row && Number.isFinite(row._rowAbsMax) ? row._rowAbsMax : 1;
                if (scaleMode === 'table') return globalMax;
                return colMax[colIdx];
            }

            function getScaleModeLabel() {
                if (scaleMode === 'row') return 'row';
                if (scaleMode === 'table') return 'table';
                return 'column';
            }

            var root = document.createElement('div');
            root.id = 'qcDtMatrixRoot';
            root.className = 'qc-dt-matrix-root';
            root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;';

            var notice = document.createElement('div');
            notice.id = 'qcDtSearchNotice';
            notice.className = 'qc-dt-search-notice';
            notice.style.cssText = 'display:none;padding:6px 8px;font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;margin-bottom:8px;flex-shrink:0;';
            notice.textContent = 'Search is active: DIANN and Name mapping tabs follow full-dataset order until you clear the search box.';

            var host = document.createElement('div');
            host.id = 'qcDtTableHost';
            host.className = 'qc-dt-table-host';
            host.style.cssText = 'flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;';

            var table = document.createElement('table');
            table.id = 'qcMatrixPreviewDt';
            table.className = 'data-check-matrix-table qc-matrix-dt-table';
            table.style.width = '100%';

            host.appendChild(table);
            root.appendChild(notice);
            root.appendChild(host);
            container.appendChild(root);

            var columns = [{
                data: 'id',
                title: 'ID',
                className: 'dt-type-string qc-dt-id-col',
                render: function (data, type, row) {
                    var orig = row._origRowIndex;
                    if (type === 'sort' || type === 'type') {
                        return data == null ? '' : String(data);
                    }
                    var tip = getIdTooltip(orig);
                    var link = getIdLink(orig);
                    var tipEsc = tip ? escapeHtml(String(tip)) : '';
                    var cls = 'data-table-id-cell' + (tip ? ' has-annotation-tip' : '');
                    var label = escapeHtml(String(data == null ? '' : data));
                    if (link) {
                        var href = escapeHtml(String(link));
                        return '<a class="' + cls + '"' + (tipEsc ? ' title="' + tipEsc + '"' : '') + ' href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
                    }
                    return '<span class="' + cls + '"' + (tipEsc ? ' title="' + tipEsc + '"' : '') + '>' + label + '</span>';
                }
            }];

            var j;
            for (j = 0; j < columnHeaders.length; j++) {
                (function (colIdx) {
                    var key = 'c' + colIdx;
                    var title = escapeHtml(String(columnHeaders[colIdx] == null ? '' : columnHeaders[colIdx]));
                    columns.push({
                        data: key,
                        title: title,
                        className: 'dt-type-numeric qc-dt-num-col',
                        render: function (data, type, row) {
                            if (type === 'sort' || type === 'type' || type === 'filter') {
                                return data === null || data === undefined || (typeof data === 'number' && !Number.isFinite(data)) ? null : data;
                            }
                            var hl = !!(opt.highlightMask && row && typeof row._origRowIndex === 'number' &&
                                opt.highlightMask[row._origRowIndex] && opt.highlightMask[row._origRowIndex][colIdx]);
                            return barCellHtml(escapeHtml, data, getBarDenominator(row, colIdx), getScaleModeLabel(), hl);
                        }
                    });
                })(j);
            }

            var DataTable = global.DataTable;

            var dtOpts = {
                data: rowData,
                columns: columns,
                deferRender: true,
                processing: false,
                paging: true,
                pageLength: pageLength,
                lengthMenu: lengthMenu,
                searching: true,
                ordering: true,
                orderMulti: false,
                order: initialOrder,
                displayStart: displayStart,
                autoWidth: true,
                layout: {
                    topStart: 'pageLength',
                    topEnd: 'search',
                    bottomStart: 'info',
                    bottomEnd: 'paging'
                },
                language: {
                    search: 'Search matrix:',
                    searchPlaceholder: 'Type to filter rows…'
                },
                initComplete: function () {
                    var $ = global.jQuery;
                    var inst = null;
                    try {
                        inst = $ && $(table).DataTable();
                    } catch (e) {
                        inst = null;
                    }
                    if (!inst) return;
                    installMatrixScrollShell(container, table);
                    installScaleModeControl(root, function () { return scaleMode; }, function (newMode) {
                        if (newMode !== 'column' && newMode !== 'row' && newMode !== 'table') return;
                        if (newMode === scaleMode) return;
                        scaleMode = newMode;
                        refreshBarCells(inst);
                    });
                    installExportCsvControl(root, buildMatrixCsv, 'qc-matrix-export');
                    requestAnimationFrame(function () {
                        applyMatrixScrollMax(container, root);
                        try { inst.columns.adjust(); } catch (_) { /* ignore */ }
                    });
                    setTimeout(function () {
                        applyMatrixScrollMax(container, root);
                        try { inst.columns.adjust(); } catch (_) { /* ignore */ }
                    }, 100);
                }
            };

            var api = new DataTable(table, dtOpts);
            container._qcMatrixDtApi = api;
            container._qcFixedMatrixMaxPx = fixedMaxHeightPx;

            function buildMatrixCsv() {
                var head = ['ID'].concat(columnHeaders.map(function (h) {
                    return h == null ? '' : String(h);
                }));
                var out = [];
                try {
                    var arr = api.rows({ search: 'applied', order: 'applied' }).data().toArray();
                    for (var mi = 0; mi < arr.length; mi++) {
                        var mrow = arr[mi] || {};
                        var cells = [mrow.id == null ? '' : mrow.id];
                        for (var mj = 0; mj < columnHeaders.length; mj++) {
                            cells.push(mrow['c' + mj]);
                        }
                        out.push(cells);
                    }
                } catch (e) {
                    for (var mk = 0; mk < rowData.length; mk++) {
                        var mrow2 = rowData[mk] || {};
                        var cells2 = [mrow2.id == null ? '' : mrow2.id];
                        for (var mj2 = 0; mj2 < columnHeaders.length; mj2++) {
                            cells2.push(mrow2['c' + mj2]);
                        }
                        out.push(cells2);
                    }
                }
                return { headers: head, rows: out };
            }

            function readSearchActive() {
                var s = '';
                try {
                    s = (api.search && api.search()) || '';
                } catch (_) { /* ignore */ }
                return !!(s && String(s).trim());
            }

            function emitSync() {
                var searchActive = readSearchActive();
                var noticeEl = container.querySelector('#qcDtSearchNotice');
                if (noticeEl) noticeEl.style.display = searchActive ? 'block' : 'none';

                var info = api.page.info();
                var page = info.page + 1;
                var len = info.length;
                var order = (api.order && api.order()) ? api.order().slice() : [];

                var sortedOut = null;
                if (!searchActive) {
                    try {
                        var idxs = api.rows({ search: 'applied', order: 'applied' }).indexes();
                        var ix = typeof idxs.toArray === 'function' ? idxs.toArray() : [];
                        sortedOut = ix.map(function (rowIdx) {
                            var d = api.row(rowIdx).data();
                            return d && typeof d._origRowIndex === 'number' ? d._origRowIndex : 0;
                        });
                    } catch (e) {
                        sortedOut = rowData.map(function (r) { return r._origRowIndex; });
                    }
                }

                onSync({
                    searchActive: searchActive,
                    sortedIndices: sortedOut,
                    page: page,
                    pageLength: len,
                    order: order
                });
            }

            var debouncedMatrixLayout = debounce(function () {
                applyMatrixScrollMax(container, root);
            }, 250);

            var debouncedColAdjust = debounce(function () {
                try { api.columns.adjust(); } catch (_) { /* ignore */ }
            }, 60);

            api.on('draw', function () {
                emitSync();
                attachControlTooltips(root);
                applyMatrixScrollMax(container, root);
                debouncedColAdjust();
            });
            api.on('order', function () {
                emitSync();
            });
            api.on('page', function () {
                emitSync();
            });
            api.on('length', function () {
                emitSync();
            });
            api.on('search', function () {
                emitSync();
            });

            var ro = new ResizeObserver(function () {
                debouncedMatrixLayout();
            });
            try {
                var panelEl = container.closest ? container.closest('.table-data-matrix-preview') : null;
                if (panelEl) ro.observe(panelEl);
                else if (container.parentElement) ro.observe(container.parentElement);
                else ro.observe(container);
            } catch (_) { /* ignore */ }
            container._qcDtResizeObserver = ro;

            requestAnimationFrame(function () {
                installMatrixScrollShell(container, table);
                applyMatrixScrollMax(container, root);
                attachControlTooltips(root);
                installScaleModeControl(root, function () { return scaleMode; }, function (newMode) {
                    if (newMode !== 'column' && newMode !== 'row' && newMode !== 'table') return;
                    if (newMode === scaleMode) return;
                    scaleMode = newMode;
                    refreshBarCells(api);
                });
                installExportCsvControl(root, buildMatrixCsv, 'qc-matrix-export');
                emitSync();
                try { api.columns.adjust(); } catch (_) { /* ignore */ }
            });

            return api;
        });
    }

    global.TableDisplay = {
        ensureLibsLoaded: ensureLibsLoaded,
        destroy: destroy,
        renderMatrixPreview: renderMatrixPreview,
        renderGenericTable: renderGenericTable,
        renderStaticTable: renderStaticTable
    };
}(typeof window !== 'undefined' ? window : this));
