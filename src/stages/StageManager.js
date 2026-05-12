/**
 * StageManager — Orchestrates stage lifecycle:
 *   validate → transition screen → init sim → gameplay → win
 */
import { StageValidator } from './StageValidator.js';

export class StageManager {
    constructor({ gpuCtx, fluidEngine, fluidRenderer, sceneRenderer, inputManager, hud, transitionScreen, gameLoop }) {
        this.gpuCtx = gpuCtx;
        this.engine = fluidEngine;
        this.renderer = fluidRenderer;
        this.scene = sceneRenderer;
        this.input = inputManager;
        this.hud = hud;
        this.transition = transitionScreen;
        this.gameLoop = gameLoop;

        this.currentStage = null;
        this.isPlaying = false;
        this.won = false;
        this.toolApplications = {};

        this._keyY = 0;
        this._keyVY = 0;
        this._validator = new StageValidator();
    }

    async startStage(stageConfig) {
        this.currentStage = stageConfig;
        this.won = false;
        this.toolApplications = {};

        // 1. Run design-time TDD validation
        const results = this._validator.validate(stageConfig);
        this._validator.log(results, stageConfig.title);

        // 2. Show narrative transition
        await this.transition.show(stageConfig.narrative);

        // 3. Initialize fluid engine
        this.engine.init({
            ...stageConfig.sim,
            walls: stageConfig.walls,
        });

        // 4. Seed particles
        const { spawnRegion, sim } = stageConfig;
        const positions = new Float32Array(sim.numParticles * 2);
        for (let i = 0; i < sim.numParticles; i++) {
            positions[i * 2]     = spawnRegion.minX + Math.random() * (spawnRegion.maxX - spawnRegion.minX);
            positions[i * 2 + 1] = spawnRegion.minY + Math.random() * (spawnRegion.maxY - spawnRegion.minY);
        }
        this.engine.seedParticles(positions);

        // 5. Initialize renderer
        this.renderer.init({
            numParticles: sim.numParticles,
            simWidth: sim.simWidth,
            simHeight: sim.simHeight,
            fluidColor: stageConfig.fluidColor,
        });

        // 6. Initialize scene overlay (walls + win zone)
        this.scene.init(this.gpuCtx.canvas, sim.simWidth, sim.simHeight);

        // 7. Setup input
        this.input.setSimBounds(sim.simWidth, sim.simHeight);
        this.input.activeTool = stageConfig.tools[0]?.id || null;
        this.input.onToolApply = (toolId, pos) => this._handleToolApply(toolId, pos);

        // 8. Show HUD
        this.hud.show(stageConfig);
        this.hud.onToolSelect((toolId) => { this.input.activeTool = toolId; });

        // 9. Key object state (Stage 2)
        if (stageConfig.keyObject) {
            this._keyY = stageConfig.keyObject.y;
            this._keyVY = 0;
        }

        // 10. Start game loop
        this.isPlaying = true;
        this.gameLoop.onUpdate = (dt) => this._update(dt);
        this.gameLoop.onRender = () => this._render();
        this.gameLoop.start();
    }

    stopStage() {
        this.isPlaying = false;
        this.gameLoop.stop();
        this.hud.hide();
        this.scene.hide();
    }

    _handleToolApply(toolId, _pos) {
        if (this.won) return;

        const tool = this.currentStage.tools.find(t => t.id === toolId);
        if (!tool) return;

        if (tool.maxApplications) {
            this.toolApplications[toolId] = (this.toolApplications[toolId] || 0) + 1;
            if (this.toolApplications[toolId] > tool.maxApplications) return;
        }

        const current = this.engine._simParamsData[tool.effect];
        this.engine.updateParam(tool.effect, current + tool.delta);
    }

    _update(dt) {
        if (!this.isPlaying || this.won) return;

        const commandEncoder = this.gpuCtx.device.createCommandEncoder();
        this.engine.encodeStep(commandEncoder);
        this.gpuCtx.device.queue.submit([commandEncoder.finish()]);

        const elapsed = this.hud.updateGauges(this.engine._simParamsData);

        // Key object physics (Stage 2 — simplified buoyancy)
        if (this.currentStage.keyObject) {
            const key = this.currentStage.keyObject;
            const fluidDensity = this.engine._simParamsData.restDensity;
            const volume = key.width * key.height;
            const buoyancyForce = (fluidDensity - key.density) * volume * 9.81 * 0.001;
            const drag = -this._keyVY * 2.0;
            this._keyVY += (buoyancyForce + drag) * dt;
            this._keyY  += this._keyVY * dt;

            const tankBottom = 13.0, tankTop = 2.0;
            if (this._keyY > tankBottom) { this._keyY = tankBottom; this._keyVY = 0; }
            if (this._keyY < tankTop)    { this._keyY = tankTop;    this._keyVY = 0; }
        }

        this._checkWin(elapsed);
    }

    _render() {
        if (!this.isPlaying) return;

        // WebGPU: fluid
        const commandEncoder = this.gpuCtx.device.createCommandEncoder();
        this.renderer.encodeRender(commandEncoder, this.engine.particleBuffer);
        this.gpuCtx.device.queue.submit([commandEncoder.finish()]);

        // Canvas 2D: scene geometry (walls + win zone)
        const wc = this.currentStage.winCondition;
        this.scene.render(
            this.currentStage.walls,
            wc.zone || null
        );

        // DOM: key object emoji (Stage 2)
        this._renderKeyObject();
    }

    _renderKeyObject() {
        if (!this.currentStage?.keyObject) return;

        let keyEl = document.getElementById('key-object');
        if (!keyEl) {
            keyEl = document.createElement('div');
            keyEl.id = 'key-object';
            keyEl.style.cssText =
                'position:fixed;z-index:12;pointer-events:none;' +
                'display:flex;align-items:center;justify-content:center;' +
                'font-size:1.8rem;filter:drop-shadow(0 0 8px rgba(200,170,50,0.5));' +
                'transition:top 0.1s linear;';
            keyEl.textContent = '🗝️';
            document.body.appendChild(keyEl);
        }

        const key = this.currentStage.keyObject;
        const canvas = this.gpuCtx.canvas;
        const rect = canvas.getBoundingClientRect();
        const sx = (key.x / this.engine.simWidth)  * rect.width  + rect.left;
        const sy = (this._keyY / this.engine.simHeight) * rect.height + rect.top;
        keyEl.style.left = `${sx - 16}px`;
        keyEl.style.top  = `${sy - 12}px`;
    }

    _checkWin(elapsed) {
        const wc = this.currentStage.winCondition;
        if (wc.check(this.engine._simParamsData, elapsed, { keyY: this._keyY })) {
            this._triggerWin();
        }
    }

    _triggerWin() {
        if (this.won) return;
        this.won = true;
        this.hud.showWin(this.currentStage.winMessage);
    }

    cleanup() {
        document.getElementById('key-object')?.remove();
        this.scene.destroy();
    }
}
