/* ============================================================
   expression-builder.js — Expression Accumulator (Step 6)
   ============================================================
   Handles:
   - Accumulating predicted characters into an expression string
   - Inline editing: insert, delete, modify individual characters
   - Click-to-select characters in the expression display
   - Auto-sync with the equation text input field
   - Expression history (undo last character add)
   - Keyboard input for manual character entry
   - Operator quick-insert buttons
   ============================================================ */

const ExpressionBuilder = (() => {

    // ---- State ----
    let expression = [];          // Array of character objects: { char, confidence, id }
    let selectedIndex = -1;       // Index of currently selected character (-1 = end)
    let history = [];             // Undo history stack
    const MAX_HISTORY = 50;

    // ---- DOM References ----
    let displayEl = null;
    let equationInputEl = null;

    // Common math symbols for quick-insert
    const OPERATORS = ['+', '-', '×', '÷', '=', '(', ')', 'x', 'y', '^', '.'];
    const OPERATOR_MAP = { '×': '*', '÷': '/' }; // Display → eval mapping


    /* ----------------------------------------------------------
       Initialization
    ---------------------------------------------------------- */

    /**
     * Initialize the ExpressionBuilder module.
     * Caches DOM elements and sets up event listeners.
     */
    function init() {
        displayEl = document.getElementById('expression-display');
        equationInputEl = document.getElementById('equation-input');

        if (!displayEl) {
            console.error('ExpressionBuilder: #expression-display not found');
            return;
        }

        // Set up event listeners
        setupDisplayClickHandler();
        setupKeyboardInput();
        setupEquationInputSync();
        createOperatorBar();

        // Initial render
        render();

        console.log('📐 ExpressionBuilder: Initialized');
    }


    /* ----------------------------------------------------------
       Core Operations: Add, Remove, Modify, Clear
    ---------------------------------------------------------- */

    /**
     * Add a predicted character to the expression.
     * @param {string} char - The character to add
     * @param {number} confidence - Confidence score (0-1), optional
     */
    function addChar(char, confidence = 1.0) {
        pushHistory();

        const entry = {
            char: char,
            confidence: confidence,
            id: Utils.uid(),
            source: confidence < 1.0 ? 'ai' : 'manual'
        };

        if (selectedIndex >= 0 && selectedIndex < expression.length) {
            // Insert after selected position
            expression.splice(selectedIndex + 1, 0, entry);
            selectedIndex = selectedIndex + 1;
        } else {
            // Append at end
            expression.push(entry);
            selectedIndex = -1;
        }

        render();
        syncToEquationInput();
        return entry;
    }

    /**
     * Remove the last character (backspace).
     */
    function backspace() {
        if (expression.length === 0) return;

        pushHistory();

        if (selectedIndex >= 0 && selectedIndex < expression.length) {
            // Remove the selected character
            expression.splice(selectedIndex, 1);
            selectedIndex = Math.min(selectedIndex, expression.length - 1);
            if (expression.length === 0) selectedIndex = -1;
        } else {
            // Remove last character
            expression.pop();
        }

        render();
        syncToEquationInput();
    }

    /**
     * Modify the character at a specific index.
     * @param {number} index - Index to modify
     * @param {string} newChar - New character value
     */
    function modifyCharAt(index, newChar) {
        if (index < 0 || index >= expression.length) return;

        pushHistory();

        expression[index].char = newChar;
        expression[index].confidence = 1.0; // Manual edit = full confidence
        expression[index].source = 'manual';

        render();
        syncToEquationInput();
    }

    /**
     * Remove character at a specific index.
     */
    function removeCharAt(index) {
        if (index < 0 || index >= expression.length) return;

        pushHistory();
        expression.splice(index, 1);

        if (selectedIndex >= expression.length) {
            selectedIndex = expression.length - 1;
        }
        if (expression.length === 0) selectedIndex = -1;

        render();
        syncToEquationInput();
    }

    /**
     * Clear the entire expression.
     */
    function clear() {
        if (expression.length === 0) return;

        pushHistory();
        expression = [];
        selectedIndex = -1;

        render();
        syncToEquationInput();

        Utils.showToast('Expression cleared', 'info');
    }

    /**
     * Undo the last operation.
     */
    function undo() {
        if (history.length === 0) return;

        const prev = history.pop();
        expression = prev.expression;
        selectedIndex = prev.selectedIndex;

        render();
        syncToEquationInput();
    }


    /* ----------------------------------------------------------
       History Management
    ---------------------------------------------------------- */

    function pushHistory() {
        history.push({
            expression: expression.map(e => ({ ...e })),
            selectedIndex
        });

        if (history.length > MAX_HISTORY) {
            history.shift();
        }
    }


    /* ----------------------------------------------------------
       Expression String Getters
    ---------------------------------------------------------- */

    /**
     * Get the expression as a display string.
     */
    function getDisplayString() {
        return expression.map(e => e.char).join('');
    }

    /**
     * Get the expression as an evaluable string.
     * Converts display operators (×, ÷) to math operators (*, /).
     */
    function getEvalString() {
        return expression.map(e => {
            return OPERATOR_MAP[e.char] || e.char;
        }).join('');
    }

    /**
     * Get the raw expression array.
     */
    function getExpression() {
        return [...expression];
    }

    /**
     * Get expression length.
     */
    function length() {
        return expression.length;
    }

    /**
     * Check if expression is empty.
     */
    function isEmpty() {
        return expression.length === 0;
    }


    /* ----------------------------------------------------------
       Set Expression from String
    ---------------------------------------------------------- */

    /**
     * Set the expression from a string (e.g. from the text input).
     * @param {string} str - The expression string
     */
    function setFromString(str) {
        pushHistory();

        expression = str.split('').map(char => ({
            char,
            confidence: 1.0,
            id: Utils.uid(),
            source: 'manual'
        }));
        selectedIndex = -1;

        render();
    }


    /* ----------------------------------------------------------
       UI Rendering
    ---------------------------------------------------------- */

    /**
     * Render the expression display with interactive character chips.
     */
    function render() {
        if (!displayEl) return;

        if (expression.length === 0) {
            displayEl.innerHTML = `
                <span class="expr-empty-hint">Draw & predict to build expression</span>
                <span class="cursor-blink"></span>
            `;
            return;
        }

        let html = '';

        expression.forEach((entry, i) => {
            const isSelected = i === selectedIndex;
            const isOperator = OPERATORS.includes(entry.char) || 
                               ['+', '-', '*', '/', '=', '(', ')', '^', '.'].includes(entry.char);
            const isLowConf = entry.confidence < 0.7;

            let classes = 'expr-char';
            if (isSelected) classes += ' expr-char--selected';
            if (isOperator) classes += ' expr-char--operator';
            if (isLowConf && entry.source === 'ai') classes += ' expr-char--low-conf';

            // Confidence indicator dot
            const confDot = entry.source === 'ai'
                ? `<span class="expr-char__conf-dot" 
                         style="background: ${getConfidenceColor(entry.confidence)}" 
                         title="Confidence: ${(entry.confidence * 100).toFixed(0)}%"></span>`
                : '';

            html += `
                <span class="${classes}" 
                      data-index="${i}" 
                      data-id="${entry.id}"
                      title="${entry.source === 'ai' 
                        ? `AI predicted (${(entry.confidence * 100).toFixed(0)}%)` 
                        : 'Manually entered'}">
                    ${escapeHtml(entry.char)}
                    ${confDot}
                </span>
            `;
        });

        // Blinking cursor at the end (or at selection)
        html += '<span class="cursor-blink"></span>';

        displayEl.innerHTML = html;
    }

    /**
     * Get a color based on confidence level.
     */
    function getConfidenceColor(confidence) {
        if (confidence >= 0.9) return 'var(--green)';
        if (confidence >= 0.7) return 'var(--yellow)';
        if (confidence >= 0.5) return 'var(--orange)';
        return 'var(--red)';
    }

    /**
     * Escape HTML special characters.
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }


    /* ----------------------------------------------------------
       Operator Quick-Insert Bar
    ---------------------------------------------------------- */

    /**
     * Create the operator quick-insert buttons below the expression controls.
     */
    function createOperatorBar() {
        const panel = displayEl?.closest('.panel');
        if (!panel) return;

        // Check if already exists
        if (panel.querySelector('.operator-bar')) return;

        const bar = document.createElement('div');
        bar.className = 'operator-bar';

        const quickOps = ['+', '-', '×', '÷', '=', '(', ')', 'x', '^', '.'];

        quickOps.forEach(op => {
            const btn = document.createElement('button');
            btn.className = 'operator-btn';
            btn.textContent = op;
            btn.title = `Insert ${op}`;
            btn.addEventListener('click', () => {
                addChar(op, 1.0);
            });
            bar.appendChild(btn);
        });

        panel.appendChild(bar);
    }


    /* ----------------------------------------------------------
       Event Handlers
    ---------------------------------------------------------- */

    /**
     * Click handler for selecting characters in the expression.
     */
    function setupDisplayClickHandler() {
        if (!displayEl) return;

        displayEl.addEventListener('click', (e) => {
            const charEl = e.target.closest('.expr-char');
            if (!charEl) {
                // Clicked empty area — deselect, move cursor to end
                selectedIndex = -1;
                render();
                return;
            }

            const index = parseInt(charEl.dataset.index, 10);

            if (selectedIndex === index) {
                // Double-click-like: prompt to edit this character
                promptEditChar(index);
            } else {
                selectedIndex = index;
                render();
            }
        });
    }

    /**
     * Prompt the user to edit a character (inline).
     */
    function promptEditChar(index) {
        if (index < 0 || index >= expression.length) return;

        const entry = expression[index];
        const charEl = displayEl.querySelector(`[data-index="${index}"]`);
        if (!charEl) return;

        // Replace the character span with a tiny input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'expr-char-edit';
        input.value = entry.char;
        input.maxLength = 1;
        input.style.width = '24px';

        charEl.replaceWith(input);
        input.focus();
        input.select();

        const finishEdit = () => {
            const newVal = input.value.trim();
            if (newVal && newVal !== entry.char) {
                modifyCharAt(index, newVal);
                Utils.showToast(`Changed '${entry.char}' → '${newVal}'`, 'info');
            } else {
                render(); // Re-render without changes
            }
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
            if (e.key === 'Escape') {
                input.value = entry.char; // Cancel
                input.blur();
            }
        });
    }

    /**
     * Keyboard shortcut handler for the expression.
     */
    function setupKeyboardInput() {
        document.addEventListener('keydown', (e) => {
            // Only when not typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Ctrl+Z: Undo expression
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                // Let canvas handle its own undo; only handle if expression has history
                // We won't intercept here to avoid conflict with canvas undo
                return;
            }

            // Delete / Backspace: remove selected or last char
            if (e.key === 'Backspace' || e.key === 'Delete') {
                if (expression.length > 0) {
                    e.preventDefault();
                    backspace();
                }
            }
        });
    }

    /**
     * Sync the expression with the equation text input field.
     */
    function setupEquationInputSync() {
        if (!equationInputEl) return;

        // When user types in the equation input, update expression
        equationInputEl.addEventListener('input', (e) => {
            const val = equationInputEl.value;
            setFromString(val);
        });

        // When user presses Enter in the equation input, trigger solve
        equationInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const solveBtn = document.getElementById('btn-solve');
                if (solveBtn) solveBtn.click();
            }
        });
    }

    /**
     * Sync expression state to the equation input field.
     */
    function syncToEquationInput() {
        if (!equationInputEl) return;

        // Use the eval string (with proper operators) for the input
        const evalStr = getEvalString();
        equationInputEl.value = evalStr;
    }


    /* ----------------------------------------------------------
       Public API
    ---------------------------------------------------------- */

    console.log('📦 expression-builder.js loaded');

    return {
        init,
        addChar,
        backspace,
        modifyCharAt,
        removeCharAt,
        clear,
        undo,
        getDisplayString,
        getEvalString,
        getExpression,
        setFromString,
        render,
        length,
        isEmpty,
    };

})();
