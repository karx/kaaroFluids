/**
 * FluidEngine — Orchestrates SPH compute passes on the GPU
 */
import spatialHashCode from '../shaders/spatial_hash.wgsl?raw';
import densityPressureCode from '../shaders/density_pressure.wgsl?raw';
import forcesCode from '../shaders/forces.wgsl?raw';
import integrateCode from '../shaders/integrate.wgsl?raw';

// Particle struct: 12 floats × 4 bytes = 48 bytes per particle
const PARTICLE_STRIDE = 48;
const MAX_PER_CELL = 64;

export class FluidEngine {
    constructor(gpuCtx) {
        this.gpu = gpuCtx;
        this.device = gpuCtx.device;
        this.numParticles = 0;
        this.simParams = null;
        this.walls = [];
    }

    init(config) {
        const {
            numParticles,
            simWidth,
            simHeight,
            smoothingRadius = 0.5,
            restDensity = 1000,
            gasConstant = 2000,
            viscosityCoeff = 5.0,
            surfaceTensionCoeff = 0.1,
            gravity = [0, 9.81],
            temperature = 20,
            walls = [],
        } = config;

        this.numParticles = numParticles;
        this.simWidth = simWidth;
        this.simHeight = simHeight;
        this.smoothingRadius = smoothingRadius;
        this.walls = walls;

        const gridSizeX = Math.ceil(simWidth / smoothingRadius);
        const gridSizeY = Math.ceil(simHeight / smoothingRadius);
        this.gridSizeX = gridSizeX;
        this.gridSizeY = gridSizeY;
        const totalCells = gridSizeX * gridSizeY;

        // --- Create buffers ---
        const particleBufferSize = numParticles * PARTICLE_STRIDE;

        this.particleBuffer = this.device.createBuffer({
            label: 'particles',
            size: particleBufferSize,
            usage:
                GPUBufferUsage.STORAGE |
                GPUBufferUsage.COPY_SRC |
                GPUBufferUsage.COPY_DST,
        });

        this.cellCountBuffer = this.device.createBuffer({
            label: 'cellCount',
            size: totalCells * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.cellParticlesBuffer = this.device.createBuffer({
            label: 'cellParticles',
            size: totalCells * MAX_PER_CELL * 4,
            usage: GPUBufferUsage.STORAGE,
        });

        // SimParams uniform buffer (aligned to 16 bytes)
        // 16 u32/f32 fields → 64 bytes
        this.simParamsBuffer = this.device.createBuffer({
            label: 'simParams',
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Walls buffer
        const maxWalls = Math.max(walls.length, 1);
        this.wallBuffer = this.device.createBuffer({
            label: 'walls',
            size: maxWalls * 16, // 4 floats per wall
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.numWallsBuffer = this.device.createBuffer({
            label: 'numWalls',
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Staging buffer for readback
        this.stagingBuffer = this.device.createBuffer({
            label: 'staging',
            size: particleBufferSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        // Upload initial sim params
        this._simParamsData = {
            numParticles,
            gridSizeX,
            gridSizeY,
            smoothingRadius,
            restDensity,
            gasConstant,
            viscosityCoeff,
            surfaceTensionCoeff,
            gravityX: gravity[0],
            gravityY: gravity[1],
            dt: 1 / 120,
            temperature,
            boundaryMinX: 0,
            boundaryMinY: 0,
            boundaryMaxX: simWidth,
            boundaryMaxY: simHeight,
        };
        this._uploadSimParams();
        this._uploadWalls(walls);

        // --- Create compute pipelines ---
        this._createPipelines();

        return this;
    }

    _uploadSimParams() {
        const p = this._simParamsData;
        const data = new ArrayBuffer(64);
        const u32 = new Uint32Array(data);
        const f32 = new Float32Array(data);
        u32[0] = p.numParticles;
        u32[1] = p.gridSizeX;
        u32[2] = p.gridSizeY;
        f32[3] = p.smoothingRadius;
        f32[4] = p.restDensity;
        f32[5] = p.gasConstant;
        f32[6] = p.viscosityCoeff;
        f32[7] = p.surfaceTensionCoeff;
        f32[8] = p.gravityX;
        f32[9] = p.gravityY;
        f32[10] = p.dt;
        f32[11] = p.temperature;
        f32[12] = p.boundaryMinX;
        f32[13] = p.boundaryMinY;
        f32[14] = p.boundaryMaxX;
        f32[15] = p.boundaryMaxY;
        this.device.queue.writeBuffer(this.simParamsBuffer, 0, data);
    }

    _uploadWalls(walls) {
        if (walls.length === 0) {
            this.device.queue.writeBuffer(
                this.numWallsBuffer,
                0,
                new Uint32Array([0])
            );
            return;
        }
        const data = new Float32Array(walls.length * 4);
        walls.forEach((w, i) => {
            data[i * 4 + 0] = w.minX;
            data[i * 4 + 1] = w.minY;
            data[i * 4 + 2] = w.maxX;
            data[i * 4 + 3] = w.maxY;
        });
        this.device.queue.writeBuffer(this.wallBuffer, 0, data);
        this.device.queue.writeBuffer(
            this.numWallsBuffer,
            0,
            new Uint32Array([walls.length])
        );
    }

    _createPipelines() {
        const device = this.device;

        // Spatial hash shaders
        const spatialModule = device.createShaderModule({
            label: 'spatial_hash',
            code: spatialHashCode,
        });

        // Spatial hash bind group layout
        this.spatialBGL = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage' },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' },
                },
            ],
        });

        this.clearGridPipeline = device.createComputePipeline({
            label: 'clearGrid',
            layout: device.createPipelineLayout({
                bindGroupLayouts: [this.spatialBGL],
            }),
            compute: { module: spatialModule, entryPoint: 'clearGrid' },
        });

        this.assignCellsPipeline = device.createComputePipeline({
            label: 'assignCells',
            layout: device.createPipelineLayout({
                bindGroupLayouts: [this.spatialBGL],
            }),
            compute: { module: spatialModule, entryPoint: 'assignCells' },
        });

        this.spatialBindGroup = device.createBindGroup({
            layout: this.spatialBGL,
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.cellCountBuffer } },
                { binding: 2, resource: { buffer: this.cellParticlesBuffer } },
                { binding: 3, resource: { buffer: this.simParamsBuffer } },
            ],
        });

        // Density/pressure + forces share a layout
        this.physicsBGL = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage' },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage' },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' },
                },
            ],
        });

        const densityModule = device.createShaderModule({
            label: 'density_pressure',
            code: densityPressureCode,
        });
        this.densityPipeline = device.createComputePipeline({
            label: 'density_pressure',
            layout: device.createPipelineLayout({
                bindGroupLayouts: [this.physicsBGL],
            }),
            compute: { module: densityModule, entryPoint: 'main' },
        });

        const forcesModule = device.createShaderModule({
            label: 'forces',
            code: forcesCode,
        });
        this.forcesPipeline = device.createComputePipeline({
            label: 'forces',
            layout: device.createPipelineLayout({
                bindGroupLayouts: [this.physicsBGL],
            }),
            compute: { module: forcesModule, entryPoint: 'main' },
        });

        this.physicsBindGroup = device.createBindGroup({
            layout: this.physicsBGL,
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.cellCountBuffer } },
                { binding: 2, resource: { buffer: this.cellParticlesBuffer } },
                { binding: 3, resource: { buffer: this.simParamsBuffer } },
            ],
        });

        // Integration pipeline
        this.integrateBGL = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage' },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' },
                },
            ],
        });

        const integrateModule = device.createShaderModule({
            label: 'integrate',
            code: integrateCode,
        });
        this.integratePipeline = device.createComputePipeline({
            label: 'integrate',
            layout: device.createPipelineLayout({
                bindGroupLayouts: [this.integrateBGL],
            }),
            compute: { module: integrateModule, entryPoint: 'main' },
        });

        this.integrateBindGroup = device.createBindGroup({
            layout: this.integrateBGL,
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.simParamsBuffer } },
                { binding: 2, resource: { buffer: this.wallBuffer } },
                { binding: 3, resource: { buffer: this.numWallsBuffer } },
            ],
        });
    }

    /**
     * Seed particles into the buffer
     */
    seedParticles(positions, velocities, temperatures, fluidTypes) {
        const data = new Float32Array(this.numParticles * 12);
        for (let i = 0; i < this.numParticles; i++) {
            const offset = i * 12;
            data[offset + 0] = positions[i * 2]; // pos.x
            data[offset + 1] = positions[i * 2 + 1]; // pos.y
            data[offset + 2] = velocities?.[i * 2] || 0; // vel.x
            data[offset + 3] = velocities?.[i * 2 + 1] || 0; // vel.y
            data[offset + 4] = 0; // force.x
            data[offset + 5] = 0; // force.y
            data[offset + 6] = 0; // density (computed)
            data[offset + 7] = 0; // pressure (computed)
            data[offset + 8] = temperatures?.[i] || 20; // temperature
            data[offset + 9] = fluidTypes?.[i] || 0; // fluidType
            data[offset + 10] = 0; // _pad
            data[offset + 11] = 0; // _pad (alignment)
        }
        this.device.queue.writeBuffer(this.particleBuffer, 0, data);
    }

    /**
     * Update a simulation parameter at runtime
     */
    updateParam(key, value) {
        this._simParamsData[key] = value;
        this._uploadSimParams();
    }

    /**
     * Encode one full simulation step into the command encoder
     */
    encodeStep(commandEncoder) {
        const workgroupsParticles = Math.ceil(this.numParticles / 64);
        const totalCells = this.gridSizeX * this.gridSizeY;
        const workgroupsCells = Math.ceil(totalCells / 64);

        // 1. Clear grid
        const clearPass = commandEncoder.beginComputePass({ label: 'clearGrid' });
        clearPass.setPipeline(this.clearGridPipeline);
        clearPass.setBindGroup(0, this.spatialBindGroup);
        clearPass.dispatchWorkgroups(workgroupsCells);
        clearPass.end();

        // 2. Assign particles to cells
        const assignPass = commandEncoder.beginComputePass({
            label: 'assignCells',
        });
        assignPass.setPipeline(this.assignCellsPipeline);
        assignPass.setBindGroup(0, this.spatialBindGroup);
        assignPass.dispatchWorkgroups(workgroupsParticles);
        assignPass.end();

        // 3. Compute density + pressure
        const densityPass = commandEncoder.beginComputePass({
            label: 'density_pressure',
        });
        densityPass.setPipeline(this.densityPipeline);
        densityPass.setBindGroup(0, this.physicsBindGroup);
        densityPass.dispatchWorkgroups(workgroupsParticles);
        densityPass.end();

        // 4. Compute forces
        const forcesPass = commandEncoder.beginComputePass({ label: 'forces' });
        forcesPass.setPipeline(this.forcesPipeline);
        forcesPass.setBindGroup(0, this.physicsBindGroup);
        forcesPass.dispatchWorkgroups(workgroupsParticles);
        forcesPass.end();

        // 5. Integration + boundaries
        const integratePass = commandEncoder.beginComputePass({
            label: 'integrate',
        });
        integratePass.setPipeline(this.integratePipeline);
        integratePass.setBindGroup(0, this.integrateBindGroup);
        integratePass.dispatchWorkgroups(workgroupsParticles);
        integratePass.end();
    }

    /**
     * Read particle positions back to CPU (async)
     */
    async readParticles(commandEncoder) {
        commandEncoder.copyBufferToBuffer(
            this.particleBuffer,
            0,
            this.stagingBuffer,
            0,
            this.numParticles * PARTICLE_STRIDE
        );

        this.device.queue.submit([commandEncoder.finish()]);

        await this.stagingBuffer.mapAsync(GPUMapMode.READ);
        const data = new Float32Array(this.stagingBuffer.getMappedRange().slice(0));
        this.stagingBuffer.unmap();
        return data;
    }
}
