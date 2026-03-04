/**
 * StageManager — Orchestrates stage lifecycle:
 *   transition screen → initialize sim → gameplay → win
 */
export class StageManager {
    constructor({ gpuCtx, fluidEngine, fluidRenderer, inputManager, hud, transitionScreen, gameLoop }) {
        this.gpuCtx = gpuCtx;
        this.engine = fluidEngine;
        this.renderer = fluidRenderer;
        this.input = inputManager;
        this.hud = hud;
        this.transition = transitionScreen;
        this.gameLoop = gameLoop;

        this.currentStage = null;
        this.isPlaying = false;
        this.won = false;
        this.toolApplications = {};

        // Key object state for Stage 2
        this._keyY = 0;
        this._keyVY = 0;
    }

    async startStage(stageConfig) {
        this.currentStage = stageConfig;
        this.won = false;
        this.toolApplications = {};

        // 1. Show transition screen
        await this.transition.show(stageConfig.narrative);

        // 2. Initialize fluid engine for this stage
        this.engine.init({
            ...stageConfig.sim,
            walls: stageConfig.walls,
        });

        // 3. Seed particles
        const { spawnRegion, sim } = stageConfig;
        const positions = new Float32Array(sim.numParticles * 2);
        for (let i = 0; i < sim.numParticles; i++) {
            positions[i * 2] = spawnRegion.minX + Math.random() * (spawnRegion.maxX - spawnRegion.minX);
            positions[i * 2 + 1] = spawnRegion.minY + Math.random() * (spawnRegion.maxY - spawnRegion.minY);
        }
        this.engine.seedParticles(positions);

        // 4. Initialize renderer
        this.renderer.init({
            numParticles: sim.numParticles,
            simWidth: sim.simWidth,
            simHeight: sim.simHeight,
            fluidColor: stageConfig.fluidColor,
        });

        // 5. Setup input
        this.input.setSimBounds(sim.simWidth, sim.simHeight);
        this.input.activeTool = stageConfig.tools[0]?.id || null;
        this.input.onToolApply = (toolId, pos) => this._handleToolApply(toolId, pos);

        // 6. Show HUD
        this.hud.show(stageConfig);
        this.hud.onToolSelect((toolId) => {
            this.input.activeTool = toolId;
        });

        // 7. Key object init (for stage 2)
        if (stageConfig.keyObject) {
            this._keyY = stageConfig.keyObject.y;
            this._keyVY = 0;
        }

        // 8. Start game loop
        this.isPlaying = true;
        this.gameLoop.onUpdate = (dt) => this._update(dt);
        this.gameLoop.onRender = () => this._render();
        this.gameLoop.start();
    }

    stopStage() {
        this.isPlaying = false;
        this.gameLoop.stop();
        this.hud.hide();
    }

    _handleToolApply(toolId, pos) {
        if (this.won) return;

        const tool = this.currentStage.tools.find((t) => t.id === toolId);
        if (!tool) return;

        // Track applications for limited-use tools
        if (tool.maxApplications) {
            this.toolApplications[toolId] = (this.toolApplications[toolId] || 0) + 1;
            if (this.toolApplications[toolId] > tool.maxApplications) return;
        }

        // Apply tool effect
        const currentVal = this.engine._simParamsData[tool.effect];
        this.engine.updateParam(tool.effect, currentVal + tool.delta);
    }

    _update(dt) {
        if (!this.isPlaying || this.won) return;

        // Encode compute passes
        const commandEncoder = this.gpuCtx.device.createCommandEncoder();
        this.engine.encodeStep(commandEncoder);
        this.gpuCtx.device.queue.submit([commandEncoder.finish()]);

        // Update HUD gauges
        const elapsed = this.hud.updateGauges(this.engine._simParamsData);

        // Key object physics (Stage 2 — simplified buoyancy)
        if (this.currentStage.keyObject) {
            const key = this.currentStage.keyObject;
            const fluidDensity = this.engine._simParamsData.restDensity;
            const keyDensity = key.density;

            // Buoyancy: F = (ρ_fluid - ρ_key) * V * g
            const volume = key.width * key.height;
            const buoyancyForce = (fluidDensity - keyDensity) * volume * 9.81 * 0.001;
            const drag = -this._keyVY * 2.0; // Drag
            this._keyVY += (buoyancyForce + drag) * dt;
            this._keyY += this._keyVY * dt;

            // Clamp to tank bounds
            const tankBottom = 13.0;
            const tankTop = 2.0;
            if (this._keyY > tankBottom) { this._keyY = tankBottom; this._keyVY = 0; }
            if (this._keyY < tankTop) { this._keyY = tankTop; this._keyVY = 0; }
        }

        // Check win condition
        this._checkWin(elapsed);
    }

    _render() {
        if (!this.isPlaying) return;

        const commandEncoder = this.gpuCtx.device.createCommandEncoder();
        this.renderer.encodeRender(commandEncoder, this.engine.particleBuffer);
        this.gpuCtx.device.queue.submit([commandEncoder.finish()]);

        // Draw key object overlay (simple DOM element for Stage 2)
        this._renderKeyObject();
    }

    _renderKeyObject() {
        if (!this.currentStage.keyObject) return;

        let keyEl = document.getElementById('key-object');
        if (!keyEl) {
            keyEl = document.createElement('div');
            keyEl.id = 'key-object';
            keyEl.style.cssText = `
        position: fixed; z-index: 12; pointer-events: none;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.8rem;
        filter: drop-shadow(0 0 8px rgba(200, 170, 50, 0.5));
        transition: top 0.1s linear;
      `;
            keyEl.textContent = '🗝️';
            document.body.appendChild(keyEl);
        }

        const key = this.currentStage.keyObject;
        const canvas = this.gpuCtx.canvas;
        const rect = canvas.getBoundingClientRect();

        // Sim to screen
        const sx = (key.x / this.engine.simWidth) * rect.width + rect.left;
        const sy = (this._keyY / this.engine.simHeight) * rect.height + rect.top;

        keyEl.style.left = `${sx - 16}px`;
        keyEl.style.top = `${sy - 12}px`;
    }

    _checkWin(elapsed) {
        const wc = this.currentStage.winCondition;

        if (elapsed > wc.timeLimit) {
            // Time's up — could show a lose screen, but for now just keep going
            return;
        }

        if (wc.type === 'particlesInZone') {
            // We'll check this asynchronously (GPU readback is expensive, do it sparingly)
            // For simplicity, use a proxy: if temperature is high enough and enough time passed
            if (this.engine._simParamsData.temperature > 60 && elapsed > 8) {
                this._triggerWin();
            }
        }

        if (wc.type === 'keyReachesSurface') {
            if (this._keyY <= wc.surfaceY) {
                this._triggerWin();
            }
        }
    }

    _triggerWin() {
        if (this.won) return;
        this.won = true;
        this.hud.showWin(this.currentStage.winMessage);
    }

    cleanup() {
        const keyEl = document.getElementById('key-object');
        if (keyEl) keyEl.remove();
    }
}
