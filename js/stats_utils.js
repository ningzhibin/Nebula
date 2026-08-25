/**
 * NebulaStats - shared numeric utilities.
 *
 * The distribution kernels (logGamma, incomplete beta, Student t / F tails and
 * inverse t) were extracted verbatim from the inline script in index.html
 * (diffLogGamma, diffBetacf, diffRegularizedIncompleteBeta, diffStudentTTwoTailP,
 * diffTInvTwoTail, diffFUpperTailP). The inline functions remain as one-line
 * aliases so all existing call sites are unchanged.
 *
 * digamma / trigamma / tetragamma / trigammaInverse are new; they implement the
 * pieces limma's fitFDist() needs for the moderated-t (eBayes) statistic.
 * trigammaInverse follows limma::trigammaInverse exactly (Newton on trigamma
 * with the tetragamma derivative, y0 = 0.5 + 1/x, eps = 1e-8, max 50 iters).
 *
 * Dual-mode: browser global window.NebulaStats + CommonJS exports for vitest.
 */
(function (global) {
    'use strict';

    // ------------------------------------------------------------------
    // Extracted from index.html (verbatim, renamed diff* -> plain names)
    // ------------------------------------------------------------------

    function logGamma(z) {
        const g = 7;
        const p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
        if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
        let zz = z - 1;
        let x = p[0];
        for (let i = 1; i < p.length; i++) x += p[i] / (zz + i);
        const t = zz + g + 0.5;
        return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
    }

    function betacf(a, b, x) {
        const MAXIT = 200;
        const EPS = 3e-14;
        const FPMIN = 1e-300;
        let qab = a + b;
        let qap = a + 1;
        let qam = a - 1;
        let c = 1;
        let d = 1 - qab * x / qap;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        d = 1 / d;
        let h = d;
        for (let m = 1; m <= MAXIT; m++) {
            const m2 = 2 * m;
            let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < FPMIN) d = FPMIN;
            c = 1 + aa / c;
            if (Math.abs(c) < FPMIN) c = FPMIN;
            d = 1 / d;
            h *= d * c;
            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
            d = 1 + aa * d;
            if (Math.abs(d) < FPMIN) d = FPMIN;
            c = 1 + aa / c;
            if (Math.abs(c) < FPMIN) c = FPMIN;
            d = 1 / d;
            const del = d * c;
            h *= del;
            if (Math.abs(del - 1) < EPS) break;
        }
        return h;
    }

    function regularizedIncompleteBeta(a, b, x) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
        if (x > (a + 1) / (a + b + 2)) return 1 - regularizedIncompleteBeta(b, a, 1 - x);
        return bt * betacf(a, b, x) / a;
    }

    /** Standard normal CDF Phi(x) (Abramowitz-Stegun 7.1.26 erf approximation). */
    function normalCdf(x) {
        if (!Number.isFinite(x)) return x > 0 ? 1 : (x < 0 ? 0 : 0.5);
        const sign = x < 0 ? -1 : 1;
        const ax = Math.abs(x) / Math.SQRT2;
        const p = 0.3275911;
        const t = 1 / (1 + p * ax);
        const er = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-ax * ax);
        return 0.5 * (1 + sign * er);
    }

    /** Standard normal quantile Phi^-1(p) via binary search on normalCdf. */
    function normalQuantile(p) {
        if (!Number.isFinite(p) || p <= 0 || p >= 1) return NaN;
        if (p === 0.5) return 0;
        let lo = -1;
        let hi = 1;
        if (p > 0.5) {
            while (normalCdf(hi) < p) hi *= 2;
            lo = -hi;
        } else {
            while (normalCdf(lo) > p) lo *= 2;
            hi = -lo;
        }
        for (let iter = 0; iter < 90; iter++) {
            const mid = (lo + hi) / 2;
            if (normalCdf(mid) < p) lo = mid;
            else hi = mid;
        }
        return (lo + hi) / 2;
    }

    /** Two-sided p-value for Student t with df degrees of freedom (|t|). */
    function studentTTwoTailP(t, df) {
        if (!Number.isFinite(t)) return NaN;
        if (df === Infinity) {
            // Student t -> standard normal as df -> Inf (limma's df.total = Inf case)
            return 2 * (1 - normalCdf(Math.abs(t)));
        }
        if (!Number.isFinite(df) || df <= 0) return NaN;
        const tt = Math.abs(t);
        const x = df / (df + tt * tt);
        return regularizedIncompleteBeta(df / 2, 0.5, x);
    }

    /** Two-sided critical |t| such that P(|T| > t) = targetP (binary search). */
    function tInvTwoTail(targetP, df) {
        if (!Number.isFinite(targetP) || targetP <= 0 || targetP >= 1) return NaN;
        if (df === Infinity) return normalQuantile(1 - targetP / 2);
        if (!Number.isFinite(df) || df <= 0) return NaN;
        let hi = 1;
        while (hi < 1e8) {
            const p = studentTTwoTailP(hi, df);
            if (!Number.isFinite(p) || p <= targetP) break;
            hi *= 2;
        }
        let lo = 0;
        for (let iter = 0; iter < 80; iter++) {
            const mid = (lo + hi) / 2;
            const p = studentTTwoTailP(mid, df);
            if (!Number.isFinite(p)) break;
            if (p > targetP) lo = mid;
            else hi = mid;
        }
        return (lo + hi) / 2;
    }

    /** Upper-tail p-value for F ~ F(d1, d2) at observed f. */
    function fUpperTailP(f, d1, d2) {
        if (!Number.isFinite(f) || f < 0 || !Number.isFinite(d1) || !Number.isFinite(d2) || d1 <= 0 || d2 <= 0) return NaN;
        if (f === 0) return 1;
        const z = (d1 * f) / (d1 * f + d2);
        const cdf = regularizedIncompleteBeta(d1 / 2, d2 / 2, z);
        return Math.max(0, Math.min(1, 1 - cdf));
    }

    // ------------------------------------------------------------------
    // New: polygamma functions (asymptotic series + recurrence, x > 0)
    // ------------------------------------------------------------------

    /** psi(x) = d/dx log Gamma(x). Accurate to ~1e-14 relative for x > 0. */
    function digamma(x) {
        if (!Number.isFinite(x) || x <= 0) return NaN;
        let r = 0;
        while (x < 8) { r -= 1 / x; x += 1; }
        const inv = 1 / x;
        const inv2 = inv * inv;
        r += Math.log(x) - 0.5 * inv
            - inv2 * (1 / 12
            - inv2 * (1 / 120
            - inv2 * (1 / 252
            - inv2 * (1 / 240
            - inv2 * (1 / 132
            - inv2 * (691 / 32760
            - inv2 * (1 / 12)))))));
        return r;
    }

    /** psi'(x) = d^2/dx^2 log Gamma(x). Accurate to ~1e-13 relative for x > 0. */
    function trigamma(x) {
        if (!Number.isFinite(x) || x <= 0) return NaN;
        let r = 0;
        while (x < 8) { r += 1 / (x * x); x += 1; }
        const inv = 1 / x;
        const inv2 = inv * inv;
        r += inv + 0.5 * inv2 + inv * inv2 * (1 / 6
            - inv2 * (1 / 30
            - inv2 * (1 / 42
            - inv2 * (1 / 30
            - inv2 * (5 / 66
            - inv2 * (691 / 2730
            - inv2 * (7 / 6)))))));
        return r;
    }

    /** psi''(x) (tetragamma). Used by trigammaInverse's Newton step. */
    function tetragamma(x) {
        if (!Number.isFinite(x) || x <= 0) return NaN;
        let r = 0;
        while (x < 8) { r -= 2 / (x * x * x); x += 1; }
        const inv = 1 / x;
        const inv2 = inv * inv;
        r += -inv2 - inv * inv2 - 0.5 * inv2 * inv2
            + inv2 * inv2 * inv2 * (1 / 6
            - inv2 * (1 / 6
            - inv2 * (3 / 10
            - inv2 * (5 / 6
            - inv2 * (8983 / 2730
            - inv2 * (35 / 2))))));
        return r;
    }

    /**
     * Solve trigamma(y) = x for y (x >= 0). Mirrors limma::trigammaInverse:
     * Newton iteration y0 = 0.5 + 1/x, update dif = tri*(1 - tri/x)/tetragamma(y),
     * stop when |dif/y| < 1e-8 or after 50 iterations.
     */
    function trigammaInverse(x) {
        if (!Number.isFinite(x) || x < 0) return NaN;
        if (x === 0) return Infinity;
        const iterMax = 50;
        const eps = 1e-8;
        let y = 0.5 + 1 / x;
        for (let iter = 0; iter < iterMax; iter++) {
            const tri = trigamma(y);
            const dif = tri * (1 - tri / x) / tetragamma(y);
            y = y + dif;
            if (Math.abs(dif / y) < eps) break;
        }
        return y;
    }

    var api = {
        logGamma: logGamma,
        betacf: betacf,
        regularizedIncompleteBeta: regularizedIncompleteBeta,
        studentTTwoTailP: studentTTwoTailP,
        tInvTwoTail: tInvTwoTail,
        fUpperTailP: fUpperTailP,
        digamma: digamma,
        trigamma: trigamma,
        tetragamma: tetragamma,
        trigammaInverse: trigammaInverse
    };
    global.NebulaStats = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
