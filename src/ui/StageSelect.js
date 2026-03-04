/**
 * StageSelect — Stage selection screen with card-based layout
 */
import { stage1Config } from '../stages/stage1_theflow.js';
import { stage2Config } from '../stages/stage2_risingkey.js';

export const STAGES = [stage1Config, stage2Config];

export class StageSelect {
    constructor() {
        this.onStageSelect = null;
    }

    show() {
        const screen = document.getElementById('stage-select');
        const container = document.getElementById('stage-cards');
        container.innerHTML = '';

        STAGES.forEach((stage) => {
            const card = document.createElement('div');
            card.className = `stage-card${stage.locked ? ' locked' : ''}`;
            card.innerHTML = `
        <span class="stage-card-icon">${stage.icon}</span>
        <span class="stage-card-num">Stage ${stage.number}</span>
        <h3 class="stage-card-title">${stage.title}</h3>
        <p class="stage-card-desc">${stage.description}</p>
        <span class="stage-card-concept">${stage.concept}</span>
      `;

            if (!stage.locked) {
                card.addEventListener('click', () => {
                    if (this.onStageSelect) this.onStageSelect(stage);
                });
            }

            container.appendChild(card);
        });

        screen.classList.remove('hidden');
    }

    hide() {
        document.getElementById('stage-select').classList.add('hidden');
    }
}
