/**
 * Data PreProcess → Name mapping: gene / UniProt accession ↔ annotations via MyGene.info (free API).
 * Uses window.currentData (bridged from main app). No API key required.
 */
(function () {
    'use strict';

    var HEADERS = ['query_id', 'gene_symbol', 'protein_name', 'uniprotkb_ac', 'species_taxid', 'mapping_note'];

    window.featureNameMapStopRequested = false;
    window.featureNameMapRunning = false;

    /** UniProt accession pattern (standard). */
    window.featureNameMapLooksLikeUniProtAcc = function (s) {
        if (!s || typeof s !== 'string') return false;
        var t = s.trim();
        if (!t || t.length < 6 || t.length > 13) return false;
        return /^[OPQ][0-9][A-Z0-9]{3}[0-9]$|^[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$/.test(t);
    };

    function normalizeRowToken(raw) {
        if (raw == null) return '';
        var s = String(raw).trim();
        if (!s) return '';
        var semi = s.split(';');
        var first = semi[0].trim();
        var sp = first.split(/\s+/)[0];
        return sp || first;
    }

    function extractUniProtFromHit(hit) {
        if (!hit) return '';
        if (hit.uniprot) {
            var u = hit.uniprot;
            if (typeof u === 'string') return u;
            var sp = u['Swiss-Prot'] != null ? u['Swiss-Prot'] : u.SwissProt;
            if (sp) return Array.isArray(sp) ? String(sp[0] || '') : String(sp);
            var tr = u.TrEMBL != null ? u.TrEMBL : u.trembl;
            if (tr) return Array.isArray(tr) ? String(tr[0] || '') : String(tr);
        }
        // dotfield=true returns flat keys like uniprot.Swiss-Prot
        var flatSp = hit['uniprot.Swiss-Prot'] != null ? hit['uniprot.Swiss-Prot'] : hit['uniprot.SwissProt'];
        if (flatSp) return Array.isArray(flatSp) ? String(flatSp[0] || '') : String(flatSp);
        var flatTr = hit['uniprot.TrEMBL'] != null ? hit['uniprot.TrEMBL'] : hit['uniprot.trembl'];
        if (flatTr) return Array.isArray(flatTr) ? String(flatTr[0] || '') : String(flatTr);
        return '';
    }

    function emptyRow(queryId) {
        return [queryId, '', '', '', '', ''];
    }

    function speciesKeyToMyGeneSpecies(key, taxidOther) {
        if (key === '9606' || key === 'human') return 'human';
        if (key === '10090' || key === 'mouse') return 'mouse';
        if (key === '10116' || key === 'rat') return 'rat';
        if (key === 'other' && taxidOther) {
            var t = parseInt(taxidOther, 10);
            return t ? String(t) : 'human';
        }
        return 'human';
    }

    function speciesKeyToTaxIdString(key, taxidOther) {
        if (key === 'human') return '9606';
        if (key === 'mouse') return '10090';
        if (key === 'rat') return '10116';
        if (key === 'other' && taxidOther) return String(parseInt(taxidOther, 10) || '9606');
        return '9606';
    }

    function mygeneBatchSymbols(symbols, speciesKey, taxidOther, signal) {
        var sp = speciesKeyToMyGeneSpecies(speciesKey, taxidOther);
        var body = new URLSearchParams();
        // MyGene batch POST: terms must be comma-, space-, or +-separated (NOT newline). See docs batch POST.
        body.set('q', symbols.join(','));
        body.set('scopes', 'symbol,alias');
        body.set('species', sp);
        body.set('fields', 'symbol,name,taxid,alias,uniprot');
        body.set('dotfield', 'true');
        return fetch('https://mygene.info/v3/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: signal
        }).then(function (r) {
            if (!r.ok) throw new Error('MyGene HTTP ' + r.status);
            return r.json();
        });
    }

    function mygeneUniprotQuery(acc, speciesKey, taxidOther, signal) {
        var sp = speciesKeyToMyGeneSpecies(speciesKey, taxidOther);
        var url = 'https://mygene.info/v3/query?q=' + encodeURIComponent('uniprot:' + acc)
            + '&species=' + encodeURIComponent(sp)
            + '&fields=symbol,name,taxid,uniprot&dotfield=true';
        return fetch(url, { method: 'GET', signal: signal }).then(function (r) {
            if (!r.ok) throw new Error('MyGene HTTP ' + r.status);
            return r.json();
        });
    }

    /** Batch POST returns a top-level JSON array [{ query, symbol, ... }, ...], not { hits: [...] }. */
    function mygeneBatchResultRows(json) {
        if (Array.isArray(json)) return json;
        if (json && Array.isArray(json.hits)) return json.hits;
        return [];
    }

    function parseHitsToMap(json, originalQueries) {
        var map = {};
        var hits = mygeneBatchResultRows(json);
        var i;
        if (hits.length === originalQueries.length) {
            for (i = 0; i < hits.length; i++) {
                var oq = String(originalQueries[i]).trim();
                map[oq] = hits[i];
                map[oq.toUpperCase()] = hits[i];
            }
            return map;
        }
        for (i = 0; i < hits.length; i++) {
            var h = hits[i];
            var qf = h.query;
            if (qf !== undefined && qf !== null) {
                var qs = String(qf).trim();
                map[qs] = h;
                map[qs.toUpperCase()] = h;
            }
            if (h.symbol) {
                map[String(h.symbol).trim().toUpperCase()] = h;
            }
        }
        return map;
    }

    function hitToRow(queryId, hit, speciesTaxStr, note) {
        var gs = hit && hit.symbol != null ? String(hit.symbol) : '';
        var pn = hit && hit.name != null ? String(hit.name) : '';
        var ac = extractUniProtFromHit(hit);
        var tx = hit && hit.taxid != null ? String(hit.taxid) : speciesTaxStr;
        return [queryId, gs, pn, ac, tx, note || ''];
    }

    /**
     * Programmatic MyGene name mapping (same pipeline as the Name mapping tab).
     * @param {{ speciesKey: string, taxidOther?: string, mode?: string, statusEl?: Element|null, logEl?: Element|null, onLog?: function(string): void, suppressComplete?: boolean, alertOnError?: boolean }} opts
     * @returns {Promise<{ rowCount: number, partial?: boolean }>}
     */
    window.runFeatureNameMappingAsync = function (opts) {
        opts = opts || {};
        var cd = window.currentData;
        if (!cd || !Array.isArray(cd.rowIds) || cd.rowIds.length === 0) {
            return Promise.reject(new Error('No matrix row IDs.'));
        }
        if (window.featureNameMapRunning) {
            return Promise.reject(new Error('Name mapping is already running.'));
        }

        var speciesKey = opts.speciesKey || 'human';
        var taxidOther = opts.taxidOther != null ? String(opts.taxidOther) : '';
        var mode = opts.mode || 'auto';
        var taxStr = speciesKeyToTaxIdString(speciesKey, taxidOther);
        var statusEl = opts.statusEl !== undefined ? opts.statusEl : document.getElementById('featureNameMapStatus');
        var logEl = opts.logEl !== undefined ? opts.logEl : document.getElementById('featureNameMapLog');
        var onLog = typeof opts.onLog === 'function' ? opts.onLog : null;
        var suppressComplete = !!opts.suppressComplete;
        var alertOnError = opts.alertOnError !== false;

        window.featureNameMapStopRequested = false;

        function log(msg) {
            if (onLog) onLog(msg);
            if (!logEl) return;
            var t = new Date().toLocaleTimeString();
            logEl.textContent += '[' + t + '] ' + msg + '\n';
            logEl.scrollTop = logEl.scrollHeight;
        }

        var controller = new AbortController();
        window._featureNameMapAbort = controller;

        var rowIds = cd.rowIds;
        var n = rowIds.length;
        var outRows = new Array(n);
        var i;
        var chain;

        try {
            window.featureNameMapRunning = true;
            if (statusEl) statusEl.textContent = 'Running…';
            if (logEl) logEl.textContent = '';

            for (i = 0; i < n; i++) {
                outRows[i] = emptyRow(normalizeRowToken(rowIds[i]));
            }

            var uniJobs = [];
            var symJobs = [];

            for (i = 0; i < n; i++) {
                var raw = rowIds[i];
                var token = normalizeRowToken(raw);
                if (!token) {
                    outRows[i] = ['', '', '', '', taxStr, 'empty id'];
                    continue;
                }
                var asUniprot = false;
                if (mode === 'uniprot') {
                    asUniprot = true;
                } else if (mode === 'gene') {
                    asUniprot = false;
                } else {
                    asUniprot = window.featureNameMapLooksLikeUniProtAcc(token);
                }
                if (asUniprot) {
                    uniJobs.push({ index: i, token: token });
                } else {
                    symJobs.push({ index: i, token: token });
                }
            }

            log('MyGene.info: ' + uniJobs.length + ' accession query(ies), ' + symJobs.length + ' symbol batch(es); taxid ' + taxStr);

            chain = Promise.resolve();

            var uniDone = 0;
            uniJobs.forEach(function (job) {
                chain = chain.then(function () {
                    if (window.featureNameMapStopRequested) throw new Error('stopped');
                    return mygeneUniprotQuery(job.token, speciesKey, taxidOther, controller.signal).then(function (json) {
                        var hits = json && json.hits ? json.hits : [];
                        if (hits.length === 0) {
                            outRows[job.index] = [job.token, '', '', '', taxStr, 'no hit'];
                        } else if (hits.length > 1) {
                            outRows[job.index] = hitToRow(job.token, hits[0], taxStr, 'multiple: ' + hits.length);
                        } else {
                            outRows[job.index] = hitToRow(job.token, hits[0], taxStr, '');
                        }
                        uniDone++;
                        if (statusEl) statusEl.textContent = 'UniProt queries: ' + uniDone + ' / ' + uniJobs.length;
                    });
                });
            });

            var SYM_CHUNK = 150;
            var chunkStart;
            for (chunkStart = 0; chunkStart < symJobs.length; chunkStart += SYM_CHUNK) {
                (function (batch, doneAfterBatch) {
                    chain = chain.then(function () {
                        if (window.featureNameMapStopRequested) throw new Error('stopped');
                        var symbols = batch.map(function (b) { return b.token; });
                        return mygeneBatchSymbols(symbols, speciesKey, taxidOther, controller.signal).then(function (json) {
                            var map = parseHitsToMap(json, symbols);
                            var j;
                            for (j = 0; j < batch.length; j++) {
                                var b = batch[j];
                                var tok = b.token;
                                var hit = map[tok] || map[tok.toUpperCase()];
                                if (hit && hit.notfound === true) {
                                    outRows[b.index] = [tok, '', '', '', taxStr, 'no hit'];
                                } else if (hit && !hit.notfound) {
                                    outRows[b.index] = hitToRow(tok, hit, taxStr, '');
                                } else {
                                    outRows[b.index] = [tok, '', '', '', taxStr, 'no hit'];
                                }
                            }
                            if (statusEl) statusEl.textContent = 'Symbol batch: ' + doneAfterBatch + ' / ' + symJobs.length;
                        });
                    });
                })(symJobs.slice(chunkStart, chunkStart + SYM_CHUNK), Math.min(chunkStart + SYM_CHUNK, symJobs.length));
            }
        } catch (syncErr) {
            window.featureNameMapRunning = false;
            var sm = syncErr && syncErr.message ? syncErr.message : String(syncErr);
            if (statusEl) statusEl.textContent = 'Error: ' + sm;
            log('Error: ' + sm);
            if (alertOnError) {
                alert('Name mapping failed: ' + sm + '\n\nIf requests are blocked, serve the app over http://localhost (not file://).');
            }
            return Promise.reject(syncErr);
        }

        return chain.then(function () {
            cd.featureNameMapHeaders = HEADERS.slice();
            cd.featureNameMapRows = outRows;
            cd.featureNameMapMeta = { source: 'mygene', generatedAt: new Date().toISOString(), speciesKey: speciesKey, mode: mode };
            window.featureNameMapRunning = false;
            if (statusEl) statusEl.textContent = 'Done (' + n + ' rows).';
            log('Complete.');
            if (!suppressComplete && typeof window.onFeatureNameMappingComplete === 'function') {
                window.onFeatureNameMappingComplete();
            }
            return { rowCount: n };
        }).catch(function (err) {
            window.featureNameMapRunning = false;
            var msg = err && err.message ? err.message : String(err);
            if (msg === 'stopped') {
                cd.featureNameMapHeaders = HEADERS.slice();
                cd.featureNameMapRows = outRows;
                cd.featureNameMapMeta = { source: 'mygene', partial: true, generatedAt: new Date().toISOString() };
                if (statusEl) statusEl.textContent = 'Stopped (partial results kept).';
                log('Stopped by user; partial rows saved.');
                if (!suppressComplete && typeof window.onFeatureNameMappingComplete === 'function') {
                    window.onFeatureNameMappingComplete();
                }
                return Promise.resolve({ rowCount: n, partial: true });
            }
            if (statusEl) statusEl.textContent = 'Error: ' + msg;
            log('Error: ' + msg);
            if (alertOnError) {
                alert('Name mapping failed: ' + msg + '\n\nIf requests are blocked, serve the app over http://localhost (not file://).');
            }
            return Promise.reject(err);
        });
    };

    window.runFeatureNameMapping = function () {
        if (window.featureNameMapRunning) {
            alert('Name mapping is already running (e.g. from Enrichr matrix row labels). Wait for it to finish or click Stop.');
            return;
        }
        var cd = window.currentData;
        if (!cd || !Array.isArray(cd.rowIds) || cd.rowIds.length === 0) {
            alert('Load a matrix with row IDs first.');
            return;
        }

        var speciesEl = document.getElementById('featureNameMapSpecies');
        var otherEl = document.getElementById('featureNameMapTaxidOther');
        var modeEl = document.getElementById('featureNameMapMode');
        var statusEl = document.getElementById('featureNameMapStatus');
        var logEl = document.getElementById('featureNameMapLog');

        var speciesKey = (speciesEl && speciesEl.value) ? speciesEl.value : 'human';
        var taxidOther = otherEl ? otherEl.value : '';
        var mode = (modeEl && modeEl.value) ? modeEl.value : 'auto';

        window.runFeatureNameMappingAsync({
            speciesKey: speciesKey,
            taxidOther: taxidOther,
            mode: mode,
            statusEl: statusEl,
            logEl: logEl,
            suppressComplete: false,
            alertOnError: true
        }).catch(function (err) {
            if (err && err.message && err.message.indexOf('already running') !== -1) {
                alert('Name mapping is already running. Wait or click Stop.');
            } else if (err) {
                console.error('runFeatureNameMapping:', err);
            }
        });
    };

    window.stopFeatureNameMapping = function () {
        window.featureNameMapStopRequested = true;
        if (window._featureNameMapAbort && typeof window._featureNameMapAbort.abort === 'function') {
            try { window._featureNameMapAbort.abort(); } catch (e) {}
        }
    };

    window.clearFeatureNameMapping = function () {
        var cd = window.currentData;
        if (!cd) return;
        delete cd.featureNameMapHeaders;
        delete cd.featureNameMapRows;
        delete cd.featureNameMapMeta;
        if (typeof window.onFeatureNameMappingComplete === 'function') {
            window.onFeatureNameMappingComplete();
        }
    };

})();
