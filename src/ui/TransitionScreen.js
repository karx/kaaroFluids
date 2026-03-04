/**
 * TransitionScreen — Narrative screenplay display between stages
 * Placeholder for future video enrichment
 */
export class TransitionScreen {
    constructor() {
        this._el = null;
        this._resolve = null;
    }

    /**
     * Show the transition screen with a narrative screenplay
     * Returns a promise that resolves when the user clicks through
     */
    show(narrative) {
        return new Promise((resolve) => {
            this._resolve = resolve;
            this._el = document.createElement('div');
            this._el.className = 'transition-screen';
            this._el.innerHTML = `
        <div class="transition-inner">
          <div class="transition-video-placeholder">
            <div class="transition-video-icon">▶</div>
            <span class="transition-video-label">VIDEO PLACEHOLDER</span>
          </div>
          <h1 class="transition-title">${narrative.title}</h1>
          <div class="screenplay">
            ${narrative.screenplay.map(line => {
                if (line === '') return '<br/>';
                if (line.startsWith('        ')) return `<p class="screenplay-whisper">${line.trim()}</p>`;
                if (line.startsWith('INT.') || line.startsWith('EXT.')) return `<p class="screenplay-heading">${line}</p>`;
                if (line === 'FADE IN:' || line === 'FADE TO GAMEPLAY.') return `<p class="screenplay-direction">${line}</p>`;
                return `<p class="screenplay-line">${line}</p>`;
            }).join('\n')}
          </div>
          <button class="transition-btn">Begin</button>
        </div>
      `;

            // Style injection (one-time)
            if (!document.getElementById('transition-styles')) {
                const style = document.createElement('style');
                style.id = 'transition-styles';
                style.textContent = `
          .transition-screen {
            position: fixed; inset: 0; z-index: 50;
            display: flex; align-items: center; justify-content: center;
            background: #050810;
            animation: ts-fade-in 0.8s ease;
          }
          @keyframes ts-fade-in { from { opacity: 0; } to { opacity: 1; } }
          .transition-inner {
            max-width: 640px; padding: 48px; text-align: center;
          }
          .transition-video-placeholder {
            width: 100%; aspect-ratio: 16/9;
            background: rgba(255,255,255,0.03);
            border: 1px dashed rgba(255,255,255,0.1);
            border-radius: 12px;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            gap: 8px; margin-bottom: 40px;
            color: rgba(255,255,255,0.2);
          }
          .transition-video-icon { font-size: 2rem; }
          .transition-video-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.65rem; letter-spacing: 3px;
          }
          .transition-title {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem; letter-spacing: 4px;
            color: rgba(200,210,230,0.5);
            margin-bottom: 32px;
          }
          .screenplay { text-align: left; margin-bottom: 40px; }
          .screenplay-heading {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.75rem; letter-spacing: 2px;
            color: rgba(200,210,230,0.4);
            margin-bottom: 12px;
            text-transform: uppercase;
          }
          .screenplay-direction {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.7rem; letter-spacing: 2px;
            color: rgba(200,210,230,0.3);
            margin: 16px 0;
          }
          .screenplay-line {
            font-family: 'Inter', sans-serif;
            font-size: 0.95rem; line-height: 1.8;
            color: rgba(230,235,245,0.7);
            font-weight: 300;
          }
          .screenplay-whisper {
            font-family: 'Inter', sans-serif;
            font-size: 1.1rem; line-height: 1.8;
            color: rgba(77,154,255,0.8);
            font-style: italic;
            text-align: center;
            margin: 24px 0;
          }
          .transition-btn {
            padding: 14px 48px;
            background: transparent;
            border: 1px solid rgba(77,154,255,0.3);
            border-radius: 8px;
            color: rgba(200,210,230,0.7);
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem; letter-spacing: 2px;
            cursor: pointer;
            transition: all 0.3s;
          }
          .transition-btn:hover {
            background: rgba(77,154,255,0.1);
            border-color: rgba(77,154,255,0.5);
            color: #e8ecf4;
          }
          .transition-screen.ts-out { animation: ts-fade-out 0.6s ease forwards; }
          @keyframes ts-fade-out { to { opacity: 0; } }
        `;
                document.head.appendChild(style);
            }

            document.body.appendChild(this._el);

            // Animate lines in sequentially
            const lines = this._el.querySelectorAll('.screenplay p');
            lines.forEach((line, i) => {
                line.style.opacity = '0';
                line.style.transform = 'translateY(8px)';
                line.style.transition = `opacity 0.5s ease ${i * 0.15}s, transform 0.5s ease ${i * 0.15}s`;
                requestAnimationFrame(() => {
                    line.style.opacity = '1';
                    line.style.transform = 'translateY(0)';
                });
            });

            // Button click
            this._el.querySelector('.transition-btn').addEventListener('click', () => {
                this._hide();
            });
        });
    }

    _hide() {
        this._el.classList.add('ts-out');
        setTimeout(() => {
            this._el.remove();
            this._el = null;
            if (this._resolve) this._resolve();
        }, 600);
    }
}
