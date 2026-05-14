/* ============================================================
   hand-tracking.js — MediaPipe Hands Integration
   ============================================================
   Handles:
   - Webcam stream initialization
   - MediaPipe Hands model loading & landmark detection
   - Hand skeleton rendering on overlay canvas
   - Pinch gesture detection (thumb tip ↔ index tip)
   - Air drawing via pinch → CanvasManager external API
   - Small sidebar webcam preview feed
   ============================================================ */

const HandTracker = (() => {

    // ---- Internal State ----
    let hands = null;
    let camera = null;
    let videoEl = null;
    let overlayCanvas = null;
    let overlayCtx = null;
    let isRunning = false;
    let handDetected = false;

    // ---- Pinch State ----
    let isPinching = false;
    let wasPinching = false;
    const PINCH_THRESHOLD = 0.055;    // normalized distance to trigger pinch
    const RELEASE_THRESHOLD = 0.075;  // hysteresis — need to open more to release

    // ---- Landmark Indices ----
    const THUMB_TIP = 4;
    const INDEX_TIP = 8;
    const INDEX_MCP = 5;

    // ---- Drawing Style ----
    const HAND_CONNECTIONS = [
        [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
        [0, 5], [5, 6], [6, 7], [7, 8],       // index
        [0, 9], [9, 10], [10, 11], [11, 12],  // middle
        [0, 13], [13, 14], [14, 15], [15, 16],// ring
        [0, 17], [17, 18], [18, 19], [19, 20],// pinky
        [5, 9], [9, 13], [13, 17]           // palm
    ];

    /* ----------------------------------------------------------
       Initialization
    ---------------------------------------------------------- */
    function init() {
        videoEl = document.getElementById('webcam-video');
        overlayCanvas = document.getElementById('canvas-overlay');
        overlayCtx = overlayCanvas.getContext('2d');

        console.log('✅ HandTracker initialized (awaiting start)');
    }

    /* ----------------------------------------------------------
       Start Hand Tracking
    ---------------------------------------------------------- */
    async function start() {
        if (isRunning) return;

        try {
            updateFooterStatus('Loading MediaPipe Hands...');

            // Initialize MediaPipe Hands
            hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });

            hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: 0.7,
                minTrackingConfidence: 0.6,
            });

            hands.onResults(onResults);

            // Start webcam
            await startCamera();

            isRunning = true;
            updateFooterStatus('Hand tracking active');
            Utils.showToast('Camera & hand tracking started', 'success');
            console.log('🎥 Hand tracking started');

        } catch (err) {
            console.error('Failed to start hand tracking:', err);
            Utils.showToast('Failed to start camera: ' + err.message, 'error');
            updateFooterStatus('Camera error');
        }
    }

    /* ----------------------------------------------------------
       Stop Hand Tracking
    ---------------------------------------------------------- */
    function stop() {
        if (camera) {
            camera.stop();
            camera = null;
        }

        if (videoEl) {
            videoEl.srcObject = null;
            videoEl.style.display = 'none';
        }

        // Show placeholder again
        const placeholder = document.getElementById('webcam-placeholder');
        if (placeholder) placeholder.style.display = '';

        // Clear overlay
        if (overlayCtx && overlayCanvas) {
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }

        // End any active air stroke
        if (isPinching) {
            CanvasManager.externalEndStroke();
            isPinching = false;
        }

        isRunning = false;
        handDetected = false;
        updateFooterStatus('Ready');
        updateStatusDot(false);
        console.log('🛑 Hand tracking stopped');
    }

    /* ----------------------------------------------------------
       Camera Setup
    ---------------------------------------------------------- */
    async function startCamera() {
        // Hide placeholder, show video
        const placeholder = document.getElementById('webcam-placeholder');
        if (placeholder) placeholder.style.display = 'none';
        videoEl.style.display = 'block';

        camera = new Camera(videoEl, {
            onFrame: async () => {
                if (hands && isRunning) {
                    await hands.send({ image: videoEl });
                }
            },
            width: 640,
            height: 480,
            facingMode: 'user'
        });

        await camera.start();
    }

    /* ----------------------------------------------------------
       MediaPipe Results Handler
    ---------------------------------------------------------- */
    function onResults(results) {
        if (!overlayCanvas || !overlayCtx) return;

        const cw = overlayCanvas.width;
        const ch = overlayCanvas.height;

        // Clear the overlay
        overlayCtx.clearRect(0, 0, cw, ch);

        // Only process in Air Draw mode
        if (App.state.mode !== 'air') {
            // If pinching was active, end it
            if (isPinching) {
                CanvasManager.externalEndStroke();
                isPinching = false;
                wasPinching = false;
            }
            return;
        }

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];

            if (!handDetected) {
                handDetected = true;
                updateStatusDot(true);
            }

            // Draw hand skeleton on overlay
            drawHandSkeleton(landmarks, cw, ch);

            // Detect pinch gesture
            handlePinchGesture(landmarks, cw, ch);

        } else {
            // No hand detected
            if (handDetected) {
                handDetected = false;
                updateStatusDot(false);
            }

            // End stroke if pinching was active
            if (isPinching) {
                CanvasManager.externalEndStroke();
                isPinching = false;
                wasPinching = false;
            }
        }
    }

    /* ----------------------------------------------------------
       Draw Hand Skeleton
    ---------------------------------------------------------- */
    function drawHandSkeleton(landmarks, cw, ch) {
        // Draw connections
        overlayCtx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
        overlayCtx.lineWidth = 2;

        for (const [i, j] of HAND_CONNECTIONS) {
            const a = landmarks[i];
            const b = landmarks[j];
            // Mirror X for selfie view
            const ax = (1 - a.x) * cw;
            const ay = a.y * ch;
            const bx = (1 - b.x) * cw;
            const by = b.y * ch;

            overlayCtx.beginPath();
            overlayCtx.moveTo(ax, ay);
            overlayCtx.lineTo(bx, by);
            overlayCtx.stroke();
        }

        // Draw landmark dots
        for (let i = 0; i < landmarks.length; i++) {
            const lm = landmarks[i];
            const x = (1 - lm.x) * cw;
            const y = lm.y * ch;

            // Highlight thumb tip & index tip
            const isKeypoint = (i === THUMB_TIP || i === INDEX_TIP);
            const radius = isKeypoint ? 6 : 3;

            overlayCtx.beginPath();
            overlayCtx.arc(x, y, radius, 0, Math.PI * 2);

            if (i === THUMB_TIP) {
                overlayCtx.fillStyle = isPinching ? '#00e676' : '#ff9100';
            } else if (i === INDEX_TIP) {
                overlayCtx.fillStyle = isPinching ? '#00e676' : '#e040fb';
            } else {
                overlayCtx.fillStyle = 'rgba(0, 229, 255, 0.7)';
            }

            overlayCtx.fill();
        }

        // Draw pinch indicator line between thumb and index
        const thumb = landmarks[THUMB_TIP];
        const index = landmarks[INDEX_TIP];
        const tx = (1 - thumb.x) * cw;
        const ty = thumb.y * ch;
        const ix = (1 - index.x) * cw;
        const iy = index.y * ch;

        overlayCtx.beginPath();
        overlayCtx.moveTo(tx, ty);
        overlayCtx.lineTo(ix, iy);
        overlayCtx.strokeStyle = isPinching ? 'rgba(0, 230, 118, 0.8)' : 'rgba(255, 145, 0, 0.5)';
        overlayCtx.lineWidth = isPinching ? 3 : 1.5;
        overlayCtx.setLineDash(isPinching ? [] : [4, 4]);
        overlayCtx.stroke();
        overlayCtx.setLineDash([]);

        // Draw pinch midpoint (drawing cursor)
        if (isPinching) {
            const mx = (tx + ix) / 2;
            const my = (ty + iy) / 2;

            // Outer glow
            overlayCtx.beginPath();
            overlayCtx.arc(mx, my, 12, 0, Math.PI * 2);
            overlayCtx.fillStyle = 'rgba(0, 230, 118, 0.15)';
            overlayCtx.fill();

            // Inner dot
            overlayCtx.beginPath();
            overlayCtx.arc(mx, my, 5, 0, Math.PI * 2);
            overlayCtx.fillStyle = '#00e676';
            overlayCtx.fill();
        }
    }

    /* ----------------------------------------------------------
       Pinch Gesture Detection & Drawing
    ---------------------------------------------------------- */
    function handlePinchGesture(landmarks, cw, ch) {
        const thumb = landmarks[THUMB_TIP];
        const index = landmarks[INDEX_TIP];

        // Calculate normalized distance between thumb and index tips
        const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y, (thumb.z - index.z) * 0.5);

        // Drawing point = midpoint of thumb & index (mirrored for selfie)
        const drawX = (1 - (thumb.x + index.x) / 2) * cw;
        const drawY = ((thumb.y + index.y) / 2) * ch;
        const point = { x: drawX, y: drawY };

        // Update status bar coords
        const coordsEl = document.getElementById('status-coords');
        if (coordsEl) {
            coordsEl.textContent = `x: ${Math.round(drawX)}  y: ${Math.round(drawY)}`;
        }

        // Hysteresis-based pinch detection
        if (!isPinching && dist < PINCH_THRESHOLD) {
            // Start pinch → start drawing
            isPinching = true;
            wasPinching = true;
            CanvasManager.externalStartStroke(point, App.state.color, App.state.size);

        } else if (isPinching && dist > RELEASE_THRESHOLD) {
            // Release pinch → end drawing
            isPinching = false;
            CanvasManager.externalEndStroke();

        } else if (isPinching) {
            // Continue drawing
            CanvasManager.externalContinueStroke(point);
        }
    }

    /* ----------------------------------------------------------
       UI Helpers
    ---------------------------------------------------------- */
    function updateStatusDot(active) {
        const dot = document.getElementById('status-dot');
        const footerDot = document.getElementById('footer-status-dot');
        if (dot) {
            dot.classList.toggle('inactive', !active);
        }
        if (footerDot) {
            footerDot.classList.toggle('inactive', !active);
        }
    }

    function updateFooterStatus(text) {
        const el = document.getElementById('footer-status-text');
        if (el) el.textContent = text;
    }

    /* ----------------------------------------------------------
       Getters
    ---------------------------------------------------------- */
    function getIsRunning() { return isRunning; }
    function getHandDetected() { return handDetected; }
    function getIsPinching() { return isPinching; }

    /* ----------------------------------------------------------
       Public API
    ---------------------------------------------------------- */
    return {
        init,
        start,
        stop,
        getIsRunning,
        getHandDetected,
        getIsPinching,
    };

})();
