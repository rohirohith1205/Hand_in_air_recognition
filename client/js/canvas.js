/* ============================================================
   canvas.js — Drawing Canvas Manager
   ============================================================
   Handles:
   - Mouse / touch drawing (Scribble mode)
   - Stroke history with undo / redo
   - Clear, save to localStorage, download as PNG
   - Eraser tool support
   - Smooth quadratic curve rendering
   ============================================================ */

const CanvasManager = (() => {

    // ---- Internal State ----
    let canvas, ctx;
    let overlayCanvas, overlayCtx;
    let isDrawing = false;
    let currentStroke = [];        // points of current stroke
    let strokes = [];              // completed strokes history
    let redoStack = [];            // redo buffer
    let lastPoint = null;

    // ---- Options (synced from App.state) ----
    let color = '#00e5ff';
    let size = 4;
    let tool = 'draw';            // 'draw' | 'erase'

    // ---- Constants ----
    const SMOOTHING = 0.3;         // curve tension
    const MIN_DISTANCE = 2;        // min px between points to record

    /* ----------------------------------------------------------
       Initialization
    ---------------------------------------------------------- */
    function init() {
        canvas = document.getElementById('canvas-main');
        ctx = canvas.getContext('2d');
        overlayCanvas = document.getElementById('canvas-overlay');
        overlayCtx = overlayCanvas.getContext('2d');

        // Size canvases to container
        resize();

        // Attach event listeners
        attachMouseEvents();
        attachTouchEvents();

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);

        console.log('✅ CanvasManager initialized');
    }

    /* ----------------------------------------------------------
       Resize — match canvas to container
    ---------------------------------------------------------- */
    function resize() {
        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);

        // Store existing image data before resizing
        let imageData = null;
        if (canvas.width > 0 && canvas.height > 0) {
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

        canvas.width = w;
        canvas.height = h;
        overlayCanvas.width = w;
        overlayCanvas.height = h;

        // Configure context defaults
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Restore image data if it existed
        if (imageData) {
            ctx.putImageData(imageData, 0, 0);
        }

        // Redraw all strokes (more reliable than putImageData on resize)
        redrawAllStrokes();
    }

    /* ----------------------------------------------------------
       Mouse Events
    ---------------------------------------------------------- */
    function attachMouseEvents() {
        canvas.addEventListener('mousedown', (e) => {
            if (App.state.mode !== 'scribble') return;
            startStroke(getCanvasPoint(e));
        });

        canvas.addEventListener('mousemove', (e) => {
            // Update coord display
            updateCoords(getCanvasPoint(e));
            if (!isDrawing || App.state.mode !== 'scribble') return;
            continueStroke(getCanvasPoint(e));
        });

        canvas.addEventListener('mouseup', () => {
            if (App.state.mode !== 'scribble') return;
            endStroke();
        });

        canvas.addEventListener('mouseleave', () => {
            if (isDrawing && App.state.mode === 'scribble') endStroke();
        });
    }

    /* ----------------------------------------------------------
       Touch Events
    ---------------------------------------------------------- */
    function attachTouchEvents() {
        canvas.addEventListener('touchstart', (e) => {
            if (App.state.mode !== 'scribble') return;
            e.preventDefault();
            const touch = e.touches[0];
            startStroke(getCanvasPointFromTouch(touch));
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            if (!isDrawing || App.state.mode !== 'scribble') return;
            e.preventDefault();
            const touch = e.touches[0];
            const point = getCanvasPointFromTouch(touch);
            updateCoords(point);
            continueStroke(point);
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            if (App.state.mode !== 'scribble') return;
            e.preventDefault();
            endStroke();
        }, { passive: false });

        canvas.addEventListener('touchcancel', () => {
            if (isDrawing) endStroke();
        });
    }

    /* ----------------------------------------------------------
       Coordinate Helpers
    ---------------------------------------------------------- */
    function getCanvasPoint(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    function getCanvasPointFromTouch(touch) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };
    }

    function updateCoords(point) {
        const el = document.getElementById('status-coords');
        if (el) el.textContent = `x: ${Math.round(point.x)}  y: ${Math.round(point.y)}`;
    }

    /* ----------------------------------------------------------
       Drawing — Core Stroke Logic
    ---------------------------------------------------------- */
    function startStroke(point) {
        isDrawing = true;
        lastPoint = point;
        currentStroke = [point];
        redoStack = []; // clear redo on new stroke

        // Sync options from App state
        color = App.state.color;
        size = App.state.size;
        tool = App.state.tool;

        // Hide placeholder
        const placeholder = document.getElementById('canvas-placeholder');
        if (placeholder) placeholder.classList.add('hidden');

        // Begin path
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);

        if (tool === 'erase') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = size * 4; // eraser is bigger
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
        }

        // Draw a dot for single clicks
        ctx.fillStyle = tool === 'erase' ? 'rgba(0,0,0,1)' : color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, (tool === 'erase' ? size * 2 : size / 2), 0, Math.PI * 2);
        ctx.fill();
    }

    function continueStroke(point) {
        if (!isDrawing) return;

        // Only add point if moved enough (reduces noise, improves perf)
        const dist = Utils.distance(lastPoint, point);
        if (dist < MIN_DISTANCE) return;

        currentStroke.push(point);

        // Smooth quadratic bezier
        const midX = (lastPoint.x + point.x) / 2;
        const midY = (lastPoint.y + point.y) / 2;

        if (tool === 'erase') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = size * 4;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
        }

        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midX, midY);
        ctx.stroke();

        lastPoint = point;

        // Draw eraser cursor on overlay
        if (tool === 'erase') {
            drawEraserCursor(point);
        }
    }

    function endStroke() {
        if (!isDrawing) return;
        isDrawing = false;

        if (currentStroke.length > 0) {
            // Save stroke to history
            strokes.push({
                points: [...currentStroke],
                color: color,
                size: size,
                tool: tool
            });
        }

        currentStroke = [];
        lastPoint = null;
        ctx.globalCompositeOperation = 'source-over';

        // Clear eraser cursor
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }

    /**
     * Draw a single stroke from recorded data  
     */
    function drawStroke(stroke) {
        if (!stroke.points || stroke.points.length === 0) return;

        if (stroke.tool === 'erase') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = stroke.size * 4;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.size;
        }

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const pts = stroke.points;

        if (pts.length === 1) {
            // Single point → draw a dot
            ctx.fillStyle = stroke.tool === 'erase' ? 'rgba(0,0,0,1)' : stroke.color;
            ctx.beginPath();
            ctx.arc(pts[0].x, pts[0].y, (stroke.tool === 'erase' ? stroke.size * 2 : stroke.size / 2), 0, Math.PI * 2);
            ctx.fill();
            return;
        }

        // Draw smooth curves through points
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);

        for (let i = 1; i < pts.length; i++) {
            const midX = (pts[i - 1].x + pts[i].x) / 2;
            const midY = (pts[i - 1].y + pts[i].y) / 2;
            ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, midX, midY);
        }

        // Last segment
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();

        ctx.globalCompositeOperation = 'source-over';
    }

    /**
     * Redraw all strokes (used after clear/undo/resize)
     */
    function redrawAllStrokes() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const stroke of strokes) {
            drawStroke(stroke);
        }
    }

    /* ----------------------------------------------------------
       Eraser Cursor Overlay
    ---------------------------------------------------------- */
    function drawEraserCursor(point) {
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        overlayCtx.beginPath();
        overlayCtx.arc(point.x, point.y, size * 2, 0, Math.PI * 2);
        overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        overlayCtx.lineWidth = 1;
        overlayCtx.stroke();
    }

    /* ----------------------------------------------------------
       Undo / Redo
    ---------------------------------------------------------- */
    function undo() {
        if (strokes.length === 0) {
            Utils.showToast('Nothing to undo', 'info');
            return;
        }
        const stroke = strokes.pop();
        redoStack.push(stroke);
        redrawAllStrokes();
        Utils.showToast('Undo', 'info');
    }

    function redo() {
        if (redoStack.length === 0) {
            Utils.showToast('Nothing to redo', 'info');
            return;
        }
        const stroke = redoStack.pop();
        strokes.push(stroke);
        drawStroke(stroke);
        Utils.showToast('Redo', 'info');
    }

    /* ----------------------------------------------------------
       Clear Canvas
    ---------------------------------------------------------- */
    function clear() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        strokes = [];
        redoStack = [];
        currentStroke = [];

        // Show placeholder again
        const placeholder = document.getElementById('canvas-placeholder');
        if (placeholder) placeholder.classList.remove('hidden');
    }

    /* ----------------------------------------------------------
       Save to localStorage
    ---------------------------------------------------------- */
    function save() {
        try {
            const dataUrl = canvas.toDataURL('image/png');
            localStorage.setItem('handinair_canvas', dataUrl);
            localStorage.setItem('handinair_strokes', JSON.stringify(strokes));
            Utils.showToast('Canvas saved!', 'success');
        } catch (err) {
            Utils.showToast('Failed to save canvas', 'error');
            console.error('Save error:', err);
        }
    }

    /**
     * Load previously saved canvas
     */
    function loadSaved() {
        try {
            const savedStrokes = localStorage.getItem('handinair_strokes');
            if (savedStrokes) {
                strokes = JSON.parse(savedStrokes);
                redrawAllStrokes();
                if (strokes.length > 0) {
                    const placeholder = document.getElementById('canvas-placeholder');
                    if (placeholder) placeholder.classList.add('hidden');
                }
                Utils.showToast('Canvas restored', 'info');
            }
        } catch (err) {
            console.warn('Could not load saved canvas:', err);
        }
    }

    /* ----------------------------------------------------------
       Download as PNG
    ---------------------------------------------------------- */
    function download() {
        const link = document.createElement('a');
        link.download = `handinair_drawing_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        Utils.showToast('Drawing downloaded!', 'success');
    }

    /* ----------------------------------------------------------
       Keyboard Shortcuts
    ---------------------------------------------------------- */
    function handleKeyboard(e) {
        // Ctrl+Z → undo
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        // Ctrl+Shift+Z or Ctrl+Y → redo
        if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
            e.preventDefault();
            redo();
        }
        // Ctrl+S → save
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            save();
        }
    }

    /* ----------------------------------------------------------
       Public API: draw from external source (hand tracking)
    ---------------------------------------------------------- */

    /**
     * Called by HandTracker to start an air-drawn stroke
     */
    function externalStartStroke(point, strokeColor, strokeSize) {
        color = strokeColor || App.state.color;
        size = strokeSize || App.state.size;
        tool = 'draw';
        isDrawing = true;
        lastPoint = point;
        currentStroke = [point];
        redoStack = [];

        const placeholder = document.getElementById('canvas-placeholder');
        if (placeholder) placeholder.classList.add('hidden');

        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Called by HandTracker to continue an air-drawn stroke
     */
    function externalContinueStroke(point) {
        if (!isDrawing || !lastPoint) return;
        const dist = Utils.distance(lastPoint, point);
        if (dist < MIN_DISTANCE) return;

        currentStroke.push(point);

        const midX = (lastPoint.x + point.x) / 2;
        const midY = (lastPoint.y + point.y) / 2;

        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
        ctx.lineWidth = size;

        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midX, midY);
        ctx.stroke();

        lastPoint = point;
    }

    /**
     * Called by HandTracker to end an air-drawn stroke
     */
    function externalEndStroke() {
        endStroke();
    }

    /* ----------------------------------------------------------
       Getters
    ---------------------------------------------------------- */
    function getCanvas() { return canvas; }
    function getContext() { return ctx; }
    function getStrokes() { return strokes; }
    function isActive() { return isDrawing; }

    /* ----------------------------------------------------------
       Public API
    ---------------------------------------------------------- */
    return {
        init,
        resize,
        clear,
        undo,
        redo,
        save,
        loadSaved,
        download,
        getCanvas,
        getContext,
        getStrokes,
        isActive,
        // External drawing (for hand tracker)
        externalStartStroke,
        externalContinueStroke,
        externalEndStroke,
    };

})();
