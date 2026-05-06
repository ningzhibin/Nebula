/**
 * ScatterLabelOptimize — reusable label placement for 2D scatter plots (e.g. Plotly PCA / t-SNE).
 * Minimizes anchor distance + smooth overlap penalties (label–label, label–marker) using Adam
 * with finite-difference gradients (no SciPy/JAX).
 */
(function (global) {
    'use strict';

    var DEFAULT_FONT = 'Segoe UI, Roboto, Helvetica, Arial, sans-serif';

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

        var spanScale = Math.sqrt(Math.max(dataW * dataH, 1e-12));
        var fdEps = Math.max(1e-7, spanScale * 1e-4);

        var steps = opts.steps != null ? opts.steps : (n <= 45 ? 130 : n <= 90 ? 85 : 65);
        var lr0 = opts.lr != null ? opts.lr : 0.32;
        var beta1 = 0.9, beta2 = 0.999, epsAdam = 1e-8;
        var m = new Array(2 * n).fill(0);
        var v = new Array(2 * n).fill(0);
        var workTheta = theta.slice();
        var tStep = 0;

        for (var s = 0; s < steps; s++) {
            tStep++;
            var g = new Array(2 * n);
            for (var k = 0; k < 2 * n; k++) {
                theta[k] += fdEps;
                var ep = totalEnergy(theta, points, anchorX, anchorY, halfW, halfH, dotHalfW, dotHalfH, dotScale, wPull, wLL, wLD, smoothEps, gapX, gapY, n);
                theta[k] -= 2 * fdEps;
                var em = totalEnergy(theta, points, anchorX, anchorY, halfW, halfH, dotHalfW, dotHalfH, dotScale, wPull, wLL, wLD, smoothEps, gapX, gapY, n);
                theta[k] += fdEps;
                g[k] = (ep - em) / (2 * fdEps);
            }

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
        for (var ii = 0; ii < n; ii++) {
            out[ii] = { x: theta[ii * 2], y: theta[ii * 2 + 1] };
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
