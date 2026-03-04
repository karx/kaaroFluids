/**
 * FluidRenderer — WebGPU render pipeline for particle metaballs
 * Two-pass: particles → offscreen → metaball post-process → screen
 */
import particleRenderCode from '../shaders/particle_render.wgsl?raw';
import metaballPostCode from '../shaders/metaball_post.wgsl?raw';

export class FluidRenderer {
    constructor(gpuCtx) {
        this.gpu = gpuCtx;
        this.device = gpuCtx.device;
    }

    init(config) {
        const {
            numParticles,
            simWidth,
            simHeight,
            fluidColor = [0.3, 0.6, 1.0, 0.8],
        } = config;
        this.numParticles = numParticles;
        this.simWidth = simWidth;
        this.simHeight = simHeight;

        const canvas = this.gpu.canvas;
        const w = canvas.width || 800;
        const h = canvas.height || 600;

        // --- Offscreen texture (use rgba8unorm for broad compatibility) ---
        this._createOffscreenTexture(w, h);

        // --- Render params uniform ---
        this.renderParamsBuffer = this.device.createBuffer({
            label: 'renderParams',
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._updateRenderParams(fluidColor);

        // --- Post params uniform ---
        this.postParamsBuffer = this.device.createBuffer({
            label: 'postParams',
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._updatePostParams(fluidColor);

        // --- Particle render pipeline ---
        const particleModule = this.device.createShaderModule({
            label: 'particle_render',
            code: particleRenderCode,
        });

        const particleBGL = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'read-only-storage' },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' },
                },
            ],
        });

        this.particlePipeline = this.device.createRenderPipeline({
            label: 'particleRender',
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [particleBGL],
            }),
            vertex: {
                module: particleModule,
                entryPoint: 'vsMain',
            },
            fragment: {
                module: particleModule,
                entryPoint: 'fsMain',
                targets: [
                    {
                        format: 'rgba8unorm',
                        blend: {
                            color: {
                                srcFactor: 'one',
                                dstFactor: 'one',
                                operation: 'add',
                            },
                            alpha: {
                                srcFactor: 'one',
                                dstFactor: 'one',
                                operation: 'add',
                            },
                        },
                    },
                ],
            },
            primitive: { topology: 'triangle-list' },
        });

        // --- Metaball post-process pipeline ---
        const postModule = this.device.createShaderModule({
            label: 'metaball_post',
            code: metaballPostCode,
        });

        this.sampler = this.device.createSampler({
            minFilter: 'linear',
            magFilter: 'linear',
        });

        const postBGL = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'float' },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: 'filtering' },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' },
                },
            ],
        });

        this.postPipeline = this.device.createRenderPipeline({
            label: 'metaballPost',
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [postBGL],
            }),
            vertex: {
                module: postModule,
                entryPoint: 'vsMain',
            },
            fragment: {
                module: postModule,
                entryPoint: 'fsMain',
                targets: [{ format: this.gpu.format }],
            },
            primitive: { topology: 'triangle-list' },
        });

        this.particleBGL = particleBGL;
        this.postBGL = postBGL;

        return this;
    }

    _createOffscreenTexture(w, h) {
        if (this.offscreenTexture) this.offscreenTexture.destroy();

        this.offscreenTexture = this.device.createTexture({
            label: 'offscreen',
            size: [Math.max(w, 1), Math.max(h, 1)],
            format: 'rgba8unorm',
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.offscreenView = this.offscreenTexture.createView();
    }

    _updateRenderParams(fluidColor) {
        const canvas = this.gpu.canvas;
        const data = new Float32Array([
            canvas.width || 800,
            canvas.height || 600,
            this.simWidth,
            this.simHeight,
            14.0, // particleRadius in pixels
            0,
            0,
            0, // padding
            fluidColor[0],
            fluidColor[1],
            fluidColor[2],
            fluidColor[3],
        ]);
        this.device.queue.writeBuffer(this.renderParamsBuffer, 0, data);
    }

    _updatePostParams(fluidColor) {
        const data = new Float32Array([
            0.2, // threshold (lower for easier metaball merging)
            0.6, // glowIntensity
            2.5, // glowRadius
            0, // padding
            fluidColor[0],
            fluidColor[1],
            fluidColor[2],
            fluidColor[3],
            0.04,
            0.06,
            0.1,
            1.0, // bgColor (dark blue-black)
        ]);
        this.device.queue.writeBuffer(this.postParamsBuffer, 0, data);
    }

    handleResize() {
        const w = this.gpu.canvas.width;
        const h = this.gpu.canvas.height;
        this._createOffscreenTexture(w, h);
    }

    updateFluidColor(color) {
        this._updateRenderParams(color);
        this._updatePostParams(color);
    }

    /**
     * Encode render passes into the command encoder
     */
    encodeRender(commandEncoder, particleBuffer) {
        const canvas = this.gpu.canvas;

        // Update canvas dimensions in render params
        const dimData = new Float32Array([canvas.width, canvas.height]);
        this.device.queue.writeBuffer(this.renderParamsBuffer, 0, dimData);

        // Bind group for particle render
        const particleBindGroup = this.device.createBindGroup({
            layout: this.particleBGL,
            entries: [
                { binding: 0, resource: { buffer: particleBuffer } },
                { binding: 1, resource: { buffer: this.renderParamsBuffer } },
            ],
        });

        // Pass 1: Render particles to offscreen texture (additive)
        const pass1 = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.offscreenView,
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        });
        pass1.setPipeline(this.particlePipeline);
        pass1.setBindGroup(0, particleBindGroup);
        pass1.draw(6, this.numParticles);
        pass1.end();

        // Bind group for post-process
        const postBindGroup = this.device.createBindGroup({
            layout: this.postBGL,
            entries: [
                { binding: 0, resource: this.offscreenView },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: { buffer: this.postParamsBuffer } },
            ],
        });

        // Pass 2: Metaball post-process to screen
        const screenTexture = this.gpu.currentTexture;
        const pass2 = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: screenTexture.createView(),
                    clearValue: { r: 0.04, g: 0.06, b: 0.1, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        });
        pass2.setPipeline(this.postPipeline);
        pass2.setBindGroup(0, postBindGroup);
        pass2.draw(3);
        pass2.end();
    }
}
