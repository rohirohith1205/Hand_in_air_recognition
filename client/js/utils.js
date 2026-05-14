/* ============================================================
   utils.js — Shared Utilities & Helpers
   ============================================================ */

const Utils = (() => {

  /**
   * Select a single DOM element
   */
  function $(selector) {
    return document.querySelector(selector);
  }

  /**
   * Select multiple DOM elements
   */
  function $$(selector) {
    return document.querySelectorAll(selector);
  }

  /**
   * Show a toast notification
   * @param {string} message 
   * @param {'success'|'error'|'info'} type 
   * @param {number} duration ms
   */
  function showToast(message, type = 'info', duration = 3000) {
    const container = $('#toast-container');
    if (!container) return;

    const iconMap = {
      success: 'check-circle-2',
      error: 'alert-circle',
      info: 'info'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <i data-lucide="${iconMap[type] || 'info'}"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    // Re-render lucide icons inside toast
    if (window.lucide) lucide.createIcons({ nodes: [toast] });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /**
   * Debounce a function
   */
  function debounce(fn, ms = 200) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /**
   * Throttle a function 
   */
  function throttle(fn, ms = 100) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn(...args);
      }
    };
  }

  /**
   * Clamp a number between min and max
   */
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /**
   * Generate a unique ID
   */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /**
   * Calculate distance between two points
   */
  function distance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  return {
    $,
    $$,
    showToast,
    debounce,
    throttle,
    clamp,
    uid,
    distance
  };

})();
