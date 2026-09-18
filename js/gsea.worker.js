// GSEA preranked engine (Web Worker source).
// Loaded via <script src="..."> so it works on Chrome with file:// URLs.
// index.html reads window._gseaWorkerSrc and creates a Blob Worker from it.
//
// Method: Subramanian et al., PNAS 102(43):15545-15550 (2005), preranked mode.
//   - Weighted running-sum enrichment score (ES), exponent p (default 1).
//   - Gene-set permutation null (random rank positions, same set size).
//   - NES normalized by same-sign permutation means.
//   - Nominal p-value with Laplace (+1/+1) correction over same-sign perms.
//   - FDR from the global null-NES distribution (observed-vs-null tail ratio,
//     monotonicity-enforced) — the official approach, not Benjamini-Hochberg.
//   - Leading edge: hits at/before the running-sum peak (ES>0) or at/after
//     the peak (ES<0).
//
// Protocol:
//   main -> worker: { type:'run', jobId, genes:[...], scores:[...],
//                     sets:{name:[...]}, opts:{weightP,nPerm,minSize,maxSize,seed} }
//   worker -> main: { type:'progress', jobId, done, total }
//                   { type:'done', jobId, results, filtered, summary }
//                   { type:'error', jobId, message }
//
// NOTE: this source must avoid backticks and '${' (it lives inside a template
// literal in this file) — string building uses concatenation only.
window._gseaWorkerSrc = `
'use strict';

/* Deterministic RNG (mulberry32) so a fixed seed reproduces the run. */
function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
        s |= 0; s = (s + 0x6D2B79F5) | 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Draw k distinct positions from [0, n) via partial Fisher-Yates. */
function samplePositions(n, k, rng) {
    var idx = new Array(n);
    for (var i = 0; i < n; i++) idx[i] = i;
    for (var j = 0; j < k; j++) {
        var r = j + Math.floor(rng() * (n - j));
        var t = idx[j]; idx[j] = idx[r]; idx[r] = t;
    }
    idx.length = k;
    idx.sort(function (a, b) { return a - b; });
    return idx;
}

/* Full running-sum curve over all N ranks for sorted hit positions.
   NR (hit-weight normalization) is recomputed from these positions, exactly
   as the official implementation does for every (permuted or observed) set.
   Returns { es, peakRank, curve } where curve is a Float64Array length N. */
function runningCurve(hitPos, absW, N, NH) {
    var NR = 0;
    for (var ni = 0; ni < hitPos.length; ni++) NR += absW[hitPos[ni]];
    var miss = 1 / (N - NH);
    var curve = new Float64Array(N);
    var run = 0, maxV = 0, minV = 0, argMax = 0, argMin = 0;
    var h = 0;
    for (var i = 0; i < N; i++) {
        if (h < hitPos.length && hitPos[h] === i) {
            run += absW[i] / NR;
            h++;
        } else {
            run -= miss;
        }
        curve[i] = run;
        if (run > maxV) { maxV = run; argMax = i; }
        if (run < minV) { minV = run; argMin = i; }
    }
    var es = (maxV >= -minV) ? maxV : minV;
    var peakRank = (es === minV && maxV !== minV) ? argMin : argMax;
    return { es: es, peakRank: peakRank, curve: curve };
}

/* Scalar ES only (permutation fast path, no curve allocation).
   NR is recomputed per permuted set — same as the official implementation. */
function esScalar(hitPos, absW, N, NH) {
    var NR = 0;
    for (var ni = 0; ni < hitPos.length; ni++) NR += absW[hitPos[ni]];
    if (!(NR > 0)) return 0;
    var miss = 1 / (N - NH);
    var run = 0, maxV = 0, minV = 0;
    var h = 0;
    for (var i = 0; i < N; i++) {
        if (h < hitPos.length && hitPos[h] === i) { run += absW[i] / NR; h++; }
        else { run -= miss; }
        if (run > maxV) maxV = run;
        if (run < minV) minV = run;
    }
    return (maxV >= -minV) ? maxV : minV;
}

function downsampleCurve(curve, peakRank, maxPts) {
    var N = curve.length;
    if (N <= maxPts) {
        var xs = new Array(N), ys = new Array(N);
        for (var i = 0; i < N; i++) { xs[i] = i; ys[i] = curve[i]; }
        return { x: xs, y: ys };
    }
    var stride = Math.ceil(N / maxPts);
    var xs = [], ys = [];
    var peakAdded = false;
    for (var k = 0; k < N; k += stride) {
        xs.push(k); ys.push(curve[k]);
        if (!peakAdded && k >= peakRank) peakAdded = true;
    }
    if (!peakAdded) { xs.push(peakRank); ys.push(curve[peakRank]); }
    if (xs[xs.length - 1] !== N - 1) { xs.push(N - 1); ys.push(curve[N - 1]); }
    return { x: xs, y: ys };
}

self.onmessage = function (ev) {
    var msg = ev.data || {};
    if (msg.type !== 'run') return;
    var jobId = msg.jobId;
    function progress(done, total) {
        self.postMessage({ type: 'progress', jobId: jobId, done: done, total: total });
    }
    try {
        var genes = msg.genes || [];
        var scores = msg.scores || [];
        var sets = msg.sets || {};
        var opts = msg.opts || {};
        var weightP = (typeof opts.weightP === 'number' && opts.weightP >= 0) ? opts.weightP : 1;
        var nPerm = Math.max(100, Math.min(10000, Math.round(opts.nPerm) || 1000));
        var minSize = Math.max(1, Math.round(opts.minSize) || 15);
        var maxSize = Math.max(minSize, Math.round(opts.maxSize) || 500);
        var rng = makeRng(typeof opts.seed === 'number' ? opts.seed : 42);

        var N = genes.length;
        if (N < 10) throw new Error('Ranked list too short (n=' + N + ').');
        if (scores.length !== N) throw new Error('Genes/scores length mismatch.');

        /* Uppercase + order check: sort descending by score (defensive copy). */
        var order = new Array(N);
        for (var i = 0; i < N; i++) order[i] = i;
        order.sort(function (a, b) { return scores[b] - scores[a]; });
        var g = new Array(N), sc = new Array(N);
        for (var q = 0; q < N; q++) {
            g[q] = String(genes[order[q]]).toUpperCase();
            sc[q] = scores[order[q]];
        }
        var absW = new Array(N);
        for (var w = 0; w < N; w++) absW[w] = Math.pow(Math.abs(sc[w]), weightP);
        var posOf = {};
        for (var pi = 0; pi < N; pi++) {
            if (posOf[g[pi]] === undefined) posOf[g[pi]] = pi;
        }

        var names = Object.keys(sets);
        var total = names.length;
        var results = [];
        var filtered = [];
        /* First pass: observed ES + per-set permutation nulls. */
        var setJobs = [];
        for (var si = 0; si < names.length; si++) {
            var nm = names[si];
            var members = sets[nm] || [];
            var hitPos = [];
            var hitGenes = [];
            for (var mi = 0; mi < members.length; mi++) {
                var up = String(members[mi]).toUpperCase();
                var px = posOf[up];
                if (px !== undefined) { hitPos.push(px); hitGenes.push(up); }
            }
            hitPos.sort(function (a, b) { return a - b; });
            var NH = hitPos.length;
            if (NH < minSize) { filtered.push({ name: nm, reason: 'size ' + NH + ' < min ' + minSize }); continue; }
            if (NH > maxSize) { filtered.push({ name: nm, reason: 'size ' + NH + ' > max ' + maxSize }); continue; }
            var NR = 0;
            for (var ni = 0; ni < NH; ni++) NR += absW[hitPos[ni]];
            if (!(NR > 0)) { filtered.push({ name: nm, reason: 'zero weight' }); continue; }
            var obs = runningCurve(hitPos, absW, N, NH);
            var nulls = new Array(nPerm);
            for (var pp = 0; pp < nPerm; pp++) {
                nulls[pp] = esScalar(samplePositions(N, NH, rng), absW, N, NH);
            }
            setJobs.push({ name: nm, NH: NH, hitPos: hitPos, hitGenes: hitGenes, NR: NR, obs: obs, nulls: nulls });
            progress(setJobs.length, total);
        }

        /* Second pass: NES (same-sign means) + nominal p (Laplace, same-sign). */
        var obsPos = [], obsNeg = [], nullPos = [], nullNeg = [];
        for (var aj = 0; aj < setJobs.length; aj++) {
            var J = setJobs[aj];
            var sumP = 0, cntP = 0, sumN = 0, cntN = 0;
            for (var u = 0; u < J.nulls.length; u++) {
                var v = J.nulls[u];
                if (v >= 0) { sumP += v; cntP++; nullPos.push(v); }
                else { sumN += -v; cntN++; nullNeg.push(-v); }
            }
            J.meanP = cntP > 0 ? sumP / cntP : 0;
            J.meanN = cntN > 0 ? sumN / cntN : 0;
            J.nes = J.obs.es >= 0
                ? (J.meanP > 0 ? J.obs.es / J.meanP : J.obs.es)
                : (J.meanN > 0 ? J.obs.es / J.meanN : J.obs.es);
            var more = 0, same = 0;
            for (var u2 = 0; u2 < J.nulls.length; u2++) {
                var v2 = J.nulls[u2];
                if (J.obs.es >= 0) {
                    if (v2 >= 0) { same++; if (v2 >= J.obs.es) more++; }
                } else {
                    if (v2 <= 0) { same++; if (v2 <= J.obs.es) more++; }
                }
            }
            J.p = (more + 1) / (same + 1);
            if (J.nes >= 0) obsPos.push(J.nes); else obsNeg.push(-J.nes);
            J.nulls = null;
        }

        /* Official-style FDR: null-tail rate over observed-tail rate. */
        function tailFrac(sortedDesc, x) {
            var lo = 0, hi = sortedDesc.length;
            while (lo < hi) {
                var mid = (lo + hi) >> 1;
                if (sortedDesc[mid] >= x) lo = mid + 1; else hi = mid;
            }
            return lo / sortedDesc.length;
        }
        nullPos.sort(function (a, b) { return b - a; });
        nullNeg.sort(function (a, b) { return b - a; });
        obsPos.sort(function (a, b) { return b - a; });
        obsNeg.sort(function (a, b) { return b - a; });
        var EPS = 1 / (nPerm * Math.max(1, setJobs.length) + 1);
        for (var fj = 0; fj < setJobs.length; fj++) {
            var F = setJobs[fj];
            var aNES = Math.abs(F.nes);
            var fdr;
            if (F.nes >= 0) {
                var nullRate = nullPos.length ? tailFrac(nullPos, F.nes) : 1;
                var obsRate = obsPos.length ? tailFrac(obsPos, F.nes) : 1;
                fdr = obsRate > 0 ? (nullRate + EPS) / obsRate : 1;
            } else {
                var nullRateN = nullNeg.length ? tailFrac(nullNeg, aNES) : 1;
                var obsRateN = obsNeg.length ? tailFrac(obsNeg, aNES) : 1;
                fdr = obsRateN > 0 ? (nullRateN + EPS) / obsRateN : 1;
            }
            F.fdr = Math.max(0, Math.min(1, fdr));
        }
        /* Monotonicity: sort by |NES| desc, enforce non-decreasing FDR. */
        setJobs.sort(function (a, b) { return Math.abs(b.nes) - Math.abs(a.nes); });
        for (var mj = 1; mj < setJobs.length; mj++) {
            if (setJobs[mj].fdr < setJobs[mj - 1].fdr) setJobs[mj].fdr = setJobs[mj - 1].fdr;
        }

        /* Assemble results with leading edges + downsampled curves. */
        var out = [];
        for (var oj = 0; oj < setJobs.length; oj++) {
            var O = setJobs[oj];
            var le = [];
            if (O.obs.es >= 0) {
                for (var l1 = 0; l1 < O.NH; l1++) {
                    if (O.hitPos[l1] <= O.obs.peakRank) le.push(O.hitGenes[l1]);
                    else break;
                }
            } else {
                for (var l2 = O.NH - 1; l2 >= 0; l2--) {
                    if (O.hitPos[l2] >= O.obs.peakRank) le.unshift(O.hitGenes[l2]);
                    else break;
                }
            }
            var ds = downsampleCurve(O.obs.curve, O.obs.peakRank, 400);
            out.push({
                name: O.name, size: O.NH, es: O.obs.es, nes: O.nes,
                p: O.p, fdr: O.fdr, peakRank: O.obs.peakRank,
                leadingEdge: le, curveX: ds.x, curveY: ds.y
            });
        }
        self.postMessage({
            type: 'done', jobId: jobId, results: out, filtered: filtered,
            summary: { nRanked: N, nSetsTested: out.length, nSetsFiltered: filtered.length, nPerm: nPerm, weightP: weightP }
        });
    } catch (err) {
        self.postMessage({ type: 'error', jobId: jobId, message: (err && err.message) ? err.message : String(err) });
    }
};
`;
