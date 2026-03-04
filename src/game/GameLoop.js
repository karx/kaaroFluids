/**
 * GameLoop — RAF-based game loop with fixed-timestep physics
 */
export class GameLoop {
    constructor() {
        this.isRunning = false;
        this.onUpdate = null;
        this.onRender = null;
        this._rafId = null;
        this._lastTime = 0;
        this._accumulator = 0;
        this.fixedDt = 1 / 60;
        this.physicsStepsPerFrame = 2; // sub-steps for stability
    }

    start() {
        this.isRunning = true;
        this._lastTime = performance.now();
        this._accumulator = 0;
        this._tick();
    }

    stop() {
        this.isRunning = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    _tick() {
        if (!this.isRunning) return;

        const now = performance.now();
        let frameDt = (now - this._lastTime) / 1000;
        this._lastTime = now;

        // Clamp to prevent spiral of death
        if (frameDt > 0.1) frameDt = 0.1;

        this._accumulator += frameDt;

        // Fixed-step physics
        let steps = 0;
        while (this._accumulator >= this.fixedDt && steps < this.physicsStepsPerFrame) {
            if (this.onUpdate) this.onUpdate(this.fixedDt);
            this._accumulator -= this.fixedDt;
            steps++;
        }

        // Render
        if (this.onRender) this.onRender();

        this._rafId = requestAnimationFrame(() => this._tick());
    }
}
