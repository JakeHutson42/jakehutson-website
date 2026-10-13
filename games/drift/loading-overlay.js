// A top-layer dialog blocks pointer and keyboard input, including in fullscreen.
// Nested operations share one lock; a failed operation always releases its lock.
export class LoadingOverlay {
    constructor(dialog, onLock = () => {}) {
        this.dialog = dialog;
        this.onLock = onLock;
        this.depth = 0;
        dialog.addEventListener('cancel', event => event.preventDefault());
        // Intercept Escape before the browser's native dialog dismissal action.
        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
            }
        });
    }
    get active() { return this.depth > 0; }
    async run(message, operation) {
        const firstOperation = this.depth++ === 0;
        try {
            if (firstOperation) {
                this.dialog.removeAttribute('data-complete');
                this.onLock();
                this.dialog.showModal();
                document.documentElement.setAttribute('aria-busy', 'true');
            }
            this.dialog.querySelector('[data-loading-label]').textContent = message;
            // Paint the loading UI before starting synchronous geometry/GPU work.
            await this.nextPaint();
            const result = await operation();
            if (firstOperation) {
                this.dialog.setAttribute('data-complete', '');
                await this.nextPaint();
            }
            return result;
        } finally {
            if (--this.depth === 0) {
                if (this.dialog.open) this.dialog.close();
                document.documentElement.removeAttribute('aria-busy');
            }
        }
    }
    nextPaint() { return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
}
