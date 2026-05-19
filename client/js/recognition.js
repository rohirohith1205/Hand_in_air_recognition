/* ============================================================
   recognition.js — AI Character Recognition (TensorFlow.js)
   ============================================================
   Handles:
   - CNN model architecture definition (LeNet-style)
   - Model training on MNIST dataset (in-browser)
   - Loading pre-trained model from file or IndexedDB
   - Real-time digit/character prediction
   - Confidence scoring & top-k results display
   - Model persistence (save/load to IndexedDB)
   ============================================================ */

const Recognition = (() => {

    // ---- Configuration ----
    const CONFIG = {
        INPUT_SHAPE: [28, 28, 1],     // MNIST input dimensions
        NUM_CLASSES: 10,               // Digits 0-9
        BATCH_SIZE: 128,
        EPOCHS: 10,
        VALIDATION_SPLIT: 0.15,
        MODEL_SAVE_PATH: 'indexeddb://hand-in-air-mnist-model',
        MNIST_IMAGES_URL: 'https://storage.googleapis.com/learnjs-data/model-builder/mnist_images.png',
        MNIST_LABELS_URL: 'https://storage.googleapis.com/learnjs-data/model-builder/mnist_labels_uint8',
        IMAGE_SIZE: 784,              // 28 * 28
        NUM_DATASET_ELEMENTS: 65000,
        NUM_TRAIN_ELEMENTS: 55000,
        NUM_TEST_ELEMENTS: 10000,
    };

    // Class labels for display
    const CLASS_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    // ---- State ----
    let model = null;
    let isModelReady = false;
    let isTraining = false;
    let trainingProgress = 0;

    /* ----------------------------------------------------------
       Model Architecture: LeNet-style CNN
    ---------------------------------------------------------- */

    /**
     * Build a LeNet-style CNN for MNIST digit recognition.
     * Architecture:
     *   Conv2D(32, 5x5) → MaxPool(2x2) →
     *   Conv2D(64, 5x5) → MaxPool(2x2) →
     *   Flatten → Dense(128) → Dropout(0.4) → Dense(10, softmax)
     */
    function buildModel() {
        const m = tf.sequential();

        // Layer 1: Conv2D + ReLU
        m.add(tf.layers.conv2d({
            inputShape: CONFIG.INPUT_SHAPE,
            kernelSize: 5,
            filters: 8,
            strides: 1,
            activation: 'relu',
            kernelInitializer: 'varianceScaling'
        }));

        // Layer 2: MaxPooling
        m.add(tf.layers.maxPooling2d({
            poolSize: [2, 2],
            strides: [2, 2]
        }));

        // Layer 3: Conv2D + ReLU
        m.add(tf.layers.conv2d({
            kernelSize: 5,
            filters: 16,
            strides: 1,
            activation: 'relu',
            kernelInitializer: 'varianceScaling'
        }));

        // Layer 4: MaxPooling
        m.add(tf.layers.maxPooling2d({
            poolSize: [2, 2],
            strides: [2, 2]
        }));

        // Flatten
        m.add(tf.layers.flatten());

        // Dense layer with dropout
        m.add(tf.layers.dense({
            units: 64,
            activation: 'relu',
            kernelInitializer: 'varianceScaling'
        }));

        m.add(tf.layers.dropout({ rate: 0.25 }));

        // Output layer
        m.add(tf.layers.dense({
            units: CONFIG.NUM_CLASSES,
            activation: 'softmax',
            kernelInitializer: 'varianceScaling'
        }));

        // Compile
        m.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        console.log('🧠 Recognition: CNN model built');
        m.summary();
        return m;
    }


    /* ----------------------------------------------------------
       MNIST Data Loading
    ---------------------------------------------------------- */

    /**
     * MnistData class — loads the MNIST sprite sheet & labels
     * from Google's hosted data files.
     */
    class MnistData {
        constructor() {
            this.trainImages = null;
            this.trainLabels = null;
            this.testImages = null;
            this.testLabels = null;
        }

        async load() {
            // Load the sprite image
            const imgRequest = new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = '';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);

                    const datasetBytesBuffer = new ArrayBuffer(
                        CONFIG.NUM_DATASET_ELEMENTS * CONFIG.IMAGE_SIZE * 4
                    );

                    const chunkSize = 5000;
                    for (let i = 0; i < CONFIG.NUM_DATASET_ELEMENTS / chunkSize; i++) {
                        const datasetBytesView = new Float32Array(
                            datasetBytesBuffer,
                            i * CONFIG.IMAGE_SIZE * chunkSize * 4,
                            CONFIG.IMAGE_SIZE * chunkSize
                        );

                        const imageData = ctx.getImageData(
                            0, i * chunkSize, img.width, chunkSize
                        );

                        for (let j = 0; j < imageData.data.length / 4; j++) {
                            datasetBytesView[j] = imageData.data[j * 4] / 255;
                        }
                    }

                    this.datasetImages = new Float32Array(datasetBytesBuffer);
                    resolve();
                };
                img.src = CONFIG.MNIST_IMAGES_URL;
            });

            // Load labels
            const labelsRequest = fetch(CONFIG.MNIST_LABELS_URL);
            const [, labelsResponse] = await Promise.all([imgRequest, labelsRequest]);
            this.datasetLabels = new Uint8Array(await labelsResponse.arrayBuffer());

            // Split into train/test
            this.trainImages = this.datasetImages.slice(
                0, CONFIG.IMAGE_SIZE * CONFIG.NUM_TRAIN_ELEMENTS
            );
            this.testImages = this.datasetImages.slice(
                CONFIG.IMAGE_SIZE * CONFIG.NUM_TRAIN_ELEMENTS
            );
            this.trainLabels = this.datasetLabels.slice(
                0, CONFIG.NUM_CLASSES * CONFIG.NUM_TRAIN_ELEMENTS
            );
            this.testLabels = this.datasetLabels.slice(
                CONFIG.NUM_CLASSES * CONFIG.NUM_TRAIN_ELEMENTS
            );
        }

        /**
         * Get training data as tensors
         */
        getTrainData() {
            const xs = tf.tensor4d(
                this.trainImages,
                [this.trainImages.length / CONFIG.IMAGE_SIZE, 28, 28, 1]
            );
            const labels = tf.tensor2d(
                this.trainLabels,
                [this.trainLabels.length / CONFIG.NUM_CLASSES, CONFIG.NUM_CLASSES]
            );
            return { xs, labels };
        }

        /**
         * Get test data as tensors
         */
        getTestData(numExamples) {
            let xs = tf.tensor4d(
                this.testImages,
                [this.testImages.length / CONFIG.IMAGE_SIZE, 28, 28, 1]
            );
            let labels = tf.tensor2d(
                this.testLabels,
                [this.testLabels.length / CONFIG.NUM_CLASSES, CONFIG.NUM_CLASSES]
            );

            if (numExamples != null) {
                xs = xs.slice([0, 0, 0, 0], [numExamples, 28, 28, 1]);
                labels = labels.slice([0, 0], [numExamples, CONFIG.NUM_CLASSES]);
            }

            return { xs, labels };
        }
    }


    /* ----------------------------------------------------------
       Model Training
    ---------------------------------------------------------- */

    /**
     * Train the CNN on MNIST data.
     * Shows progress in the UI via callbacks.
     */
    async function trainModel(onProgress) {
        if (isTraining) {
            console.warn('Recognition: Training already in progress');
            return;
        }

        isTraining = true;
        trainingProgress = 0;

        try {
            updateTrainingUI('loading', 'Loading MNIST data...');

            const data = new MnistData();
            await data.load();

            updateTrainingUI('loading', 'Building model...');
            model = buildModel();

            const { xs: trainXs, labels: trainLabels } = data.getTrainData();

            updateTrainingUI('training', 'Training model...');

            await model.fit(trainXs, trainLabels, {
                batchSize: CONFIG.BATCH_SIZE,
                validationSplit: CONFIG.VALIDATION_SPLIT,
                epochs: CONFIG.EPOCHS,
                shuffle: true,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        trainingProgress = ((epoch + 1) / CONFIG.EPOCHS) * 100;
                        const acc = (logs.acc * 100).toFixed(1);
                        const valAcc = (logs.val_acc * 100).toFixed(1);
                        const msg = `Epoch ${epoch + 1}/${CONFIG.EPOCHS} — Acc: ${acc}% | Val: ${valAcc}%`;
                        console.log(`🧠 ${msg}`);
                        updateTrainingUI('training', msg, trainingProgress);
                        if (onProgress) onProgress(epoch + 1, CONFIG.EPOCHS, logs);
                    }
                }
            });

            // Evaluate on test data
            const { xs: testXs, labels: testLabels } = data.getTestData(1000);
            const evalResult = model.evaluate(testXs, testLabels);
            const testAcc = (await evalResult[1].data())[0];
            console.log(`🧠 Recognition: Test accuracy: ${(testAcc * 100).toFixed(1)}%`);

            // Clean up tensors
            trainXs.dispose();
            trainLabels.dispose();
            testXs.dispose();
            testLabels.dispose();
            evalResult[0].dispose();
            evalResult[1].dispose();

            // Save model
            await saveModel();

            isModelReady = true;
            isTraining = false;

            updateTrainingUI('ready', `Model ready! Test accuracy: ${(testAcc * 100).toFixed(1)}%`);
            Utils.showToast(`AI Model trained! Accuracy: ${(testAcc * 100).toFixed(1)}%`, 'success');

        } catch (err) {
            console.error('Recognition: Training failed:', err);
            isTraining = false;
            updateTrainingUI('error', 'Training failed: ' + err.message);
            Utils.showToast('Model training failed', 'error');
        }
    }


    /* ----------------------------------------------------------
       Model Save / Load (IndexedDB)
    ---------------------------------------------------------- */

    /**
     * Save the trained model to IndexedDB
     */
    async function saveModel() {
        if (!model) return;
        try {
            await model.save(CONFIG.MODEL_SAVE_PATH);
            console.log('🧠 Recognition: Model saved to IndexedDB');
        } catch (err) {
            console.warn('Recognition: Could not save model:', err.message);
        }
    }

    /**
     * Try to load a previously saved model from IndexedDB
     */
    async function loadSavedModel() {
        try {
            updateTrainingUI('loading', 'Loading saved model...');
            model = await tf.loadLayersModel(CONFIG.MODEL_SAVE_PATH);

            // Re-compile (required after load)
            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });

            isModelReady = true;
            console.log('🧠 Recognition: Model loaded from IndexedDB');
            updateTrainingUI('ready', 'Model loaded from cache!');
            Utils.showToast('AI Model loaded from cache', 'success');
            return true;
        } catch (err) {
            console.log('Recognition: No saved model found, will need training');
            return false;
        }
    }

    /**
     * Load model from a URL (for pre-trained model files)
     */
    async function loadModelFromUrl(url) {
        try {
            updateTrainingUI('loading', 'Loading model from server...');
            model = await tf.loadLayersModel(url);

            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });

            isModelReady = true;
            console.log('🧠 Recognition: Model loaded from URL');
            updateTrainingUI('ready', 'Model loaded!');
            Utils.showToast('AI Model loaded', 'success');
            return true;
        } catch (err) {
            console.error('Recognition: Failed to load model from URL:', err);
            return false;
        }
    }


    /* ----------------------------------------------------------
       Prediction
    ---------------------------------------------------------- */

    /**
     * Predict a digit from a preprocessed Float32Array (784 values).
     * Returns { label, confidence, topK } or null.
     *
     * @param {Float32Array} floatArray - 784-element normalized pixel array
     * @param {number} topK - Number of top predictions to return
     * @returns {Object|null} { label, confidence, topK: [{label, confidence}] }
     */
    function predict(floatArray, topK = 5) {
        if (!isModelReady || !model) {
            console.warn('Recognition: Model not ready');
            Utils.showToast('Model not ready — train or load first', 'error');
            return null;
        }

        return tf.tidy(() => {
            // Reshape to [1, 28, 28, 1]
            const input = tf.tensor4d(floatArray, [1, 28, 28, 1]);

            // Run prediction
            const output = model.predict(input);
            const probabilities = output.dataSync();

            // Get sorted indices (descending confidence)
            const indexed = Array.from(probabilities).map((prob, idx) => ({
                label: CLASS_LABELS[idx],
                confidence: prob,
                index: idx
            }));

            indexed.sort((a, b) => b.confidence - a.confidence);

            const topPredictions = indexed.slice(0, topK);
            const best = topPredictions[0];

            return {
                label: best.label,
                confidence: best.confidence,
                index: best.index,
                topK: topPredictions,
                allProbabilities: Array.from(probabilities)
            };
        });
    }

    /**
     * Predict from a 28×28 canvas element (alternative to float array).
     */
    function predictFromCanvas(canvas28) {
        if (!canvas28) return null;

        return tf.tidy(() => {
            let tensor = tf.browser.fromPixels(canvas28, 1) // grayscale = 1 channel
                .toFloat()
                .div(tf.scalar(255.0))
                .expandDims(0); // [1, 28, 28, 1]

            return predict(tensor.dataSync());
        });
    }


    /* ----------------------------------------------------------
       UI Updates — Prediction Display
    ---------------------------------------------------------- */

    /**
     * Update the prediction display in the right sidebar.
     */
    function updatePredictionUI(result) {
        if (!result) return;

        const charEl = document.getElementById('prediction-char');
        const confEl = document.getElementById('prediction-confidence');

        if (charEl) {
            charEl.textContent = result.label;
            charEl.classList.add('predict-pop');
            setTimeout(() => charEl.classList.remove('predict-pop'), 500);
        }

        if (confEl) {
            const pct = (result.confidence * 100).toFixed(1);
            confEl.innerHTML = `Confidence: <span>${pct}%</span>`;
        }

        // Update top-k predictions bar chart
        updateTopKDisplay(result.topK);
    }

    /**
     * Render top-K predictions as a horizontal bar chart.
     */
    function updateTopKDisplay(topK) {
        let container = document.getElementById('topk-predictions');

        if (!container) {
            // Create the top-k container in the prediction panel
            const panel = document.getElementById('prediction-display');
            if (!panel) return;

            container = document.createElement('div');
            container.id = 'topk-predictions';
            container.className = 'topk-predictions';
            panel.appendChild(container);
        }

        container.innerHTML = topK.map((pred, i) => {
            const pct = (pred.confidence * 100).toFixed(1);
            const barWidth = Math.max(2, pred.confidence * 100);
            const isTop = i === 0;
            const delay = i * 0.05;

            return `
                <div class="topk-row ${isTop ? 'topk-row--best' : ''}" 
                     style="animation-delay: ${delay}s">
                    <span class="topk-label">${pred.label}</span>
                    <div class="topk-bar-bg">
                        <div class="topk-bar-fill" 
                             style="width: ${barWidth}%; transition-delay: ${delay}s"></div>
                    </div>
                    <span class="topk-pct">${pct}%</span>
                </div>
            `;
        }).join('');
    }


    /* ----------------------------------------------------------
       UI Updates — Training Status
    ---------------------------------------------------------- */

    /**
     * Update the training status in the prediction panel.
     */
    function updateTrainingUI(status, message, progress = 0) {
        let statusEl = document.getElementById('model-status');

        if (!statusEl) {
            const panel = document.getElementById('prediction-display');
            if (!panel) return;

            statusEl = document.createElement('div');
            statusEl.id = 'model-status';
            statusEl.className = 'model-status';

            // Insert before the prediction char
            const firstChild = panel.firstChild;
            panel.insertBefore(statusEl, firstChild);
        }

        const statusIcons = {
            loading: '⏳',
            training: '🔄',
            ready: '✅',
            error: '❌',
            idle: '💤'
        };

        const statusColors = {
            loading: 'var(--yellow)',
            training: 'var(--cyan)',
            ready: 'var(--green)',
            error: 'var(--red)',
            idle: 'var(--text-muted)'
        };

        let html = `
            <div class="model-status__header">
                <span class="model-status__icon">${statusIcons[status] || '❓'}</span>
                <span class="model-status__text" style="color: ${statusColors[status]}">${message}</span>
            </div>
        `;

        if (status === 'training' && progress > 0) {
            html += `
                <div class="model-status__progress">
                    <div class="model-status__progress-bar" 
                         style="width: ${progress}%"></div>
                </div>
            `;
        }

        statusEl.innerHTML = html;

        // Remove status after a delay when ready
        if (status === 'ready') {
            setTimeout(() => {
                if (statusEl && statusEl.parentNode) {
                    statusEl.style.opacity = '0';
                    statusEl.style.transition = 'opacity 0.5s ease';
                    setTimeout(() => {
                        if (statusEl.parentNode) statusEl.remove();
                    }, 500);
                }
            }, 4000);
        }
    }


    /* ----------------------------------------------------------
       Initialization
    ---------------------------------------------------------- */

    /**
     * Initialize the recognition module.
     * Tries to load a cached model first, otherwise prompts training.
     */
    async function init() {
        if (typeof tf === 'undefined') {
            console.error('Recognition: TensorFlow.js not loaded!');
            Utils.showToast('TensorFlow.js not loaded', 'error');
            return;
        }

        console.log('🧠 Recognition: TensorFlow.js version:', tf.version.tfjs);

        // Try loading from IndexedDB first
        const loaded = await loadSavedModel();

        if (!loaded) {
            updateTrainingUI('idle', 'No model — click "Train AI" to start');
            createTrainButton();
        }
    }

    /**
     * Create the "Train AI" button in the prediction panel.
     */
    function createTrainButton() {
        let btnContainer = document.getElementById('train-model-container');
        if (btnContainer) return; // Already exists

        const panel = document.getElementById('prediction-display');
        if (!panel) return;

        btnContainer = document.createElement('div');
        btnContainer.id = 'train-model-container';
        btnContainer.className = 'train-model-container';
        btnContainer.innerHTML = `
            <button class="train-model-btn" id="btn-train-model">
                <span class="train-model-btn__icon">🧠</span>
                <span class="train-model-btn__text">Train AI Model</span>
            </button>
            <p class="train-model-hint">
                Trains a CNN on MNIST digits (~30s)
            </p>
        `;

        panel.appendChild(btnContainer);

        document.getElementById('btn-train-model').addEventListener('click', async () => {
            const btn = document.getElementById('btn-train-model');
            btn.disabled = true;
            btn.querySelector('.train-model-btn__text').textContent = 'Training...';

            await trainModel();

            // Remove the train button container
            if (btnContainer.parentNode) btnContainer.remove();
        });
    }

    /**
     * Delete the cached model (for debugging / retraining)
     */
    async function deleteModel() {
        try {
            await tf.io.removeModel(CONFIG.MODEL_SAVE_PATH);
            model = null;
            isModelReady = false;
            console.log('🧠 Recognition: Cached model deleted');
            Utils.showToast('Cached model deleted', 'info');
            updateTrainingUI('idle', 'Model deleted — retrain needed');
            createTrainButton();
        } catch (err) {
            console.warn('Recognition: No cached model to delete');
        }
    }


    /* ----------------------------------------------------------
       Public API
    ---------------------------------------------------------- */

    console.log('📦 recognition.js loaded');

    return {
        init,
        predict,
        predictFromCanvas,
        trainModel,
        loadSavedModel,
        loadModelFromUrl,
        deleteModel,
        updatePredictionUI,
        isReady: () => isModelReady,
        isTraining: () => isTraining,
        getModel: () => model,
        CLASS_LABELS,
    };

})();
