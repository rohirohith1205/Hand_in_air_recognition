console.log("Air Writing – Pinch Version ✍️");

// Elements
const videoElement = document.querySelector('.input_video');

const overlayCanvas = document.querySelector('.output_canvas');
const overlayCtx = overlayCanvas.getContext('2d');

const drawingCanvas = document.querySelector('.drawing_canvas');
const drawingCtx = drawingCanvas.getContext('2d');

const statusIndicator = document.querySelector('.status-indicator');

const clearBtn = document.getElementById('clear-btn');
const colorButtons = document.querySelectorAll('.color-btn');


// Drawing state
let lastX = null;
let lastY = null;
let isDrawing = false;
let currentColor = "#000000";
let lineWidth = 8;


// Resize canvases
function resizeCanvas() {
    overlayCanvas.width = window.innerWidth;
    overlayCanvas.height = window.innerHeight;

    drawingCanvas.width = window.innerWidth;
    drawingCanvas.height = window.innerHeight;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();


// Clear button
clearBtn.addEventListener("click", () => {
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
});


// Color picker
colorButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        colorButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentColor = btn.dataset.color;
    });
});


// MediaPipe Hands setup
const hands = new Hands({
    locateFile: file =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});


hands.setOptions({

    maxNumHands: 1,

    modelComplexity: 1,

    minDetectionConfidence: 0.5,

    minTrackingConfidence: 0.5

});


hands.onResults(onResults);


// Camera setup
const camera = new Camera(videoElement,
    {
        onFrame: async () => {
            await hands.send({ image: videoElement });
        },

        width: 640,
        height: 480
    });


camera.start().then(() => {
    statusIndicator.textContent = "Camera Ready";
});


// Distance function
function distance(a, b) {
    return Math.sqrt(
        Math.pow(a.x - b.x, 2) +
        Math.pow(a.y - b.y, 2)
    );
}


// Main loop
function onResults(results) {
    overlayCtx.clearRect(
        0,
        0,
        overlayCanvas.width,
        overlayCanvas.height
    );


    // If no hand → reset drawing
    if (!results.multiHandLandmarks) {
        isDrawing = false;
        lastX = null;
        lastY = null;

        statusIndicator.textContent = "Show hand";

        return;
    }


    const landmarks = results.multiHandLandmarks[0];


    // Draw skeleton
    drawConnectors(
        overlayCtx,
        landmarks,
        HAND_CONNECTIONS,
        { color: "#00FFAA", lineWidth: 3 }
    );


    drawLandmarks(
        overlayCtx,
        landmarks,
        { color: "#FF0000", radius: 4 }
    );


    // Get finger tips
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];


    // Convert coordinates (mirror corrected)
    const x = (1 - indexTip.x) * drawingCanvas.width;
    const y = indexTip.y * drawingCanvas.height;


    // Show finger dot
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, 10, 0, Math.PI * 2);
    overlayCtx.fillStyle = "yellow";
    overlayCtx.fill();


    // Detect pinch
    const pinchDistance = distance(indexTip, thumbTip);


    if (pinchDistance < 0.05) {
        isDrawing = true;

        statusIndicator.textContent = "PINCH → Drawing ✍️";

        overlayCtx.fillStyle = "lime";

        overlayCtx.beginPath();
        overlayCtx.arc(x, y, 14, 0, Math.PI * 2);
        overlayCtx.fill();
    }
    else {
        isDrawing = false;

        lastX = null;
        lastY = null;

        statusIndicator.textContent = "Open fingers → Stop";
    }


    // Draw line
    if (isDrawing) {
        if (lastX !== null) {
            drawingCtx.beginPath();

            drawingCtx.moveTo(lastX, lastY);

            drawingCtx.lineTo(x, y);

            drawingCtx.strokeStyle = currentColor;

            drawingCtx.lineWidth = lineWidth;

            drawingCtx.lineCap = "round";

            drawingCtx.stroke();
        }

        lastX = x;
        lastY = y;
    }
}
