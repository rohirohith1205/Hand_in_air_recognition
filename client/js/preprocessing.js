/* ============================================================
   preprocessing.js — Drawing-to-Image Processing Pipeline
   ============================================================
   Handles:
   - Canvas capture (full or bounding-box crop)
   - Auto bounding-box detection around drawn content
   - Padding & centering (MNIST-style)
   - Grayscale conversion
   - Resize to 28×28 using offscreen canvas
   - Pixel normalization (0–1 float array)
   - Debug preview rendering
   ============================================================ */

const Preprocessor = (() => {

    // ---- Constants ----
    const TARGET_SIZE = 28;          // MNIST standard input size
    const PADDING_RATIO = 0.15;      // padding around content as fraction of size
    const BG_THRESHOLD = 10;         // pixel value threshold to detect content vs bg

    /* ----------------------------------------------------------
       Main Pipeline: Canvas → Preprocessed 28×28 Float32Array
    ---------------------------------------------------------- */

    /**
     * Process the current canvas drawing into a 28×28 normalized array.
     * Returns { imageData, floatArray, preview } or null if canvas is empty.
     *
     * @param {HTMLCanvasElement} sourceCanvas - The drawing canvas
     * @returns {Object|null} { floatArray: Float32Array(784), imageData, preview: dataURL }
     */
    function processCanvas(sourceCanvas) {
        if (!sourceCanvas) return null;

        const ctx = sourceCanvas.getContext('2d');
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        // Step 1: Get raw image data
        const rawData = ctx.getImageData(0, 0, w, h);

        // Step 2: Find bounding box of non-empty pixels
        const bbox = findBoundingBox(rawData, w, h);
        if (!bbox) {
            console.warn('Preprocessor: Canvas is empty, no content to process.');
            return null;
        }

        // Step 3: Crop to bounding box with padding
        const cropped = cropWithPadding(sourceCanvas, bbox);

        // Step 4: Convert to grayscale on white-on-black (MNIST style)
        const grayscale = toGrayscale(cropped);

        // Step 5: Resize to 28×28
        const resized = resizeTo28(grayscale);

        // Step 6: Normalize pixel values to [0, 1]
        const floatArray = normalizePixels(resized);

        // Step 7: Generate preview data URL
        const preview = generatePreview(resized);

        return {
            floatArray,      // Float32Array(784) — ready for TensorFlow.js
            imageData: resized,
            preview,         // base64 data URL of 28×28 preview
            bbox             // original bounding box info
        };
    }

    /* ----------------------------------------------------------
       Step 2: Find Bounding Box
    ---------------------------------------------------------- */

    /**
     * Scan the image data to find the tight bounding box of drawn content.
     * Looks for any pixel with alpha > threshold.
     */
    function findBoundingBox(imageData, w, h) {
        const data = imageData.data; // RGBA flat array
        let minX = w, minY = h, maxX = 0, maxY = 0;
        let hasContent = false;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                const a = data[idx + 3]; // alpha channel

                // Also check if any color channel has content
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const brightness = (r + g + b) / 3;

                if (a > BG_THRESHOLD && brightness > BG_THRESHOLD) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                    hasContent = true;
                }
            }
        }

        if (!hasContent) return null;

        return {
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1
        };
    }

    /* ----------------------------------------------------------
       Step 3: Crop with Padding (square, centered)
    ---------------------------------------------------------- */

    /**
     * Crop the canvas to the bounding box, add padding,
     * and make it square (centered content).
     */
    function cropWithPadding(sourceCanvas, bbox) {
        // Make it square based on the larger dimension
        const maxDim = Math.max(bbox.width, bbox.height);
        const padding = Math.round(maxDim * PADDING_RATIO);
        const size = maxDim + padding * 2;

        // Center offsets
        const offsetX = Math.round((size - bbox.width) / 2);
        const offsetY = Math.round((size - bbox.height) / 2);

        // Create offscreen canvas
        const crop = document.createElement('canvas');
        crop.width = size;
        crop.height = size;
        const cropCtx = crop.getContext('2d');

        // Fill with black (MNIST background)
        cropCtx.fillStyle = '#000000';
        cropCtx.fillRect(0, 0, size, size);

        // Draw the cropped region centered
        cropCtx.drawImage(
            sourceCanvas,
            bbox.x, bbox.y, bbox.width, bbox.height,
            offsetX, offsetY, bbox.width, bbox.height
        );

        return crop;
    }

    /* ----------------------------------------------------------
       Step 4: Convert to Grayscale (white strokes on black bg)
    ---------------------------------------------------------- */

    /**
     * Convert the cropped canvas to grayscale.
     * MNIST expects white (255) digits on black (0) background.
     */
    function toGrayscale(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // Luminance formula
            let gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

            // Apply alpha compositing over black background
            gray = Math.round(gray * (a / 255));

            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
            data[i + 3] = 255; // full opacity
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    /* ----------------------------------------------------------
       Step 5: Resize to 28×28
    ---------------------------------------------------------- */

    /**
     * Resize the canvas to exactly 28×28 pixels using
     * multi-step downscaling for better quality.
     */
    function resizeTo28(canvas) {
        let current = canvas;

        // Multi-step downscale: halve the size until close to target
        while (current.width > TARGET_SIZE * 2) {
            const half = document.createElement('canvas');
            half.width = Math.max(TARGET_SIZE, Math.floor(current.width / 2));
            half.height = Math.max(TARGET_SIZE, Math.floor(current.height / 2));
            const halfCtx = half.getContext('2d');
            halfCtx.drawImage(current, 0, 0, half.width, half.height);
            current = half;
        }

        // Final resize to exactly 28×28
        const final = document.createElement('canvas');
        final.width = TARGET_SIZE;
        final.height = TARGET_SIZE;
        const finalCtx = final.getContext('2d');

        // Use better interpolation
        finalCtx.imageSmoothingEnabled = true;
        finalCtx.imageSmoothingQuality = 'high';

        finalCtx.drawImage(current, 0, 0, TARGET_SIZE, TARGET_SIZE);

        return final;
    }

    /* ----------------------------------------------------------
       Step 6: Normalize Pixels to [0, 1]
    ---------------------------------------------------------- */

    /**
     * Extract pixel values and normalize to [0, 1] range.
     * Returns a Float32Array of 784 values (28×28).
     */
    function normalizePixels(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE);
        const data = imageData.data;
        const floatArray = new Float32Array(TARGET_SIZE * TARGET_SIZE);

        for (let i = 0; i < floatArray.length; i++) {
            // Use the red channel (grayscale, so R = G = B)
            floatArray[i] = data[i * 4] / 255.0;
        }

        return floatArray;
    }

    /* ----------------------------------------------------------
       Step 7: Generate Preview
    ---------------------------------------------------------- */

    /**
     * Generate a data URL preview of the 28×28 processed image.
     * Upscales for visibility.
     */
    function generatePreview(canvas28, scale = 4) {
        const preview = document.createElement('canvas');
        preview.width = TARGET_SIZE * scale;
        preview.height = TARGET_SIZE * scale;
        const previewCtx = preview.getContext('2d');

        // Disable smoothing for crisp pixel art look
        previewCtx.imageSmoothingEnabled = false;
        previewCtx.drawImage(canvas28, 0, 0, preview.width, preview.height);

        return preview.toDataURL('image/png');
    }

    /* ----------------------------------------------------------
       Debug: Render preview into the UI
    ---------------------------------------------------------- */

    /**
     * Show the preprocessed 28×28 image in a debug element.
     * Creates/updates an <img> element in the prediction panel.
     */
    function showDebugPreview(previewDataUrl) {
        let debugEl = document.getElementById('preprocess-debug');

        if (!debugEl) {
            // Create debug preview element inside prediction panel
            const panel = document.getElementById('prediction-display');
            if (!panel) return;

            debugEl = document.createElement('div');
            debugEl.id = 'preprocess-debug';
            debugEl.style.cssText = `
        margin-top: 10px;
        text-align: center;
      `;
            debugEl.innerHTML = `
        <div style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 4px; 
                    font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em;">
          Preprocessed 28×28
        </div>
        <img id="preprocess-preview-img"
             style="width: 84px; height: 84px; image-rendering: pixelated;
                    border: 1px solid var(--border-color); border-radius: 6px;
                    background: #000;" />
      `;
            panel.appendChild(debugEl);
        }

        const img = document.getElementById('preprocess-preview-img');
        if (img) {
            img.src = previewDataUrl;
        }
    }

    /**
     * Hide the debug preview
     */
    function hideDebugPreview() {
        const debugEl = document.getElementById('preprocess-debug');
        if (debugEl) debugEl.remove();
    }

    /* ----------------------------------------------------------
       Utility: Get raw 28×28 canvas (for TF.js fromPixels)
    ---------------------------------------------------------- */

    /**
     * Returns just the 28×28 canvas element (useful for tf.browser.fromPixels).
     */
    function getProcessedCanvas(sourceCanvas) {
        const result = processCanvas(sourceCanvas);
        if (!result) return null;

        // Reconstruct a 28×28 canvas from the float array
        const canvas28 = document.createElement('canvas');
        canvas28.width = TARGET_SIZE;
        canvas28.height = TARGET_SIZE;
        const ctx = canvas28.getContext('2d');
        const imgData = ctx.createImageData(TARGET_SIZE, TARGET_SIZE);

        for (let i = 0; i < result.floatArray.length; i++) {
            const val = Math.round(result.floatArray[i] * 255);
            imgData.data[i * 4] = val;
            imgData.data[i * 4 + 1] = val;
            imgData.data[i * 4 + 2] = val;
            imgData.data[i * 4 + 3] = 255;
        }

        ctx.putImageData(imgData, 0, 0);
        return canvas28;
    }

    /* ----------------------------------------------------------
       Public API
    ---------------------------------------------------------- */
    return {
        processCanvas,
        getProcessedCanvas,
        showDebugPreview,
        hideDebugPreview,
        findBoundingBox,    // exposed for testing
        TARGET_SIZE,
    };

})();
