// GSVA engine (Web Worker source): single-sample pathway scores.
// Loaded via <script src="..."> so it works on Chrome with file:// URLs.
// index.html reads window._gsvaWorkerSrc and creates a Blob Worker from it.
//
// Method: Hanzelmann, Castelo & Guinney, BMC Bioinformatics 14:7 (2013),
// R package rcastelo/GSVA. Four variants here:
//   gsva   — Gaussian-kernel CDF per gene across samples, log-odds transform,
//            within-sample ranks (ties broken last-to-first, i.e. R
//            rank(ties.method="last")), decreasing order statistics,
//            symmetric rank statistics |p/2 - rank|, KS-like random walk with
//            exponent tau, ES = max+min (maxDiff) or max deviation.
//   ssgsea — Barbie et al. 2009: average-tie ranks, weighted ECDF difference
//            with exponent alpha, normalized by the global range over all
//            samples and gene sets.
//   zscore — Lee et al. 2008 (PLoS Comp Biol 4(11):e1000217): row-standardized
//            matrix (mean, sample SD like R scale()), per-set combined
//            z-score colSums/sqrt(k). No method-specific parameters.
//   plage  — Tomfohr et al. 2005 (BMC Bioinformatics 6:225): first right
//            singular vector of the row-standardized set matrix (top
//            eigenvector of its sample Gram matrix via cyclic Jacobi).
//            Unsigned, as in R (plain svd() $v[,1]). No method-specific
//            parameters.
// Constant (zero-variance) genes are filtered up front, mirroring R's
// filterRows default for gsva. Non-finite cells drop their whole row.
// Gaussian kernel only (intensity data); no Poisson path.
//
// Protocol:
//   main -> worker: { type:'run', jobId, X: [[...]...] (p rows x n cols),
//                     samples: [...], sets: {name:[rowIdx,...]},
//                     opts: {method,tau,maxDiff,absRanking,alpha,normalize,
//                            minSize,maxSize} }
//   worker -> main: { type:'progress', jobId, done, total }
//                   { type:'done', jobId, rows, cols, values, sizes, summary }
//                   { type:'error', jobId, message }
//
// NOTE: this source must avoid backticks and '${' (it lives inside a template
// literal in this file) — string building uses concatenation only.
window._gsvaWorkerSrc = `
'use strict';

/* Standard normal CDF via Abramowitz-Stegun 7.1.26 (|eps| <= 1.5e-7). */
function phiStd(x) {
    var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    var a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    var s = x < 0 ? -1 : 1;
    var ax = Math.abs(x) / Math.sqrt(2);
    var t = 1 / (1 + p * ax);
    var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
    return 0.5 * (1 + s * y);
}

function meanSd(a) {
    var n = a.length, s = 0, i;
    for (i = 0; i < n; i++) s += a[i];
    var m = s / n;
    if (n < 2) return { m: m, sd: NaN };
    var q = 0;
    for (i = 0; i < n; i++) { var d = a[i] - m; q += d * d; }
    return { m: m, sd: Math.sqrt(q / (n - 1)) };
}

/* ---- classic gsva: kernel log-odds matrix Z (genes x samples) ----
   kcdf "Gaussian" mirrors R (sd/4 bandwidth, Abramowitz-Stegun Phi).
   kcdf "Poisson" mirrors R row_d Gaussk=0: lt = mean_k ppois(y_j, x_k+0.5),
   then the same log-odds. Rows with min < -0.5 would give NaN lambdas in R
   and are dropped here instead (counted). kcdf "none" is the direct ECDF
   lt = #{k: x_k <= x_j}/n (R ecdf semantics, ties take max rank). ---- */
function kernelLogOdds(X, n, p) {
    var Z = new Array(p);
    var dropped = [];
    for (var i = 0; i < p; i++) {
        var row = X[i];
        var ms = meanSd(row);
        if (!isFinite(ms.sd)) { dropped.push(i); Z[i] = null; continue; }
        var bw = ms.sd / 4;
        if (!(bw > 0)) bw = 0.001;
        var z = new Array(n);
        for (var j = 0; j < n; j++) {
            var lt = 0;
            for (var k = 0; k < n; k++) lt += phiStd((row[j] - row[k]) / bw);
            lt /= n;
            z[j] = -Math.log((1 - lt) / lt);
        }
        Z[i] = z;
    }
    return { Z: Z, dropped: dropped };
}

/* Log-gamma via Lanczos (for the Poisson CDF below). */
function gammln(xx) {
    var cof = [76.18009172947146, -86.50532032961677, 24.01409824083091,
               -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = xx, tmp = xx + 5.5;
    tmp -= (xx + 0.5) * Math.log(tmp);
    var ser = 1.000000000190015;
    for (var j = 0; j < 6; j++) { y += 1; ser += cof[j] / y; }
    return -tmp + Math.log(2.5066282746310005 * ser / xx);
}

/* Upper regularized incomplete gamma Q(a,x) by series (x<a+1) or continued
   fraction, i.e. R pgamma(x, a, lower=FALSE). */
function gammaQ(a, x) {
    var gln = gammln(a);
    var eps = 3e-14, fpmin = 1e-300;
    var res;
    if (x < a + 1) {
        var ap = a, del = 1 / a, sum = del, n;
        for (n = 1; n <= 1000; n++) {
            ap += 1;
            del *= x / ap;
            sum += del;
            if (Math.abs(del) < Math.abs(sum) * eps) break;
        }
        res = 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
    } else {
        var b = x + 1 - a, c = 1 / fpmin, d = 1 / b, h = d, i;
        for (i = 1; i <= 1000; i++) {
            var an = -i * (i - a);
            b += 2;
            d = an * d + b;
            if (Math.abs(d) < fpmin) d = fpmin;
            c = b + an / c;
            if (Math.abs(c) < fpmin) c = fpmin;
            d = 1 / d;
            var del2 = d * c;
            h *= del2;
            if (Math.abs(del2 - 1) < eps) break;
        }
        res = Math.exp(-x + a * Math.log(x) - gln) * h;
    }
    if (!(res >= 0)) return 0;
    if (!(res <= 1)) return 1;
    return res;
}

/* R ppois(q, lambda): P(X <= q) = Q(a=q+1, x=lambda). */
function poissonCdf(q, lambda) {
    if (!(lambda >= 0)) return NaN;
    if (q < 0) return 0;
    if (lambda === 0) return 1;
    return gammaQ(q + 1, lambda);
}

/* Poisson-kernel log-odds (R row_d, Gaussk=0): lambda = x+0.5.
   Rows with min < -0.5 are returned null (R yields NaN there). */
function poissonLogOdds(X, n, p) {
    var Z = new Array(p);
    for (var i = 0; i < p; i++) {
        var row = X[i];
        var ok = true;
        for (var c = 0; c < n; c++) {
            if (!(row[c] >= -0.5)) { ok = false; break; }
        }
        if (!ok) { Z[i] = null; continue; }
        var z = new Array(n);
        for (var j = 0; j < n; j++) {
            var lt = 0;
            for (var k = 0; k < n; k++) lt += poissonCdf(row[j], row[k] + 0.5);
            lt /= n;
            z[j] = -Math.log((1 - lt) / lt);
        }
        Z[i] = z;
    }
    return Z;
}

/* Direct ECDF log-odds (kcdf "none"): lt = #{k: x_k <= x_j}/n. */
function ecdfLogOdds(X, n, p) {
    var Z = new Array(p);
    for (var i = 0; i < p; i++) {
        var row = X[i];
        var cp = row.slice().sort(function (a, b) { return a - b; });
        var z = new Array(n);
        for (var j = 0; j < n; j++) {
            var lo = 0, hi = n;
            while (lo < hi) {
                var mid = (lo + hi) >> 1;
                if (cp[mid] <= row[j]) lo = mid + 1;
                else hi = mid;
            }
            var lt = lo / n;
            z[j] = -Math.log((1 - lt) / lt);
        }
        Z[i] = z;
    }
    return Z;
}

/* kcdf "auto" (R gsvaParam): n >= minSS -> "none"; all non-negative
   integers -> "Poisson"; else "Gaussian". */
function resolveKcdf(kcdfOpt, Xk, n, p, minSS) {
    if (kcdfOpt === 'Gaussian' || kcdfOpt === 'Poisson' || kcdfOpt === 'none') return kcdfOpt;
    if (n >= minSS) return 'none';
    for (var i = 0; i < p; i++) {
        var row = Xk[i];
        for (var j = 0; j < n; j++) {
            var v = row[j];
            if (!(v >= 0) || v !== Math.floor(v)) return 'Gaussian';
        }
    }
    return 'Poisson';
}

/* Descending-value order per sample; ties broken by ascending row index
   (equivalent of R rank(ties.method="last") followed by dos reversal). */
function descOrder(zcol, p) {
    var idx = new Array(p);
    for (var i = 0; i < p; i++) idx[i] = i;
    idx.sort(function (a, b) {
        if (zcol[a] !== zcol[b]) return zcol[b] - zcol[a];
        return a - b;
    });
    return idx;
}

/* Ascending ranks with ties broken last-to-first (R rank ties.method="last"):
   sort by (value asc, index desc), assign 1..p. Returns rank per row. */
function ranksLast(zcol, p) {
    var idx = new Array(p);
    for (var i = 0; i < p; i++) idx[i] = i;
    idx.sort(function (a, b) {
        if (zcol[a] !== zcol[b]) return zcol[a] - zcol[b];
        return b - a;
    });
    var r = new Array(p);
    for (var q = 0; q < p; q++) r[idx[q]] = q + 1;
    return r;
}

/* KS random walk for one set in one sample over the descending-value order
   D (array of kept positions, highest expression first). */
function ksWalk(D, inSet, srsW, wSum, p, k) {
    var miss = 1 / (p - k);
    var run = 0, maxV = 0, minV = 0;
    for (var i = 0; i < p; i++) {
        var gi = D[i];
        if (inSet[gi]) run += srsW[gi] / wSum;
        else run -= miss;
        if (run > maxV) maxV = run;
        if (run < minV) minV = run;
    }
    return { maxV: maxV, minV: minV };
}

function gsvaScores(Z, sets, names, n, p, tau, maxDiff, absRanking, post) {
    var out = {};
    for (var s = 0; s < names.length; s++) {
        var nm = names[s];
        var rows = sets[nm];
        var k = rows.length;
        var inSet = {};
        for (var g0 = 0; g0 < k; g0++) inSet[rows[g0]] = true;
        var sc = new Array(n);
        for (var j = 0; j < n; j++) {
            var zcol = new Array(p);
            for (var i = 0; i < p; i++) zcol[i] = Z[i][j];
            var rk = ranksLast(zcol, p);
            var srsW = new Array(p);
            var wSum = 0;
            for (var g = 0; g < k; g++) {
                var gi = rows[g];
                var w = Math.pow(Math.abs(p / 2 - rk[gi]), tau);
                srsW[gi] = w;
                wSum += w;
            }
            var D = descOrder(zcol, p);
            var w = ksWalk(D, inSet, srsW, wSum, p, k);
            var es;
            if (maxDiff) {
                es = absRanking ? (w.maxV - w.minV) : (w.maxV + w.minV);
            } else {
                es = (w.maxV >= -w.minV) ? w.maxV : w.minV;
            }
            sc[j] = es;
        }
        out[nm] = sc;
        post(s + 1, names.length);
    }
    return out;
}

/* ---- ssgsea: average-tie ranks, weighted ECDF difference ---- */
function ranksAverage(col, p) {
    var idx = new Array(p);
    for (var i = 0; i < p; i++) idx[i] = i;
    idx.sort(function (a, b) { return col[a] - col[b]; });
    var r = new Array(p);
    var q = 0;
    while (q < p) {
        var q2 = q;
        while (q2 + 1 < p && col[idx[q2 + 1]] === col[idx[q]]) q2++;
        var avg = (q + 1 + q2 + 1) / 2;
        for (var t = q; t <= q2; t++) r[idx[t]] = avg;
        q = q2 + 1;
    }
    return r;
}

function ssgseaScores(Xk, sets, names, n, p, alpha, post) {
    var tri = p * (p + 1) / 2;
    var raw = {};
    var gmin = Infinity, gmax = -Infinity;
    for (var s2 = 0; s2 < names.length; s2++) {
        raw[names[s2]] = new Array(n);
    }
    for (var j = 0; j < n; j++) {
        var col = new Array(p);
        for (var i = 0; i < p; i++) col[i] = Xk[i][j];
        var rk = ranksAverage(col, p);
        var ra = new Array(p);
        for (var q2 = 0; q2 < p; q2++) ra[q2] = Math.pow(rk[q2], alpha);
        var desc = new Array(p);
        for (var d0 = 0; d0 < p; d0++) desc[d0] = d0;
        desc.sort(function (a, b) {
            if (rk[a] !== rk[b]) return rk[b] - rk[a];
            return a - b;
        });
        var pos = new Array(p);
        for (var d1 = 0; d1 < p; d1++) pos[desc[d1]] = d1 + 1;
        for (var s3 = 0; s3 < names.length; s3++) {
            var nm3 = names[s3];
            var rows3 = sets[nm3];
            var k3 = rows3.length;
            var num = 0, wsum = 0, rsum = 0;
            for (var g3 = 0; g3 < k3; g3++) {
                var gi3 = rows3[g3];
                var term = p - pos[gi3] + 1;
                num += ra[gi3] * term;
                wsum += ra[gi3];
                rsum += term;
            }
            var es = (wsum > 0 && k3 < p) ? (num / wsum - (tri - rsum) / (p - k3)) : 0;
            raw[nm3][j] = es;
            if (es < gmin) gmin = es;
            if (es > gmax) gmax = es;
        }
        post(j + 1, n * 2);
    }
    return { raw: raw, gmin: gmin, gmax: gmax };
}

/* ---- shared row standardization (R scale(): mean, sample SD, n-1).
   Callers drop zero-variance rows first, so sd > 0; guard anyway. ---- */
function scaleRows(Xk, n, p) {
    var Z = new Array(p);
    for (var i = 0; i < p; i++) {
        var row = Xk[i];
        var ms = meanSd(row);
        var z = new Array(n);
        if (!(ms.sd > 0)) {
            for (var q = 0; q < n; q++) z[q] = 0;
        } else {
            for (var j = 0; j < n; j++) z[j] = (row[j] - ms.m) / ms.sd;
        }
        Z[i] = z;
    }
    return Z;
}

/* ---- zscore: combined z-score colSums/sqrt(k) per set ---- */
function zscoreScores(Z, sets, names, n, post) {
    var out = {};
    for (var s = 0; s < names.length; s++) {
        var rows = sets[names[s]];
        var den = Math.sqrt(rows.length);
        var sc = new Array(n);
        for (var j = 0; j < n; j++) {
            var t = 0;
            for (var g = 0; g < rows.length; g++) t += Z[rows[g]][j];
            sc[j] = t / den;
        }
        out[names[s]] = sc;
        post(s + 1, names.length);
    }
    return out;
}

/* Largest eigenpair of symmetric n x n A via cyclic Jacobi rotations. */
function topEigenpair(A, n) {
    var a = new Array(n);
    var v = new Array(n);
    var i, r, c;
    for (i = 0; i < n; i++) {
        a[i] = A[i].slice();
        v[i] = new Array(n);
        for (c = 0; c < n; c++) v[i][c] = (i === c) ? 1 : 0;
    }
    for (var sweep = 0; sweep < 100; sweep++) {
        var off = 0;
        for (r = 0; r < n; r++) {
            for (c = 0; c < r; c++) off += a[r][c] * a[r][c];
        }
        if (!(off > 1e-24)) break;
        for (var q = 1; q < n; q++) {
            for (var p = 0; p < q; p++) {
                var apq = a[q][p];
                if (!(Math.abs(apq) > 1e-300)) continue;
                var app = a[q][q], aqq = a[p][p];
                var tau = (aqq - app) / (2 * apq);
                var t = ((tau >= 0) ? 1 : -1) / (Math.abs(tau) + Math.sqrt(tau * tau + 1));
                var co = 1 / Math.sqrt(t * t + 1);
                var si = t * co;
                var k;
                for (k = 0; k < n; k++) {
                    var akq = a[k][q], akp = a[k][p];
                    a[k][q] = co * akq - si * akp;
                    a[k][p] = si * akq + co * akp;
                }
                for (k = 0; k < n; k++) {
                    var aqk = a[q][k], apk = a[p][k];
                    a[q][k] = co * aqk - si * apk;
                    a[p][k] = si * aqk + co * apk;
                }
                for (k = 0; k < n; k++) {
                    var vkq = v[k][q], vkp = v[k][p];
                    v[k][q] = co * vkq - si * vkp;
                    v[k][p] = si * vkq + co * vkp;
                }
            }
        }
    }
    var top = 0;
    for (i = 1; i < n; i++) {
        if (a[i][i] > a[top][top]) top = i;
    }
    var vec = new Array(n);
    for (i = 0; i < n; i++) vec[i] = v[i][top];
    return { value: a[top][top], vector: vec };
}

/* ---- plage: first right singular vector of the standardized set matrix.
   Solved as the top eigenvector of the n x n Gram matrix (or the k x k one
   when the set is smaller, mapped back through the data). ---- */
function plageScores(Z, sets, names, n, post) {
    var out = {};
    for (var s = 0; s < names.length; s++) {
        var rows = sets[names[s]];
        var k = rows.length;
        var sc = new Array(n);
        var j;
        if (k < n) {
            var H = new Array(k);
            var g1, g2;
            for (g1 = 0; g1 < k; g1++) {
                H[g1] = new Array(k);
                for (g2 = 0; g2 < k; g2++) {
                    var h = 0;
                    for (j = 0; j < n; j++) h += Z[rows[g1]][j] * Z[rows[g2]][j];
                    H[g1][g2] = h;
                }
            }
            var eph = topEigenpair(H, k);
            var lam = eph.value > 0 ? eph.value : 0;
            var den = Math.sqrt(lam);
            for (j = 0; j < n; j++) {
                var u = 0;
                for (g1 = 0; g1 < k; g1++) u += Z[rows[g1]][j] * eph.vector[g1];
                sc[j] = den > 0 ? u / den : 0;
            }
        } else {
            var G = new Array(n);
            var a, b, g;
            for (a = 0; a < n; a++) {
                G[a] = new Array(n);
                for (b = 0; b < n; b++) {
                    var t = 0;
                    for (g = 0; g < k; g++) t += Z[rows[g]][a] * Z[rows[g]][b];
                    G[a][b] = t;
                }
            }
            sc = topEigenpair(G, n).vector;
        }
        out[names[s]] = sc;
        post(s + 1, names.length);
    }
    return out;
}

/* Kept-row view of Xin plus original->kept position map for set remap. */
function keptView(Xin, keep, p) {
    var Xk = new Array(p);
    var posOf = {};
    var i;
    for (i = 0; i < p; i++) {
        Xk[i] = Xin[keep[i]];
        posOf[keep[i]] = i;
    }
    return { Xk: Xk, posOf: posOf };
}

function remapSets(sets, useNames, posOf) {
    var out = {};
    for (var s = 0; s < useNames.length; s++) {
        var nm = useNames[s];
        out[nm] = sets[nm].map(function (r) { return posOf[r]; });
    }
    return out;
}

self.onmessage = function (ev) {
    var msg = ev.data || {};
    if (msg.type !== 'run') return;
    var jobId = msg.jobId;
    function progress(done, total) {
        self.postMessage({ type: 'progress', jobId: jobId, done: done, total: total });
    }
    try {
        var Xin = msg.X || [];
        var samples = msg.samples || [];
        var setsIn = msg.sets || {};
        var opts = msg.opts || {};
        var method = opts.method;
        if (method !== 'ssgsea' && method !== 'plage' && method !== 'zscore') method = 'gsva';
        var tau = (typeof opts.tau === 'number' && opts.tau >= 0) ? opts.tau : 1;
        var maxDiff = opts.maxDiff !== false;
        var absRanking = !!opts.absRanking;
        var alpha = (typeof opts.alpha === 'number' && opts.alpha > 0) ? opts.alpha : 0.25;
        var normalize = opts.normalize !== false;
        var kcdfOpt = opts.kcdf;
        if (kcdfOpt !== 'Gaussian' && kcdfOpt !== 'Poisson' && kcdfOpt !== 'none') kcdfOpt = 'auto';
        var kcdfMinSS = Math.max(1, Math.round(opts.kcdfNoneMinSampleSize) || 200);
        var kcdfRes = null;
        var droppedPoisson = 0;
        var minSize = Math.max(1, Math.round(opts.minSize) || 5);
        var maxSize = Math.max(minSize, Math.round(opts.maxSize) || 500);

        var p0 = Xin.length;
        var n = samples.length;
        if (p0 < 10) throw new Error('Too few genes (n=' + p0 + ').');
        if (n < 2) throw new Error('Need at least 2 samples (n=' + n + ').');

        /* Drop rows with any non-finite cell; drop zero-variance rows. */
        var keep = [];
        var droppedNF = 0, droppedConst = 0;
        for (var i = 0; i < p0; i++) {
            var row = Xin[i] || [];
            var ok = row.length >= n;
            if (ok) {
                for (var j = 0; j < n; j++) {
                    if (!isFinite(row[j])) { ok = false; break; }
                }
            }
            if (!ok) { droppedNF++; continue; }
            var ms0 = meanSd(row);
            if (!isFinite(ms0.sd) || ms0.sd === 0) { droppedConst++; continue; }
            keep.push(i);
        }
        var p = keep.length;
        if (p < 10) throw new Error('Too few usable genes after filtering (n=' + p + ').');

        /* Map sets to kept row indices; size-filter. */
        var names = Object.keys(setsIn);
        var sets = {}, sizes = {}, skipped = [];
        for (var si = 0; si < names.length; si++) {
            var nm = names[si];
            var arr = setsIn[nm] || [];
            var mapped = [];
            for (var mi = 0; mi < arr.length; mi++) {
                if (arr[mi] >= 0) mapped.push(arr[mi]);
            }
            if (mapped.length < minSize) { skipped.push({ name: nm, reason: 'size ' + mapped.length + ' < min ' + minSize }); continue; }
            if (mapped.length > maxSize) { skipped.push({ name: nm, reason: 'size ' + mapped.length + ' > max ' + maxSize }); continue; }
            sets[nm] = mapped;
            sizes[nm] = mapped.length;
        }
        var useNames = Object.keys(sets);
        if (!useNames.length) throw new Error('No gene sets pass the size filter.');

        var total = (method === 'gsva') ? useNames.length + n : (method === 'ssgsea' ? n * 2 : useNames.length);
        var out = {};
        if (method === 'gsva') {
            var kvG = keptView(Xin, keep, p);
            kcdfRes = resolveKcdf(kcdfOpt, kvG.Xk, n, p, kcdfMinSS);
            var Z = null;
            var finalPos = {};
            var pf = p;
            var pi;
            if (kcdfRes === 'Poisson') {
                var pz = poissonLogOdds(kvG.Xk, n, p);
                Z = [];
                for (pi = 0; pi < p; pi++) {
                    if (pz[pi] === null) { droppedPoisson++; continue; }
                    finalPos[pi] = Z.length;
                    Z.push(pz[pi]);
                }
                pf = Z.length;
                if (pf < 10) throw new Error('Too few usable genes for Poisson kcdf (n=' + pf + '); Poisson needs non-negative counts.');
            } else if (kcdfRes === 'none') {
                Z = ecdfLogOdds(kvG.Xk, n, p);
                for (pi = 0; pi < p; pi++) finalPos[pi] = pi;
            } else {
                kcdfRes = 'Gaussian';
                var kl = kernelLogOdds(Xin, n, p0);
                /* kernelLogOdds indexes by original rows; rebuild Z over kept rows */
                Z = new Array(p);
                for (var zi = 0; zi < p; zi++) Z[zi] = kl.Z[keep[zi]];
                for (pi = 0; pi < p; pi++) finalPos[pi] = pi;
            }
            /* remap set rows: original index -> kept position -> final position */
            var setsKept = {};
            for (var sk = 0; sk < useNames.length; sk++) {
                var nmk = useNames[sk];
                var arrk = sets[nmk];
                var mapped = [];
                for (var mi2 = 0; mi2 < arrk.length; mi2++) {
                    var kp = kvG.posOf[arrk[mi2]];
                    if (kp == null) continue;
                    var fp2 = finalPos[kp];
                    if (fp2 == null) continue;
                    mapped.push(fp2);
                }
                setsKept[nmk] = mapped;
            }
            out = gsvaScores(Z, setsKept, useNames, n, pf, tau, maxDiff, absRanking, function (d) {
                progress(d, total);
            });
            /* note: gsvaScores expects keep==identity over Z; pass positions directly */
        } else if (method === 'plage' || method === 'zscore') {
            var kv = keptView(Xin, keep, p);
            var setsKeptRZ = remapSets(sets, useNames, kv.posOf);
            var Zm = scaleRows(kv.Xk, n, p);
            if (method === 'zscore') {
                out = zscoreScores(Zm, setsKeptRZ, useNames, n, function (d) {
                    progress(d, total);
                });
            } else {
                out = plageScores(Zm, setsKeptRZ, useNames, n, function (d) {
                    progress(d, total);
                });
            }
        } else {
            var kv2 = keptView(Xin, keep, p);
            var setsKept2 = remapSets(sets, useNames, kv2.posOf);
            var rr = ssgseaScores(kv2.Xk, setsKept2, useNames, n, p, alpha, function (d) {
                progress(useNames.length + d, total);
            });
            var span = rr.gmax - rr.gmin;
            for (var sk3 = 0; sk3 < useNames.length; sk3++) {
                var nmk3 = useNames[sk3];
                var vec = rr.raw[nmk3];
                out[nmk3] = (normalize && span > 0) ? vec.map(function (v) { return v / span; }) : vec.slice();
            }
        }

        var values = useNames.map(function (nm) { return out[nm]; });
        self.postMessage({
            type: 'done', jobId: jobId, rows: useNames, cols: samples,
            values: values, sizes: sizes, skipped: skipped,
            summary: { method: method, nGenes: p, nSamples: n, nSets: useNames.length,
                       nSkipped: skipped.length, droppedNonFinite: droppedNF,
                       droppedConstant: droppedConst, droppedPoisson: droppedPoisson,
                       kcdf: kcdfRes, tau: tau, maxDiff: maxDiff,
                       absRanking: absRanking, alpha: alpha, normalize: normalize }
        });
    } catch (err) {
        self.postMessage({ type: 'error', jobId: jobId, message: (err && err.message) ? err.message : String(err) });
    }
};
`;
