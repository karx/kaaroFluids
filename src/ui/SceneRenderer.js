/**
 * SceneRenderer — Canvas 2D overlay for scene geometry.
 * Draws walls and win zone on top of the WebGPU canvas so the player
 * can see the level layout. Sits at z-index 5 (below HUD at 20).
 */
export class SceneRenderer {
    constructor() {
        this._canvas = null;
        this._ctx = null;
        this._simW = 1;
        this._simH = 1;
        this._gpuCanvas = null;
        this._onResize = () => this._syncSize();
    }

    init(gpuCanvas, simWidth, simHeight) {
        this._gpuCanvas = gpuCanvas;
        this._simW = simWidth;
        this._simH = simHeight;

        if (!this._canvas) {
            this._canvas = document.createElement('canvas');
            this._canvas.style.cssText =
                'position:fixed;top:0;left:0;width:100%;height:100%;z-index:5;pointer-events:none;';
            document.body.appendChild(this._canvas);
            this._ctx = this._canvas.getContext('2d');
        }

        this._syncSize();
        window.addEventListener('resize', this._onResize);
        this._canvas.style.display = 'block';
    }

    _syncSize() {
        if (!this._canvas || !this._gpuCanvas) return;
        this._canvas.width = this._gpuCanvas.width;
        this._canvas.height = this._gpuCanvas.height;
    }

    // Sim-space → canvas pixel
    _sx(x) { return (x / this._simW) * this._canvas.width; }
    _sy(y) { return (y / this._simH) * this._canvas.height; }

    render(walls, winZone) {
        const ctx = this._ctx;
        if (!ctx || !this._canvas.width) return;

        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        // --- Walls ---
        for (const w of walls) {
            const x = this._sx(w.minX);
            const y = this._sy(w.minY);
            const rw = this._sx(w.maxX) - x;
            const rh = this._sy(w.maxY) - y;

            ctx.save();

            // Glow
            ctx.shadowColor = 'rgba(100, 160, 255, 0.4)';
            ctx.shadowBlur = 8;

            ctx.fillStyle = 'rgba(40, 80, 170, 0.45)';
            ctx.beginPath();
            ctx.roundRect(x, y, rw, rh, 3);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(120, 175, 255, 0.75)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.restore();
        }

        // --- Win zone ---
        if (winZone) {
            const x = this._sx(winZone.minX);
            const y = this._sy(winZone.minY);
            const rw = this._sx(winZone.maxX) - x;
            const rh = this._sy(winZone.maxY) - y;

            ctx.save();
            ctx.fillStyle = 'rgba(52, 211, 153, 0.05)';
            ctx.fillRect(x, y, rw, rh);

            ctx.strokeStyle = 'rgba(52, 211, 153, 0.5)';
            ctx.setLineDash([7, 4]);
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x, y, rw, rh);

            // "GOAL" label
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(52, 211, 153, 0.4)';
            ctx.font = `${Math.max(10, rh * 0.18)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('GOAL', x + rw / 2, y + rh / 2);
            ctx.restore();
        }
    }

    hide() {
        if (this._canvas) this._canvas.style.display = 'none';
    }

    show() {
        if (this._canvas) this._canvas.style.display = 'block';
    }

    destroy() {
        window.removeEventListener('resize', this._onResize);
        if (this._canvas) {
            this._canvas.remove();
            this._canvas = null;
            this._ctx = null;
        }
    }
}
