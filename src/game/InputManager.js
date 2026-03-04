/**
 * InputManager — Mouse/touch input for tool interaction
 */
export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.isPointerDown = false;
        this.pointerPos = { x: 0, y: 0 };
        this.pointerWorldPos = { x: 0, y: 0 };
        this.activeTool = null;
        this.onToolApply = null;
        this.simWidth = 1;
        this.simHeight = 1;

        this._bindEvents();
    }

    setSimBounds(w, h) {
        this.simWidth = w;
        this.simHeight = h;
    }

    _toWorld(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const nx = (clientX - rect.left) / rect.width;
        const ny = (clientY - rect.top) / rect.height;
        return {
            x: nx * this.simWidth,
            y: ny * this.simHeight,
        };
    }

    _bindEvents() {
        this.canvas.addEventListener('pointerdown', (e) => {
            this.isPointerDown = true;
            this.pointerWorldPos = this._toWorld(e.clientX, e.clientY);
            this._applyTool();
        });

        this.canvas.addEventListener('pointermove', (e) => {
            this.pointerWorldPos = this._toWorld(e.clientX, e.clientY);
            if (this.isPointerDown) {
                this._applyTool();
            }
        });

        this.canvas.addEventListener('pointerup', () => {
            this.isPointerDown = false;
        });

        this.canvas.addEventListener('pointerleave', () => {
            this.isPointerDown = false;
        });
    }

    _applyTool() {
        if (this.activeTool && this.onToolApply) {
            this.onToolApply(this.activeTool, this.pointerWorldPos);
        }
    }
}
