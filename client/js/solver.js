/* ============================================================
   solver.js — Equation Solver Engine (Step 7)
   ============================================================
   Handles:
   - Arithmetic expression evaluation (2+3, 5*8-1)
   - Algebraic equation solving (2x+5=15, x^2-4=0)
   - Symbolic simplification
   - Step-by-step solution generation
   - Integration with Nerdamer.js for symbolic math
   - Fallback to safe eval for simple arithmetic
   ============================================================ */

const Solver = (() => {

    // ---- State ----
    let showSteps = false;

    // ---- DOM References ----
    let resultEl = null;
    let stepsEl = null;
    let placeholderEl = null;
    let stepsToggleBtn = null;


    /* ----------------------------------------------------------
       Initialization
    ---------------------------------------------------------- */

    function init() {
        resultEl = document.getElementById('solution-result');
        stepsEl = document.getElementById('solution-steps');
        placeholderEl = document.getElementById('solution-placeholder');
        stepsToggleBtn = document.getElementById('btn-steps-toggle');

        if (stepsToggleBtn) {
            stepsToggleBtn.addEventListener('click', toggleSteps);
        }

        console.log('🔢 Solver: Initialized');
    }


    /* ----------------------------------------------------------
       Steps Toggle
    ---------------------------------------------------------- */

    function toggleSteps() {
        showSteps = !showSteps;
        if (stepsToggleBtn) {
            stepsToggleBtn.classList.toggle('active', showSteps);
        }
        if (stepsEl) {
            stepsEl.style.display = showSteps ? 'block' : 'none';
        }
    }


    /* ----------------------------------------------------------
       Main Solve Entry Point
    ---------------------------------------------------------- */

    /**
     * Solve an expression string.
     * @param {string} input - Expression or equation to solve
     * @returns {Object} { result, steps[], type, error? }
     */
    function solve(input) {
        if (!input || input.trim() === '') {
            return { result: null, steps: [], type: 'empty', error: 'No expression to solve' };
        }

        const cleaned = cleanInput(input.trim());
        console.log('🔢 Solver: Solving:', cleaned);

        let solution;

        try {
            // Determine the type and solve accordingly
            if (isEquation(cleaned)) {
                solution = solveEquation(cleaned);
            } else if (isExpression(cleaned)) {
                solution = evaluateExpression(cleaned);
            } else {
                solution = trySimplify(cleaned);
            }
        } catch (err) {
            console.error('Solver error:', err);
            solution = {
                result: 'Error',
                steps: [{ text: `Could not solve: ${err.message}`, type: 'error' }],
                type: 'error',
                error: err.message
            };
        }

        // Display results
        displaySolution(solution);
        return solution;
    }


    /* ----------------------------------------------------------
       Input Cleaning & Classification
    ---------------------------------------------------------- */

    /**
     * Clean and normalize the input expression.
     */
    function cleanInput(input) {
        let s = input;

        // Replace common display symbols with math operators
        s = s.replace(/×/g, '*');
        s = s.replace(/÷/g, '/');
        s = s.replace(/−/g, '-');

        // Remove extra whitespace
        s = s.replace(/\s+/g, ' ').trim();

        return s;
    }

    /**
     * Check if the input is an equation (contains =).
     */
    function isEquation(input) {
        // Contains = but not == or ===
        return /[^=]=[^=]/.test(input) || input.startsWith('=') || input.endsWith('=');
    }

    /**
     * Check if the input is a pure arithmetic expression.
     */
    function isExpression(input) {
        // Only numbers, operators, parentheses, decimals
        return /^[\d\s+\-*/().^%]+$/.test(input);
    }


    /* ----------------------------------------------------------
       Arithmetic Expression Evaluation
    ---------------------------------------------------------- */

    /**
     * Evaluate a pure arithmetic expression.
     */
    function evaluateExpression(expr) {
        const steps = [];

        steps.push({ text: `Expression: ${expr}`, type: 'input' });

        // Try Nerdamer first
        if (typeof nerdamer !== 'undefined') {
            try {
                const result = nerdamer(expr);
                const evaluated = result.evaluate();
                const numResult = evaluated.text('decimals');

                steps.push({ text: `Evaluate: ${expr}`, type: 'step' });
                steps.push({ text: `= ${numResult}`, type: 'result' });

                return {
                    result: numResult,
                    steps,
                    type: 'arithmetic',
                    expression: expr
                };
            } catch (e) {
                // Fall through to safe eval
            }
        }

        // Fallback: Safe arithmetic evaluation
        const result = safeEval(expr);
        if (result !== null) {
            // Generate step-by-step for basic arithmetic
            const detailedSteps = generateArithmeticSteps(expr, result);
            return {
                result: formatNumber(result),
                steps: detailedSteps,
                type: 'arithmetic',
                expression: expr
            };
        }

        return {
            result: 'Error',
            steps: [{ text: 'Could not evaluate expression', type: 'error' }],
            type: 'error',
            error: 'Invalid expression'
        };
    }


    /* ----------------------------------------------------------
       Equation Solving
    ---------------------------------------------------------- */

    /**
     * Solve an algebraic equation.
     */
    function solveEquation(equation) {
        const steps = [];
        steps.push({ text: `Equation: ${equation}`, type: 'input' });

        // Find the variable to solve for
        const variable = findVariable(equation);

        // Try Nerdamer
        if (typeof nerdamer !== 'undefined') {
            try {
                const solutions = nerdamer.solve(equation, variable);
                const solText = solutions.text('decimals');

                steps.push({ text: `Solving for ${variable}`, type: 'step' });

                // Parse sides for steps
                const sides = equation.split('=');
                if (sides.length === 2) {
                    steps.push({ text: `${sides[0].trim()} = ${sides[1].trim()}`, type: 'step' });

                    // Try to show rearrangement
                    const lhs = sides[0].trim();
                    const rhs = sides[1].trim();

                    // Move terms
                    if (rhs !== '0') {
                        steps.push({ text: `${lhs} - (${rhs}) = 0`, type: 'step' });
                    }
                }

                // Parse solutions
                const solArray = parseSolutions(solText);
                if (solArray.length > 0) {
                    solArray.forEach((sol, i) => {
                        steps.push({
                            text: `${variable}${solArray.length > 1 ? `₍${i + 1}₎` : ''} = ${sol}`,
                            type: 'result'
                        });
                    });
                }

                return {
                    result: solArray.length === 1
                        ? `${variable} = ${solArray[0]}`
                        : solArray.map((s, i) => `${variable}₍${i + 1}₎ = ${s}`).join(', '),
                    steps,
                    type: 'equation',
                    variable,
                    solutions: solArray,
                    expression: equation
                };
            } catch (e) {
                // Try simple linear solve
                return solveLinearSimple(equation, variable, steps);
            }
        }

        // Fallback: Simple linear solver
        return solveLinearSimple(equation, variable, steps);
    }

    /**
     * Simple linear equation solver (ax + b = c).
     */
    function solveLinearSimple(equation, variable, steps) {
        const parts = equation.split('=');
        if (parts.length !== 2) {
            return {
                result: 'Error',
                steps: [{ text: 'Invalid equation format', type: 'error' }],
                type: 'error'
            };
        }

        const lhs = parts[0].trim();
        const rhs = parts[1].trim();

        steps.push({ text: `${lhs} = ${rhs}`, type: 'step' });

        // Try to evaluate both sides
        const rhsVal = safeEval(rhs);

        if (rhsVal !== null) {
            // Simple case: expression = number
            // Try to isolate variable
            // Pattern: ax + b = c  →  x = (c - b) / a
            const match = lhs.match(
                new RegExp(`([+-]?\\d*\\.?\\d*)\\s*\\*?\\s*${variable}\\s*([+-]\\s*\\d+\\.?\\d*)?`)
            );

            if (match) {
                let a = match[1] === '' || match[1] === '+' ? 1 : match[1] === '-' ? -1 : parseFloat(match[1]);
                let b = match[2] ? parseFloat(match[2].replace(/\s/g, '')) : 0;

                steps.push({ text: `${a}${variable} + ${b} = ${rhsVal}`, type: 'step' });
                steps.push({ text: `${a}${variable} = ${rhsVal} - ${b}`, type: 'step' });
                steps.push({ text: `${a}${variable} = ${rhsVal - b}`, type: 'step' });

                const result = (rhsVal - b) / a;
                steps.push({ text: `${variable} = ${formatNumber(result)}`, type: 'result' });

                return {
                    result: `${variable} = ${formatNumber(result)}`,
                    steps,
                    type: 'equation',
                    variable,
                    solutions: [formatNumber(result)]
                };
            }
        }

        return {
            result: 'Could not solve',
            steps: [...steps, { text: 'Equation too complex for basic solver', type: 'error' }],
            type: 'error'
        };
    }

    /**
     * Try to simplify a symbolic expression.
     */
    function trySimplify(input) {
        const steps = [];
        steps.push({ text: `Input: ${input}`, type: 'input' });

        if (typeof nerdamer !== 'undefined') {
            try {
                const simplified = nerdamer(input).text();
                const evaluated = nerdamer(input).evaluate().text('decimals');

                steps.push({ text: `Simplified: ${simplified}`, type: 'step' });

                if (evaluated !== simplified) {
                    steps.push({ text: `≈ ${evaluated}`, type: 'result' });
                }

                return {
                    result: evaluated || simplified,
                    steps,
                    type: 'simplify',
                    expression: input
                };
            } catch (e) {
                // Try safe eval
            }
        }

        const result = safeEval(input);
        if (result !== null) {
            steps.push({ text: `= ${formatNumber(result)}`, type: 'result' });
            return { result: formatNumber(result), steps, type: 'arithmetic' };
        }

        return {
            result: 'Cannot evaluate',
            steps: [{ text: `Expression: ${input}`, type: 'input' },
                    { text: 'Could not evaluate', type: 'error' }],
            type: 'error'
        };
    }


    /* ----------------------------------------------------------
       Utility Functions
    ---------------------------------------------------------- */

    /**
     * Safe arithmetic evaluation — no eval(), uses Function constructor
     * with whitelist of allowed characters.
     */
    function safeEval(expr) {
        try {
            // Validate: only allow digits, operators, parens, decimals, spaces
            if (!/^[\d\s+\-*/().^%e]+$/i.test(expr)) return null;

            // Replace ^ with ** for exponentiation
            let jsExpr = expr.replace(/\^/g, '**');

            // Use Function constructor (safer than eval)
            const fn = new Function(`"use strict"; return (${jsExpr});`);
            const result = fn();

            if (typeof result === 'number' && isFinite(result)) {
                return result;
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Find the variable in an expression (x, y, z, etc.).
     */
    function findVariable(expr) {
        const match = expr.match(/[a-z]/i);
        return match ? match[0] : 'x';
    }

    /**
     * Parse Nerdamer solution text into an array.
     */
    function parseSolutions(solText) {
        if (!solText) return [];
        // Nerdamer returns solutions like [1, 2] or just "5"
        const cleaned = solText.replace(/[\[\]]/g, '');
        return cleaned.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    /**
     * Format a number for display.
     */
    function formatNumber(num) {
        if (Number.isInteger(num)) return num.toString();
        // Round to reasonable decimal places
        const rounded = Math.round(num * 1000000) / 1000000;
        return rounded.toString();
    }

    /**
     * Generate step-by-step breakdown for basic arithmetic.
     */
    function generateArithmeticSteps(expr, result) {
        const steps = [];
        steps.push({ text: `Expression: ${expr}`, type: 'input' });

        // Try to break down by operator precedence
        // Handle parentheses first
        const parenMatch = expr.match(/\(([^)]+)\)/);
        if (parenMatch) {
            const inner = parenMatch[1];
            const innerResult = safeEval(inner);
            if (innerResult !== null) {
                steps.push({ text: `Evaluate parentheses: (${inner}) = ${formatNumber(innerResult)}`, type: 'step' });
                const simplified = expr.replace(`(${inner})`, formatNumber(innerResult));
                steps.push({ text: `→ ${simplified}`, type: 'step' });
            }
        }

        // Handle multiplication/division
        const mulDivMatch = expr.match(/(\d+\.?\d*)\s*([*/])\s*(\d+\.?\d*)/);
        if (mulDivMatch && !parenMatch) {
            const a = parseFloat(mulDivMatch[1]);
            const op = mulDivMatch[2];
            const b = parseFloat(mulDivMatch[3]);
            const partResult = op === '*' ? a * b : a / b;
            steps.push({ text: `${a} ${op} ${b} = ${formatNumber(partResult)}`, type: 'step' });
        }

        // Handle addition/subtraction
        const addSubMatch = expr.match(/(\d+\.?\d*)\s*([+-])\s*(\d+\.?\d*)/);
        if (addSubMatch && !mulDivMatch && !parenMatch) {
            const a = parseFloat(addSubMatch[1]);
            const op = addSubMatch[2];
            const b = parseFloat(addSubMatch[3]);
            steps.push({ text: `${a} ${op} ${b} = ${formatNumber(result)}`, type: 'step' });
        }

        steps.push({ text: `= ${formatNumber(result)}`, type: 'result' });
        return steps;
    }


    /* ----------------------------------------------------------
       UI Display
    ---------------------------------------------------------- */

    /**
     * Display the solution in the right sidebar.
     */
    function displaySolution(solution) {
        if (!resultEl || !stepsEl || !placeholderEl) return;

        // Hide placeholder
        placeholderEl.style.display = 'none';

        // Show result
        resultEl.style.display = 'block';
        resultEl.innerHTML = '';

        if (solution.error && solution.type === 'error') {
            resultEl.innerHTML = `<span class="solution-error">${escapeHtml(solution.error)}</span>`;
            resultEl.className = 'solution-result solution-result--error';
        } else {
            resultEl.textContent = solution.result;
            resultEl.className = 'solution-result';

            // Add pop animation
            resultEl.classList.add('solution-pop');
            setTimeout(() => resultEl.classList.remove('solution-pop'), 500);
        }

        // Show steps
        stepsEl.innerHTML = '';
        if (solution.steps && solution.steps.length > 0) {
            solution.steps.forEach((step, i) => {
                const stepEl = document.createElement('div');
                stepEl.className = `solution-step solution-step--${step.type}`;
                stepEl.innerHTML = `
                    <span class="step-num">${i + 1}.</span>
                    <span class="step-text">${escapeHtml(step.text)}</span>
                `;
                stepsEl.appendChild(stepEl);
            });
        }

        stepsEl.style.display = showSteps ? 'block' : 'none';
    }

    /**
     * Clear the solution display.
     */
    function clearDisplay() {
        if (resultEl) {
            resultEl.style.display = 'none';
            resultEl.innerHTML = '';
        }
        if (stepsEl) {
            stepsEl.style.display = 'none';
            stepsEl.innerHTML = '';
        }
        if (placeholderEl) {
            placeholderEl.style.display = 'flex';
        }
    }

    /**
     * Escape HTML.
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }


    /* ----------------------------------------------------------
       Public API
    ---------------------------------------------------------- */

    console.log('📦 solver.js loaded');

    return {
        init,
        solve,
        clearDisplay,
        toggleSteps,
        isShowingSteps: () => showSteps,
    };

})();
