/**
 * Enrichr tab: infer Human/Mouse from matrix row/column/meta text, DIANN annotation
 * (especially Protein.Names UniProt suffixes), and meta; heuristics for when row IDs need
 * MyGene mapping; build deduped gene lists; prefer DIANN pg **Genes** column when complete.
 */
(function () {
    'use strict';

    function firstRowToken(raw) {
        return String(raw == null ? '' : raw).split(/\t|;|\|/)[0].trim();
    }

    /**
     * Common UniProt-style organism mnemonics on protein/gene row IDs (e.g. UBA6_HUMAN, Xyz_mouse).
     * Case-insensitive match on the segment after the last underscore. Not exhaustive but covers typical DIANN pg rows.
     */
    var UNIPROT_ROW_LABEL_SPECIES_SUFFIX = new Set([
        'HUMAN', 'MOUSE', 'RAT', 'BOVIN', 'PIG', 'RABIT', 'CHICK', 'XENLA', 'DROME', 'CAEEL', 'YEAST', 'SCHPO', 'DANRE',
        'CANLF', 'MACMU', 'PANTR', 'PONAB', 'MACFA', 'GORGO', 'CHLAE', 'PAPHA', 'CALJA', 'CANFA', 'FELIS', 'FELCA', 'HORSE',
        'EQUAS', 'SHEEP', 'GOAT', 'MESAU', 'CAVPO', 'CRIGR', 'NORVG', 'HAMST', 'GERBL', 'GUINE', 'ECHGR', 'LOXAF', 'ORNAN',
        'MONDO', 'DASNO', 'SORAR', 'TUPCH', 'OTOGA', 'MUSPF', 'NEOMU', 'SUS', 'ECOLI', 'ARATH', 'SOYBN', 'MAIZE', 'BRARE',
        'ORYZA', 'WHEAT', 'BARJU', 'COTJA', 'SOLLC', 'TOBAC', 'PHYPA', 'DICDI', 'ASPOR', 'AJECG', 'BACSU', 'HELPY', 'LACLM',
        'STRPN', 'STAAR', 'YERPE', 'PSEAE', 'METJA', 'TRYBR', 'PLAF', 'XENTR', 'LASMU', 'VICPA', 'BISBO', 'TAEGU'
    ]);

    /**
     * Remove trailing _SPECIES from a single token (already split from semicolon/pipe lists).
     * @param {string} token
     * @returns {string}
     */
    window.stripMatrixRowLabelSpeciesSuffixForEnrichr = function (token) {
        var t = String(token == null ? '' : token).trim();
        if (!t) return '';
        var last = t.lastIndexOf('_');
        if (last < 1) return t;
        var pre = t.slice(0, last);
        var suf = t.slice(last + 1);
        if (suf.length < 3 || suf.length > 15) return t;
        if (!/^[A-Za-z0-9]+$/.test(suf)) return t;
        var up = suf.toUpperCase();
        if (!UNIPROT_ROW_LABEL_SPECIES_SUFFIX.has(up)) return t;
        return pre.length >= 1 ? pre : t;
    };

    /** First list token + UniProt-style _SPECIES strip for Enrichr / heuristics. */
    window.normalizeMatrixRowLabelTokenForEnrichr = function (rawRowId) {
        return window.stripMatrixRowLabelSpeciesSuffixForEnrichr(firstRowToken(rawRowId));
    };

    /** Conservative gene-symbol token (HGNC-style); excludes long accessions. */
    function looksLikeGeneSymbolToken(token) {
        if (!token || typeof token !== 'string') return false;
        var t = token.trim();
        if (t.length < 1 || t.length > 20) return false;
        if (/\s/.test(t)) return false;
        return /^[A-Za-z][A-Za-z0-9_-]*$/.test(t);
    }

    /**
     * @param {string[]} rowIds
     * @returns {{ need: boolean, sampleSize: number, uniprotFrac: number, longFrac: number, geneLikeFrac: number }}
     */
    window.rowIdsLikelyNeedGeneMapping = function (rowIds) {
        if (!Array.isArray(rowIds) || rowIds.length === 0) {
            return { need: false, sampleSize: 0, uniprotFrac: 0, longFrac: 0, geneLikeFrac: 0 };
        }
        var n = rowIds.length;
        var maxSample = 220;
        var step = n <= maxSample ? 1 : Math.ceil(n / maxSample);
        var uniprotN = 0;
        var longN = 0;
        var geneLikeN = 0;
        var counted = 0;
        var looksUni = window.featureNameMapLooksLikeUniProtAcc;
        for (var i = 0; i < n; i += step) {
            var tok = firstRowToken(rowIds[i]);
            if (!tok) continue;
            counted++;
            if (typeof looksUni === 'function' && looksUni(tok)) uniprotN++;
            if (tok.length > 40 || tok.split(/\s+/).length > 2) longN++;
            if (looksLikeGeneSymbolToken(tok)) geneLikeN++;
        }
        if (counted === 0) {
            return { need: true, sampleSize: 0, uniprotFrac: 0, longFrac: 0, geneLikeFrac: 0 };
        }
        var uf = uniprotN / counted;
        var lf = longN / counted;
        var gf = geneLikeN / counted;
        var need = uf > 0.12 || lf > 0.2 || gf < 0.38;
        return { need: need, sampleSize: counted, uniprotFrac: uf, longFrac: lf, geneLikeFrac: gf };
    };

    /**
     * @param {*} cd window.currentData
     * @param {*} meta window.metaData { headers, rows }
     * @returns {{ enrichrSpecies: string|null, confidence: string|null, rationale: string }}
     */
    window.guessEnrichrSpeciesFromMatrix = function (cd, meta) {
        if (!cd) {
            return { enrichrSpecies: null, confidence: null, rationale: 'No matrix data.' };
        }
        var parts = [];
        var diannProtSuffixHumanCount = 0;
        var diannProtSuffixMouseCount = 0;
        if (Array.isArray(cd.columnHeaders)) {
            cd.columnHeaders.forEach(function (h) {
                parts.push(String(h || ''));
            });
        }
        if (Array.isArray(cd.rowIds)) {
            var n = cd.rowIds.length;
            var step = n <= 200 ? 1 : Math.ceil(n / 200);
            for (var i = 0; i < n; i += step) {
                parts.push(firstRowToken(cd.rowIds[i]));
            }
        }
        if (meta && Array.isArray(meta.rows) && meta.rows.length) {
            var maxR = Math.min(meta.rows.length, 80);
            for (var r = 0; r < maxR; r++) {
                var row = meta.rows[r];
                if (row && typeof row === 'object') {
                    Object.keys(row).forEach(function (k) {
                        parts.push(String(row[k] == null ? '' : row[k]));
                    });
                }
            }
        }
        /** DIANN pg first-column block: Protein.Names (and similar) carry UniProt _HUMAN / _MOUSE suffixes — strong species hints. */
        var diannSpeciesNote = '';
        if (Array.isArray(cd.diannPgAnnotationHeaders) && Array.isArray(cd.diannPgAnnotationRows)
            && cd.diannPgAnnotationHeaders.length > 0 && cd.diannPgAnnotationRows.length > 0
            && Array.isArray(cd.rowIds) && cd.rowIds.length > 0) {
            var ah = cd.diannPgAnnotationHeaders;
            var arows = cd.diannPgAnnotationRows;
            var nAnn = Math.min(arows.length, cd.rowIds.length);
            if (arows.length !== cd.rowIds.length) {
                diannSpeciesNote = 'DIANN annotation rows (' + arows.length + ') vs matrix rowIds (' + cd.rowIds.length + '); species scan uses first ' + nAnn + ' rows.';
            }
            var pnIdx = -1;
            for (var hi = 0; hi < ah.length; hi++) {
                var hnorm = String(ah[hi] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                if (hnorm === 'proteinnames' || hnorm === 'proteinname' || hnorm === 'proteinids') {
                    pnIdx = hi;
                    break;
                }
            }
            if (pnIdx < 0) {
                for (var hj = 0; hj < ah.length; hj++) {
                    var low = String(ah[hj] || '').toLowerCase();
                    if (low.indexOf('protein') !== -1 && low.indexOf('name') !== -1) {
                        pnIdx = hj;
                        break;
                    }
                }
            }
            var stepA = nAnn <= 280 ? 1 : Math.ceil(nAnn / 280);
            if (pnIdx >= 0) {
                var pnLabel = String(ah[pnIdx] || 'Protein.Names');
                diannSpeciesNote = (diannSpeciesNote ? diannSpeciesNote + ' ' : '') +
                    'DIANN "' + pnLabel + '" column sampled for species hints (UniProt-style _HUMAN / _MOUSE, etc.).';
                for (var ai = 0; ai < nAnn; ai += stepA) {
                    var rowA = arows[ai];
                    if (rowA && pnIdx < rowA.length) {
                        var cellStr = String(rowA[pnIdx] == null ? '' : rowA[pnIdx]);
                        parts.push(cellStr);
                        var lc = cellStr.toLowerCase();
                        if (/_human\b|_hsapiens\b/.test(lc)) diannProtSuffixHumanCount++;
                        if (/_mouse\b/.test(lc) && !/_human\b/.test(lc)) diannProtSuffixMouseCount++;
                    }
                }
            } else {
                diannSpeciesNote = (diannSpeciesNote ? diannSpeciesNote + ' ' : '') + 'DIANN annotation columns (no Protein.Names header) sampled.';
                var stepB = nAnn <= 100 ? 1 : Math.ceil(nAnn / 100);
                for (var ck = 0; ck < ah.length; ck++) {
                    for (var rk = 0; rk < nAnn; rk += stepB) {
                        var rowB = arows[rk];
                        if (rowB && ck < rowB.length) {
                            parts.push(String(rowB[ck] == null ? '' : rowB[ck]));
                        }
                    }
                }
            }
        }
        var hay = parts.join('\n').toLowerCase();
        var humanHits = 0;
        var mouseHits = 0;
        var notes = [];

        function score(re, label, isHuman) {
            var m = hay.match(re);
            if (m) {
                if (isHuman) humanHits += 2;
                else mouseHits += 2;
                notes.push(label + ':' + m[0]);
            }
        }

        score(/\bhuman\b|\bhomo sapiens\b|\bhsapiens\b/, 'text', true);
        score(/\bhg38\b|\bhg19\b|\bgrch3[78]\b|\bgrch37\b/, 'genome', true);
        score(/(^|[^a-z0-9])9606([^0-9]|$)/, 'taxid9606', true);
        score(/_human\b/, 'suffix_human', true);

        score(/\bmouse\b|\bmus musculus\b|\bmusculus\b/, 'text', false);
        score(/\bmm10\b|\bmm39\b|\bgencode.*mouse\b/, 'genome', false);
        score(/\bmmu-|\bmmu_|\bmus\b(?![a-z])/, 'prefix', false);
        score(/(^|[^a-z0-9])10090([^0-9]|$)/, 'taxid10090', false);
        score(/_mouse\b/, 'suffix_mouse', false);

        if (diannProtSuffixHumanCount > 0 || diannProtSuffixMouseCount > 0) {
            humanHits += Math.min(16, diannProtSuffixHumanCount * 2);
            mouseHits += Math.min(16, diannProtSuffixMouseCount * 2);
            notes.push('diannProtNames:_HUMAN×' + diannProtSuffixHumanCount);
            notes.push('diannProtNames:_MOUSE×' + diannProtSuffixMouseCount);
        }

        if (diannProtSuffixMouseCount >= 5 && diannProtSuffixMouseCount >= diannProtSuffixHumanCount * 2 + 1) {
            return {
                enrichrSpecies: 'Mouse',
                confidence: 'high',
                rationale: 'DIANN protein-name column: mostly UniProt _MOUSE suffixes (' + diannProtSuffixMouseCount + ' sampled rows with _MOUSE vs ' + diannProtSuffixHumanCount + ' with _HUMAN).' + (diannSpeciesNote ? ' ' + diannSpeciesNote : '')
            };
        }
        if (diannProtSuffixHumanCount >= 5 && diannProtSuffixHumanCount >= diannProtSuffixMouseCount * 2 + 1) {
            return {
                enrichrSpecies: 'Human',
                confidence: 'high',
                rationale: 'DIANN protein-name column: mostly UniProt _HUMAN suffixes (' + diannProtSuffixHumanCount + ' vs _MOUSE ' + diannProtSuffixMouseCount + ').' + (diannSpeciesNote ? ' ' + diannSpeciesNote : '')
            };
        }

        var diannTail = diannSpeciesNote ? ' ' + diannSpeciesNote : '';
        if (humanHits === 0 && mouseHits === 0) {
            return {
                enrichrSpecies: null,
                confidence: null,
                rationale: 'No strong Human/Mouse keywords in row IDs, column names, meta sample, or DIANN annotation text.' + diannTail
            };
        }
        if (humanHits > mouseHits + 1) {
            return {
                enrichrSpecies: 'Human',
                confidence: humanHits >= 4 ? 'high' : 'low',
                rationale: 'Signals favor Human (' + humanHits + ' vs ' + mouseHits + '). ' + notes.slice(0, 4).join('; ') + diannTail
            };
        }
        if (mouseHits > humanHits + 1) {
            return {
                enrichrSpecies: 'Mouse',
                confidence: mouseHits >= 4 ? 'high' : 'low',
                rationale: 'Signals favor Mouse (' + mouseHits + ' vs ' + humanHits + '). ' + notes.slice(0, 4).join('; ') + diannTail
            };
        }
        return {
            enrichrSpecies: null,
            confidence: null,
            rationale: 'Ambiguous Human vs Mouse signals (' + humanHits + ' vs ' + mouseHits + ').' + diannTail
        };
    };

    /**
     * When row IDs need mapping, reuse existing MyGene table if enough symbols already present.
     * @param {*} cd
     * @param {boolean} needMapping from rowIdsLikelyNeedGeneMapping
     */
    window.canReuseFeatureNameMapForEnrichr = function (cd, needMapping) {
        if (!needMapping || !cd || !Array.isArray(cd.featureNameMapRows) || !Array.isArray(cd.featureNameMapHeaders)) {
            return { reuse: false, symbolFrac: 0 };
        }
        var h = cd.featureNameMapHeaders;
        var rows = cd.featureNameMapRows;
        var gi = h.indexOf('gene_symbol');
        if (gi < 0) return { reuse: false, symbolFrac: 0 };
        var withSym = 0;
        for (var i = 0; i < rows.length; i++) {
            var cell = rows[i] && rows[i][gi];
            if (cell != null && String(cell).trim()) withSym++;
        }
        var frac = rows.length ? withSym / rows.length : 0;
        return { reuse: frac >= 0.55, symbolFrac: frac };
    };

    /**
     * Deduped gene_symbol list in row order (first occurrence wins).
     * @param {*} cd currentData with featureNameMapHeaders / featureNameMapRows
     * @returns {string[]}
     */
    window.buildGeneListFromFeatureMap = function (cd) {
        if (!cd || !Array.isArray(cd.featureNameMapHeaders) || !Array.isArray(cd.featureNameMapRows)) return [];
        var gi = cd.featureNameMapHeaders.indexOf('gene_symbol');
        if (gi < 0) return [];
        var seen = {};
        var out = [];
        for (var i = 0; i < cd.featureNameMapRows.length; i++) {
            var row = cd.featureNameMapRows[i];
            if (!row) continue;
            var sym = row[gi];
            if (sym == null) continue;
            var t = String(sym).trim();
            if (!t || seen[t]) continue;
            seen[t] = true;
            out.push(t);
        }
        return out;
    };

    /**
     * Uppercased gene / row-label token → matrix row indices for mapping Enrichr overlap genes to matrix rows.
     * Uses normalized row ID (first token, species suffix stripped), optional **gene_symbol** from name mapping,
     * and tokens from **diannPgGenesByRow** when present (same row index as **rowIds**).
     * @param {*} cd window.currentData
     * @returns {Object<string, number[]>}
     */
    window.buildEnrichrGeneUpperToRowIndicesMap = function (cd) {
        if (!cd || !Array.isArray(cd.rowIds) || cd.rowIds.length === 0) return {};
        var norm = typeof window.normalizeMatrixRowLabelTokenForEnrichr === 'function'
            ? window.normalizeMatrixRowLabelTokenForEnrichr
            : function (rid) { return String(rid == null ? '' : rid).split(/\t|;|\|/)[0].trim(); };
        var out = {};
        function addSym(sym, rowIdx) {
            if (sym == null) return;
            var t = String(sym).trim();
            if (!t) return;
            var k = t.toUpperCase();
            if (!out[k]) out[k] = [];
            var arr = out[k];
            if (arr.indexOf(rowIdx) === -1) arr.push(rowIdx);
        }
        var n = cd.rowIds.length;
        var gi = -1;
        if (Array.isArray(cd.featureNameMapHeaders) && Array.isArray(cd.featureNameMapRows)) {
            gi = cd.featureNameMapHeaders.indexOf('gene_symbol');
        }
        var i;
        for (i = 0; i < n; i++) {
            addSym(norm(cd.rowIds[i]), i);
            if (gi >= 0 && cd.featureNameMapRows && cd.featureNameMapRows[i]) {
                addSym(cd.featureNameMapRows[i][gi], i);
            }
            if (Array.isArray(cd.diannPgGenesByRow) && i < cd.diannPgGenesByRow.length) {
                var cell = cd.diannPgGenesByRow[i];
                if (cell == null || !String(cell).trim()) continue;
                String(cell).split(/[,;|\s]+/).forEach(function (piece) {
                    var raw = piece.trim();
                    if (!raw) return;
                    var tok = typeof window.stripMatrixRowLabelSpeciesSuffixForEnrichr === 'function'
                        ? window.stripMatrixRowLabelSpeciesSuffixForEnrichr(raw)
                        : raw;
                    addSym(tok, i);
                });
            }
        }
        return out;
    };

    function findDiannPgGenesAnnotationColumnIndex(cd) {
        if (!cd || !Array.isArray(cd.diannPgAnnotationHeaders)) return -1;
        var headers = cd.diannPgAnnotationHeaders;
        var i;
        for (i = 0; i < headers.length; i++) {
            if (String(headers[i] || '').trim().toLowerCase() === 'genes') return i;
        }
        for (i = 0; i < headers.length; i++) {
            var hn = String(headers[i] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (hn === 'genes' || hn === 'gene' || hn === 'genenames' || hn === 'genename') return i;
        }
        return -1;
    }

    /** Split DIANN multi-gene cells (; | ,) and apply species-suffix strip per token. */
    function pushSplitGeneTokensForEnrichr(rawCell, seen, out) {
        if (rawCell == null) return;
        var raw = String(rawCell).trim();
        if (!raw) return;
        var pieces = raw.split(/[;\|,]+/);
        for (var p = 0; p < pieces.length; p++) {
            var piece = pieces[p].trim();
            if (!piece) continue;
            var tok = window.stripMatrixRowLabelSpeciesSuffixForEnrichr
                ? window.stripMatrixRowLabelSpeciesSuffixForEnrichr(piece)
                : piece;
            tok = String(tok || '').trim();
            if (!tok || seen[tok]) continue;
            seen[tok] = true;
            out.push(tok);
        }
    }

    /**
     * Prefer DIANN pg **Genes** (matrix column stored as diannPgGenesByRow, or matching annotation column)
     * when enough rows have values and enough unique symbols for Enrichr.
     * @param {*} cd currentData
     * @returns {null | { genes: string[], columnLabel: string, source: string }}
     */
    window.buildGeneListFromDiannPgGeneColumn = function (cd) {
        if (!cd || !Array.isArray(cd.rowIds) || cd.rowIds.length === 0) return null;
        var n = cd.rowIds.length;
        var minUnique = Math.max(15, Math.floor(n * 0.12));
        var minRowFrac = 0.22;

        if (Array.isArray(cd.diannPgGenesByRow) && cd.diannPgGenesByRow.length > 0) {
            var nGen = Math.min(n, cd.diannPgGenesByRow.length);
            var minUniqueGen = Math.max(12, Math.floor(nGen * 0.12));
            var seenG = {};
            var outG = [];
            var rowsWith = 0;
            for (var r = 0; r < nGen; r++) {
                var cell = cd.diannPgGenesByRow[r];
                if (cell != null && String(cell).trim()) rowsWith++;
                pushSplitGeneTokensForEnrichr(cell, seenG, outG);
            }
            var fracG = rowsWith / nGen;
            if (outG.length >= minUniqueGen && fracG >= minRowFrac) {
                return { genes: outG, columnLabel: 'Genes', source: 'diann_matrix_genes_column' };
            }
        }

        var colIdx = findDiannPgGenesAnnotationColumnIndex(cd);
        if (colIdx < 0 || !Array.isArray(cd.diannPgAnnotationRows) || cd.diannPgAnnotationRows.length === 0) return null;

        var nAnnRows = Math.min(n, cd.diannPgAnnotationRows.length);
        var minUniqueAnn = Math.max(12, Math.floor(nAnnRows * 0.12));
        var seen = {};
        var out = [];
        var rowsWith2 = 0;
        for (var i2 = 0; i2 < nAnnRows; i2++) {
            var row = cd.diannPgAnnotationRows[i2];
            var c = row && colIdx < row.length ? row[colIdx] : null;
            if (c != null && String(c).trim()) rowsWith2++;
            pushSplitGeneTokensForEnrichr(c, seen, out);
        }
        var frac2 = rowsWith2 / nAnnRows;
        var colName = String(cd.diannPgAnnotationHeaders[colIdx] || 'Genes');
        if (out.length >= minUniqueAnn && frac2 >= minRowFrac) {
            return { genes: out, columnLabel: colName, source: 'diann_annotation_column' };
        }
        return null;
    };

    /**
     * Infer Human/Mouse from matrix + DIANN + meta and set **#enrichrSpecies** / **#featureNameMapSpecies** when confident.
     * Call when opening the Enrichr tab or before running enrichment (row-label path also calls this via prepare).
     * @param {{ logFn?: function(string): void }} [opts]
     */
    window.applyEnrichrSpeciesGuessToDom = function (opts) {
        opts = opts || {};
        var logFn = typeof opts.logFn === 'function' ? opts.logFn : function () {};
        var cd = window.currentData;
        if (!cd || typeof window.guessEnrichrSpeciesFromMatrix !== 'function') return;
        var guess = window.guessEnrichrSpeciesFromMatrix(cd, window.metaData);
        if (guess.enrichrSpecies === 'Human' || guess.enrichrSpecies === 'Mouse') {
            var enrichrSel = document.getElementById('enrichrSpecies');
            if (enrichrSel) enrichrSel.value = guess.enrichrSpecies;
            var fms = document.getElementById('featureNameMapSpecies');
            if (fms) fms.value = guess.enrichrSpecies === 'Mouse' ? 'mouse' : 'human';
            logFn('Species inferred: ' + guess.enrichrSpecies + ' (' + (guess.confidence || '') + ') — ' + guess.rationale);
        } else {
            logFn('Species not auto-set: ' + (guess.rationale || 'no Human/Mouse signal.'));
        }
    };

    /** Map Enrichr sidebar species value to feature_name_mapping speciesKey. */
    window.enrichrSpeciesValueToMappingKey = function (enrichrVal) {
        var v = String(enrichrVal || '').trim();
        if (v === 'Mouse') return 'mouse';
        if (v === 'Human') return 'human';
        return 'human';
    };
})();
