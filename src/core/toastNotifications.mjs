export function createToastNotifications(host) {
  const { document } = host;
  const createToastCloseButton = (dismiss) => {
    const button = document.createElement('button');
    button.className = 'ivlyrics-toast-close';
    button.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>';
    button.onclick = (event) => {
      event.stopPropagation();
      dismiss();
    };
    return button;
  };

  const hideToast = (toast, onRemoved) => {
    toast.classList.remove('ivlyrics-toast-show');
    toast.classList.add('ivlyrics-toast-hide');
    host.setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
      onRemoved?.();
    }, 300);
  };

  const refreshProgressTimeout = (owner, current) => {
    if (current.dismissing) return;
    if (current.timeout != null) host.clearTimeout(current.timeout);
    current.timeout = host.setTimeout(() => {
      if (owner._progressToast === current) owner.dismissProgress();
    }, 60000);
  };

  return {
    _container: null,
    _toasts: [],
    _idCounter: 0,
    _progressToast: null, // progress 전용 토스트

    /**
     * Initialize toast container
     */
    _ensureContainer() {
      if (this._container && document.body.contains(this._container)) {
        if (document.body.lastChild !== this._container) document.body.appendChild(this._container);
        return this._container;
      }

      this._container = document.createElement('div');
      this._container.className = 'ivlyrics-toast-container';
      document.body.appendChild(this._container);
      return this._container;
    },

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {boolean} isError - Whether this is an error message
     * @param {number} duration - Duration in ms (default: 3000)
     * @returns {number} Toast ID
     */
    show(message, isError = false, duration = 3000) {
      this._ensureContainer();

      const id = ++this._idCounter;
      const toast = document.createElement('div');
      toast.className = `ivlyrics-toast ${isError ? 'ivlyrics-toast-error' : 'ivlyrics-toast-success'}`;
      toast.dataset.toastId = id;

      // Icon
      const icon = document.createElement('span');
      icon.className = 'ivlyrics-toast-icon';
      icon.innerHTML = isError
        ? '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM7.25 5h1.5v4h-1.5V5zm0 5h1.5v1.5h-1.5V10z"/></svg>'
        : '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zm3.146-8.854a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L6.5 8.793l3.646-3.647a.5.5 0 0 1 .708 0z"/></svg>';

      // Message
      const text = document.createElement('span');
      text.className = 'ivlyrics-toast-message';
      text.textContent = message;

      const closeBtn = createToastCloseButton(() => this.dismiss(id));

      toast.appendChild(icon);
      toast.appendChild(text);
      toast.appendChild(closeBtn);

      // Click anywhere to dismiss
      toast.onclick = () => this.dismiss(id);

      this._container.appendChild(toast);
      this._toasts.push({ id, element: toast, timeout: null });

      // Trigger animation
      host.requestAnimationFrame(() => {
        toast.classList.add('ivlyrics-toast-show');
      });

      // Auto dismiss
      if (duration > 0) {
        const toastData = this._toasts[this._toasts.length - 1];
        if (toastData) {
          toastData.timeout = host.setTimeout(() => this.dismiss(id), duration);
        }
      }

      return id;
    },

    /**
     * Show or update progress toast (single instance, reusable)
     * @param {string} message - The message to display
     * @param {number} percent - Progress percentage (0-100)
     */
    progress(message, percent = 0) {
      this._ensureContainer();

      // 이미 progress 토스트가 있으면 업데이트
      if (this._progressToast && document.body.contains(this._progressToast.element)) {
        const textEl = this._progressToast.element.querySelector('.ivlyrics-toast-message');
        const barEl = this._progressToast.element.querySelector('.ivlyrics-toast-progress-bar');
        if (textEl) textEl.textContent = message;
        if (barEl) barEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;

        // 타임아웃 리셋 (활동이 있으면 연장)
        refreshProgressTimeout(this, this._progressToast);

        return this._progressToast.id;
      }

      // 새로운 progress 토스트 생성
      const id = ++this._idCounter;
      const toast = document.createElement('div');
      toast.className = 'ivlyrics-toast ivlyrics-toast-progress';
      toast.dataset.toastId = id;

      // Icon (다운로드 아이콘)
      const icon = document.createElement('span');
      icon.className = 'ivlyrics-toast-icon';
      icon.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 12l-4-4h2.5V3h3v5H12L8 12z"/><path d="M14 14H2v-2h12v2z"/></svg>';

      // Message
      const text = document.createElement('span');
      text.className = 'ivlyrics-toast-message';
      text.textContent = message;

      // Progress bar container
      const progressContainer = document.createElement('div');
      progressContainer.className = 'ivlyrics-toast-progress-container';

      const progressBar = document.createElement('div');
      progressBar.className = 'ivlyrics-toast-progress-bar';
      progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;

      progressContainer.appendChild(progressBar);

      const closeBtn = createToastCloseButton(() => this.dismissProgress());

      toast.appendChild(icon);
      toast.appendChild(text);
      toast.appendChild(progressContainer);
      toast.appendChild(closeBtn);

      this._container.appendChild(toast);

      // A detached progress toast may still have an outstanding timer.
      if (this._progressToast?.timeout != null) host.clearTimeout(this._progressToast.timeout);
      this._progressToast = { id, element: toast, timeout: null };
      refreshProgressTimeout(this, this._progressToast);

      // Trigger animation
      host.requestAnimationFrame(() => {
        toast.classList.add('ivlyrics-toast-show');
      });

      return id;
    },

    /**
     * Dismiss progress toast
     */
    dismissProgress() {
      const current = this._progressToast;
      if (!current || current.dismissing) return;
      current.dismissing = true;
      if (current.timeout != null) host.clearTimeout(current.timeout);
      current.timeout = null;

      hideToast(current.element, () => {
        if (this._progressToast === current) this._progressToast = null;
      });
    },

    /**
     * Dismiss a toast
     * @param {number} id - Toast ID
     */
    dismiss(id) {
      const index = this._toasts.findIndex(t => t.id === id);
      if (index === -1) return;

      const toastData = this._toasts[index];

      if (toastData.timeout) {
        host.clearTimeout(toastData.timeout);
        toastData.timeout = null;
      }

      this._toasts.splice(index, 1);
      hideToast(toastData.element);
    },

    /**
     * Dismiss all toasts
     */
    dismissAll() {
      [...this._toasts].forEach(t => this.dismiss(t.id));
    },

    /**
     * Clean up orphaned toast elements in DOM that are not tracked in _toasts array
     * This handles edge cases where DOM elements persist but tracking was lost
     */
    _cleanupOrphanedToasts() {
      if (!this._container || this._container.childElementCount === 0) return;

      const trackedIds = new Set(this._toasts.map(t => t.id));
      const domToasts = this._container.querySelectorAll('.ivlyrics-toast');

      domToasts.forEach(toast => {
        const id = parseInt(toast.dataset.toastId, 10);
        // progress toast는 별도 관리되므로 제외
        if (this._progressToast && this._progressToast.id === id) return;

        if (!trackedIds.has(id)) {
          // 추적되지 않는 toast 발견 - 제거
          console.debug(`[Toast] Cleaning up orphaned toast id=${id}`);
          toast.classList.add('ivlyrics-toast-hide');
          host.setTimeout(() => {
            if (toast.parentNode) {
              toast.parentNode.removeChild(toast);
            }
          }, 300);
        }
      });
    },

    /**
     * Start periodic cleanup (call once during initialization)
     */
    startPeriodicCleanup() {
      if (this._cleanupInterval) return;
      // 30초마다 고아 toast 정리
      this._cleanupInterval = host.setInterval(() => this._cleanupOrphanedToasts(), 30000);
    },

    /**
     * Success toast shorthand
     */
    success(message, duration = 3000) {
      return this.show(message, false, duration);
    },

    /**
     * Error toast shorthand
     */
    error(message, duration = 3000) {
      return this.show(message, true, duration);
    },

    /**
     * Warning toast shorthand
     */
    warning(message, duration = 3000) {
      return this.show(message, false, duration);
    }
  };
}
