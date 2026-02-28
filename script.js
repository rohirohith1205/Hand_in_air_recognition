/**
 * ══════════════════════════════════════════════════════════════
 *  Hand-in-Air — Air Writing Character Recognizer
 *  Main Application Script
 * ══════════════════════════════════════════════════════════════
 */

console.log("✋ Hand-in-Air — Air Writing Recognizer");

// ── DOM References ──────────────────────────────────────────
const DOM = {
    // Header
    modeToggle: document.getElementById('mode-toggle'),
    btnAirDraw: document.getElementById('btn-air-draw'),
    btnScribble: document.getElementById('btn-scribble'),
    btnSave: document.getElementById('btn-save'),
    btnDownload: document.getElementById('btn-download'),
    btnTheme: document.getElementById('btn-theme'),
    userAvatar: document.getElementById('user-avatar'),

    // Left sidebar
    colorPicker: document.getElementById('color-picker'),
    colorSwatches: document.querySelectorAll('.color-swatch'),
    sizePicker: document.getElementById('size-picker'),
    sizeDots: document.querySelectorAll('.size-dot'),
    currentSizeLabel: document.getElementById('current-size-label'),

    // Canvas
    canvasWrapper: document.getElementById('canvas-wrapper'),
    drawingCanvas: document.getElementById('drawing-canvas'),
    overlayCanvas: document.getElementById('overlay-canvas'),
    canvasPlaceholder: document.getElementById('canvas-placeholder'),
    statusIndicator: document.getElementById('status-indicator'),
    statusSize: document.getElementById('status-size'),

    // Webcam
    videoElement: document.getElementById('webcam-video'),
    videoPreview: document.getElementById('video-preview'),

    // Right sidebar
    predictionBody: document.getElementById('prediction-body'),
    btnSolve: document.getElementById('btn-solve'),
    btnPlot: document.getElementById('btn-plot'),
    solutionBody: document.getElementById('solution-body'),
    graphBody: document.getElementById('graph-body'),

    // Bottom bar
    bottomStatus: document.getElementById('bottom-status'),
    bottomSize: document.getElementById('bottom-size'),
    btnClear: document.getElementById('btn-clear-canvas'),
};

// Canvas contexts
const drawingCtx = DOM.drawingCanvas.getContext('2d');
const overlayCtx = DOM.overlayCanvas.getContext('2d');

// ── Application State ───────────────────────────────────────
const state = {
    mode: 'air-draw',       // 'air-draw' | 'scribble'
    currentColor: '#00e5ff',
    currentSize: 4,
    isDrawing: false,
    lastX: null,
    lastY: null,
    cameraReady: false,
    isDarkTheme: true,
};

// ── Canvas Sizing ───────────────────────────────────────────
function resizeCanvases() {
    const wrapper = DOM.canvasWrapper;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;

    // Save current drawing
    const imageData = drawingCtx.getImageData(0, 0, DOM.drawingCanvas.width, DOM.drawingCanvas.height);

    DOM.drawingCanvas.width = w;
    DOM.drawingCanvas.height = h;
    DOM.overlayCanvas.width = w;
    DOM.overlayCanvas.height = h;

    // Restore drawing
    drawingCtx.putImageData(imageData, 0, 0);
}

const resizeObserver = new ResizeObserver(() => resizeCanvases());
resizeObserver.observe(DOM.canvasWrapper);

// Initial sizing
setTimeout(resizeCanvases, 100);

// ── Color Picker ────────────────────────────────────────────
DOM.colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
        DOM.colorSwatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        state.currentColor = swatch.dataset.color;
    });
});

// ── Size Picker ─────────────────────────────────────────────
DOM.sizeDots.forEach(dot => {
    dot.addEventListener('click', () => {
        DOM.sizeDots.forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        state.currentSize = parseInt(dot.dataset.size, 10);

        // Update labels
        const label = `${state.currentSize}px`;
        DOM.currentSizeLabel.textContent = label;

        // Update status bar sizes
        DOM.statusSize.innerHTML = `<span class="status-dot pink"></span> ${label}`;
        DOM.bottomSize.innerHTML = `<span class="status-dot pink"></span> ${label}`;
    });
});

// ── Mode Toggle ─────────────────────────────────────────────
DOM.btnAirDraw.addEventListener('click', () => {
    state.mode = 'air-draw';
    DOM.btnAirDraw.classList.add('active');
    DOM.btnScribble.classList.remove('active');
});

DOM.btnScribble.addEventListener('click', () => {
    state.mode = 'scribble';
    DOM.btnScribble.classList.add('active');
    DOM.btnAirDraw.classList.remove('active');

    // Enable mouse/touch drawing on the canvas in scribble mode
    enableScribbleMode();
});

// ── Clear Canvas ────────────────────────────────────────────
DOM.btnClear.addEventListener('click', () => {
    drawingCtx.clearRect(0, 0, DOM.drawingCanvas.width, DOM.drawingCanvas.height);

    // Reset prediction
    DOM.predictionBody.innerHTML = '<p class="panel-placeholder">Draw to see prediction...</p>';
});

// ── Save / Download ─────────────────────────────────────────
DOM.btnSave.addEventListener('click', () => {
    const data = DOM.drawingCanvas.toDataURL('image/png');
    localStorage.setItem('hand-in-air-saved', data);
    showToast('Drawing saved!');
});

DOM.btnDownload.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'hand-in-air-drawing.png';
    link.href = DOM.drawingCanvas.toDataURL('image/png');
    link.click();
    showToast('Downloaded!');
});

// ── Toast Notification Helper ───────────────────────────────
function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '60px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 229, 255, 0.15)',
        border: '1px solid rgba(0, 229, 255, 0.3)',
        color: '#00e5ff',
        padding: '8px 20px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: '600',
        fontFamily: "'Inter', sans-serif",
        backdropFilter: 'blur(12px)',
        zIndex: '9999',
        animation: 'fade-in 0.3s ease',
    });
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ── Scribble Mode (mouse/touch drawing) ─────────────────────
let scribbleEnabled = false;

function enableScribbleMode() {
    if (scribbleEnabled) return;
    scribbleEnabled = true;

    const canvas = DOM.overlayCanvas;
    canvas.style.pointerEvents = 'auto';
    canvas.style.cursor = 'crosshair';

    let drawing = false;
    let lx = null, ly = null;

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    canvas.addEventListener('mousedown', (e) => {
        if (state.mode !== 'scribble') return;
        drawing = true;
        const pos = getPos(e);
        lx = pos.x; ly = pos.y;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!drawing || state.mode !== 'scribble') return;
        const pos = getPos(e);
        drawingCtx.beginPath();
        drawingCtx.moveTo(lx, ly);
        drawingCtx.lineTo(pos.x, pos.y);
        drawingCtx.strokeStyle = state.currentColor;
        drawingCtx.lineWidth = state.currentSize;
        drawingCtx.lineCap = 'round';
        drawingCtx.lineJoin = 'round';
        drawingCtx.stroke();
        lx = pos.x; ly = pos.y;
    });

    canvas.addEventListener('mouseup', () => { drawing = false; lx = null; ly = null; });
    canvas.addEventListener('mouseleave', () => { drawing = false; lx = null; ly = null; });

    // Touch
    canvas.addEventListener('touchstart', (e) => {
        if (state.mode !== 'scribble') return;
        e.preventDefault();
        drawing = true;
        const pos = getPos(e);
        lx = pos.x; ly = pos.y;
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        if (!drawing || state.mode !== 'scribble') return;
        e.preventDefault();
        const pos = getPos(e);
        drawingCtx.beginPath();
        drawingCtx.moveTo(lx, ly);
        drawingCtx.lineTo(pos.x, pos.y);
        drawingCtx.strokeStyle = state.currentColor;
        drawingCtx.lineWidth = state.currentSize;
        drawingCtx.lineCap = 'round';
        drawingCtx.lineJoin = 'round';
        drawingCtx.stroke();
        lx = pos.x; ly = pos.y;
    }, { passive: false });

    canvas.addEventListener('touchend', () => { drawing = false; lx = null; ly = null; });
}

// ── Solve Button (demo) ────────────────────────────────────
DOM.btnSolve.addEventListener('click', () => {
    DOM.predictionBody.innerHTML = '<p class="panel-placeholder" style="opacity:0.6;">Analyzing...</p>';

    setTimeout(() => {
        // Demo: show a random character
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const randomChar = chars.charAt(Math.floor(Math.random() * chars.length));
        DOM.predictionBody.innerHTML = `<span class="prediction-result">${randomChar}</span>`;

        // Demo solution steps
        DOM.solutionBody.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:8px;">
                <div class="panel-placeholder-row" style="color:var(--text-secondary);">
                    <span>1. Captured drawing strokes</span>
                </div>
                <div class="panel-placeholder-row" style="color:var(--text-secondary);">
                    <span>2. Preprocessed to 28×28 grid</span>
                </div>
                <div class="panel-placeholder-row" style="color:var(--text-secondary);">
                    <span>3. Fed to CNN model</span>
                </div>
                <div class="panel-placeholder-row" style="color:var(--cyan);">
                    <span>4. Prediction: <strong>${randomChar}</strong> (${(Math.random() * 30 + 70).toFixed(1)}% confidence)</span>
                </div>
            </div>
        `;
    }, 1200);
});

// ── Plot Button (demo) ─────────────────────────────────────
DOM.btnPlot.addEventListener('click', () => {
    const graphCanvas = document.createElement('canvas');
    graphCanvas.width = 280;
    graphCanvas.height = 120;
    const gCtx = graphCanvas.getContext('2d');

    // Draw a simple demo bar chart
    const bars = 8;
    const barWidth = 24;
    const gap = 8;
    const startX = 16;

    for (let i = 0; i < bars; i++) {
        const h = Math.random() * 80 + 20;
        const x = startX + i * (barWidth + gap);
        const y = 110 - h;

        const grad = gCtx.createLinearGradient(x, y, x, 110);
        grad.addColorStop(0, '#7c4dff');
        grad.addColorStop(1, '#448aff');
        gCtx.fillStyle = grad;
        gCtx.beginPath();
        gCtx.roundRect(x, y, barWidth, h, 4);
        gCtx.fill();
    }

    DOM.graphBody.innerHTML = '';
    DOM.graphBody.appendChild(graphCanvas);
    graphCanvas.style.width = '100%';
    graphCanvas.style.height = 'auto';
    graphCanvas.style.borderRadius = '8px';
});

// ══════════════════════════════════════════════════════════════
//  MEDIAPIPE HAND TRACKING
// ══════════════════════════════════════════════════════════════

// MediaPipe Hands setup
const hands = new Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,
    minDetectionConfidence: 0.4,
    minTrackingConfidence: 0.4,
});

hands.onResults(onResults);

// Camera setup
const camera = new Camera(DOM.videoElement, {
    onFrame: async () => {
        await hands.send({ image: DOM.videoElement });
    },
    width: 640,
    height: 480,
});

camera.start().then(() => {
    state.cameraReady = true;
    DOM.canvasPlaceholder.classList.add('hidden');
    updateStatus('READY', 'green');
}).catch(err => {
    console.warn('Camera not available:', err);
    updateStatus('NO CAMERA', 'orange');
});

// Distance helper
function distance(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

// Update status indicators
function updateStatus(text, color) {
    const dotClass = color === 'green' ? 'green' : 'pink';
    const statusHTML = `<span class="status-dot ${dotClass}"></span> ${text}`;

    DOM.statusIndicator.innerHTML = statusHTML;
    DOM.bottomStatus.innerHTML = statusHTML;

    if (color === 'green') {
        DOM.statusIndicator.style.color = 'var(--green)';
        DOM.bottomStatus.style.color = 'var(--green)';
    } else if (color === 'cyan') {
        DOM.statusIndicator.style.color = 'var(--cyan)';
        DOM.bottomStatus.style.color = 'var(--cyan)';
    } else {
        DOM.statusIndicator.style.color = 'var(--text-secondary)';
        DOM.bottomStatus.style.color = 'var(--text-secondary)';
    }
}

// Main results callback
function onResults(results) {
    overlayCtx.clearRect(0, 0, DOM.overlayCanvas.width, DOM.overlayCanvas.height);

    // No hand detected
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        state.isDrawing = false;
        state.lastX = null;
        state.lastY = null;

        if (state.mode === 'air-draw') {
            updateStatus('SHOW HAND', 'text');
        }
        return;
    }

    if (state.mode !== 'air-draw') return;

    const landmarks = results.multiHandLandmarks[0];

    // Draw skeleton on overlay
    drawConnectors(overlayCtx, landmarks, HAND_CONNECTIONS, {
        color: 'rgba(0, 229, 255, 0.4)',
        lineWidth: 2,
    });

    drawLandmarks(overlayCtx, landmarks, {
        color: 'rgba(124, 77, 255, 0.6)',
        fillColor: 'rgba(124, 77, 255, 0.3)',
        radius: 3,
    });

    // Get finger tips
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];

    // Convert coordinates (mirror corrected)
    const x = (1 - indexTip.x) * DOM.drawingCanvas.width;
    const y = indexTip.y * DOM.drawingCanvas.height;

    // Finger indicator dot
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, 8, 0, Math.PI * 2);
    const indicatorGrad = overlayCtx.createRadialGradient(x, y, 0, x, y, 12);
    indicatorGrad.addColorStop(0, state.currentColor);
    indicatorGrad.addColorStop(1, 'transparent');
    overlayCtx.fillStyle = indicatorGrad;
    overlayCtx.fill();

    // Outer glow
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, 14, 0, Math.PI * 2);
    overlayCtx.strokeStyle = state.currentColor;
    overlayCtx.lineWidth = 1.5;
    overlayCtx.globalAlpha = 0.5;
    overlayCtx.stroke();
    overlayCtx.globalAlpha = 1;

    // Detect pinch
    const pinchDist = distance(indexTip, thumbTip);

    if (pinchDist < 0.05) {
        state.isDrawing = true;
        updateStatus('DRAWING ✍️', 'cyan');

        // Stronger indicator when drawing
        overlayCtx.beginPath();
        overlayCtx.arc(x, y, 12, 0, Math.PI * 2);
        overlayCtx.fillStyle = state.currentColor;
        overlayCtx.globalAlpha = 0.6;
        overlayCtx.fill();
        overlayCtx.globalAlpha = 1;
    } else {
        state.isDrawing = false;
        state.lastX = null;
        state.lastY = null;
        updateStatus('READY', 'green');
    }

    // Draw on permanent canvas
    if (state.isDrawing) {
        if (state.lastX !== null) {
            drawingCtx.beginPath();
            drawingCtx.moveTo(state.lastX, state.lastY);
            drawingCtx.lineTo(x, y);
            drawingCtx.strokeStyle = state.currentColor;
            drawingCtx.lineWidth = state.currentSize;
            drawingCtx.lineCap = 'round';
            drawingCtx.lineJoin = 'round';
            drawingCtx.stroke();
        }
        state.lastX = x;
        state.lastY = y;
    }
}

// ── Initialize Lucide Icons ─────────────────────────────────
lucide.createIcons();

// ── Theme Toggle (demo) ─────────────────────────────────────
DOM.btnTheme.addEventListener('click', () => {
    state.isDarkTheme = !state.isDarkTheme;
    // For now just toggle an indicator; full light theme would be a larger overhaul
    showToast(state.isDarkTheme ? 'Dark mode' : 'Light mode (coming soon)');
});

console.log("✅ Hand-in-Air initialized");
