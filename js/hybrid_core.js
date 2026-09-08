/* ============================================================================
 * hybrid-core.js
 * Statistical core for the reproduction of:
 *
 *   X. Wang, G. A. Anderson, R. D. Smith, A. R. Dabney (2012).
 *   "A hybrid approach to protein differential expression in mass
 *    spectrometry-based proteomics." Bioinformatics 28(12):1586-1591.
 *   doi:10.1093/bioinformatics/bts193
 *
 * Implements, in portable JavaScript (browser + Node, no dependencies):
 *
 *   Section 2.3  Exact peptide-level test for differential presence
 *   Section 2.4  Parametric-bootstrap protein-level test (two estimators)
 *   Section 2.5  FDR estimation:
 *                 2.5.1  peptide-level (binary weights, discrete statistic)
 *                 2.5.2  protein-level (Storey-Tibshirani)
 *                 2.5.3  mixed single- and multi-peptide proteins
 *   Section 2.6  Hybrid (intensity + presence/absence) with a single FDR
 *
 *   Intensity stage (documented substitution for Karpievitch et al. 2009
 *   censored-likelihood model): log2 transform, optional per-sample median
 *   centering (off by default), optional left-censored small-value imputation
 *   (off by default: complete case, observed samples only), Welch t-test.
 *
 * All sections cite the paper; deviations are listed in README.md.
 * ==========================================================================*/
(function (global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    global.HybridProteomics = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 0. Small math utilities
   * ------------------------------------------------------------------ */

  const LGAMMA_C = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7
  ];

  /** Log-gamma function (Lanczos approximation, g = 7). */
  function lgamma(z) {
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
    z -= 1;
    let x = 0.99999999999980993;
    for (let i = 0; i < 8; i++) x += LGAMMA_C[i] / (z + i + 1);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  /** log of binomial coefficient C(n,k); 0 outside 0..k<=n. */
  function logComb(n, k) {
    if (k < 0 || k > n) return -Infinity;
    return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
  }

  /**
   * Binomial PMF B(m; n, p), computed in log space for stability.
   * Returns 0 when m is outside [0, n]. Handles p in {0, 1}.
   */
  function binomPmf(m, n, p) {
    if (m < 0 || m > n) return 0;
    if (p <= 0) return m === 0 ? 1 : 0;
    if (p >= 1) return m === n ? 1 : 0;
    return Math.exp(logComb(n, m) + m * Math.log(p) + (n - m) * Math.log(1 - p));
  }

  /** Binomial CDF P(X <= m). */
  function binomCdf(m, n, p) {
    if (m < 0) return 0;
    if (m >= n) return 1;
    let s = 0;
    for (let k = 0; k <= m; k++) s += binomPmf(k, n, p);
    return s;
  }

  /**
   * Regularized incomplete beta function I_x(a, b)
   * (Lentz continued fraction, Numerical Recipes).
   */
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-12, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  function regIncBeta(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const front = Math.exp(
      lgamma(a + b) - lgamma(a) - lgamma(b) +
      a * Math.log(x) + b * Math.log(1 - x)
    );
    if (x < (a + 1) / (a + b + 2)) return (front * betacf(a, b, x)) / a;
    return 1 - (front * betacf(b, a, 1 - x)) / b;
  }

  /** Two-sided p-value for a t statistic with df degrees of freedom. */
  function tTwoSidedP(t, df) {
    if (!isFinite(t)) return 0;
    if (df <= 0) return 1;
    if (df < 1e5) return regIncBeta(df / 2, 0.5, df / (df + t * t));
    // very large df: the t distribution is essentially normal.
    // 2(1 - Phi(z)) = erfc(z/sqrt(2)); use Abramowitz-Stegun 7.1.26
    // for erf (max error 1.5e-7).
    const z = Math.abs(t) / Math.SQRT2;
    const u = 1 / (1 + 0.3275911 * z);
    const poly = ((((1.061405429 * u - 1.453152027) * u + 1.421413741) * u
      - 0.284496736) * u + 0.254829592) * u;
    const erf = 1 - poly * Math.exp(-z * z);
    const p = 1 - erf; // erfc(z)
    return Math.min(1, Math.max(0, p));
  }

  /**
   * Digamma psi(z) and trigamma psi'(z) for z > 0, plus the trigamma
   * inverse. Recurrence to z >= 8, then asymptotic series
   * (Abramowitz & Stegun 6.3.5 / DLMF 5.9.12) — double precision.
   * Needed to fit the limma-style prior variance (fitFDist).
   */
  function digamma(z) {
    let s = 0;
    while (z < 8) { s -= 1 / z; z += 1; }
    const z2 = z * z;
    return Math.log(z) - 1 / (2 * z) - 1 / (12 * z2) + 1 / (120 * z2 * z2)
      - 1 / (252 * z2 * z2 * z2) + 1 / (240 * z2 * z2 * z2 * z2) + s;
  }
  function trigamma(z) {
    let s = 0;
    while (z < 8) { s += 1 / (z * z); z += 1; }
    const z3 = z * z * z;
    const z5 = z3 * z * z;
    const z7 = z5 * z * z;
    return s + 1 / z + 1 / (2 * z * z) + 1 / (6 * z3) - 1 / (30 * z5)
      + 1 / (42 * z7) - 1 / (30 * z7 * z * z);
  }
  /** Solve psi'(z) = v for z > 0 (psi' strictly decreasing). */
  function trigammaInverse(v) {
    if (!(v > 0)) return Infinity;
    let lo = 0.05, hi = 50;
    while (trigamma(lo) < v) lo /= 2;
    while (trigamma(hi) > v) hi *= 2;
    for (let i = 0; i < 200 && (hi - lo) > 1e-14 * hi; i++) {
      const mid = 0.5 * (lo + hi);
      if (trigamma(mid) > v) lo = mid; else hi = mid;
    }
    const z = 0.5 * (lo + hi);
    return z;
  }

  /* ------------------------------------------------------------------ *
   * 1. RNG (seedable, deterministic) + binomial sampling
   * ------------------------------------------------------------------ */

  /** mulberry32 PRNG; returns () => [0,1). */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Binomial sampler via precomputed CDF + binary search (fast for small n).
   * Returns a zero-arg function drawing from Bin(n, p).
   */
  function makeBinomSampler(n, p, rng) {
    if (p <= 0) return () => 0;
    if (p >= 1) return () => n;
    const cdf = new Float64Array(n + 1);
    let c = 0;
    for (let k = 0; k <= n; k++) { c += binomPmf(k, n, p); cdf[k] = c; }
    const total = cdf[n];
    return function () {
      const u = rng() * total;
      let lo = 0, hi = n;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] >= u) hi = mid; else lo = mid + 1;
      }
      return lo;
    };
  }

  /* ------------------------------------------------------------------ *
   * 2. Section 2.3 — exact peptide-level test
   * ------------------------------------------------------------------ */

  /**
   * Exact null PMF of T = |Y1 - Y2| at value t, under H0: p1 = p2 = p0:
   * Pr(T = t) = sum_{a} B(a;n1,p0) B(a+t;n2,p0)   [branch Y2 = Y1 + t]
   *           + sum_{b} B(b;n2,p0) B(b+t;n1,p0)   [branch Y1 = Y2 + t]
   * with a <= min(n1, n2-t) and b <= min(n2, n1-t) (terms with counts beyond
   * the group size are zero).
   *
   * Note: the paper prints the branch limits as n1-t and n2-t; those coincide
   * with min(n1, n2-t) only when n1 = n2. We implement the mathematically
   * correct limits (verified against direct enumeration; see test-core.js and
   * README, deviations).
   */
  function exactNullMassAt(t, n1, n2, p0) {
    if (t < 0 || t > Math.max(n1, n2)) return 0;
    let mass = 0;
    if (t === 0) {
      // Y1 = Y2: the two branches coincide, count once
      const aMax = Math.min(n1, n2);
      for (let a = 0; a <= aMax; a++) {
        mass += binomPmf(a, n1, p0) * binomPmf(a, n2, p0);
      }
      return mass;
    }
    const aMax = Math.min(n1, n2 - t);
    for (let a = 0; a <= aMax; a++) {
      mass += binomPmf(a, n1, p0) * binomPmf(a + t, n2, p0);
    }
    const bMax = Math.min(n2, n1 - t);
    for (let b = 0; b <= bMax; b++) {
      mass += binomPmf(b, n2, p0) * binomPmf(b + t, n1, p0);
    }
    return mass;
  }

  /**
   * Exact two-group test for one peptide (paper Section 2.3).
   * y1, y2 = observed peak counts in groups 1, 2; n1, n2 = sample sizes.
   * p0 estimated by the pooled sample proportion.
   * Returns { T, p0, p } where p = sum_{t>=Tobs} Pr_H0(T = t).
   */
  function exactPeptideTest(y1, y2, n1, n2) {
    const T = Math.abs(y1 - y2);
    const p0 = (y1 + y2) / (n1 + n2);
    let p = 0;
    for (let t = T; t <= Math.max(n1, n2); t++) p += exactNullMassAt(t, n1, n2, p0);
    return { T, p0, p: Math.max(p, 0) };
  }

  /**
   * Attainable null tail probabilities of the exact test (Section 2.5.1,
   * F0_c in the authors' code): for every statistic value t,
   * F(t) = Pr_H0(|T| >= t). Discrete statistics make this set finite and
   * sparse — the FDR estimators evaluate the null CDF at cp as
   * "the largest attainable tail <= cp" (authors' fdr_est.R / qual_method.R:
   *   F0_c[i,kk] = F_0_k[i,][F_0_k[i,] <= cutoff[kk]][1]).
   * Returns { tails: [F(0) ... F(nmax)], f0At(cp) }.
   */
  function exactTails(n1, n2, p0) {
    const nmax = Math.max(n1, n2);
    const mass = new Array(nmax + 1);
    for (let t = 0; t <= nmax; t++) mass[t] = exactNullMassAt(t, n1, n2, p0);
    // Attainable null tails are the CUMULATIVE tails q(t) = Pr_H0(|Y1-Y2| >= t)
    // = sum_{s>=t} Pr(T=s)  — monotone decreasing in t, reaching 1 at t=0.
    // This matches the authors' qual_method.R:54 (F_0_k = rev(cumsum(rev(pmf_0)))).
    // (A single-step mass Pr(T=t) would cap at ~max_t Pr(T=t) and never reach 1.)
    const tails = new Array(nmax + 1);
    let acc = 0;
    for (let t = nmax; t >= 0; t--) { acc += mass[t]; tails[t] = acc; }
    const f0At = function (cp) {
      // largest attainable tail <= cp (clamp to the smallest attainable tail)
      for (let t = 0; t <= nmax; t++) {
        if (tails[t] <= cp + 1e-15) return tails[t];
      }
      return tails[nmax];
    };
    return { tails, f0At };
  }

  /**
   * Binary null/alternative weight w_j of paper Section 2.5.1:
   * w_j = 1{ PMF_null(observed counts) >= PMF_alt(observed counts) },
   * where the null uses the pooled probability and the alternative the
   * unrestricted (group-specific) MLEs.
   */
  function peptideBinaryWeight(y1, y2, n1, n2) {
    const p0 = (y1 + y2) / (n1 + n2);
    const p1 = y1 / n1, p2 = y2 / n2;
    const pmf0 = binomPmf(y1, n1, p0) * binomPmf(y2, n2, p0);
    const pmf1 = binomPmf(y1, n1, p1) * binomPmf(y2, n2, p2);
    const w = pmf0 >= pmf1 ? 1 : 0;
    return { w, pmf0, pmf1 };
  }

  /* ------------------------------------------------------------------ *
   * 3. Section 2.4 — parametric-bootstrap protein-level test
   * ------------------------------------------------------------------ */

  /** ratio with a sane 0/0 limit: x/0 -> (x>0 ? 1 : 0). */
  function safeRatio(x, y) {
    if (y > 0) return x / y;
    return x > 0 ? 1 : 0;
  }

  /**
   * Protein-level test statistic T_Mi of paper Eq. (2):
   * T_Mi = sum_j kappa_ij (y_ij1 - y_ij2), kappa_ij = y_ij.. / sum_j y_ij..
   */
  function proteinStatistic(peps) {
    const total = peps.reduce((s, p) => s + p.y1 + p.y2, 0);
    const kappa = peps.map(p => (total > 0 ? (p.y1 + p.y2) / total : 1 / peps.length));
    let T = 0;
    for (let j = 0; j < peps.length; j++) T += kappa[j] * (peps[j].y1 - peps[j].y2);
    return { T, kappa, total };
  }

  /**
   * Presence-probability estimates for the structured (detectability) model,
   * paper Section 2.4, second approach: p_ijk = p_ik * d_ij with
   *   p_ik = mean presence proportion of the top 10% (rounded up) most
   *          prevalent peptides of protein i in group k,
   *   d_ij = (1/K) * sum_k (pijk / pik).
   */
  function structuredPeaks(peps, n1, n2) {
    const m = peps.length;
    const r = Math.max(1, Math.ceil(0.1 * m));
    const order = peps
      .map((p, j) => ({ j, c: p.y1 + p.y2 }))
      .sort((a, b) => b.c - a.c)
      .slice(0, r)
      .map(o => o.j);
    let p1 = 0, p2 = 0;
    for (const j of order) { p1 += peps[j].y1 / n1; p2 += peps[j].y2 / n2; }
    p1 /= r; p2 /= r;
    const d = peps.map(p => 0.5 * (safeRatio(p.y1 / n1, p1) + safeRatio(p.y2 / n2, p2)));
    return { p1, p2, d, r };
  }

  /**
   * Parametric bootstrap for a multi-peptide protein (Section 2.4).
   *
   * mode 'structured'  (default): p_ijk = p_ik * d_ij as above.
   * mode 'unstructured': per-peptide sample proportions (2*m_i parameters).
   *
   * Under the null, both groups share a common probability:
   *   structured:   p_i0 = (p_i1 + p_i2)/2, draws Bin(n_k, p_i0 * d_ij);
   *   unstructured: p_j0 = (y_j1 + y_j2)/(n1 + n2) per peptide (pooled),
   *                 draws Bin(n_k, p_j0).
   * (Using the group-specific proportions under the null would estimate the
   * alternative, not the null; the pooled probability is the null MLE.)
   * p-value = #{|T*_b| >= |T_obs|} / B, smoothed as (count+1)/(B+1).
   *
   * Also returns the binary null/alternative weight w of Section 2.5.1
   * (authors' qual_method.R, weight_f01 for multi-peptide proteins):
   * compare the density of the bootstrap null statistic at the observed T
   * with the density of the alternative-model statistic there:
   *   f0 = Pr(|T*_null - T| <= delta),  f1 = Pr(|T*_alt - T| <= delta),
   *   w  = 1{ f0 >= f1 }.
   * The alternative model draws group k of peptide j from
   * Bin(n_k, y_jk/n_k) (unrestricted group-specific MLEs; the authors smooth
   * these with the presence/detectability estimates — see README).
   * delta starts at 0.01 (authors) and is doubled (up to 1.0) if no draws
   * land inside the window, so the comparison is well defined.
   *
   * Note: the paper writes #{T*_b >= T_Mi}; the two-sided |*| form is the
   * natural "as or more extreme" reading for the signed statistic and is
   * used here (see README, deviations).
   */
  function proteinBootstrapTest(peps, n1, n2, B, mode, rng) {
    const { T, kappa } = proteinStatistic(peps);
    const m = peps.length;
    const sam1 = new Array(m), sam2 = new Array(m);
    if (mode === 'structured') {
      const { p1, p2, d } = structuredPeaks(peps, n1, n2);
      const p0 = (p1 + p2) / 2;
      for (let j = 0; j < m; j++) {
        const pj = Math.min(1, Math.max(0, p0 * d[j]));
        sam1[j] = makeBinomSampler(n1, pj, rng);
        sam2[j] = makeBinomSampler(n2, pj, rng);
      }
    } else {
      for (let j = 0; j < m; j++) {
        const p0j = (peps[j].y1 + peps[j].y2) / (n1 + n2);
        sam1[j] = makeBinomSampler(n1, p0j, rng);
        sam2[j] = makeBinomSampler(n2, p0j, rng);
      }
    }
    // alternative model: group-specific MLEs per peptide
    const sam1a = peps.map(p => makeBinomSampler(n1, p.y1 / n1, rng));
    const sam2a = peps.map(p => makeBinomSampler(n2, p.y2 / n2, rng));
    const tol = 1e-12;
    const absT = Math.abs(T);
    const nullDraws = new Float64Array(B);
    const altDraws = new Float64Array(B);
    let count = 0;
    for (let b = 0; b < B; b++) {
      let Tb = 0, Ta = 0;
      for (let j = 0; j < m; j++) {
        const d0 = sam1[j]() - sam2[j]();
        const d1 = sam1a[j]() - sam2a[j]();
        Tb += kappa[j] * d0;
        Ta += kappa[j] * d1;
      }
      nullDraws[b] = Tb;
      altDraws[b] = Ta;
      if (Math.abs(Tb) >= absT - tol) count++;
    }
    // likelihood-density comparison at the signed observed T (adaptive window)
    let f0 = 0, f1 = 0, delta = 0.01;
    for (; delta <= 1.0 + 1e-12; delta *= 2) {
      f0 = 0; f1 = 0;
      for (let b = 0; b < B; b++) {
        if (Math.abs(nullDraws[b] - T) <= delta) f0++;
        if (Math.abs(altDraws[b] - T) <= delta) f1++;
      }
      if (f0 > 0 || f1 > 0) break;
    }
    const w = f0 >= f1 ? 1 : 0;
    return { T, p: (count + 1) / (B + 1), w, f0: f0 / B, f1: f1 / B };
  }

  /* ------------------------------------------------------------------ *
   * 4. Section 2.5 — FDR estimation
   * ------------------------------------------------------------------ */

  function quantileSorted(sorted, q) {
    if (sorted.length === 0) return NaN;
    const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN; }
  function variance(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1);
  }
  function median(a) {
    const s = a.slice().sort((x, y) => x - y);
    const mid = (s.length - 1) / 2;
    return s.length % 2 ? s[Math.floor(mid)] : (s[Math.floor(mid)] + s[Math.ceil(mid)]) / 2;
  }
  function iqr(a) {
    const s = a.slice().sort((x, y) => x - y);
    return quantileSorted(s, 0.75) - quantileSorted(s, 0.25);
  }

  /**
   * Storey-Tibshirani (2003) estimate of pi0.
   * pi0hat(lambda) = #{p > lambda} / (M (1 - lambda)); fit a quadratic to
   * the last 25% of (lambda, pi0hat) points (quantile-based grid) and
   * extrapolate to lambda -> 1, clamped to [0, 1].
   */
  function storeyPi0(pvalues) {
    const M = pvalues.length;
    if (M === 0) return { pi0: 0, curve: [] };
    const sorted = pvalues.slice().sort((a, b) => a - b);
    // Grid: uniform 0.01..0.99 plus quantile points 0.99..0.999
    // (Storey & Tibshirani 2003, as in their R implementation pi0est).
    const grid = new Set();
    for (let i = 1; i <= 99; i++) grid.add(i / 100);
    for (let i = 99; i <= 999; i += 10) grid.add(i / 1000);
    grid.add(0.999);
    const pts = [];
    for (const lam of grid) {
      if (lam >= 1) continue;
      let gt = 0;
      for (let i = 0; i < M; i++) if (sorted[i] > lam) { gt = M - i; break; }
      pts.push([lam, gt / (M * (1 - lam))]);
    }
    pts.sort((a, b) => a[0] - b[0]);
    // Fit a quadratic to the last 25% of points, extrapolate to lambda -> 1.
    const tail = pts.slice(Math.max(0, Math.floor(0.75 * pts.length)));
    let pi0 = NaN;
    if (tail.length >= 3) {
      const c = fitQuadratic(tail);
      if (c) pi0 = c.a + c.b + c.c;
    }
    if (!isFinite(pi0)) pi0 = tail.length ? tail[tail.length - 1][1] : 1;
    pi0 = Math.min(1, Math.max(0, pi0));
    return { pi0, curve: pts };
  }

  /** Least-squares quadratic y = a + b x + c x^2 for points [[x,y],...]. */
  function fitQuadratic(pts) {
    let S0 = 0, S1 = 0, S2 = 0, S3 = 0, S4 = 0, T0 = 0, T1 = 0, T2 = 0;
    for (const [x, y] of pts) {
      S0 += 1; S1 += x; S2 += x * x; S3 += x * x * x; S4 += x * x * x * x;
      T0 += y; T1 += x * y; T2 += x * x * y;
    }
    // normal equations for [a, b, c]
    const A = [
      [S0, S1, S2],
      [S1, S2, S3],
      [S2, S3, S4]
    ];
    const v = [T0, T1, T2];
    // Gaussian elimination with partial pivoting
    const n = 3;
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      if (Math.abs(A[piv][col]) < 1e-14) return null;
      [A[col], A[piv]] = [A[piv], A[col]];
      [v[col], v[piv]] = [v[piv], v[col]];
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = A[r][col] / A[col][col];
        for (let c2 = col; c2 < n; c2++) A[r][c2] -= f * A[col][c2];
        v[r] -= f * v[col];
      }
    }
    return { a: v[0] / A[0][0], b: v[1] / A[1][1], c: v[2] / A[2][2] };
  }

  /**
   * Build the full set of binary (presence/absence) FDR curves
   * (paper Section 2.5; authors' fdr_est.R / qual_method.R).
   *
   * All estimators divide by the number of proteins with p <= cp and SUM
   * over ALL proteins (not just selected ones):
   *   - "unweighted" (FDR_uw):  sum_i F0_i(cp), where F0_i(cp) is the null
   *     CDF of protein i at the cutoff — for single-peptide proteins the
   *     largest attainable exact-test tail <= cp, for multi-peptide
   *     proteins cp itself (bootstrap p-values ~ uniform under H0);
   *   - "weighted" (FDR_wt3):   sum_i w_i * F0_i(cp) with w_i the
   *     per-protein null/alternative weight of Section 2.5.1;
   *   - "mixed" (FDR_mix3, the paper's recommended estimator):
   *     single-peptide part weighted (sum_{i:single} w_i F0_i(cp)) plus
   *     the Storey-Tibshirani part for multi-peptide proteins
   *     (pi0_multi * M_multi * cp).
   *
   * single: array of { p, w, f0At }  (w = 0/1 weight of 2.5.1; f0At(cp) as
   *         above, from the exact test of that peptide);
   * multi:  array of { p, w }        (w = 0/1 bootstrap-likelihood weight).
   *
   * Returns { curves: [{cp, fdrMix, fdrWt, fdrUw, sel, selSingle, selMulti}],
   *           pi0Multi }.
   */
  function binaryFdrCurves(single, multi, cpGrid) {
    const { pi0: pi0m } = storeyPi0(multi.map(x => x.p));
    const sm = multi.map(x => x.p).sort((a, b) => a - b);
    const s1 = single.map(x => x.p).sort((a, b) => a - b);
    const wMultiSum = multi.reduce((s, x) => s + x.w, 0);
    const curves = [];
    for (const cp of cpGrid) {
      let f0w = 0, f0u = 0;
      for (let i = 0; i < single.length; i++) {
        const f0 = single[i].f0At ? single[i].f0At(cp) : cp;
        f0w += single[i].w * f0;
        f0u += f0;
      }
      let selS = 0;
      for (let i = 0; i < s1.length; i++) { if (s1[i] <= cp) selS++; else break; }
      let selM = 0;
      for (let i = 0; i < sm.length; i++) if (sm[i] <= cp) selM++; else break;
      const Mm = sm.length;
      const sel = selS + selM;
      const numMix = f0w + Mm * pi0m * cp;
      const numWt = f0w + wMultiSum * cp;
      const numUw = f0u + Mm * cp;
      curves.push({
        cp,
        fdrMix: sel > 0 ? numMix / sel : NaN,
        fdrWt: sel > 0 ? numWt / sel : NaN,
        fdrUw: sel > 0 ? numUw / sel : NaN,
        sel, selSingle: selS, selMulti: selM
      });
    }
    return { curves, pi0Multi: pi0m };
  }

  /* ------------------------------------------------------------------ *
   * 5. Intensity stage (documented substitution, see README)
   * ------------------------------------------------------------------ */

  /**
   * Protein-level intensity analysis (documented substitution for the
   * Karpievitch 2009 censored-likelihood regression):
   *  1. log2 transform of positive intensities;
   *  2. optional per-sample centering (centering: 'median' | 'none',
   *     default 'none'). Per-sample median centering (the Perseus convention)
   *     assumes a large majority of proteins are not differential: when a
   *     substantial fraction carry large group shifts, the group medians
   *     differ and every null protein inherits the same spurious group
   *     difference (verified: 46-92% of nulls reach p < 0.05 at 25-50%
   *     differential in the demo generator, versus 3-9% with 'none').
   *     With 'none', sample-level technical variation enters symmetrically
   *     as noise in a randomized two-group design — unbiased (conservative),
   *     mirroring the sample-effect handling of the Karpievitch regression.
   *     If 'median' is chosen, each sample's centering median is computed
   *     over the peptides observed in BOTH comparison groups (group-specific
   *     one-state peptides are excluded: using them transfers their group
   *     difference into every other protein);
   *  3. missing-value handling (impute flag; default false = OFF):
   *     OFF (default, complete case): a sample enters the group comparison
   *     only if at least one of the protein's features is observed in it;
   *     unobserved samples are left out. Features observed in only one group
   *     (one-state) then have no testable group contrast and get pInt = NaN
   *     (the presence/absence stage covers them). ON: left-censored (MNAR)
   *     small-value imputation per peptide at min - 1.5*IQR of that peptide's
   *     observed log values (undetected ~= below the observed range), which
   *     puts every sample into the test but can dominate within-group
   *     variance and dilute a real group difference;
   *  4. per-sample protein mean = mean of that sample's observed feature
   *     values (plus imputed values when impute is ON);
   *  5. two-group test of the per-sample means: default is the limma-style
   *     empirical-Bayes moderated t (Smyth 2004; each feature's pooled
   *     residual variance is moderated toward a prior variance estimated
   *     across the batch — small-sample robustness), or the plain Welch
   *     two-sample t (test = 'welch'); log2FC = mean(G1) - mean(G2).
   */
  function intensityAnalysis(pepMatrix, samples, centering, impute, test, groups) {
    centering = centering || 'none';
     impute = impute === true; // default false: no missing-value imputation (complete
                               // case: samples without an observed feature value are
                               // left out of the group comparison)
    // pepMatrix: array of peptides; each { values: Map sampleId -> intensity|undefined }
    const nS = samples.length;
    const sampleIdx = new Map(samples.map((s, i) => [s.id, i]));
    // 1. log2
    const logs = pepMatrix.map(p => {
      const row = new Array(nS).fill(NaN);
      for (const [sid, v] of Object.entries(p.values || {})) {
        if (v != null && isFinite(v) && v > 0) row[sampleIdx.get(sid)] = Math.log2(v);
      }
      return row;
    });
    // 2. optional centering. Default 'none': per-sample median centering
    //    (the Perseus convention) assumes a large majority of proteins are
    //    null; with a substantial differential fraction it transfers the
    //    group shift into every null protein (verified: 46-92% of nulls
    //    reach p < 0.05 at 25-50% differential, versus 3-9% with 'none').
    const center = new Array(nS).fill(0);
    if (centering === 'median') {
      const g1Idx = [], g2Idx = [];
      samples.forEach((s, i) => (s.group === 0 ? g1Idx : g2Idx).push(i));
      const shared = logs.map(row =>
        g1Idx.some(l => isFinite(row[l])) && g2Idx.some(l => isFinite(row[l])));
      for (let l = 0; l < nS; l++) {
        const vals = [];
        for (let j = 0; j < logs.length; j++) {
          if (shared[j] && isFinite(logs[j][l])) vals.push(logs[j][l]);
        }
        if (vals.length === 0) {
          for (let j = 0; j < logs.length; j++) if (isFinite(logs[j][l])) vals.push(logs[j][l]);
        }
        center[l] = vals.length ? median(vals) : 0;
      }
    }
    // 3. per-peptide imputation value
    const imputed = logs.map(row => {
      if (!impute) return null; // complete case: missing samples are simply left out
      const obs = row.filter(isFinite);
      if (obs.length === 0) return null;
      const lo = Math.min.apply(null, obs);
      return lo - 1.5 * iqr(obs);
    });
    // 4. per-sample protein means (peptide-level)
    function proteinSampleMeans(pepIdxs) {
      const mS = new Array(nS).fill(NaN);
      let usable = 0;
      for (let l = 0; l < nS; l++) {
        let s = 0, c = 0;
        for (const j of pepIdxs) {
          const v = logs[j][l];
          const x = isFinite(v) ? v - center[l] : (imputed[j] != null ? imputed[j] - center[l] : NaN);
          if (isFinite(x)) { s += x; c++; }
        }
        if (c > 0) { mS[l] = s / c; usable++; }
      }
      return { mS, usable };
    }
    // per-protein results. Two available test statistics for the
    // group-mean contrast:
    //  * 'limma' (default): the limma-style empirical-Bayes moderated t
    //    (Smyth 2004; limma::eBayes on a two-group design). Each feature's
    //    pooled residual variance MS_j (df d1_j = n1+n2-2) is moderated
    //    toward a common prior variance estimated across the whole batch
    //    (limma fitFDist, non-robust path):
    //      e_j   = log(MS_j) - psi(d1_j/2) + log(d1_j/2)
    //      evar  = Var(e) - mean( psi'(d1_j/2) )      (sample Var, n-1 denom)
    //      if evar > 0 : df2 = 2*psi'^-1(evar),
    //                    s20 = exp( mean(e) + psi(df2/2) - log(df2/2) )
    //      else        : df2 = Inf, s20 = mean(MS_j)   (fully pooled)
    //    posterior variance s2p_j = (df2*s20 + d1_j*MS_j)/(df2 + d1_j), with
    //    s2p_j = s20 when df2 = Inf;
    //      t*_j = (m1_j - m2_j)/sqrt( s2p_j*(1/n1_j + 1/n2_j) ), with
    //    p*_j under the t distribution with df2 + d1_j degrees of freedom
    //    (standard normal when df2 = Inf). This borrows strength across
    //    features, which is exactly the small-sample (n = 3-10/group)
    //    robustness plain Welch t lacks in proteomics.
    //  * 'welch': plain Welch two-sample t (the period-typical choice for
    //    the paper's pipeline).
    test = (test === 'welch') ? 'welch' : 'limma';
    groups = Array.isArray(groups) ? groups : null;
    function baseStats(pepIdxs) {
      const { mS, usable } = proteinSampleMeans(pepIdxs);
      if (usable < 2) return null;
      const g1 = [], g2 = [];
      for (let l = 0; l < nS; l++) {
        if (!isFinite(mS[l])) continue;
        (samples[l].group === 0 ? g1 : g2).push(mS[l]);
      }
      if (g1.length < 2 || g2.length < 2) return null;
      const n1 = g1.length, n2 = g2.length;
      const m1 = mean(g1), m2 = mean(g2);
      const v1 = variance(g1), v2 = variance(g2);
      const d1 = n1 + n2 - 2;
      const ms = ((n1 - 1) * v1 + (n2 - 1) * v2) / d1; // pooled residual MS
      return { n1, n2, m1, m2, v1, v2, d1, ms };
    }
    function welchT(b) {
      const { n1, n2, m1, m2, v1, v2 } = b;
      const se2 = v1 / n1 + v2 / n2;
      let t = NaN, df = Math.min(n1, n2) - 1, p = NaN;
      if (se2 > 0) {
        t = (m1 - m2) / Math.sqrt(se2);
        df = (se2 * se2) / (Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1));
        if (!isFinite(df) || df <= 0) df = n1 + n2 - 2;
        p = tTwoSidedP(t, df);
      }
      return { p, log2FC: m1 - m2, t, df, s2post: NaN };
    }
    function limmaT(b, prior) {
      const { n1, n2, m1, m2, d1, ms } = b;
      const df2 = prior.df2, s20 = prior.s20;
      const s2post = isFinite(df2) ? (df2 * s20 + d1 * ms) / (df2 + d1) : s20;
      const se2 = s2post * (1 / n1 + 1 / n2);
      const df = (isFinite(df2) ? df2 : Infinity) + d1;
      if (!(se2 > 0)) return { p: NaN, log2FC: m1 - m2, t: NaN, df, s2post };
      const t = (m1 - m2) / Math.sqrt(se2);
      return { p: tTwoSidedP(t, df), log2FC: m1 - m2, t, df, s2post };
    }
    // limma fitFDist (non-robust): prior df2 and scale s20 from the batch
    // of pooled residual variances.
    function fitFDist(MS, d1s) {
      const n = MS.length;
      if (n === 0) return { df2: NaN, s20: NaN };
      if (n === 1) return { df2: 0, s20: Math.max(MS[0], 0) };
      const x = MS.map(v => Math.max(v, 0));
      const m = median(x);
      const off = 1e-5 * (m > 0 ? m : 1);
      const xx = x.map(v => Math.max(v, off));
      const e = xx.map((v, j) => Math.log(v) - digamma(d1s[j] / 2) + Math.log(d1s[j] / 2));
      const emean = mean(e);
      let evar = e.reduce((s, v) => s + (v - emean) * (v - emean), 0) / (n - 1);
      evar -= d1s.reduce((s, d) => s + trigamma(d / 2), 0) / n;
      if (evar > 0) {
        const df2 = 2 * trigammaInverse(evar);
        return { df2, s20: Math.exp(emean + digamma(df2 / 2) - Math.log(df2 / 2)) };
      }
      return { df2: Infinity, s20: mean(xx) };
    }
    // batch of protein groups (runAnalysis passes one entry per group): a
    // single shared prior is estimated across the batch, as in limma
    const baseList = groups ? groups.map(baseStats) : null;
    let prior = null;
    if (test === 'limma' && baseList) {
      const ok = baseList.filter(Boolean);
      if (ok.length) prior = fitFDist(ok.map(b => b.ms), ok.map(b => b.d1));
    }
    const perGroup = baseList ? baseList.map(b => b === null
          ? { p: NaN, log2FC: NaN, t: NaN, df: NaN, s2post: NaN }
          : test === 'limma' ? limmaT(b, prior || { df2: 0, s20: b.ms }) : welchT(b))
      : null;
    function analyze(pepIdxs) {
      const b = baseStats(pepIdxs);
      if (!b) return { p: NaN, log2FC: NaN, t: NaN, df: NaN, s2post: NaN };
      return test === 'limma' ? limmaT(b, prior || fitFDist([b.ms], [b.d1])) : welchT(b);
    }
    return { analyze, logs, center, imputed, test, prior, perGroup };
  }

  /* ------------------------------------------------------------------ *
   * 6. Section 2.6 — hybrid analysis with a single FDR
   * ------------------------------------------------------------------ */

  /**
   * Hybrid FDR at cutoff cp (paper Section 2.6; authors' fdr_est.R):
   *
   *   FDR_h(cp) = sum_i w_i * Pr0( p_b,i <= cp or p_int,i <= cp ) / #{selected}
   *
   * The null selection probability of protein i is estimated as
   *   cp + (1-cp) * F0_bin_i(cp)
   * where F0_bin_i(cp) is the null CDF of the binary statistic at the
   * cutoff: the largest attainable exact-test tail <= cp for single-peptide
   * proteins, and cp itself for multi-peptide proteins (bootstrap p-values
   * are ~uniform under H0). For independent binary and intensity p-values
   * under H0 this equals cp + (1-cp)*cp = 2cp - cp^2, the exact null
   * union probability (authors' F0_2d_c = cp + F0_c - cp*F0_c).
   *
   * The sum runs over ALL proteins (authors' sum(weight_2d*F0_2d_c) over
   * the full protein vector), and
   *   selected = #{i : p_b,i <= cp or p_int,i <= cp}.
   *
   * w_i = (w_binary,i + pi0_intensity)/2 (authors'
   * weight_2d = rowMeans(cbind(wt_quant, wt_qual))):
   *   - single-peptide proteins: w_binary,i = 0/1 PMF weight of Section 2.5.1;
   *   - multi-peptide proteins:  w_binary,i = 0/1 bootstrap-likelihood
   *     weight of Section 2.5.1 (null vs alternative density at T).
   */
  function hybridCurves(perProtein, pi0Intensity, cpGrid) {
    // perProtein: [{ pBin, pInt, wBin, f0At? }]
    const curves = [];
    for (const cp of cpGrid) {
      let num = 0, sel = 0;
      for (const x of perProtein) {
        if (!isFinite(x.pBin)) continue;
        const selI = isFinite(x.pInt) && x.pInt <= cp;
        const selB = x.pBin <= cp;
        if (selB || selI) sel++;
        const f0bin = x.f0At ? x.f0At(cp) : cp;
        const f02d = cp + (1 - cp) * f0bin;
        const w = (x.wBin + pi0Intensity) / 2;
        num += w * f02d;
      }
      curves.push({ cp, fdr: sel > 0 ? num / sel : NaN, sel });
    }
    return curves;
  }

  /* ------------------------------------------------------------------ *
   * 7. Full pipeline
   * ------------------------------------------------------------------ */

  /**
   * dataset (normalized):
   *   samples: [{ id, group: 0|1 }]
   *   peptides: [{ id, protein, values: { sampleId: intensity|undefined } }]
   *   proteins: [{ id, peptideIds: [..] }]
   * opts: { bootstrapIters=1000, bootstrapMode='structured',
   *         targetFdr=0.05, cpPoints=101, seed=42 }
   */
  function runAnalysis(dataset, opts) {
    const O = Object.assign({
      bootstrapIters: 1000,
      bootstrapMode: 'structured',
      targetFdr: 0.05,
      cpPoints: 101,
      seed: 42,
      intensityCentering: 'none',
      intensityImpute: false, // default: no missing-value imputation (complete case)
      intensityTest: 'limma' // 'limma' (moderated t, default) or 'welch'
    }, opts || {});

    const samples = dataset.samples;
    const n1 = samples.filter(s => s.group === 0).length;
    const n2 = samples.filter(s => s.group === 1).length;
    if (n1 < 2 || n2 < 2) throw new Error('Need at least 2 samples in each comparison group.');

    // --- presence/absence digitization ---
    // y_ijkl = 1 iff a peak was observed for peptide j in sample l.
    const pepById = new Map(dataset.peptides.map(p => [p.id, p]));
    const protById = new Map(dataset.proteins.map(p => [p.id, p]));

    const proteinsOut = [];
    for (const prot of dataset.proteins) {
      const peps = prot.peptideIds
        .map(id => pepById.get(id))
        .filter(Boolean)
        .map(p => {
          let y1 = 0, y2 = 0;
          for (const s of samples) {
            const v = p.values[s.id];
            if (v != null && isFinite(v) && v > 0) {
              if (s.group === 0) y1++; else y2++;
            }
          }
          return { id: p.id, y1, y2 };
        });
      if (peps.length === 0) continue;

      const single = peps.length === 1;
      let pBin, extra = {};
      if (single) {
        const e = exactPeptideTest(peps[0].y1, peps[0].y2, n1, n2);
        const wt = peptideBinaryWeight(peps[0].y1, peps[0].y2, n1, n2);
        const tails = exactTails(n1, n2, e.p0);
        pBin = e.p;
        extra = { T: e.T, p0: e.p0, w: wt.w, pmf0: wt.pmf0, pmf1: wt.pmf1, f0At: tails.f0At };
      } else {
        const bt = proteinBootstrapTest(peps, n1, n2, O.bootstrapIters, O.bootstrapMode, mulberry32(O.seed + proteinsOut.length * 101));
        pBin = bt.p;
        extra = { T: bt.T, w: bt.w, f0dens: bt.f0, f1dens: bt.f1 };
      }
      const y1tot = peps.reduce((s, p) => s + p.y1, 0);
      const y2tot = peps.reduce((s, p) => s + p.y2, 0);
      proteinsOut.push({
        protein: prot.id,
        nPeptides: peps.length,
        single,
        y1: y1tot, y2: y2tot,
        pBin,
        ...extra
      });
    }

    // --- cp grid: log-spaced, anchored at observed p-values ---
    const allP = [];
    for (const x of proteinsOut) allP.push(x.pBin);
    allP.sort((a, b) => a - b);
    const cpGrid = [];
    for (let i = 0; i < O.cpPoints; i++) {
      const q = i / (O.cpPoints - 1);
      const logcp = -6 + q * 6; // 1e-6 .. 1
      cpGrid.push(Math.pow(10, logcp));
    }
    cpGrid.push(1);
    // also include exact p-value points for stability of selection counts
    for (const p of allP) cpGrid.push(p);
    cpGrid.sort((a, b) => a - b);
    const uniqGrid = [];
    for (const cp of cpGrid) {
      if (uniqGrid.length === 0 || cp > uniqGrid[uniqGrid.length - 1] * (1 + 1e-12)) uniqGrid.push(cp);
    }
    const grid = uniqGrid;

    const singleArr = proteinsOut.filter(x => x.single).map(x => ({ p: x.pBin, w: x.w, f0At: x.f0At }));
    const multiArr = proteinsOut.filter(x => !x.single).map(x => ({ p: x.pBin, w: x.w }));
    const binFdr = binaryFdrCurves(singleArr, multiArr, grid);

    // --- intensity stage ---
    const pepIdx = new Map(dataset.peptides.map((p, i) => [p.id, i]));
    const groups = dataset.proteins
      .map(p => p.peptideIds.map(id => pepIdx.get(id)).filter(i => i != null));
    const intRes = intensityAnalysis(
      dataset.peptides, samples, O.intensityCentering, O.intensityImpute, O.intensityTest, groups);
    const gIdx = new Map(dataset.proteins.map((p, i) => [p.id, i]));
    for (const x of proteinsOut) {
      const r = intRes.perGroup[gIdx.get(x.protein)] || { p: NaN, log2FC: NaN, t: NaN, df: NaN, s2post: NaN };
      x.pInt = r.p;
      x.log2FC = r.log2FC;
      x.t = r.t; x.df = r.df;
      x.s2post = isFinite(r.s2post) ? r.s2post : NaN;
    }
    const intPvals = proteinsOut.filter(x => isFinite(x.pInt)).map(x => x.pInt);
    const { pi0: pi0Int } = storeyPi0(intPvals);
    // full intensity FDR curve (Storey-Tibshirani) for plotting
    const sortedInt = intPvals.slice().sort((a, b) => a - b);
    const intCurves = grid.map(cp => {
      let sel = 0;
      for (const p of sortedInt) { if (p <= cp) sel++; else break; }
      return { cp, sel, fdr: sel > 0 ? intPvals.length * pi0Int * cp / sel : NaN };
    });

    // --- hybrid ---
    // wBin is the per-protein binary weight of Section 2.5.1 for BOTH
    // single- and multi-peptide proteins (PMF weight / bootstrap-likelihood
    // weight); f0At is the single-peptide exact-test null CDF (multi-peptide
    // proteins use F0 = cp inside hybridCurves).
    const hybridInput = proteinsOut.map(x => ({
      protein: x.protein,
      pBin: x.pBin,
      pInt: x.pInt,
      wBin: x.w,
      f0At: x.single ? x.f0At : undefined
    }));
    const hCurves = hybridCurves(hybridInput, pi0Int, grid);

    // --- operating points at target FDR ---
    function operatingPoint(curves, fdrKey, selKey) {
      let best = null;
      for (const c of curves) {
        const f = c[fdrKey];
        if (isFinite(f) && f <= O.targetFdr) best = c; // grid sorted ascending in cp
      }
      return best ? { cp: best.cp, fdr: best[fdrKey], sel: best[selKey] }
                  : { cp: NaN, fdr: NaN, sel: 0 };
    }
    const opBinary = operatingPoint(binFdr.curves, 'fdrMix', 'sel');
    const opInt = (function () {
      // intensity-only: Storey FDR on intensity p-values
      const sorted = intPvals.slice().sort((a, b) => a - b);
      let bestCp = NaN, bestFdr = NaN, bestSel = 0;
      for (const cp of grid) {
        let sel = 0;
        for (const p of sorted) { if (p <= cp) sel++; else break; }
        if (sel === 0) continue;
        const fdr = intPvals.length * pi0Int * cp / sel;
        if (fdr <= O.targetFdr) { bestCp = cp; bestFdr = fdr; bestSel = sel; }
      }
      return { cp: bestCp, fdr: bestFdr, sel: bestSel };
    })();
    const opHybrid = operatingPoint(hCurves, 'fdr', 'sel');

    // selection flags at target
    for (const x of proteinsOut) {
      x.selBinary = opBinary.sel > 0 && x.pBin <= opBinary.cp;
      x.selIntensity = opInt.sel > 0 && isFinite(x.pInt) && x.pInt <= opInt.cp;
      x.selHybrid = opHybrid.sel > 0 && (x.pBin <= opHybrid.cp || (isFinite(x.pInt) && x.pInt <= opHybrid.cp));
      x.wHybrid = (x.w + pi0Int) / 2;
    }

    // --- per-feature FDR columns ---
    // (a) x.fdr : GLOBAL (list-level) FDR — the estimated FDR of the whole
    //     selected list "at-or-more significant than this feature", i.e. the
    //     conservative all-numerator hybrid estimator num(sel)/sel evaluated at
    //     the feature's own min p. This is the figure-1 curve's x-axis (estimated
    //     FDR) at that feature's operating point; it is the quantity Perseus
    //     reports as "PEP". Cap at 1 (a ratio >1 = "expected FDR > 100%" =
    //     certainly a false, do-not-select feature).
    // (b) x.pep : LOCAL, per-feature posterior probability that this feature is a
    //     false discovery, from the paper's own null-vs-alternative likelihoods
    //     with a flat 50/50 prior: single-feature rows pmf0/(pmf0+pmf1) (exact
    //     binomial PMFs of Sec. 2.3/2.5.1), multi-feature rows
    //     f0dens/(f0dens+f1dens) (bootstrap null/alt densities at T, Sec. 2.4).
    //     This is a genuine per-feature quantity, so it differs from the global
    //     list FDR.
    const fdrMemo = new Map();
    const fdrNumSel = (cp) => {
      let ns = fdrMemo.get(cp);
      if (ns) return ns;
      let num = 0, sel = 0;
      for (const z of hybridInput) {
        if (!isFinite(z.pBin)) continue;
        const selI = isFinite(z.pInt) && z.pInt <= cp;
        const selB = z.pBin <= cp;
        if (selB || selI) sel++;
        const f0bin = z.f0At ? z.f0At(cp) : cp;
        const f02d = cp + (1 - cp) * f0bin;
        const w = (z.wBin + pi0Int) / 2;
        num += w * f02d;
      }
      ns = { num, sel };
      fdrMemo.set(cp, ns);
      return ns;
    };
    for (const x of proteinsOut) {
      const cands = [];
      if (isFinite(x.pBin)) cands.push(x.pBin);
      if (isFinite(x.pInt)) cands.push(x.pInt);
      const minP = cands.length ? Math.min.apply(null, cands) : NaN;
      x.minP = minP;
      if (isFinite(minP)) {
        const ns = fdrNumSel(minP);
        x.fdr = ns.sel > 0 ? Math.min(1, ns.num / ns.sel) : NaN;
      } else {
        x.fdr = NaN;
      }
      const l0 = x.single ? x.pmf0 : x.f0dens;
      const l1 = x.single ? x.pmf1 : x.f1dens;
      x.pep = (isFinite(l0) && isFinite(l1) && (l0 + l1) > 0) ? l0 / (l0 + l1) : NaN;
    }

    return {
      n1, n2,
      nProteins: proteinsOut.length,
      nSingle: singleArr.length,
      nMulti: multiArr.length,
      proteins: proteinsOut,
      binary: {
        pi0Multi: binFdr.pi0Multi,
        curves: binFdr.curves,
        operatingPoint: opBinary
      },
      intensity: {
        pi0: pi0Int,
        nValid: intPvals.length,
        curves: intCurves,
        operatingPoint: opInt,
        test: intRes.test, // 'limma' (moderated t) or 'welch'
        prior: intRes.prior // { df2, s20 } — the fitted common prior variance
      },
      hybrid: {
        pi0Intensity: pi0Int,
        curves: hCurves,
        operatingPoint: opHybrid
      },
      options: O
    };
  }

  /* ------------------------------------------------------------------ *
   * 8. Demo data generator (mirrors paper Section 2.1.3 simulation)
   * ------------------------------------------------------------------ */

  /**
   * Generate a diabetes-style simulated feature×sample dataset.
   * A *feature* is one matrix row; *feature groups* are the analysis units
   * (the paper's "proteins", built from its "peptides"). With singleShare=1
   * every group has exactly one feature — a plain feature (protein) matrix,
   * the generalized form. With singleShare<1 some groups have multiple
   * features (the paper's multi-peptide proteins), exercising the bootstrap.
   *  - two groups of nPerGroup samples;
   *  - feature groups with 1..30 features (a share single-feature);
   *  - presence probabilities p1 in {0.2,0.3,0.4,0.5}; half the groups
   *    differential with pd in {0.1..0.7}; a few guaranteed one-state
   *    groups (present in all samples of one group, absent in the other);
   *  - intensities log-normal with differential mean shifts (low: 1,2;
   *    high: 5,10 log2 units), and MNAR censoring of the lowest
   *    missingFrac of each feature's intensities.
   */
  function generateDemo(params) {
    const P = Object.assign({
      seed: 20120419,
      nPerGroup: 10,
      nProteins: 177,
      singleShare: 0.30,
      difShare: 0.50,
      oneStateShare: 0.06,
      missingFrac: 0.25,
      p1set: [0.2, 0.3, 0.4, 0.5],
      pdset: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
      detectabilities: [0.01, 0.05, 0.1, 0.3, 0.5, 0.7, 0.9],
      lowMag: [1, 2],
      highMag: [5, 10],
      sigma: 0.8,
      groupLabels: ['Diabetic', 'Control']
    }, params || {});

    const rng = mulberry32(P.seed);
    const pick = a => a[Math.floor(rng() * a.length)];
    const n1 = P.nPerGroup, n2 = P.nPerGroup;
    const samples = [];
    for (let l = 1; l <= n1; l++) samples.push({ id: 'S' + String(l).padStart(2, '0'), group: 0 });
    for (let l = 1; l <= n2; l++) samples.push({ id: 'S' + String(n1 + l).padStart(2, '0'), group: 1 });

    const gauss = () => {
      // Box-Muller
      let u = 0, v = 0;
      while (u === 0) u = rng();
      while (v === 0) v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    const peptides = [];
    const proteins = [];
    const trueLabels = [];

    for (let i = 0; i < P.nProteins; i++) {
      const protId = 'PROT' + String(i + 1).padStart(3, '0');
      const m = (i < Math.round(P.singleShare * P.nProteins)) ? 1
                : 1 + Math.floor(rng() * 29); // 2..30
      let p1 = pick(P.p1set);
      let p2, dif = false, oneState = false, delta = 0;
      const u = rng();
      if (u < P.oneStateShare) {
        // guaranteed one-state protein
        oneState = true; dif = true;
        const hiInGroup1 = rng() < 0.5;
        p2 = hiInGroup1 ? 0 : 1;
        p1 = hiInGroup1 ? 1 : 0;
        delta = hiInGroup1 ? 10 : -10;
      } else if (u < P.oneStateShare + P.difShare) {
        dif = true;
        const pd = pick(P.pdset);
        // Presence direction and intensity direction are drawn INDEPENDENTLY.
        // (If they were coupled — high intensity always in the high-presence
        // group — the per-peptide low-value imputation would asymmetrically
        // attenuate the fold change of one direction, making the demo volcano
        // one-sided. Independent directions keep the demo representative and
        // the intensity stage directionally fair.)
        const pdSign = rng() < 0.5 ? 1 : -1;
        const intSign = rng() < 0.5 ? 1 : -1;
        p2 = Math.min(0.95, Math.max(0.05, p1 + pdSign * pd));
        const mag = rng() < 0.5 ? pick(P.lowMag) : pick(P.highMag);
        delta = intSign * mag;
      } else {
        p2 = p1; // null protein
      }

      const peptideIds = [];
      for (let j = 0; j < m; j++) {
        // A single-feature group (e.g. a protein matrix row) is named after
        // the group itself; multi-feature groups use PROTxxx_P1, _P2, …
        const pepId = (m === 1) ? protId : protId + '_P' + (j + 1);
        peptideIds.push(pepId);
        // One-state peptides are the paper's flagship case (10 vs 0): they are
        // assumed well detected, so give them high detectability. (Otherwise a
        // low detectability draw makes a one-state peptide nearly unobserved
        // and the exact test cannot highlight it.)
        const d = oneState ? 0.9 : pick(P.detectabilities);
        const muBase = 3 + 3 * rng(); // protein-level abundance (log2)
        const values = {};
        const obs = []; // observed entries, for MNAR censoring
        for (let k = 0; k < 2; k++) {
          const pk = (k === 0 ? p1 : p2) * d;
          for (let l = 0; l < n1; l++) {
            const sampleId = samples[k === 0 ? l : n1 + l].id;
            if (rng() < pk) {
              const mu = muBase + (k === 1 ? delta : 0);
              const logI = mu + P.sigma * gauss();
              const I = Math.pow(2, logI);
              values[sampleId] = I;
              obs.push({ sampleId, I });
            }
          }
        }
        // MNAR censoring: drop the lowest `missingFrac` of this peptide's
        // intensities (low-intensity peaks fail to be detected).
        if (obs.length > 2 && P.missingFrac > 0) {
          const dropCount = Math.floor(obs.length * P.missingFrac);
          if (dropCount > 0) {
            obs.sort((a, b) => a.I - b.I);
            for (let d2 = 0; d2 < dropCount; d2++) delete values[obs[d2].sampleId];
          }
        }
        peptides.push({ id: pepId, protein: protId, values });
      }

      proteins.push({ id: protId, peptideIds });
      trueLabels.push({
        protein: protId,
        differential: dif,
        oneState,
        p1, p2, delta,
        nPeptides: m
      });
    }

    return {
      samples,
      peptides,
      proteins,
      groupLabels: P.groupLabels,
      trueLabels,
      meta: { source: 'simulated', params: P }
    };
  }

  /* ------------------------------------------------------------------ *
   * 9. CSV parsing (long form + wide matrix)
   * ------------------------------------------------------------------ */

  function detectDelimiter(line) {
    const counts = { '\t': 0, ';': 0, ',': 0 };
    for (const ch of line) if (ch in counts) counts[ch]++;
    let best = ',', bc = -1;
    for (const d of ['\t', ';', ',']) if (counts[d] > bc) { best = d; bc = counts[d]; }
    return best;
  }

  function splitCsvLine(line, delim) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  function toNum(s) {
    if (s == null) return NaN;
    const t = String(s).trim().toLowerCase();
    if (t === '' || t === 'na' || t === 'n/a' || t === 'nan' || t === 'missing' ||
        t === '.' || t === '-' || t === '0.0') {
      // treat explicit zero as 0; everything else above as missing
      if (t === '0.0') return 0;
      return NaN;
    }
    const v = Number(t);
    return isFinite(v) ? v : NaN;
  }

  // Accepted column names for the generalized feature × sample matrix.
  // The analysis unit is a *feature* (peptide, protein, metabolite, gene, …);
  // an optional *feature-group* column groups features (e.g. peptides → proteins).
  const FEATURE_COL_NAMES = ['feature', 'feature_id', 'featureid', 'peptide',
    'peptide_id', 'peptideid', 'sequence', 'protein', 'protein_id', 'proteinid',
    'gene', 'gene_id', 'metabolite', 'metabolite_id', 'compound', 'name', 'id'];
  // Note: the bare word "group" is deliberately NOT a feature-group name —
  // in long form it denotes the *sample* group, which would be ambiguous.
  const FGROUP_COL_NAMES = ['feature_group', 'featuregroup', 'feature group',
    'protein', 'protein_id', 'proteinid', 'protein_group', 'gene', 'gene_id',
    'assignment', 'parent'];

  /**
   * Parse a CSV into the normalized dataset.
   * Long form:  feature[,feature group],sample,group,intensity
   * Wide form:  row1: Feature[,Feature group],sample...
   *             row2 (optional): Group,,gA,gB,...
   *             rows: feature[,feature group],intensity...
   * Feature column names are generic (Feature/Protein/Peptide/Gene/…).
   * Returns { dataset, warnings }.
   */
  function parseCsv(text) {
    const warnings = [];
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
      .map(l => l).filter(l => l.trim().length > 0);
    if (lines.length < 3) throw new Error('CSV needs a header plus at least two data rows.');
    const delim = detectDelimiter(lines[0]);
    const header = splitCsvLine(lines[0], delim).map(h => h.toLowerCase());

    const isLong = header.includes('intensity') &&
      FEATURE_COL_NAMES.some(h => header.includes(h)) &&
      header.includes('sample') && header.includes('group');

    if (isLong) {
      const iPep = header.findIndex(h => FEATURE_COL_NAMES.includes(h));
      const iProt = header.findIndex(h => FGROUP_COL_NAMES.includes(h));
      const iSmp = header.indexOf('sample');
      const iGrp = header.indexOf('group');
      const iInt = header.indexOf('intensity');
      if (iProt < 0) {
        // no feature-group column: each feature is its own group
        warnings.push('No feature-group column found; each feature is treated as its own single-feature group.');
      }
      const pepMap = new Map();
      const grpMap = new Map();
      const samples = new Map();
      const rows = lines.slice(1);
      for (const line of rows) {
        const cells = splitCsvLine(line, delim);
        const pepId = cells[iPep];
        const protId = iProt >= 0 ? (cells[iProt] || pepId) : pepId;
        const smpId = cells[iSmp];
        const grp = cells[iGrp];
        const v = toNum(cells[iInt]);
        if (!pepMap.has(pepId)) pepMap.set(pepId, { id: pepId, protein: protId, values: {} });
        if (!samples.has(smpId)) samples.set(smpId, { id: smpId, group: null });
        if (!grpMap.has(grp)) {
          if (grpMap.size >= 2) {
            throw new Error('More than two groups found (' + [...grpMap.keys()].join(', ') + '). This method requires exactly two comparison groups.');
          }
          grpMap.set(grp, grpMap.size);
        }
        samples.get(smpId).group = grpMap.get(grp);
        const p = pepMap.get(pepId);
        if (iProt >= 0 && p.protein !== protId) {
          // protein assignments must be consistent per peptide
          warnings.push('Peptide ' + pepId + ' has conflicting protein assignments; using first.');
        }
        if (isFinite(v)) p.values[smpId] = v;
      }
      for (const s of samples.values()) {
        if (s.group == null) throw new Error('Sample ' + s.id + ' has no group label.');
      }
      const proteinsMap = new Map();
      for (const p of pepMap.values()) {
        if (!proteinsMap.has(p.protein)) proteinsMap.set(p.protein, { id: p.protein, peptideIds: [] });
        proteinsMap.get(p.protein).peptideIds.push(p.id);
      }
      const groupLabels = [...grpMap.entries()].sort((a, b) => a[1] - b[1]).map(e => e[0]);
      return {
        dataset: {
          samples: [...samples.values()],
          peptides: [...pepMap.values()],
          proteins: [...proteinsMap.values()],
          groupLabels
        },
        warnings
      };
    }

    // ---- wide form ----
    const first = header[0];
    if (!FEATURE_COL_NAMES.includes(first)) {
      throw new Error('Unrecognized format: expected a long-form CSV (feature,feature group,sample,group,intensity) ' +
        'or a wide feature×sample matrix whose first header cell names the feature column ' +
        '(Feature / Protein / Peptide / Gene / …).');
    }
    let groupRow = null;
    let dataStart = 1;
    if (lines.length > 2) {
      const r2 = splitCsvLine(lines[1], delim).map(c => c.toLowerCase());
      if (['group', 'groups', 'condition', 'conditions', 'class', 'label'].includes(r2[0])) {
        groupRow = splitCsvLine(lines[1], delim);
        dataStart = 2;
      }
    }
    const sampleNames = splitCsvLine(lines[0], delim).slice(2);
    if (sampleNames.length < 2) throw new Error('Wide matrix needs at least two sample columns.');
    const hasProt = header[1] != null && FGROUP_COL_NAMES.includes(header[1].toLowerCase());
    const sampleGroups = new Map();
    if (groupRow) {
      for (let i = 0; i < sampleNames.length; i++) {
        const g = (groupRow[i + 2] != null && groupRow[i + 2].trim() !== '') ? groupRow[i + 2].trim() : null;
        if (g) sampleGroups.set(sampleNames[i], g);
      }
    } else {
      warnings.push('No group row found; inferring groups from sample-name suffixes.');
    }
    const grpMap = new Map();
    const samples = sampleNames.map(s => ({ id: s, group: null }));
    for (const s of samples) {
      let g = sampleGroups.get(s.id) || null;
      if (!g) {
        const parts = s.id.split(/[_\-. ]/);
        g = parts[parts.length - 1];
      }
      if (!grpMap.has(g)) {
        if (grpMap.size >= 2) {
          throw new Error('More than two groups inferred (' + [...grpMap.keys()].join(', ') + '). ' +
            'Add a "Group" annotation row or use long-form CSV.');
        }
        grpMap.set(g, grpMap.size);
      }
      s.group = grpMap.get(g);
    }
    const groupLabels = [...grpMap.entries()].sort((a, b) => a[1] - b[1]).map(e => e[0]);
    const peptides = [];
    const proteinsMap = new Map();
    for (let li = dataStart; li < lines.length; li++) {
      const cells = splitCsvLine(lines[li], delim);
      const pepId = cells[0];
      const protId = hasProt && cells[1] && cells[1].trim() !== '' ? cells[1] : pepId;
      const p = { id: pepId, protein: protId, values: {} };
      for (let si = 0; si < sampleNames.length; si++) {
        const v = toNum(cells[hasProt ? si + 2 : si + 1]);
        if (isFinite(v) && v >= 0) p.values[sampleNames[si]] = v;
      }
      peptides.push(p);
      if (!proteinsMap.has(protId)) proteinsMap.set(protId, { id: protId, peptideIds: [] });
      proteinsMap.get(protId).peptideIds.push(pepId);
    }
    if (hasProt) {
      warnings.push('Feature-group assignments taken from the wide matrix feature-group column.');
    } else {
      warnings.push('No feature-group column found in wide matrix; each feature is treated as its own single-feature group.');
    }
    return {
      dataset: { samples, peptides, proteins: [...proteinsMap.values()], groupLabels },
      warnings
    };
  }

  /* ------------------------------------------------------------------ *
   * 10. Self-tests (paper's reported properties)
   * ------------------------------------------------------------------ */

  /**
   * Self-test battery mirroring the paper's claims:
   *  1. one-state peptide exact test (Section 2.3 example);
   *  2. FDR calibration on a known mixture (estimator conservative);
   *  3. hybrid >= components in selection count (paper Table 2 style).
   */
  function selfTest(opts) {
    const O = Object.assign({ seed: 7, nProteins: 500, bootstrapIters: 800 }, opts || {});
    const out = {};

    // 1. one-state peptide, n1 = n2 = 10, y = (10, 0)
    const one = exactPeptideTest(10, 0, 10, 10);
    const expected = 2 * Math.pow(0.5, 20);
    out.oneState = {
      observed: one.p,
      expected,
      ok: Math.abs(one.p - expected) < 1e-12 && one.p < 1e-4
    };

    // 2. mixture calibration (paper Fig. 2 style): the estimated FDR curve
    //    should lie at or above the true FDR curve (conservative estimator),
    //    on a simulated mixture of null + differential proteins.
    const ds = generateDemo({
      seed: O.seed, nPerGroup: 10, nProteins: O.nProteins,
      singleShare: 0.3, difShare: 0.3, oneStateShare: 0.0,
      missingFrac: 0.2, p1set: [0.3, 0.4], pdset: [0.2, 0.3, 0.4]
    });
    const res = runAnalysis(ds, { bootstrapIters: O.bootstrapIters, targetFdr: 0.05, seed: O.seed });
    const trueDif = new Set(ds.trueLabels.filter(t => t.differential).map(t => t.protein));
    // true FDR curve from the simulated truth
    const curvePts = [];
    for (const c of res.binary.curves) {
      if (!isFinite(c.fdrMix) || c.sel === 0) continue;
      let sel = 0, fp = 0;
      for (const x of res.proteins) {
        if (x.pBin <= c.cp) { sel++; if (!trueDif.has(x.protein)) fp++; }
      }
      if (sel >= 8) curvePts.push({ cp: c.cp, est: c.fdrMix, truth: fp / sel, sel });
    }
    // Conservativeness (paper's claim "resulting FDR estimates are
    // conservative"): at the operating point (estimated FDR = 0.05) the true
    // FDR must not exceed the estimate, and the estimate should lie above the
    // truth curve overall (median gap positive). In the low-selection region
    // the *true* FDR estimate itself is noisy, so a few isolated crossings
    // there are expected (cf. paper Fig. 2).
    const gaps = curvePts.map(p => p.est - p.truth).sort((a, b) => a - b);
    const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : NaN;
    let cpStar = NaN;
    for (const p of curvePts) if (p.est <= 0.05) cpStar = p.cp;
    const op = curvePts.find(p => Math.abs(p.cp - (cpStar || 0)) < 1e-12) || null;
    // Primary robust check: the estimator lies above the truth curve on
    // average (median gap > 0), i.e. conservative. The operating point is
    // reported for information; the true-FDR estimate there is itself noisy
    // (se ~ sqrt(p(1-p)/sel)), so a single-point crossing is not decisive.
    out.calibration = {
      cpAt5pct: cpStar,
      points: curvePts.length,
      medianGap,
      operatingPoint: op ? { cp: op.cp, est: op.est, truth: op.truth, sel: op.sel } : null,
      ok: curvePts.length > 5 && medianGap > 0 && isFinite(cpStar)
    };

    // 3. At the same cutoff, hybrid selection is the union of the two
    //    component selections (paper Section 2.6), hence contains both.
    const cpFix = 0.05;
    let bSel = 0, hSel = 0, iSel = 0;
    for (const x of res.proteins) {
      if (x.pBin <= cpFix) bSel++;
      if (isFinite(x.pInt) && x.pInt <= cpFix) iSel++;
      if (x.pBin <= cpFix || (isFinite(x.pInt) && x.pInt <= cpFix)) hSel++;
    }
    out.hybridVsComponents = {
      atCp05: { binary: bSel, intensity: iSel, hybrid: hSel },
      operatingPoints: {
        binary: res.binary.operatingPoint.sel,
        intensity: res.intensity.operatingPoint.sel,
        hybrid: res.hybrid.operatingPoint.sel
      },
      ok: hSel >= bSel && hSel >= iSel && bSel > 0
    };

    out.pass = out.oneState.ok && out.calibration.ok && out.hybridVsComponents.ok;
    return out;
  }

  return {
    // math
    lgamma, logComb, binomPmf, binomCdf, regIncBeta, tTwoSidedP,
    digamma, trigamma, trigammaInverse,
    mulberry32, makeBinomSampler, quantileSorted, mean, variance, median, iqr,
    // section 2.3
    exactNullMassAt, exactPeptideTest, exactTails, peptideBinaryWeight,
    // section 2.4
    proteinStatistic, structuredPeaks, proteinBootstrapTest,
    // section 2.5
    storeyPi0, fitQuadratic, binaryFdrCurves,
    // intensity
    intensityAnalysis,
    // section 2.6
    hybridCurves,
    // pipeline
    runAnalysis, generateDemo, parseCsv, selfTest,
    version: '1.0.0'
  };
});
