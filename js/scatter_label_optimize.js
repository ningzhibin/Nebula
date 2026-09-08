/**
 * ScatterLabelOptimize — reusable label placement for 2D scatter plots (e.g. Plotly PCA / t-SNE).
 * Minimizes anchor distance + smooth overlap penalties (label–label, label–marker) using Adam
 * with finite-difference gradients (no SciPy/JAX).
 */
(function (global) {
    'use strict';

    // Prefer the app body stack (css/font_tokens.css via NebulaFonts) so canvas
    // measurement matches the rendered Plotly/DOM typeface; fall back if no tokens.
    var DEFAULT_FONT = (typeof window !== 'undefined' && window.NebulaFonts && window.NebulaFonts.body)
        || 'IBM Plex Sans, Segoe UI, system-ui, sans-serif';

    /** @type {HTMLCanvasElement|null} */
    var _measureCanvas = null;

    /**
     * @param {string[]} texts
     * @param {number} fontSizePx
     * @param {string} [fontFamily]
     * @returns {number[]} width in px
     */
    function measureLabelWidthsPx(texts, fontSizePx, fontFamily) {
        var fs = Math.max(6, fontSizePx);
        if (typeof document === 'undefined') {
            return texts.map(function (t) {
                return Math.max(fs * 2, String(t || '').length * fs * 0.55 + fs);
            });
        }
        if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
        var ctx = _measureCanvas.getContext('2d');
        if (!ctx) {
            return texts.map(function (t) {
                return Math.max(fs * 2, String(t || '').length * fs * 0.55 + fs);
            });
        }
        ctx.font = fs + 'px ' + (fontFamily || DEFAULT_FONT);
        return texts.map(function (t) {
            var m = ctx.measureText(String(t || ''));
            var w = (m && typeof m.width === 'number') ? m.width : String(t || '').length * fs * 0.55;
            return Math.max(fs * 1.5, w + fs * 0.35);
        });
    }

    /**
     * Smooth approximation to max(d, 0).
     * @param {number} d
     * @param {number} eps
     */
    function smoothPos(d, eps) {
        var e = eps > 0 ? eps : 1e-6;
        return 0.5 * (d + Math.sqrt(d * d + e * e));
    }

    /** Derivative of smoothPos w.r.t. d. */
    function smoothPosDeriv(d, eps) {
        var e = eps > 0 ? eps : 1e-6;
        return 0.5 * (1 + d / Math.sqrt(d * d + e * e));
    }

    function clamp(x, lo, hi) {
        return Math.max(lo, Math.min(hi, x));
    }

    /**
     * @param {{x:number,y:number,text?:string}[]} points
     */
    function computeFullSpanProduct(points) {
        if (!points || points.length === 0) return 1e-12;
        var minX = points[0].x, maxX = points[0].x, minY = points[0].y, maxY = points[0].y;
        for (var i = 1; i < points.length; i++) {
            var p = points[i];
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        var sx = Math.max(maxX - minX, 1e-12);
        var sy = Math.max(maxY - minY, 1e-12);
        return sx * sy;
    }

    /**
     * How many labels to show: baseline at full view, more when zoomed in (smaller view span vs full data).
     * @param {number} nCandidates
     * @param {number} fullSpanProduct — (xMax-xMin)*(yMax-yMin) over all points in dataset
     * @param {{xMin:number,xMax:number,yMin:number,yMax:number}} viewBounds — current padded axis bounds
     * @param {{baseline?:number,maxCap?:number}} [opts]
     */
    function computeMaxLabelCount(nCandidates, fullSpanProduct, viewBounds, opts) {
        var baseline = (opts && opts.baseline != null) ? opts.baseline : 40;
        var maxCap = (opts && opts.maxCap != null) ? opts.maxCap : 150;
        if (nCandidates <= 0) return 0;
        var vx = Math.max(viewBounds.xMax - viewBounds.xMin, 1e-12);
        var vy = Math.max(viewBounds.yMax - viewBounds.yMin, 1e-12);
        var viewSpanProduct = vx * vy;
        var full = Math.max(fullSpanProduct, 1e-12);
        var zoomFactor = Math.max(1, full / viewSpanProduct);
        var boosted = Math.floor(baseline * Math.sqrt(zoomFactor));
        var maxItems = Math.min(nCandidates, Math.min(maxCap, Math.max(baseline, boosted)));
        return maxItems;
    }

    /**
     * @param {{x:number,y:number,text?:string}[]} points
     * @param {{xMin:number,xMax:number,yMin:number,yMax:number}} bounds
     * @param {number} plotInnerWidth
     * @param {number} plotInnerHeight
     * @param {{fontSizePx?:number,fontFamily?:string,padPx?:number,minHalfWFrac?:number,lineHeightPx?:number}} [opts]
     * @returns {{ halfW: number[], halfH: number[] }}
     */
    function estimateLabelBoxes(points, bounds, plotInnerWidth, plotInnerHeight, opts) {
        var fontSizePx = (opts && opts.fontSizePx != null) ? opts.fontSizePx : 11;
        var fontFamily = (opts && opts.fontFamily) || DEFAULT_FONT;
        var padPx = (opts && opts.padPx != null) ? opts.padPx : 3;
        var minHalfWFrac = (opts && opts.minHalfWFrac != null) ? opts.minHalfWFrac : 0.02;
        var lineHeightPx = (opts && opts.lineHeightPx != null) ? opts.lineHeightPx : Math.round(fontSizePx * 1.25 + 2);

        var xMin = bounds.xMin, xMax = bounds.xMax, yMin = bounds.yMin, yMax = bounds.yMax;
        var dataW = Math.max(xMax - xMin, 1e-6);
        var dataH = Math.max(yMax - yMin, 1e-6);
        var dataPerPxX = dataW / Math.max(1, plotInnerWidth);
        var dataPerPxY = dataH / Math.max(1, plotInnerHeight);

        var texts = points.map(function (p) { return String(p.text != null ? p.text : ''); });
        var widthsPx = measureLabelWidthsPx(texts, fontSizePx, fontFamily);
        var n = points.length;
        var halfW = new Array(n);
        var halfH = new Array(n);
        var minHalfWData = dataW * minHalfWFrac;
        for (var i = 0; i < n; i++) {
            halfW[i] = Math.max(minHalfWData, ((widthsPx[i] + padPx * 2) * 0.5) * dataPerPxX);
            halfH[i] = ((lineHeightPx + padPx * 2) * 0.5) * dataPerPxY;
        }
        return { halfW: halfW, halfH: halfH, dataPerPxX: dataPerPxX, dataPerPxY: dataPerPxY };
    }

    /**
     * Reference objective (energy only). The optimizer uses `energyAndGrad` below for speed;
     * this function is kept as the readable definition of the objective and as the ground truth
     * for gradient checking (finite-diff of totalEnergy must match energyAndGrad's gradient).
     * @param {number[]} theta length 2n (lx0,ly0,...)
     * @param {{x:number,y:number}[]} points anchors (data points)
     * @param {number[]} anchorX
     * @param {number[]} anchorY
     * @param {number[]} halfW
     * @param {number[]} halfH
     * @param {number} dotHalfW
     * @param {number} dotHalfH
     * @param {number} dotScale
     * @param {number} wPull
     * @param {number} wLL
     * @param {number} wLD
     * @param {number} smoothEps
     * @param {number} n
     */
    function totalEnergy(theta, points, anchorX, anchorY, halfW, halfH, dotHalfW, dotHalfH, dotScale, wPull, wLL, wLD, smoothEps, gapX, gapY, n) {
        var pull = 0, ll = 0, ld = 0;
        var i, j;
        var dW0 = dotHalfW * dotScale + gapX;
        var dH0 = dotHalfH * dotScale + gapY;
        for (i = 0; i < n; i++) {
            var lx = theta[i * 2];
            var ly = theta[i * 2 + 1];
            var dx = lx - anchorX[i];
            var dy = ly - anchorY[i];
            pull += dx * dx + dy * dy;
            var li = lx - halfW[i], ri = lx + halfW[i], bi = ly - halfH[i], ti = ly + halfH[i];
            for (j = 0; j < n; j++) {
                var pjx = points[j].x, pjy = points[j].y;
                var dl = pjx - dW0, dr = pjx + dW0, db = pjy - dH0, dt = pjy + dH0;
                var ox = Math.min(ri, dr) - Math.max(li, dl);
                var oy = Math.min(ti, dt) - Math.max(bi, db);
                ld += smoothPos(ox, smoothEps) * smoothPos(oy, smoothEps);
            }
        }
        for (i = 0; i < n; i++) {
            var lix = theta[i * 2] - halfW[i], rix = theta[i * 2] + halfW[i];
            var biy = theta[i * 2 + 1] - halfH[i], tiy = theta[i * 2 + 1] + halfH[i];
            for (j = i + 1; j < n; j++) {
                var ljx = theta[j * 2] - halfW[j], rjx = theta[j * 2] + halfW[j];
                var bjy = theta[j * 2 + 1] - halfH[j], tjy = theta[j * 2 + 1] + halfH[j];
                var ox = Math.min(rix, rjx) - Math.max(lix, ljx);
                var oy = Math.min(tiy, tjy) - Math.max(biy, bjy);
                ll += smoothPos(ox, smoothEps) * smoothPos(oy, smoothEps);
            }
        }
        return wPull * pull + wLL * ll + wLD * ld;
    }

    /**
     * Analytic energy + gradient in a single O(n^2) pass (replaces the previous
     * O(n^3) finite-difference gradient: 2*(2n) energy evaluations, each O(n^2), per step).
     * The overlap terms use subgradients at the min/max seams — exact except on the measure-zero
     * set of exact box-edge ties, which is irrelevant to the optimizer. `grad` is filled in place
     * (length 2n) and the total energy is returned. Matches `totalEnergy` term for term.
     */
    function energyAndGrad(theta, points, anchorX, anchorY, halfW, halfH, dotHalfW, dotHalfH, dotScale, wPull, wLL, wLD, smoothEps, gapX, gapY, n, grad) {
        var pull = 0, ll = 0, ld = 0;
        var i, j;
        var dW0 = dotHalfW * dotScale + gapX;
        var dH0 = dotHalfH * dotScale + gapY;
        for (i = 0; i < 2 * n; i++) grad[i] = 0;

        // Pull toward anchors + label vs marker boxes (markers fixed).
        for (i = 0; i < n; i++) {
            var lx = theta[i * 2];
            var ly = theta[i * 2 + 1];
            var dx = lx - anchorX[i];
            var dy = ly - anchorY[i];
            pull += dx * dx + dy * dy;
            grad[i * 2] += wPull * 2 * dx;
            grad[i * 2 + 1] += wPull * 2 * dy;
            var li = lx - halfW[i], ri = lx + halfW[i], bi = ly - halfH[i], ti = ly + halfH[i];
            for (j = 0; j < n; j++) {
                var pjx = points[j].x, pjy = points[j].y;
                var dl = pjx - dW0, dr = pjx + dW0, db = pjy - dH0, dt = pjy + dH0;
                var ox = Math.min(ri, dr) - Math.max(li, dl);
                var oy = Math.min(ti, dt) - Math.max(bi, db);
                var spx = smoothPos(ox, smoothEps), spy = smoothPos(oy, smoothEps);
                ld += spx * spy;
                var dOxDlx = (ri < dr ? 1 : 0) - (li > dl ? 1 : 0);
                var dOyDly = (ti < dt ? 1 : 0) - (bi > db ? 1 : 0);
                grad[i * 2] += wLD * smoothPosDeriv(ox, smoothEps) * dOxDlx * spy;
                grad[i * 2 + 1] += wLD * spx * smoothPosDeriv(oy, smoothEps) * dOyDly;
            }
        }

        // Label vs label boxes (both endpoints move).
        for (i = 0; i < n; i++) {
            var lix = theta[i * 2] - halfW[i], rix = theta[i * 2] + halfW[i];
            var biy = theta[i * 2 + 1] - halfH[i], tiy = theta[i * 2 + 1] + halfH[i];
            for (j = i + 1; j < n; j++) {
                var ljx = theta[j * 2] - halfW[j], rjx = theta[j * 2] + halfW[j];
                var bjy = theta[j * 2 + 1] - halfH[j], tjy = theta[j * 2 + 1] + halfH[j];
                var ox2 = Math.min(rix, rjx) - Math.max(lix, ljx);
                var oy2 = Math.min(tiy, tjy) - Math.max(biy, bjy);
                var spx2 = smoothPos(ox2, smoothEps), spy2 = smoothPos(oy2, smoothEps);
                ll += spx2 * spy2;
                var dspx2 = smoothPosDeriv(ox2, smoothEps), dspy2 = smoothPosDeriv(oy2, smoothEps);
                var dOxDlxi = (rix < rjx ? 1 : 0) - (lix > ljx ? 1 : 0);
                var dOxDlxj = (rjx < rix ? 1 : 0) - (ljx > lix ? 1 : 0);
                var dOyDlyi = (tiy < tjy ? 1 : 0) - (biy > bjy ? 1 : 0);
                var dOyDlyj = (tjy < tiy ? 1 : 0) - (bjy > biy ? 1 : 0);
                grad[i * 2] += wLL * dspx2 * dOxDlxi * spy2;
                grad[j * 2] += wLL * dspx2 * dOxDlxj * spy2;
                grad[i * 2 + 1] += wLL * spx2 * dspy2 * dOyDlyi;
                grad[j * 2 + 1] += wLL * spx2 * dspy2 * dOyDlyj;
            }
        }
        return wPull * pull + wLL * ll + wLD * ld;
    }

    function clampCentersToBounds(theta, halfW, halfH, bounds, n) {
        var xMin = bounds.xMin, xMax = bounds.xMax, yMin = bounds.yMin, yMax = bounds.yMax;
        for (var i = 0; i < n; i++) {
            var w = halfW[i], h = halfH[i];
            theta[i * 2] = clamp(theta[i * 2], xMin + w, xMax - w);
            theta[i * 2 + 1] = clamp(theta[i * 2 + 1], yMin + h, yMax - h);
        }
    }

    /**
     * @param {{x:number,y:number,text?:string}[]} points
     * @param {{xMin:number,xMax:number,yMin:number,yMax:number}} bounds
     * @param {number} plotInnerWidth
     * @param {number} plotInnerHeight
     * @param {object} [userOpts]
     * @returns {{x:number,y:number}[]}
     */
    function optimizeScatterLabels(points, bounds, plotInnerWidth, plotInnerHeight, userOpts) {
        var opts = userOpts || {};
        if (!points || points.length === 0) return [];

        var fontSizePx = opts.fontSizePx != null ? opts.fontSizePx : 11;
        var markerSizePx = opts.markerSizePx != null ? opts.markerSizePx : 12;
        var nudgeFracX = opts.nudgeFracX != null ? opts.nudgeFracX : 0.03;
        var wPull = opts.wPull != null ? opts.wPull : 0.02;
        var wLL = opts.wLL != null ? opts.wLL : 2.5;
        var wLD = opts.wLD != null ? opts.wLD : 1.2;
        var dotScale = opts.dotScale != null ? opts.dotScale : 1.4;
        var gapPx = opts.gapPx != null ? opts.gapPx : 8;
        var smoothEps = opts.smoothEps != null ? opts.smoothEps : 2e-3;

        // --- Scale normalization (makes the optimizer scale-invariant) ---
        // The Adam step size (lr) and smoothEps are absolute data-unit constants tuned for
        // coordinates of order ~10-100 (e.g. PCA scores). For data with very small coordinates
        // (e.g. PCoA on Bray-Curtis distances, spans ~0.1-1), a step of lr=0.32 data units is
        // larger than the whole plot, so labels get flung to the axis bounds and end up far from
        // their points (long leader lines). Rescaling every input to a canonical span before
        // optimizing, then mapping results back, keeps placement quality identical regardless of
        // the coordinate magnitude.
        var TARGET_SPAN = 100;
        var _sx = Math.max(Math.abs(bounds.xMax - bounds.xMin), 1e-12);
        var _sy = Math.max(Math.abs(bounds.yMax - bounds.yMin), 1e-12);
        var normK = TARGET_SPAN / Math.sqrt(_sx * _sy);
        if (!isFinite(normK) || normK <= 0) normK = 1;
        if (normK !== 1) {
            points = points.map(function (p) { return { x: p.x * normK, y: p.y * normK, text: p.text }; });
            bounds = {
                xMin: bounds.xMin * normK, xMax: bounds.xMax * normK,
                yMin: bounds.yMin * normK, yMax: bounds.yMax * normK
            };
        }

        var xMin = bounds.xMin, xMax = bounds.xMax, yMin = bounds.yMin, yMax = bounds.yMax;
        var dataW = Math.max(xMax - xMin, 1e-6);
        var dataH = Math.max(yMax - yMin, 1e-6);
        var dataPerPxX = dataW / Math.max(1, plotInnerWidth);
        var dataPerPxY = dataH / Math.max(1, plotInnerHeight);
        var gapX = gapPx * dataPerPxX;
        var gapY = gapPx * dataPerPxY;

        var boxes = estimateLabelBoxes(points, bounds, plotInnerWidth, plotInnerHeight, {
            fontSizePx: fontSizePx,
            fontFamily: opts.fontFamily,
            padPx: opts.padPx,
            minHalfWFrac: opts.minHalfWFrac,
            lineHeightPx: opts.lineHeightPx
        });
        var halfW = boxes.halfW;
        var halfH = boxes.halfH;
        var n = points.length;

        var nudgeRight = dataW * nudgeFracX;
        var anchorX = new Array(n);
        var anchorY = new Array(n);
        var theta = new Array(2 * n);
        for (var i = 0; i < n; i++) {
            anchorX[i] = points[i].x + nudgeRight;
            anchorY[i] = points[i].y;
            theta[i * 2] = anchorX[i];
            theta[i * 2 + 1] = anchorY[i];
        }
        clampCentersToBounds(theta, halfW, halfH, bounds, n);

        var markerPx = typeof markerSizePx === 'number' ? markerSizePx : 12;
        var dotHalfW = (markerPx / 2) * dataPerPxX;
        var dotHalfH = (markerPx / 2) * dataPerPxY;

        var steps = opts.steps != null ? opts.steps : (n <= 45 ? 130 : n <= 90 ? 85 : 65);
        var lr0 = opts.lr != null ? opts.lr : 0.32;
        var beta1 = 0.9, beta2 = 0.999, epsAdam = 1e-8;
        var m = new Array(2 * n).fill(0);
        var v = new Array(2 * n).fill(0);
        var workTheta = theta.slice();
        var g = new Array(2 * n);
        var tStep = 0;

        for (var s = 0; s < steps; s++) {
            tStep++;
            energyAndGrad(theta, points, anchorX, anchorY, halfW, halfH, dotHalfW, dotHalfH, dotScale, wPull, wLL, wLD, smoothEps, gapX, gapY, n, g);

            var lr = lr0 * Math.pow(0.985, s);
            for (var kk = 0; kk < 2 * n; kk++) {
                m[kk] = beta1 * m[kk] + (1 - beta1) * g[kk];
                v[kk] = beta2 * v[kk] + (1 - beta2) * g[kk] * g[kk];
                var mhat = m[kk] / (1 - Math.pow(beta1, tStep));
                var vhat = v[kk] / (1 - Math.pow(beta2, tStep));
                workTheta[kk] = theta[kk] - lr * mhat / (Math.sqrt(vhat) + epsAdam);
            }
            for (var c = 0; c < 2 * n; c++) theta[c] = workTheta[c];
            clampCentersToBounds(theta, halfW, halfH, bounds, n);
        }

        var out = new Array(n);
        var invK = normK !== 1 ? 1 / normK : 1;
        for (var ii = 0; ii < n; ii++) {
            out[ii] = { x: theta[ii * 2] * invK, y: theta[ii * 2 + 1] * invK };
        }
        return out;
    }

    /**
     * Drop-in replacement for legacy repelLabels (adds fontSizePx for accurate box sizes).
     * @param {{x:number,y:number,text?:string}[]} points
     * @param {{xMin:number,xMax:number,yMin:number,yMax:number}} bounds
     * @param {number} plotInnerWidth
     * @param {number} plotInnerHeight
     * @param {number} [markerSizePx]
     * @param {number} [fontSizePx]
     * @param {object} [extraOpts] merged into optimizer opts
     */
    function repelLabelsCompat(points, bounds, plotInnerWidth, plotInnerHeight, markerSizePx, fontSizePx, extraOpts) {
        if (!points || !points.length) return [];
        var fs = fontSizePx != null && fontSizePx > 0 ? fontSizePx : 11;
        var merged = Object.assign({ fontSizePx: fs, markerSizePx: markerSizePx }, extraOpts || {});
        return optimizeScatterLabels(points, bounds, plotInnerWidth, plotInnerHeight, merged);
    }

    var api = {
        measureLabelWidthsPx: measureLabelWidthsPx,
        computeFullSpanProduct: computeFullSpanProduct,
        computeMaxLabelCount: computeMaxLabelCount,
        estimateLabelBoxes: estimateLabelBoxes,
        optimizeScatterLabels: optimizeScatterLabels,
        repelLabelsCompat: repelLabelsCompat
    };

    global.ScatterLabelOptimize = api;
})(typeof window !== 'undefined' ? window : this);
