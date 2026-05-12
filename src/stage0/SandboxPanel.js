/**
 * SandboxPanel — floating HTML control panel for Stage 0.
 *
 * Provides real-time sliders for simulation parameters (gravity, stiffness)
 * and a reset button that calls back with the desired spawn region.
 */

export class SandboxPanel {
    /**
     * @param {{ onReset: (region) => void }} callbacks
     */
    constructor({ onReset }) {
        this._onReset = onReset;
        this._el      = null;
    }

    mount() {
        const panel = document.createElement('div');
        panel.id = 'sandbox-panel';
        panel.innerHTML = `
            <div class="sp-header">
                <span class="sp-title">Fluid Sandbox</span>
                <span class="sp-badge">MLS-MPM</span>
            </div>

            <label class="sp-row">
                <span class="sp-label">Gravity</span>
                <input id="sp-gravity" type="range" min="-30" max="0" step="0.5" value="-9.8">
                <span class="sp-val" id="sp-gravity-val">9.8 m/s²</span>
            </label>

            <label class="sp-row">
                <span class="sp-label">Stiffness</span>
                <input id="sp-stiffness" type="range" min="1" max="200" step="1" value="50">
                <span class="sp-val" id="sp-stiffness-val">50</span>
            </label>

            <label class="sp-row">
                <span class="sp-label">Substeps / frame</span>
                <input id="sp-substeps" type="range" min="1" max="20" step="1" value="8">
                <span class="sp-val" id="sp-substeps-val">8</span>
            </label>

            <div class="sp-spawns">
                <span class="sp-label">Spawn shape</span>
                <div class="sp-spawn-btns">
                    <button class="sp-spawn active" data-region="top">Dam</button>
                    <button class="sp-spawn" data-region="left">Left wall</button>
                    <button class="sp-spawn" data-region="center">Pool</button>
                </div>
            </div>

            <button id="sp-reset">↺ Reset</button>
        `;

        document.body.appendChild(panel);
        this._el = panel;
        this._bindEvents();
    }

    _bindEvents() {
        const gravity   = this._el.querySelector('#sp-gravity');
        const stiffness = this._el.querySelector('#sp-stiffness');
        const substeps  = this._el.querySelector('#sp-substeps');

        gravity.addEventListener('input', () => {
            this._el.querySelector('#sp-gravity-val').textContent =
                Math.abs(+gravity.value).toFixed(1) + ' m/s²';
            this._dispatch('gravity', +gravity.value);
        });

        stiffness.addEventListener('input', () => {
            this._el.querySelector('#sp-stiffness-val').textContent = stiffness.value;
            this._dispatch('stiffness', +stiffness.value);
        });

        substeps.addEventListener('input', () => {
            this._el.querySelector('#sp-substeps-val').textContent = substeps.value;
            this._dispatch('substeps', +substeps.value);
        });

        this._el.querySelector('#sp-reset').addEventListener('click', () => {
            const active = this._el.querySelector('.sp-spawn.active');
            const region = active ? active.dataset.region : 'top';
            this._onReset(this._regionFor(region));
        });

        this._el.querySelectorAll('.sp-spawn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._el.querySelectorAll('.sp-spawn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    _regionFor(key) {
        const regions = {
            top:    { minX: 0.1, minY: 0.55, maxX: 0.9, maxY: 0.95 },
            left:   { minX: 0.05, minY: 0.1, maxX: 0.45, maxY: 0.9 },
            center: { minX: 0.3, minY: 0.3, maxX: 0.7, maxY: 0.7  },
        };
        return regions[key] ?? regions.top;
    }

    _dispatch(param, value) {
        this._el.dispatchEvent(new CustomEvent('param', { bubbles: true, detail: { param, value } }));
    }

    /** Listen for parameter changes. */
    on(event, handler) {
        document.body.addEventListener(event === 'param' ? 'param' : event, handler);
        return this;
    }

    unmount() {
        this._el?.remove();
    }
}
