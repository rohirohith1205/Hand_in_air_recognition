/* ============================================================
   app.js — Main Application Orchestrator (Steps 1-8)
   ============================================================
   Initializes UI, CanvasManager, HandTracker, Preprocessor,
   Recognition, ExpressionBuilder, Solver, and Plotter.
   ============================================================ */

const App = (() => {
    // ---- State ----
    const state = {
        mode: 'air',          // 'air' | 'scribble'
        tool: 'draw',         // 'draw' | 'erase'
        color: '#00e5ff',
        size: 4,
        isDrawing: false,
    };

    // ---- DOM Cache ----
    let els = {};

    /**
     * Cache commonly-used DOM elements
     */
    function cacheDom() {
        const { $, $$ } = Utils;
        els = {
            // Header
            modeAir: $('#btn-mode-air'),
            modeScribble: $('#btn-mode-scribble'),
            btnSave: $('#btn-save'),
            btnDownload: $('#btn-download'),
            btnUndo: $('#btn-undo'),
            btnRedo: $('#btn-redo'),
            btnUser: $('#btn-user'),

            // Left sidebar
            colorPicker: $('#color-picker'),
            sizePicker: $('#size-picker'),
            sizeLabel: $('#size-label'),
            toolDraw: $('#tool-draw'),
            toolErase: $('#tool-erase'),

            // Canvas
            canvasMain: $('#canvas-main'),
            canvasOverlay: $('#canvas-overlay'),
            placeholder: $('#canvas-placeholder'),
            statusDot: $('#status-dot'),
            statusMode: $('#status-mode'),
            statusSize: $('#status-size'),
            statusCoords: $('#status-coords'),

            // Right sidebar
            predictionChar: $('#prediction-char'),
            predictionConf: $('#prediction-confidence'),
            expressionDisp: $('#expression-display'),
            equationInput: $('#equation-input'),
            btnPredict: $('#btn-predict'),
            btnBackspace: $('#btn-backspace'),
            btnClearExpr: $('#btn-clear-expr'),
            btnSolve: $('#btn-solve'),
            btnPlot: $('#btn-plot'),
            btnStepsToggle: $('#btn-steps-toggle'),
            solutionResult: $('#solution-result'),
            solutionSteps: $('#solution-steps'),
            solutionPlaceholder: $('#solution-placeholder'),
            graphArea: $('#graph-area'),

            // Footer
            btnClearCanvas: $('#btn-clear-canvas'),
            footerDot: $('#footer-status-dot'),
            footerStatus: $('#footer-status-text'),

            // Modal
            authModal: $('#auth-modal'),
        };
    }

    /**
     * Initialize mode toggle
     */
    function initModeToggle() {
        els.modeAir.addEventListener('click', () => setMode('air'));
        els.modeScribble.addEventListener('click', () => setMode('scribble'));
    }

    function setMode(mode) {
        state.mode = mode;
        els.modeAir.classList.toggle('active', mode === 'air');
        els.modeScribble.classList.toggle('active', mode === 'scribble');
        els.statusMode.textContent = mode === 'air' ? 'AIR DRAW' : 'SCRIBBLE';

        // Toggle placeholder + cursor style
        if (mode === 'scribble') {
            els.placeholder.classList.add('hidden');
            els.canvasMain.style.cursor = 'crosshair';
            // Stop hand tracking when switching to scribble
            if (HandTracker.getIsRunning()) {
                HandTracker.stop();
            }
        } else {
            els.canvasMain.style.cursor = 'default';
            // Start hand tracking when switching to air draw
            if (!HandTracker.getIsRunning()) {
                HandTracker.start();
            }
        }

        Utils.showToast(`Switched to ${mode === 'air' ? 'Air Draw' : 'Scribble'} mode`, 'info');
    }

    /**
     * Initialize color picker
     */
    function initColorPicker() {
        els.colorPicker.addEventListener('click', (e) => {
            const swatch = e.target.closest('.color-swatch');
            if (!swatch) return;

            // Update active state
            els.colorPicker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');

            state.color = swatch.dataset.color;
        });
    }

    /**
     * Initialize size picker
     */
    function initSizePicker() {
        els.sizePicker.addEventListener('click', (e) => {
            const dot = e.target.closest('.size-dot');
            if (!dot) return;

            els.sizePicker.querySelectorAll('.size-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');

            state.size = parseInt(dot.dataset.size, 10);
            els.sizeLabel.textContent = `${state.size}px`;
            els.statusSize.textContent = `${state.size}px`;
        });
    }

    /**
     * Initialize tool toggle (draw / erase)
     */
    function initTools() {
        els.toolDraw.addEventListener('click', () => setTool('draw'));
        els.toolErase.addEventListener('click', () => setTool('erase'));
    }

    function setTool(tool) {
        state.tool = tool;
        els.toolDraw.classList.toggle('active', tool === 'draw');
        els.toolErase.classList.toggle('active', tool === 'erase');
        // Update cursor for eraser
        if (state.mode === 'scribble') {
            els.canvasMain.style.cursor = tool === 'erase' ? 'none' : 'crosshair';
        }
    }

    /**
     * Initialize header action buttons (Save, Download, Undo, Redo)
     */
    function initHeaderActions() {
        els.btnSave.addEventListener('click', () => CanvasManager.save());
        els.btnDownload.addEventListener('click', () => CanvasManager.download());
        els.btnUndo.addEventListener('click', () => CanvasManager.undo());
        els.btnRedo.addEventListener('click', () => CanvasManager.redo());
    }

    /**
     * Initialize footer actions
     */
    function initFooter() {
        els.btnClearCanvas.addEventListener('click', () => {
            CanvasManager.clear();
            Preprocessor.hideDebugPreview();
            Utils.showToast('Canvas cleared', 'success');
        });
    }

    /**
     * Initialize Predict button — runs preprocessing pipeline
     */
    function initPredictButton() {
        els.btnPredict.addEventListener('click', () => {
            const canvas = CanvasManager.getCanvas();
            const result = Preprocessor.processCanvas(canvas);

            if (!result) {
                Utils.showToast('Nothing to predict — draw something first!', 'error');
                return;
            }

            // Show the 28×28 debug preview
            Preprocessor.showDebugPreview(result.preview);

            // Step 5: Run AI prediction on the preprocessed image
            if (Recognition.isReady()) {
                const prediction = Recognition.predict(result.floatArray);
                if (prediction) {
                    Recognition.updatePredictionUI(prediction);

                    // Step 6: Add predicted character to expression
                    ExpressionBuilder.addChar(prediction.label, prediction.confidence);

                    console.log('🧠 Prediction:', prediction.label,
                        `(${(prediction.confidence * 100).toFixed(1)}%)`);
                    Utils.showToast(
                        `Predicted: ${prediction.label} (${(prediction.confidence * 100).toFixed(1)}%)`,
                        'success'
                    );

                    // Auto-clear canvas after capturing character
                    CanvasManager.clear();
                    Preprocessor.hideDebugPreview();
                }
            } else {
                Utils.showToast('AI Model not ready — train first!', 'error');
            }
        });
    }

    /**
     * Initialize expression control buttons (Backspace, Clear)
     */
    function initExpressionControls() {
        // Backspace button
        els.btnBackspace.addEventListener('click', () => {
            ExpressionBuilder.backspace();
        });

        // Clear expression button
        els.btnClearExpr.addEventListener('click', () => {
            ExpressionBuilder.clear();
        });
    }

    /**
     * Initialize Solve and Plot buttons (Steps 7 & 8)
     */
    function initSolvePlot() {
        // Solve button
        els.btnSolve.addEventListener('click', () => {
            // Get expression from the input field or expression builder
            const input = els.equationInput.value.trim()
                || ExpressionBuilder.getEvalString();

            if (!input) {
                Utils.showToast('Nothing to solve — enter an expression first!', 'error');
                return;
            }

            Solver.solve(input);
        });

        // Plot button
        els.btnPlot.addEventListener('click', () => {
            const input = els.equationInput.value.trim()
                || ExpressionBuilder.getEvalString();

            if (!input) {
                Utils.showToast('Nothing to plot — enter an expression first!', 'error');
                return;
            }

            Plotter.plotFromInput(input);
        });
    }

    /**
     * Initialize user/auth button
     */
    function initAuth() {
        els.btnUser.addEventListener('click', () => {
            els.authModal.classList.toggle('active');
        });

        // Close modal on overlay click
        els.authModal.addEventListener('click', (e) => {
            if (e.target === els.authModal) {
                els.authModal.classList.remove('active');
            }
        });
    }

    /**
     * Resize canvases to match container (delegates to CanvasManager)
     */
    function resizeCanvases() {
        CanvasManager.resize();
    }

    /**
     * Boot the application
     */
    function init() {
        cacheDom();
        initModeToggle();
        initColorPicker();
        initSizePicker();
        initTools();
        initHeaderActions();
        initFooter();
        initPredictButton();
        initExpressionControls();
        initSolvePlot();
        initAuth();

        // Initialize CanvasManager
        CanvasManager.init();

        // Initialize HandTracker
        HandTracker.init();

        // Initialize Recognition (TensorFlow.js AI)
        Recognition.init();

        // Initialize ExpressionBuilder (Step 6)
        ExpressionBuilder.init();

        // Initialize Solver (Step 7)
        Solver.init();

        // Initialize Plotter (Step 8)
        Plotter.init();

        // Try to restore previously saved drawing
        CanvasManager.loadSaved();

        // Auto-start hand tracking if in Air Draw mode
        if (state.mode === 'air') {
            // Slight delay so UI renders first
            setTimeout(() => HandTracker.start(), 500);
        }

        // Resize canvases on window resize
        window.addEventListener('resize', Utils.debounce(resizeCanvases, 150));

        // Render Lucide icons
        if (window.lucide) lucide.createIcons();

        console.log('🖐️ Hand-in-Air — App initialized (Steps 1-8 complete)');
        Utils.showToast('Hand-in-Air is ready!', 'success');
    }

    // ---- Start ----
    document.addEventListener('DOMContentLoaded', init);

    // Expose state & methods for modules
    return {
        state,
        setMode,
        setTool,
        resizeCanvases,
    };

})();
