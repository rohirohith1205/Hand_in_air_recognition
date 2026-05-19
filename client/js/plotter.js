/* ============================================================
   plotter.js — Graph Plotting Module (Step 8)
   ============================================================
   Handles:
   - Parsing mathematical expressions into plottable functions
   - Interactive graph rendering using Plotly.js
   - Multiple function plotting on same axes
   - Dark theme matching the app design
   - Zoom, pan, hover tooltips
   - Support for: polynomials, trig, exponential, log, etc.
   ============================================================ */

const Plotter = (() => {

    // ---- Configuration ----
    const CONFIG = {
        X_MIN: -10,
        X_MAX: 10,
        NUM_POINTS: 500,
        CONTAINER_ID: 'graph-area',
        COLORS: [
            '#00e5ff', // cyan
            '#7c4dff', // purple
            '#e040fb', // magenta
            '#ff4081', // pink
            '#00e676', // green
            '#448aff', // blue
            '#ff9100', // orange
            '#ffea00', // yellow
        ]
    };

    // ---- State ----
    let plotData = [];
    let plotCount = 0;
    let containerEl = null;
    let placeholderEl = null;
    let isPlotlyLoaded = false;


    /* ----------------------------------------------------------
       Initialization
    ---------------------------------------------------------- */

    function init() {
        containerEl = document.getElementById(CONFIG.CONTAINER_ID);
        placeholderEl = document.getElementById('graph-placeholder');

        isPlotlyLoaded = typeof Plotly !== 'undefined';

        if (!isPlotlyLoaded) {
            console.warn('Plotter: Plotly.js not loaded — graphs will not be available');
        }

        console.log('📊 Plotter: Initialized', isPlotlyLoaded ? '(Plotly ready)' : '(Plotly not loaded)');
    }


    /* ----------------------------------------------------------
       Expression Parsing
    ---------------------------------------------------------- */

    /**
     * Parse a math expression string into a JS-evaluable function.
     * Supports: x, sin, cos, tan, sqrt, log, ln, exp, abs, pi, e
     *
     * @param {string} expr - Expression like "x^2 + 3*x - 5"
     * @returns {Function|null} A function that takes x and returns y
     */
    function parseExpression(expr) {
        if (!expr || expr.trim() === '') return null;

        let fn = expr.trim();

        // Remove "y=" or "f(x)=" prefix
        fn = fn.replace(/^[yf]\s*\(?\s*x?\s*\)?\s*=\s*/i, '');

        // Replace math functions
        fn = fn.replace(/\bsin\b/gi, 'Math.sin');
        fn = fn.replace(/\bcos\b/gi, 'Math.cos');
        fn = fn.replace(/\btan\b/gi, 'Math.tan');
        fn = fn.replace(/\bsqrt\b/gi, 'Math.sqrt');
        fn = fn.replace(/\blog\b/gi, 'Math.log10');
        fn = fn.replace(/\bln\b/gi, 'Math.log');
        fn = fn.replace(/\bexp\b/gi, 'Math.exp');
        fn = fn.replace(/\babs\b/gi, 'Math.abs');
        fn = fn.replace(/\bfloor\b/gi, 'Math.floor');
        fn = fn.replace(/\bceil\b/gi, 'Math.ceil');

        // Replace constants
        fn = fn.replace(/\bpi\b/gi, 'Math.PI');
        fn = fn.replace(/\be\b/g, 'Math.E');

        // Replace ^ with **
        fn = fn.replace(/\^/g, '**');

        // Handle implicit multiplication: 2x → 2*x, x( → x*(
        fn = fn.replace(/(\d)([a-zA-Z(])/g, '$1*$2');
        fn = fn.replace(/([a-zA-Z)])(\d)/g, '$1*$2');
        fn = fn.replace(/\)(\()/g, ')*(');
        fn = fn.replace(/([a-zA-Z])\(/g, '$1*(');

        try {
            // Test that it's a valid function
            const testFn = new Function('x', `"use strict"; return (${fn});`);
            testFn(1); // Test with x=1
            return testFn;
        } catch (err) {
            console.error('Plotter: Invalid expression:', expr, err.message);
            return null;
        }
    }

    /**
     * Generate x,y data points for a function.
     */
    function generatePoints(fn, xMin = CONFIG.X_MIN, xMax = CONFIG.X_MAX, numPoints = CONFIG.NUM_POINTS) {
        const xs = [];
        const ys = [];
        const step = (xMax - xMin) / numPoints;

        for (let i = 0; i <= numPoints; i++) {
            const x = xMin + i * step;
            try {
                const y = fn(x);
                if (typeof y === 'number' && isFinite(y) && Math.abs(y) < 1e10) {
                    xs.push(x);
                    ys.push(y);
                } else {
                    // Discontinuity — insert null for gap
                    xs.push(x);
                    ys.push(null);
                }
            } catch {
                xs.push(x);
                ys.push(null);
            }
        }

        return { xs, ys };
    }


    /* ----------------------------------------------------------
       Plotly Layout (Dark Theme)
    ---------------------------------------------------------- */

    /**
     * Get the dark-themed Plotly layout config.
     */
    function getLayout(title = '') {
        return {
            title: {
                text: title || '',
                font: { color: '#9196a8', size: 12, family: 'Inter, sans-serif' },
                x: 0.5,
                y: 0.98
            },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(10, 10, 22, 0.6)',
            font: {
                color: '#9196a8',
                family: 'JetBrains Mono, monospace',
                size: 10
            },
            xaxis: {
                color: '#555a6e',
                gridcolor: 'rgba(255,255,255,0.04)',
                zerolinecolor: 'rgba(255,255,255,0.1)',
                zerolinewidth: 1,
                linecolor: 'rgba(255,255,255,0.06)',
                tickfont: { size: 9, color: '#555a6e' }
            },
            yaxis: {
                color: '#555a6e',
                gridcolor: 'rgba(255,255,255,0.04)',
                zerolinecolor: 'rgba(255,255,255,0.1)',
                zerolinewidth: 1,
                linecolor: 'rgba(255,255,255,0.06)',
                tickfont: { size: 9, color: '#555a6e' }
            },
            margin: { l: 40, r: 20, t: 30, b: 35 },
            showlegend: plotData.length > 1,
            legend: {
                font: { color: '#9196a8', size: 9 },
                bgcolor: 'rgba(0,0,0,0)',
                x: 0.02,
                y: 0.98
            },
            hovermode: 'closest',
            dragmode: 'pan',
        };
    }

    /**
     * Get Plotly config options.
     */
    function getConfig() {
        return {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: [
                'select2d', 'lasso2d', 'autoScale2d', 'hoverClosestCartesian',
                'hoverCompareCartesian', 'toggleSpikelines'
            ],
            modeBarButtonsToAdd: [],
            scrollZoom: true
        };
    }


    /* ----------------------------------------------------------
       Plot Functions
    ---------------------------------------------------------- */

    /**
     * Plot a single expression.
     * @param {string} expr - Expression like "x^2" or "sin(x)"
     * @param {Object} options - { append, label, color }
     */
    function plot(expr, options = {}) {
        if (!isPlotlyLoaded) {
            Utils.showToast('Plotly.js not loaded — cannot plot', 'error');
            return false;
        }

        if (!containerEl) {
            console.error('Plotter: Container not found');
            return false;
        }

        const fn = parseExpression(expr);
        if (!fn) {
            Utils.showToast(`Invalid expression: ${expr}`, 'error');
            return false;
        }

        const { xs, ys } = generatePoints(fn);
        const color = options.color || CONFIG.COLORS[plotCount % CONFIG.COLORS.length];
        const label = options.label || expr;

        const trace = {
            x: xs,
            y: ys,
            type: 'scatter',
            mode: 'lines',
            name: label,
            line: {
                color: color,
                width: 2.5,
                shape: 'spline',
                smoothing: 0.8
            },
            hovertemplate: 'x: %{x:.2f}<br>y: %{y:.2f}<extra></extra>',
            connectgaps: false
        };

        if (options.append && plotData.length > 0) {
            plotData.push(trace);
        } else {
            plotData = [trace];
            plotCount = 0;
        }

        plotCount++;

        // Hide placeholder
        if (placeholderEl) {
            placeholderEl.style.display = 'none';
        }

        // Render
        Plotly.newPlot(containerEl, plotData, getLayout(), getConfig());

        Utils.showToast(`Plotted: ${label}`, 'success');
        console.log('📊 Plotter: Plotted', label);
        return true;
    }

    /**
     * Add another trace to the existing plot.
     */
    function addTrace(expr, label) {
        return plot(expr, { append: true, label });
    }

    /**
     * Clear the plot.
     */
    function clearPlot() {
        plotData = [];
        plotCount = 0;

        if (containerEl && isPlotlyLoaded) {
            Plotly.purge(containerEl);
        }

        if (placeholderEl) {
            placeholderEl.style.display = 'flex';
        }

        // Restore the placeholder HTML
        if (containerEl) {
            const existing = containerEl.querySelector('.graph-placeholder');
            if (!existing && placeholderEl) {
                containerEl.appendChild(placeholderEl);
            }
        }
    }

    /**
     * Plot from the expression builder / equation input.
     * Handles both "y=..." format and plain expressions.
     */
    function plotFromInput(input) {
        if (!input || input.trim() === '') {
            Utils.showToast('Nothing to plot — enter an expression first', 'error');
            return false;
        }

        let expr = input.trim();

        // Handle equation format: "y = x^2" → "x^2"
        expr = expr.replace(/^[yf]\s*\(?\s*x?\s*\)?\s*=\s*/i, '');

        // Handle "x = 3" (vertical line — not plottable as function)
        if (/^x\s*=\s*\d/.test(input.trim())) {
            Utils.showToast('Vertical lines (x = constant) are not supported', 'error');
            return false;
        }

        return plot(expr, { label: input.trim() });
    }


    /* ----------------------------------------------------------
       Quick Plot Presets
    ---------------------------------------------------------- */

    /**
     * Plot a preset function for demo purposes.
     */
    function plotPreset(preset) {
        const presets = {
            'quadratic': 'x^2',
            'cubic': 'x^3 - 3*x',
            'sine': 'sin(x)',
            'cosine': 'cos(x)',
            'tangent': 'tan(x)',
            'exponential': 'exp(x)',
            'logarithm': 'log(x)',
            'absolute': 'abs(x)',
            'reciprocal': '1/x',
            'sqrt': 'sqrt(x)',
        };

        const expr = presets[preset];
        if (expr) {
            plot(expr, { label: `y = ${expr}` });
        }
    }


    /* ----------------------------------------------------------
       Public API
    ---------------------------------------------------------- */

    console.log('📦 plotter.js loaded');

    return {
        init,
        plot,
        plotFromInput,
        addTrace,
        clearPlot,
        plotPreset,
        parseExpression,
        isReady: () => isPlotlyLoaded,
    };

})();
