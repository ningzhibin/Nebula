/**
 * NebulaFonts — runtime accessor for the typography design tokens.
 *
 * css/font_tokens.css is the single source of truth for font families and
 * the --fs-* size scale. CSS consumes it via var(--font-*) / var(--fs-*);
 * JS APIs that need LITERAL strings (Plotly `font.family`, canvas text
 * measurement, exported HTML) must read them from window.NebulaFonts
 * instead of hardcoding stacks.
 *
 * Plain script (no modules) — loaded in index.html and the popout pages,
 * always AFTER css/font_tokens.css.
 */
(function (global) {
    'use strict';

    function cssVar(name, fallback) {
        try {
            var v = getComputedStyle(document.documentElement).getPropertyValue(name);
            v = String(v == null ? '' : v).trim();
            return v || fallback;
        } catch (e) {
            return fallback;
        }
    }

    global.NebulaFonts = {
        /** Body/figure text stack (e.g. `"IBM Plex Sans", "Segoe UI", system-ui, sans-serif`) */
        body: cssVar('--font-body', '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif'),
        /** Data/mono stack */
        mono: cssVar('--font-mono', '"IBM Plex Mono", ui-monospace, "SF Mono", Consolas, monospace'),
        /** Display/heading stack */
        display: cssVar('--font-display', 'Fraunces, Georgia, "Times New Roman", serif'),
        /**
         * Raw CSS custom-property value for a token (e.g. css('--fs-sm') → "12px").
         * Used to bake literal token values into standalone exported HTML.
         * @param {string} name  e.g. '--font-body', '--fs-sm'
         * @param {string} [fallback]
         */
        css: function (name, fallback) {
            try {
                var v = getComputedStyle(document.documentElement).getPropertyValue(name);
                v = String(v == null ? '' : v).trim();
                return v || (fallback || '');
            } catch (e) {
                return fallback || '';
            }
        },
        /**
         * Numeric size (px) for a scale step: NebulaFonts.fs('xs') → 11.
         * @param {string} step 2xs|xs|sm|md|lg|base|xl|2xl|3xl|4xl
         * @param {number} [fallbackPx]
         */
        fs: function (step, fallbackPx) {
            var v = cssVar('--fs-' + step, '');
            var n = v ? parseFloat(v) : NaN;
            return isFinite(n) ? n : (fallbackPx != null ? fallbackPx : NaN);
        }
    };
})(window);
