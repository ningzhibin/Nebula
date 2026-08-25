/**
 * NebulaModeratedT - limma-style moderated t statistics (empirical Bayes variance
 * shrinkage, Smyth 2004) and Storey q-values, for small-n proteomics comparisons.
 *
 * fitFDist / eBayesTwoGroup mirror limma (non-robust eBayes, no covariate):
 *   squeezeVar: s2.post = (d0*s0^2 + d_g*s2_g) / (d0 + d_g)
 *   t.mod     = meanDiff / (sqrt(s2.post) * stdev.unscaled),  stdev.unscaled = sqrt(1/n1+1/n2)
 *   df.total  = d_g + d0,  p = 2*pt(-|t.mod|, df.total)
 *
 * storeyQValues mirrors qvalue::qvalue with pi0.method="smoother"
 * (lambda grid 0..0.95 by 0.05, smooth.spline with df=3 evaluated at max lambda).
 * The smoothing spline is a Reinsch penalized natural cubic spline with the
 * penalty chosen so trace(S) = df, matching stats::smooth.spline.
 *
 * Dual-mode: window.NebulaModeratedT in the browser, module.exports for vitest.
 * Depends on NebulaStats (js/stats_utils.js, loaded first).
 */
(function (global) {
    'use strict';

    var S = global.NebulaStats
        || (typeof require !== 'undefined' ? require('./stats_utils.js') : null);
    if (!S) throw new Error('NebulaModeratedT requires NebulaStats (js/stats_utils.js)');

    // ------------------------------------------------------------------
    // Small dense-matrix helpers (used only for <= ~20 x 20 spline systems)
    // ------------------------------------------------------------------

    function zeros(r, c) {
        var m = new Array(r);
        for (var i = 0; i < r; i++) {
            m[i] = new Array(c);
            for (var j = 0; j < c; j++) m[i][j] = 0;
        }
        return m;
    }

    /** Gauss-Jordan inverse with partial pivoting. */
    function invert(A) {
        var n = A.length;
        var M = zeros(n, 2 * n);
        var i, j, k;
        for (i = 0; i < n; i++) {
            for (j = 0; j < n; j++) M[i][j] = A[i][j];
            for (j = 0; j < n; j++) M[i][n + j] = i === j ? 1 : 0;
        }
        for (k = 0; k < n; k++) {
            var piv = k;
            for (i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[piv][k])) piv = i;
            if (piv !== k) { var tmp = M[piv]; M[piv] = M[k]; M[k] = tmp; }
            var d = M[k][k];
            if (Math.abs(d) < 1e-300) throw new Error('invert: singular matrix');
            for (j = 0; j < 2 * n; j++) M[k][j] /= d;
            for (i = 0; i < n; i++) {
                if (i === k) continue;
                var f = M[i][k];
                if (f === 0) continue;
                for (j = 0; j < 2 * n; j++) M[i][j] -= f * M[k][j];
            }
        }
        return M.map(function (row) { return row.slice(n); });
    }

    function matVec(A, v) {
        return A.map(function (row) {
            var s = 0;
            for (var j = 0; j < v.length; j++) s += row[j] * v[j];
            return s;
        });
    }

    // ------------------------------------------------------------------
    // Reinsch smoothing spline with fixed effective degrees of freedom
    // (equivalent to stats::smooth.spline(x, y, df = df) at the knots)
    // ------------------------------------------------------------------

    /**
     * Fit a penalized natural cubic spline through (x, y) with trace(S) = df.
     * x must be strictly increasing. Returns { fitted: [...], gamma2: [...] }
     * where gamma2 are second derivatives at the knots (natural: 0 at ends).
     */
    function smoothSplineFit(x, y, df) {
        var n = x.length;
        if (n < 3) throw new Error('smoothSplineFit needs >= 3 knots');
        var h = new Array(n - 1);
        var i, j;
        for (i = 0; i < n - 1; i++) h[i] = x[i + 1] - x[i];

        var n2 = n - 2;
        var R = zeros(n2, n2);
        for (i = 0; i < n2; i++) {
            R[i][i] = (h[i] + h[i + 1]) / 3;
            if (i + 1 < n2) {
                R[i][i + 1] = h[i + 1] / 6;
                R[i + 1][i] = h[i + 1] / 6;
            }
        }
        var Rinv = invert(R);

        // Q: n x n2 second-difference matrix
        var Q = zeros(n, n2);
        for (j = 0; j < n2; j++) {
            Q[j][j] = 1 / h[j];
            Q[j + 1][j] = -(1 / h[j] + 1 / h[j + 1]);
            Q[j + 2][j] = 1 / h[j + 1];
        }

        // K = Q Rinv Q^T  (n x n)
        var QRinv = zeros(n, n2);
        for (i = 0; i < n; i++) {
            for (j = 0; j < n2; j++) {
                var s = 0;
                for (var k = 0; k < n2; k++) s += Q[i][k] * Rinv[k][j];
                QRinv[i][j] = s;
            }
        }
        var K = zeros(n, n);
        for (i = 0; i < n; i++) {
            for (j = 0; j < n; j++) {
                var s2 = 0;
                for (var k2 = 0; k2 < n2; k2++) s2 += QRinv[i][k2] * Q[j][k2];
                K[i][j] = s2;
            }
        }

        function solveFor(lambda) {
            var A = zeros(n, n);
            for (var a = 0; a < n; a++) {
                for (var b = 0; b < n; b++) A[a][b] = lambda * K[a][b];
                A[a][a] += 1;
            }
            var Ainv = invert(A);
            var tr = 0;
            for (var d = 0; d < n; d++) tr += Ainv[d][d];
            return { f: matVec(Ainv, y), edf: tr };
        }

        // edf decreases from n (lambda -> 0) towards 2 (lambda -> Inf)
        var lo = 1e-14;
        var hi = 1e14;
        var r = null;
        for (var it = 0; it < 300; it++) {
            var mid = Math.sqrt(lo * hi);
            r = solveFor(mid);
            if (Math.abs(r.edf - df) < 1e-10) break;
            if (r.edf > df) lo = mid; else hi = mid;
        }
        var f = r.f;

        // second derivatives at interior knots: gamma = Rinv Q^T f
        var Qtf = new Array(n2);
        for (j = 0; j < n2; j++) {
            var s3 = 0;
            for (i = 0; i < n; i++) s3 += Q[i][j] * f[i];
            Qtf[j] = s3;
        }
        var gammaInterior = matVec(Rinv, Qtf);
        var gamma2 = new Array(n);
        gamma2[0] = 0;
        gamma2[n - 1] = 0;
        for (j = 0; j < n2; j++) gamma2[j + 1] = gammaInterior[j];

        return { fitted: f, gamma2: gamma2, x: x };
    }

    /** Evaluate a fitted smoothSpline at xNew (clamped outside the knot range). */
    function smoothSplinePredict(fit, xNew) {
        var x = fit.x;
        var n = x.length;
        if (xNew <= x[0]) return fit.fitted[0];
        if (xNew >= x[n - 1]) return fit.fitted[n - 1];
        var i = 0;
        while (i < n - 2 && xNew > x[i + 1]) i++;
        var hi = x[i + 1] - x[i];
        var a = (x[i + 1] - xNew) / hi;
        var b = (xNew - x[i]) / hi;
        return a * fit.fitted[i] + b * fit.fitted[i + 1]
            + ((a * a * a - a) * fit.gamma2[i] + (b * b * b - b) * fit.gamma2[i + 1]) * hi * hi / 6;
    }

    // ------------------------------------------------------------------
    // limma: fitFDist + eBayes (two-group)
    // ------------------------------------------------------------------

    /**
     * limma::fitFDist (no covariate): moment fit of s2 ~ s0^2 * (d0/d) F(d, d0).
     * s2Arr: per-feature variances; dfArr: per-feature residual df.
     * Non-positive / non-finite entries are ignored (limma requires strictly
     * positive inputs; filtering is the safe superset for app data).
     * Returns { s0Squared, df0 } (df0 = Infinity when no shrinkage signal).
     */
    function fitFDist(s2Arr, dfArr) {
        var m = s2Arr.length;
        var e = [];
        var tgSum = 0;
        var i;
        for (i = 0; i < m; i++) {
            var s2 = s2Arr[i];
            var d = dfArr[i];
            if (!Number.isFinite(s2) || !(s2 > 0) || !Number.isFinite(d) || d <= 0) continue;
            e.push(Math.log(s2));
            tgSum += S.trigamma(d / 2);
        }
        var n = e.length;
        if (n < 3) return { s0Squared: NaN, df0: Infinity };
        var emean = 0;
        for (i = 0; i < n; i++) emean += e[i];
        emean /= n;
        var evar = 0;
        for (i = 0; i < n; i++) { var dd = e[i] - emean; evar += dd * dd; }
        evar /= (n - 1);
        evar -= tgSum / n;

        if (evar > 0) {
            var df0 = 2 * S.trigammaInverse(evar);
            var s0sq = Math.exp(emean + S.digamma(df0 / 2) - Math.log(df0 / 2));
            return { s0Squared: s0sq, df0: df0 };
        }
        return { s0Squared: Math.exp(emean), df0: Infinity };
    }

    /**
     * limma::eBayes moderated t for a two-group comparison.
     * meanDiffArr[i]: difference of group means on the tested scale (B - A).
     * s2Arr[i]: pooled per-feature variance; dfArr[i]: residual df (n1 + n2 - 2).
     * n1, n2: group sizes — scalars, or per-feature arrays when a feature has
     * missing values (so stdev.unscaled[i] = sqrt(1/n1_i + 1/n2_i), matching
     * limma's per-gene stdev.unscaled for genes with incomplete rows).
     * Returns { tMod, pMod, dfTotal, s2Post, s0Squared, df0, stdevUnscaled }.
     * stdevUnscaled is returned as an array of length m.
     */
    function eBayesTwoGroup(meanDiffArr, s2Arr, dfArr, n1, n2) {
        var fit = fitFDist(s2Arr, dfArr);
        var s0sq = fit.s0Squared;
        var d0 = fit.df0;
        var n1IsArr = Array.isArray(n1);
        var n2IsArr = Array.isArray(n2);
        var m = meanDiffArr.length;
        var tMod = new Array(m);
        var pMod = new Array(m);
        var dfTotal = new Array(m);
        var s2Post = new Array(m);
        var stdevUnscaled = new Array(m);
        for (var i = 0; i < m; i++) {
            var md = meanDiffArr[i];
            var s2 = s2Arr[i];
            var dg = dfArr[i];
            var n1i = n1IsArr ? n1[i] : n1;
            var n2i = n2IsArr ? n2[i] : n2;
            var su = (Number.isFinite(n1i) && Number.isFinite(n2i) && n1i > 0 && n2i > 0)
                ? Math.sqrt(1 / n1i + 1 / n2i)
                : NaN;
            stdevUnscaled[i] = su;
            if (!Number.isFinite(md) || !Number.isFinite(s2) || !Number.isFinite(dg) || dg <= 0 || !Number.isFinite(su)) {
                tMod[i] = NaN; pMod[i] = NaN; dfTotal[i] = NaN; s2Post[i] = NaN;
                continue;
            }
            var spost;
            if (!Number.isFinite(d0)) {
                spost = s0sq; // infinite prior df: full shrinkage to the prior
            } else {
                spost = (d0 * s0sq + dg * Math.max(s2, 0)) / (d0 + dg);
            }
            var se = Math.sqrt(spost) * su;
            var dft = dg + d0;
            var t, p;
            if (!(se > 0) || !Number.isFinite(se)) {
                // degenerate: no residual and no usable prior information
                t = md === 0 ? 0 : (md > 0 ? 1e12 : -1e12);
                p = md === 0 ? 1 : 0;
            } else {
                t = md / se;
                p = S.studentTTwoTailP(t, dft);
            }
            tMod[i] = t;
            pMod[i] = p;
            dfTotal[i] = dft;
            s2Post[i] = spost;
        }
        return {
            tMod: tMod, pMod: pMod, dfTotal: dfTotal, s2Post: s2Post,
            s0Squared: s0sq, df0: d0, stdevUnscaled: stdevUnscaled
        };
    }

    /** Two-sided (1 - alpha) CI for an effect estimate given its SE and df. */
    function effectSizeCI(estimate, se, dfTotal, alpha) {
        if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) alpha = 0.05;
        var crit = S.tInvTwoTail(alpha, dfTotal);
        return { lower: estimate - crit * se, upper: estimate + crit * se };
    }

    // ------------------------------------------------------------------
    // Storey q-values (qvalue package, smoother pi0)
    // ------------------------------------------------------------------

    var STOREY_LAMBDA = (function () {
        var l = [];
        for (var v = 0; v <= 0.9500001; v += 0.05) l.push(Number(v.toFixed(2)));
        return l;
    })();

    /**
     * qvalue::qvalue with pi0.method = "smoother" (smooth.spline df = 3 at max lambda).
     * Non-finite p-values are excluded and returned as NaN q-values.
     * Returns { qvalues, pi0, pi0Lambda, lambda }.
     */
    function storeyQValues(pArr) {
        var idx = [];
        var i;
        for (i = 0; i < pArr.length; i++) if (Number.isFinite(pArr[i])) idx.push(i);
        var m = idx.length;
        var qvalues = new Array(pArr.length);
        for (i = 0; i < pArr.length; i++) qvalues[i] = NaN;
        if (m === 0) return { qvalues: qvalues, pi0: NaN, pi0Lambda: [], lambda: STOREY_LAMBDA };

        var lambda = STOREY_LAMBDA;
        var pi0Lambda = new Array(lambda.length);
        for (var l = 0; l < lambda.length; l++) {
            var cnt = 0;
            for (i = 0; i < m; i++) if (pArr[idx[i]] >= lambda[l]) cnt++;
            pi0Lambda[l] = cnt / m / (1 - lambda[l]);
        }

        var pi0;
        if (m >= 20) {
            var fit = smoothSplineFit(lambda, pi0Lambda, 3);
            pi0 = smoothSplinePredict(fit, lambda[lambda.length - 1]);
        } else {
            // too few tests for a stable spline: conservative minimum estimate
            pi0 = Math.min.apply(null, pi0Lambda);
        }
        if (!Number.isFinite(pi0)) pi0 = 1;
        pi0 = Math.max(0, Math.min(1, pi0));

        // ascending ranks (stable sort keeps ties deterministic)
        var order = idx.slice().sort(function (a, b) { return pArr[a] - pArr[b]; });
        for (var k = 0; k < m; k++) {
            qvalues[order[k]] = pi0 * m * pArr[order[k]] / (k + 1);
        }
        var prev = 1;
        for (var k2 = m - 1; k2 >= 0; k2--) {
            prev = Math.min(prev, qvalues[order[k2]]);
            qvalues[order[k2]] = prev;
        }
        return { qvalues: qvalues, pi0: pi0, pi0Lambda: pi0Lambda, lambda: lambda };
    }

    var api = {
        fitFDist: fitFDist,
        eBayesTwoGroup: eBayesTwoGroup,
        effectSizeCI: effectSizeCI,
        storeyQValues: storeyQValues,
        smoothSplineFit: smoothSplineFit,
        smoothSplinePredict: smoothSplinePredict
    };
    global.NebulaModeratedT = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
