/**
 * HUD — Glassmorphism heads-up display with gauges, timer, and callouts
 */
export class HUD {
    constructor() {
        this._calloutTimeouts = [];
        this._triggeredCallouts = new Set();
        this._whisperEl = null;
    }

    show(stageConfig) {
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');

        // Stage info
        document.getElementById('hud-stage-title').textContent = stageConfig.title;
        document.getElementById('hud-objective').textContent = stageConfig.description;

        // Timer
        this._timeLimit = stageConfig.winCondition.timeLimit;
        this._startTime = Date.now();

        // Build gauges
        const gaugePanel = document.getElementById('gauge-panel');
        gaugePanel.innerHTML = '';
        this._gaugeEls = {};

        stageConfig.gauges.forEach((g) => {
            const gauge = document.createElement('div');
            gauge.className = 'gauge';
            gauge.innerHTML = `
        <div class="gauge-label">${g.label}</div>
        <div class="gauge-value" id="gauge-val-${g.id}">
          <span class="gauge-num">0</span>
          <span class="gauge-unit">${g.unit}</span>
        </div>
        <div class="gauge-bar-track">
          <div class="gauge-bar-fill" id="gauge-bar-${g.id}" style="background: ${g.color}; width: 0%"></div>
        </div>
      `;
            gaugePanel.appendChild(gauge);
            this._gaugeEls[g.id] = {
                num: gauge.querySelector('.gauge-num'),
                bar: gauge.querySelector('.gauge-bar-fill'),
                config: g,
            };
        });

        // Build toolbar
        const toolbar = document.getElementById('toolbar');
        toolbar.innerHTML = '';
        this._toolBtns = {};

        stageConfig.tools.forEach((tool, i) => {
            const btn = document.createElement('button');
            btn.className = `tool-btn${i === 0 ? ' active' : ''}`;
            btn.innerHTML = `
        <span class="tool-icon">${tool.icon}</span>
        <span class="tool-label">${tool.name}</span>
      `;
            btn.dataset.toolId = tool.id;
            toolbar.appendChild(btn);
            this._toolBtns[tool.id] = btn;
        });

        // Whisper text (contemplative overlay)
        this._createWhisper(stageConfig.narrative?.whisper);

        // Hide win overlay
        document.getElementById('win-overlay').classList.add('hidden');
        document.getElementById('callout').classList.add('hidden');

        this._stageConfig = stageConfig;
        this._triggeredCallouts.clear();
    }

    hide() {
        document.getElementById('hud').classList.add('hidden');
        this._clearWhisper();
    }

    _createWhisper(text) {
        this._clearWhisper();
        if (!text) return;

        this._whisperEl = document.createElement('div');
        this._whisperEl.style.cssText = `
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      font-family: 'Inter', sans-serif;
      font-size: 1.4rem; font-style: italic; font-weight: 300;
      color: rgba(77,154,255,0.15);
      pointer-events: none; z-index: 15;
      text-align: center; max-width: 400px;
      transition: opacity 3s ease;
    `;
        this._whisperEl.textContent = `"${text}"`;
        document.body.appendChild(this._whisperEl);

        // Slowly fade out over 10 seconds
        setTimeout(() => {
            if (this._whisperEl) this._whisperEl.style.opacity = '0';
        }, 5000);
        setTimeout(() => this._clearWhisper(), 15000);
    }

    _clearWhisper() {
        if (this._whisperEl) {
            this._whisperEl.remove();
            this._whisperEl = null;
        }
    }

    updateGauges(simParams) {
        for (const [id, gauge] of Object.entries(this._gaugeEls)) {
            const cfg = gauge.config;
            let value;

            if (cfg.static !== undefined) {
                value = cfg.static;
            } else if (cfg.compute) {
                value = cfg.compute(simParams);
                gauge.num.textContent = value;
                continue;
            } else {
                value = simParams[cfg.param] || 0;
            }

            gauge.num.textContent = typeof value === 'number' ? value.toFixed(1) : value;
            const pct = ((value - cfg.min) / (cfg.max - cfg.min)) * 100;
            gauge.bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        }

        // Timer
        const elapsed = (Date.now() - this._startTime) / 1000;
        const remaining = Math.max(0, this._timeLimit - elapsed);
        document.getElementById('hud-timer-text').textContent = `${Math.ceil(remaining)}s`;
        const pct = (remaining / this._timeLimit) * 100;
        document.getElementById('hud-timer-fill').style.width = `${pct}%`;

        // Check callouts
        this._checkCallouts(simParams);

        return elapsed;
    }

    _checkCallouts(simParams) {
        if (!this._stageConfig.callouts) return;

        for (const callout of this._stageConfig.callouts) {
            const key = `${callout.trigger}-${callout.value}`;
            if (this._triggeredCallouts.has(key)) continue;

            let triggered = false;
            if (callout.trigger === 'temperatureAbove' && simParams.temperature > callout.value) {
                triggered = true;
            }
            if (callout.trigger === 'restDensityAbove' && simParams.restDensity > callout.value) {
                triggered = true;
            }

            if (triggered) {
                this._triggeredCallouts.add(key);
                this.showCallout(callout.text);
            }
        }
    }

    showCallout(text) {
        const el = document.getElementById('callout');
        document.getElementById('callout-text').textContent = text;
        el.classList.remove('hidden');

        // Auto-hide after 6 seconds
        clearTimeout(this._calloutTimer);
        this._calloutTimer = setTimeout(() => {
            el.classList.add('hidden');
        }, 6000);
    }

    showWin(message) {
        const overlay = document.getElementById('win-overlay');
        document.getElementById('win-message').textContent = message;
        overlay.classList.remove('hidden');
    }

    getActiveTool() {
        const active = document.querySelector('.tool-btn.active');
        return active?.dataset.toolId || null;
    }

    onToolSelect(callback) {
        document.getElementById('toolbar').addEventListener('click', (e) => {
            const btn = e.target.closest('.tool-btn');
            if (!btn) return;

            // Deactivate all
            document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            callback(btn.dataset.toolId);
        });
    }

    onBack(callback) {
        document.getElementById('hud-back-btn').addEventListener('click', callback);
    }

    onWinContinue(callback) {
        document.getElementById('win-continue').addEventListener('click', callback);
    }
}
