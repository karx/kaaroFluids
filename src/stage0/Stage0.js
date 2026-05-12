/**
 * Stage 0 — Fluid Sandbox
 *
 * Boots the MLS-MPM fluid simulation and renders it via Three.js WebGPU.
 * The sandbox lets players explore fluid dynamics with live parameter controls
 * before any scored stages begin.
 */

import { MLSMPMSim } from '../sim/MLSMPMSim.js';
import { ParticleRenderer } from '../render/ParticleRenderer.js';
import { SandboxPanel } from './SandboxPanel.js';

const DEFAULT_PARTICLES = 8000;
const DEFAULT_SUBSTEPS  = 8;
const DEFAULT_REGION    = { minX: 0.1, minY: 0.55, maxX: 0.9, maxY: 0.95 };

export class Stage0 {
    constructor(canvas) {
        this.canvas   = canvas;
        this._running = false;
        this._rafId   = null;
        this._substeps = DEFAULT_SUBSTEPS;
        this._sim      = null;
        this._renderer = null;
        this._panel    = null;
    }

    async start() {
        // Build renderer first (owns the WebGPU device)
        this._sim = new MLSMPMSim(null, DEFAULT_PARTICLES, DEFAULT_REGION);
        this._renderer = new ParticleRenderer(this.canvas, this._sim);

        const gpuRenderer = await this._renderer.init();

        // Now patch sim with the real renderer reference
        this._sim.renderer = gpuRenderer;

        // Mount UI panel
        this._panel = new SandboxPanel({
            onReset: (region) => this._reset(region),
        });
        this._panel.mount();

        // Wire panel parameter events
        document.body.addEventListener('param', (e) => this._onParam(e.detail));

        this._running = true;
        this._loop();
    }

    async _loop() {
        if (!this._running) return;

        // Run physics substeps
        await this._sim.substeps(this._substeps);

        // Render
        this._renderer.render();

        this._rafId = requestAnimationFrame(() => this._loop());
    }

    async _reset(region) {
        this._running = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);

        // Dispose old sim (just recreate — no expensive GPU teardown needed)
        this._sim = new MLSMPMSim(this._renderer.renderer, DEFAULT_PARTICLES, region);

        // Update renderer to point at new sim buffers
        this._renderer.sim = this._sim;
        this._renderer._buildMesh();

        this._running = true;
        this._loop();
    }

    _onParam({ param, value }) {
        switch (param) {
            case 'gravity':
                this._sim.uGravityY.value = value;
                break;
            case 'stiffness':
                this._sim.uBulkK.value = value;
                break;
            case 'substeps':
                this._substeps = value;
                break;
        }
    }

    stop() {
        this._running = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._panel?.unmount();
        this._renderer?.destroy();
    }
}
