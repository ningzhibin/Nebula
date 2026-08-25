// K-means clustering worker source.
// Loaded via <script src="..."> so it works on Chrome with file:// URLs.
// index.html reads window._kmeansWorkerSrc and creates a Blob Worker from it.
//
// Responsibilities (all heavy numeric work runs off the main thread):
//   - k-means++ / random initialization
//   - Lloyd's algorithm with empty-cluster reseeding and multiple restarts (n_init)
//   - sweep over a range of k, recording inertia (WCSS) + mean silhouette for
//     elbow / silhouette model selection
//   - silhouette scores from a single precomputed pairwise distance matrix
//   - a compact 2-component PCA projection of the samples (and cluster centroids)
//     purely for 2D visualization
window._kmeansWorkerSrc = `
'use strict';

/* Deterministic RNG (mulberry32) so a fixed seed reproduces the same clustering. */
function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
        s |= 0; s = (s + 0x6D2B79F5) | 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Squared Euclidean distance between rows a and b (arrays of equal length). */
function dist2(a, b) {
    var s = 0;
    for (var j = 0; j < a.length; j++) {
        var d = a[j] - b[j];
        s += d * d;
    }
    return s;
}

/* k-means++ seeding: spread initial centers proportional to squared distance. */
function initPlusPlus(X, k, rng) {
    var n = X.length;
    var centers = [];
    var first = Math.floor(rng() * n);
    centers.push(X[first].slice());
    var d2 = new Float64Array(n);
    for (var i = 0; i < n; i++) d2[i] = dist2(X[i], centers[0]);
    for (var c = 1; c < k; c++) {
        var sum = 0;
        for (var q = 0; q < n; q++) sum += d2[q];
        var target = rng() * sum;
        var acc = 0, chosen = n - 1;
        for (var p = 0; p < n; p++) {
            acc += d2[p];
            if (acc >= target) { chosen = p; break; }
        }
        centers.push(X[chosen].slice());
        for (var r = 0; r < n; r++) {
            var nd = dist2(X[r], centers[c]);
            if (nd < d2[r]) d2[r] = nd;
        }
    }
    return centers;
}

/* Random distinct-point seeding. */
function initRandom(X, k, rng) {
    var n = X.length;
    var idx = [];
    for (var i = 0; i < n; i++) idx.push(i);
    for (var a = n - 1; a > 0; a--) {
        var b = Math.floor(rng() * (a + 1));
        var t = idx[a]; idx[a] = idx[b]; idx[b] = t;
    }
    var centers = [];
    for (var c = 0; c < k; c++) centers.push(X[idx[c]].slice());
    return centers;
}

/* One Lloyd's run from given initial centers. Returns {labels, centers, inertia, iterations}. */
function lloyd(X, k, centers, maxIter) {
    var n = X.length, m = X[0].length;
    var labels = new Int32Array(n);
    var iter = 0;
    for (iter = 0; iter < maxIter; iter++) {
        var changed = false;
        // Assignment step
        for (var i = 0; i < n; i++) {
            var best = 0, bestD = Infinity;
            for (var c = 0; c < k; c++) {
                var d = dist2(X[i], centers[c]);
                if (d < bestD) { bestD = d; best = c; }
            }
            if (labels[i] !== best) { labels[i] = best; changed = true; }
        }
        // Update step
        var sums = [];
        var counts = new Int32Array(k);
        for (var s = 0; s < k; s++) sums.push(new Float64Array(m));
        for (var p = 0; p < n; p++) {
            var lab = labels[p];
            counts[lab]++;
            var row = X[p], sr = sums[lab];
            for (var j = 0; j < m; j++) sr[j] += row[j];
        }
        for (var cc = 0; cc < k; cc++) {
            if (counts[cc] > 0) {
                var inv = 1 / counts[cc];
                var cen = centers[cc];
                var su = sums[cc];
                for (var jj = 0; jj < m; jj++) cen[jj] = su[jj] * inv;
            } else {
                // Empty cluster: reseed to the point farthest from its assigned center.
                var far = 0, farD = -1;
                for (var q = 0; q < n; q++) {
                    var dd = dist2(X[q], centers[labels[q]]);
                    if (dd > farD) { farD = dd; far = q; }
                }
                centers[cc] = X[far].slice();
                labels[far] = cc;
                changed = true;
            }
        }
        if (!changed && iter > 0) { iter++; break; }
    }
    // Final inertia (WCSS): sum of squared distances to assigned center.
    var inertia = 0;
    for (var z = 0; z < n; z++) inertia += dist2(X[z], centers[labels[z]]);
    return { labels: labels, centers: centers, inertia: inertia, iterations: iter };
}

/* Best of nInit restarts (lowest inertia). */
function runKMeans(X, k, nInit, maxIter, initMethod, rng) {
    var best = null;
    for (var t = 0; t < nInit; t++) {
        var centers = initMethod === 'random' ? initRandom(X, k, rng) : initPlusPlus(X, k, rng);
        var res = lloyd(X, k, centers, maxIter);
        if (!best || res.inertia < best.inertia) best = res;
    }
    return best;
}

/* Full pairwise Euclidean distance matrix (n x n), reused for all silhouette calcs. */
function pairwiseDistances(X) {
    var n = X.length;
    var D = [];
    for (var i = 0; i < n; i++) D.push(new Float64Array(n));
    for (var a = 0; a < n; a++) {
        for (var b = a + 1; b < n; b++) {
            var d = Math.sqrt(dist2(X[a], X[b]));
            D[a][b] = d; D[b][a] = d;
        }
    }
    return D;
}

/* Mean + per-sample silhouette given a precomputed distance matrix D and labels. */
function silhouette(D, labels, k) {
    var n = labels.length;
    var counts = new Int32Array(k);
    for (var i = 0; i < n; i++) counts[labels[i]]++;
    var sil = new Float64Array(n);
    var sum = 0;
    for (var p = 0; p < n; p++) {
        var own = labels[p];
        if (counts[own] <= 1) { sil[p] = 0; continue; }
        var sums = new Float64Array(k);
        var row = D[p];
        for (var q = 0; q < n; q++) sums[labels[q]] += row[q];
        var a = sums[own] / (counts[own] - 1);
        var b = Infinity;
        for (var c = 0; c < k; c++) {
            if (c === own || counts[c] === 0) continue;
            var mean = sums[c] / counts[c];
            if (mean < b) b = mean;
        }
        var s = (b === Infinity) ? 0 : (b - a) / Math.max(a, b);
        sil[p] = s;
        sum += s;
    }
    return { mean: sum / n, perSample: Array.from(sil) };
}

/* Compact 2-component PCA (power iteration + deflation) for visualization. */
function pca2(X) {
    var n = X.length, m = X[0].length;
    var mean = new Float64Array(m);
    for (var i = 0; i < n; i++) {
        var row = X[i];
        for (var j = 0; j < m; j++) mean[j] += row[j];
    }
    for (var j2 = 0; j2 < m; j2++) mean[j2] /= n;
    var C = [];
    var totalVar = 0;
    for (var a = 0; a < n; a++) {
        var cr = new Float64Array(m);
        var src = X[a];
        for (var b = 0; b < m; b++) { var v = src[b] - mean[b]; cr[b] = v; }
        C.push(cr);
    }
    for (var jv = 0; jv < m; jv++) {
        var sv = 0;
        for (var iv = 0; iv < n; iv++) sv += C[iv][jv] * C[iv][jv];
        totalVar += sv / (n - 1 || 1);
    }
    var comps = [];
    var eigs = [];
    var denom = (n - 1) || 1;
    for (var comp = 0; comp < 2; comp++) {
        var vec = new Float64Array(m);
        vec[comp % m] = 1;
        for (var it = 0; it < 60; it++) {
            var xv = new Float64Array(n);
            for (var k1 = 0; k1 < n; k1++) {
                var xx = 0, cc = C[k1];
                for (var j3 = 0; j3 < m; j3++) xx += cc[j3] * vec[j3];
                xv[k1] = xx;
            }
            var nv = new Float64Array(m);
            for (var j4 = 0; j4 < m; j4++) {
                var s2 = 0;
                for (var k2 = 0; k2 < n; k2++) s2 += C[k2][j4] * xv[k2];
                nv[j4] = s2 / denom;
            }
            for (var prev = 0; prev < comp; prev++) {
                var dot = 0;
                for (var jp = 0; jp < m; jp++) dot += nv[jp] * comps[prev][jp];
                for (var jp2 = 0; jp2 < m; jp2++) nv[jp2] -= dot * comps[prev][jp2];
            }
            var norm = 0;
            for (var jn = 0; jn < m; jn++) norm += nv[jn] * nv[jn];
            norm = Math.sqrt(norm);
            if (norm < 1e-12) break;
            for (var jd = 0; jd < m; jd++) vec[jd] = nv[jd] / norm;
        }
        var eig = 0;
        for (var ke = 0; ke < n; ke++) {
            var proj = 0, ce = C[ke];
            for (var je = 0; je < m; je++) proj += ce[je] * vec[je];
            eig += proj * proj;
        }
        eig /= denom;
        eigs.push(eig);
        comps.push(Array.from(vec));
    }
    // Project samples onto the 2 components.
    function project(rowVals) {
        var out = [0, 0];
        for (var c = 0; c < 2; c++) {
            var comp = comps[c], acc = 0;
            for (var j = 0; j < m; j++) acc += (rowVals[j] - mean[j]) * comp[j];
            out[c] = acc;
        }
        return out;
    }
    var coords = [];
    for (var s = 0; s < n; s++) coords.push(project(X[s]));
    return {
        coords: coords,
        project: project,
        explained: [totalVar > 0 ? eigs[0] / totalVar : 0, totalVar > 0 ? eigs[1] / totalVar : 0]
    };
}

/* Kneedle-style elbow: point of maximum distance to the line joining the
   first and last (k, inertia) points on the normalized curve. */
function chooseElbow(ks, inertias) {
    var nP = ks.length;
    if (nP <= 2) return ks[0];
    var kMinV = ks[0], kMaxV = ks[nP - 1];
    var iMax = inertias[0], iMin = inertias[nP - 1];
    var kSpan = (kMaxV - kMinV) || 1;
    var iSpan = (iMax - iMin) || 1;
    var bestK = ks[0], bestDist = -1;
    for (var i = 0; i < nP; i++) {
        var x = (ks[i] - kMinV) / kSpan;
        var y = (inertias[i] - iMin) / iSpan;
        // Distance from point to the diagonal line y = 1 - x (normalized decreasing curve).
        var d = Math.abs(x + y - 1) / Math.SQRT2;
        if (d > bestDist) { bestDist = d; bestK = ks[i]; }
    }
    return bestK;
}

self.onmessage = function (e) {
    var msg = e.data || {};
    if (msg.type !== 'run') return;
    try {
        var X = msg.X;
        var o = msg.opts || {};
        var n = X.length;
        if (n < 3 || !X[0] || X[0].length < 1) {
            throw new Error('Need at least 3 samples with features to cluster.');
        }
        var maxIter = o.maxIter || 300;
        var nInit = Math.max(1, o.nInit || 10);
        var initMethod = o.initMethod === 'random' ? 'random' : 'kmeanspp';
        var rng = makeRng(o.seed || 42);

        self.postMessage({ type: 'progress', progress: 8, message: 'Projecting samples (PCA)…' });
        var proj = pca2(X);

        var computeSil = !!o.computeSilhouette;
        var D = null;
        if (computeSil) {
            self.postMessage({ type: 'progress', progress: 16, message: 'Computing distance matrix…' });
            D = pairwiseDistances(X);
        }

        var maxAllowed = n - 1;
        var kMin = Math.max(2, Math.min(o.kMin || 2, maxAllowed));
        var kMax = Math.max(kMin, Math.min(o.kMax || 10, maxAllowed));
        var sweep = [];
        var sweepNInit = Math.max(1, Math.min(nInit, 5));
        var span = (kMax - kMin + 1);
        for (var k = kMin; k <= kMax; k++) {
            var pr = 20 + Math.floor(((k - kMin) / span) * 55);
            self.postMessage({ type: 'progress', progress: pr, message: 'Evaluating k=' + k + '…' });
            var res = runKMeans(X, k, sweepNInit, maxIter, initMethod, rng);
            var silMean = null;
            if (D) silMean = silhouette(D, res.labels, k).mean;
            sweep.push({ k: k, inertia: res.inertia, silhouetteMean: silMean });
        }

        // Decide final k.
        var finalK;
        var chosenBy;
        if (o.mode === 'fixed') {
            finalK = Math.max(2, Math.min(o.kFixed || 3, maxAllowed));
            chosenBy = 'fixed';
        } else if (o.selMetric === 'elbow' || !D) {
            finalK = chooseElbow(sweep.map(function (s) { return s.k; }), sweep.map(function (s) { return s.inertia; }));
            chosenBy = 'elbow';
        } else {
            var bestSil = -Infinity;
            finalK = sweep[0].k;
            for (var i = 0; i < sweep.length; i++) {
                if (sweep[i].silhouetteMean != null && sweep[i].silhouetteMean > bestSil) {
                    bestSil = sweep[i].silhouetteMean;
                    finalK = sweep[i].k;
                }
            }
            chosenBy = 'silhouette';
        }

        self.postMessage({ type: 'progress', progress: 82, message: 'Final clustering (k=' + finalK + ')…' });
        var finalRes = runKMeans(X, finalK, nInit, maxIter, initMethod, rng);
        var labels = Array.from(finalRes.labels);
        var silFinal = D ? silhouette(D, finalRes.labels, finalK) : { mean: null, perSample: null };

        // Project centroids into the same 2D PCA space.
        var centers2d = finalRes.centers.map(function (c) { return proj.project(c); });
        var sizes = new Array(finalK).fill(0);
        for (var li = 0; li < labels.length; li++) sizes[labels[li]]++;

        self.postMessage({ type: 'progress', progress: 96, message: 'Finalizing…' });
        self.postMessage({
            type: 'result',
            success: true,
            result: {
                k: finalK,
                chosenBy: chosenBy,
                labels: labels,
                inertia: finalRes.inertia,
                iterations: finalRes.iterations,
                silhouetteMean: silFinal.mean,
                silhouette: silFinal.perSample,
                sizes: sizes,
                sweep: sweep,
                coords2d: proj.coords,
                centers2d: centers2d,
                explained2d: proj.explained,
                silhouetteComputed: !!D
            }
        });
    } catch (err) {
        self.postMessage({ type: 'result', success: false, error: (err && err.message) ? err.message : String(err) });
    }
};
`;
