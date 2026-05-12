import { Stage0 } from './stage0/Stage0.js';

const canvas = document.getElementById('canvas');

if (!navigator.gpu) {
    document.getElementById('no-webgpu').style.display = 'flex';
} else {
    const stage0 = new Stage0(canvas);
    stage0.start().catch(err => {
        console.error('Stage 0 failed to start:', err);
        document.getElementById('no-webgpu').textContent =
            'WebGPU initialisation error — see console for details.';
        document.getElementById('no-webgpu').style.display = 'flex';
    });
}
