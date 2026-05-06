/**
 * Parse raw Enrichr API term rows (array rows) into analytic objects.
 * Column indices match Enrichr / Maayan Lab table: Rank, Term, P-value, Odds Ratio,
 * Combined Score, Genes, Adjusted P-value, ...
 */
(function (global) {
    'use strict';

    var IDX = {
        RANK: 0,
        TERM: 1,
        P: 2,
        ODDS: 3,
        COMBINED: 4,
        GENES: 5,
        PADJ: 6
    };

    function parseNum(v) {
        if (v == null || v === '') return NaN;
        var n = typeof v === 'number' ? v : parseFloat(String(v));
        return typeof n === 'number' && !isNaN(n) ? n : NaN;
    }

    /** Split gene cell from API (array or delimited string). */
    function parseGeneCell(val) {
        if (val == null || val === '') return [];
        if (Array.isArray(val)) {
            return val.map(function (g) {
                return String(g || '').trim();
            }).filter(Boolean);
        }
        return String(val).split(/[,;|\s]+/).map(function (x) {
            return x.trim();
        }).filter(Boolean);
    }

    function dedupeGenes(arr) {
        var seen = {};
        var out = [];
        arr.forEach(function (g) {
            var k = String(g).toUpperCase();
            if (!seen[k]) {
                seen[k] = true;
                out.push(g);
            }
        });
        return out;
    }

    function negLog10(p) {
        if (!Number.isFinite(p) || p <= 0 || p > 1) return 0;
        return -Math.log10(Math.max(p, 1e-300));
    }

    /**
     * @param {Array[]} terms - raw rows from Enrichr
     * @returns {Array<{rank:number,label:string,p:number,oddsRatio:number,combinedScore:number,genes:string[],overlapCount:number,padj:number,matrixColSums:(number|null)[]|null}>}
     */
    function parseEnrichrTermRows(terms) {
        if (!terms || !terms.length) return [];
        var rows = [];
        for (var i = 0; i < terms.length; i++) {
            var t = terms[i];
            if (!Array.isArray(t)) continue;
            var genesRaw = t.length > IDX.GENES ? t[IDX.GENES] : null;
            var genes = dedupeGenes(parseGeneCell(genesRaw));
            var matCols = t._enrichrMatrixColSums;
            var matCopy = Array.isArray(matCols) ? matCols.map(function (x) {
                return (typeof x === 'number' && !isNaN(x) && Number.isFinite(x)) ? x : null;
            }) : null;
            rows.push({
                rank: parseNum(t[IDX.RANK]),
                label: t[IDX.TERM] != null ? String(t[IDX.TERM]) : '',
                p: parseNum(t[IDX.P]),
                oddsRatio: parseNum(t[IDX.ODDS]),
                combinedScore: parseNum(t[IDX.COMBINED]),
                genes: genes,
                overlapCount: genes.length,
                padj: parseNum(t[IDX.PADJ]),
                matrixColSums: matCopy
            });
        }
        return rows;
    }

    /**
     * Sort and cap rows for plotting.
     * @param {object[]} rows - from parseEnrichrTermRows
     * @param {{topN?:number,minOverlap?:number,rankBy?:string}} options
     */
    function filterAndTopN(rows, options) {
        options = options || {};
        var topN = parseInt(options.topN, 10);
        if (!Number.isFinite(topN) || topN < 5) topN = 25;
        topN = Math.min(200, Math.max(5, topN));
        var minOverlap = parseInt(options.minOverlap, 10);
        if (!Number.isFinite(minOverlap) || minOverlap < 0) minOverlap = 0;
        var rankBy = options.rankBy || 'padj';

        var filtered = rows.filter(function (r) {
            return r.label && r.overlapCount >= minOverlap;
        });

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

        return filtered.slice(0, topN);
    }

    global.EnrichrResultsParse = {
        IDX: IDX,
        parseEnrichrTermRows: parseEnrichrTermRows,
        filterAndTopN: filterAndTopN,
        negLog10: negLog10,
        dedupeGenes: dedupeGenes,
        parseGeneCell: parseGeneCell
    };
})(typeof window !== 'undefined' ? window : this);
