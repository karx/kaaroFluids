/**
 * GPUContext — WebGPU initialization, buffer management, pipeline orchestration
 */
export class GPUContext {
    constructor() {
        this.device = null;
        this.context = null;
        this.format = 'bgra8unorm';
        this.canvas = null;
        this.buffers = {};
        this.pipelines = {};
        this.bindGroups = {};
    }

    async init(canvas) {
        if (!navigator.gpu) {
            throw new Error('WebGPU not supported');
        }

        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance',
        });
        if (!adapter) {
            throw new Error('No GPU adapter found');
        }

        this.device = await adapter.requestDevice({
            requiredLimits: {
                maxStorageBufferBindingSize: 256 * 1024 * 1024,
                maxBufferSize: 256 * 1024 * 1024,
            },
        });

        this.canvas = canvas;
        this.context = canvas.getContext('webgpu');
        this.format = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'opaque',
        });

        return this;
    }

    resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.floor(this.canvas.clientWidth * dpr);
        this.canvas.height = Math.floor(this.canvas.clientHeight * dpr);
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'opaque',
        });
    }

    createBuffer(label, size, usage) {
        const buffer = this.device.createBuffer({ label, size, usage });
        this.buffers[label] = buffer;
        return buffer;
    }

    writeBuffer(buffer, data, offset = 0) {
        this.device.queue.writeBuffer(buffer, offset, data);
    }

    createShaderModule(label, code) {
        return this.device.createShaderModule({ label, code });
    }

    createComputePipeline(label, shaderModule, entryPoint, bindGroupLayout) {
        const pipeline = this.device.createComputePipeline({
            label,
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout],
            }),
            compute: {
                module: shaderModule,
                entryPoint,
            },
        });
        this.pipelines[label] = pipeline;
        return pipeline;
    }

    get currentTexture() {
        return this.context.getCurrentTexture();
    }

    destroy() {
        Object.values(this.buffers).forEach((b) => b.destroy());
        this.device?.destroy();
    }
}
