/**
 * DynoFluid — Main Entry Point
 * Initializes WebGPU, wires all systems, and starts the game.
 */
import './styles/index.css';
import { GPUContext } from './gpu/GPUContext.js';
import { FluidEngine } from './gpu/FluidEngine.js';
import { FluidRenderer } from './gpu/FluidRenderer.js';
import { GameLoop } from './game/GameLoop.js';
import { InputManager } from './game/InputManager.js';
import { StageSelect } from './ui/StageSelect.js';
import { HUD } from './ui/HUD.js';
import { TransitionScreen } from './ui/TransitionScreen.js';
import { StageManager } from './stages/StageManager.js';

async function main() {
    // --- WebGPU support check ---
    if (!navigator.gpu) {
        document.getElementById('no-webgpu').classList.remove('hidden');
        return;
    }

    // --- Initialize WebGPU ---
    const canvas = document.getElementById('gpu-canvas');
    const gpuCtx = new GPUContext();

    try {
        await gpuCtx.init(canvas);
    } catch (err) {
        console.error('WebGPU init failed:', err);
        document.getElementById('no-webgpu').classList.remove('hidden');
        return;
    }

    // Resize canvas to match display
    const resizeCanvas = () => {
        gpuCtx.resizeCanvas();
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // --- Create game systems ---
    const fluidEngine = new FluidEngine(gpuCtx);
    const fluidRenderer = new FluidRenderer(gpuCtx);
    const gameLoop = new GameLoop();
    const inputManager = new InputManager(canvas);
    const stageSelect = new StageSelect();
    const hud = new HUD();
    const transitionScreen = new TransitionScreen();

    const stageManager = new StageManager({
        gpuCtx,
        fluidEngine,
        fluidRenderer,
        inputManager,
        hud,
        transitionScreen,
        gameLoop,
    });

    // --- Wire up stage selection ---
    stageSelect.onStageSelect = async (stageConfig) => {
        stageSelect.hide();
        await stageManager.startStage(stageConfig);
    };

    // --- Wire up HUD controls ---
    hud.onBack(() => {
        stageManager.stopStage();
        stageManager.cleanup();
        stageSelect.show();
    });

    hud.onWinContinue(() => {
        stageManager.stopStage();
        stageManager.cleanup();
        stageSelect.show();
    });

    // --- Show stage select ---
    stageSelect.show();

    console.log('🌊 DynoFluid initialized — WebGPU ready');
}

main().catch((err) => {
    console.error('DynoFluid fatal error:', err);
});
