/**
 * 2D MLS-MPM Fluid Simulation  (Three.js TSL compute, WebGPU)
 * Moving Least Squares Material Point Method — Hu et al. 2018
 *
 * Grid: N_GRID×N_GRID cells over [0,1]²    (float32 — NO atomics needed)
 * Particles: N separate flat float32 buffers
 *
 * Grid buffer layout  (3 floats per cell):
 *   [3i+0]  x-momentum  (after clearGrid/P2G) → x-velocity (after updateGrid)
 *   [3i+1]  y-momentum  (after clearGrid/P2G) → y-velocity (after updateGrid)
 *   [3i+2]  mass
 *
 * P2G is "thread per cell" — each thread accumulates contributions from all
 * particles whose 3×3 stencil covers this cell.  No atomic operations needed.
 */

import {
    Fn, If, Loop, select, property,
    instanceIndex, instancedArray, uniform,
    float, int,
    floor, clamp,
} from 'three/tsl';

// ── Sim constants ─────────────────────────────────────────────────────────────

export const N_GRID     = 64;
const DX                = 1.0 / N_GRID;
const INV_DX            = N_GRID;
const PARTICLE_MASS     = 1.0;
const DEFAULT_GRAVITY_Y = -9.8;
const DEFAULT_BULK_K    = 50.0;

// ── MLSMPMSim ─────────────────────────────────────────────────────────────────

export class MLSMPMSim {
    /**
     * @param {import('three/webgpu').WebGPURenderer} renderer
     * @param {number} numParticles
     * @param {{ minX, minY, maxX, maxY }} spawnRegion   positions in [0,1]²
     */
    constructor(renderer, numParticles = 8000,
                spawnRegion = { minX: 0.1, minY: 0.55, maxX: 0.9, maxY: 0.95 }) {
        this.renderer = renderer;
        this.N        = numParticles;
        this.dt       = 1e-3;

        // Tunable uniforms (set .value to update live)
        this.uGravityY = uniform(DEFAULT_GRAVITY_Y);
        this.uBulkK    = uniform(DEFAULT_BULK_K);

        this._initParticles(spawnRegion);
        this._initGrid();
        this._buildKernels();
    }

    // ── Initialisation ────────────────────────────────────────────────────────

    _initParticles({ minX, minY, maxX, maxY }) {
        const N   = this.N;
        const pos = new Float32Array(N * 2);
        const vel = new Float32Array(N * 2);  // zero
        const c   = new Float32Array(N * 4);  // zero
        const jp  = new Float32Array(N).fill(1.0);

        // Jittered grid spawn
        const cols = Math.ceil(Math.sqrt(N * (maxX - minX) / Math.max(maxY - minY, 0.01)));
        const rows = Math.ceil(N / cols);
        const sx   = (maxX - minX) / cols;
        const sy   = (maxY - minY) / rows;
        for (let i = 0; i < N; i++) {
            const r = Math.floor(i / cols);
            const c_ = i % cols;
            pos[i * 2]     = minX + (c_ + 0.1 + Math.random() * 0.8) * sx;
            pos[i * 2 + 1] = minY + (r  + 0.1 + Math.random() * 0.8) * sy;
        }

        this.posBuf = instancedArray(pos, 'float');
        this.velBuf = instancedArray(vel, 'float');
        this.cBuf   = instancedArray(c,   'float');
        this.jpBuf  = instancedArray(jp,  'float');
    }

    _initGrid() {
        const G = N_GRID * N_GRID;
        // Float grid — 3 values per cell (mvx, mvy, mass).  No atomics needed.
        this.gridBuf = instancedArray(new Float32Array(G * 3), 'float');
    }

    // ── Kernel builders ───────────────────────────────────────────────────────

    _buildKernels() {
        this._clearKernel      = this._buildClear();
        this._p2gKernel        = this._buildP2G();
        this._updateGridKernel = this._buildUpdateGrid();
        this._g2pKernel        = this._buildG2P();
    }

    /** Thread per cell: set 3 floats to 0. */
    _buildClear() {
        const { gridBuf } = this;
        const G = N_GRID * N_GRID;

        return Fn(() => {
            const i    = instanceIndex;
            const base = i.mul(3);
            gridBuf.element(base).assign(float(0));
            gridBuf.element(base.add(1)).assign(float(0));
            gridBuf.element(base.add(2)).assign(float(0));
        })().compute(G);
    }

    /**
     * Thread per cell: iterate all N particles, accumulate momentum & mass
     * from particles whose 3×3 stencil covers this cell.
     *
     * No atomics — each thread writes only to its own cell slots.
     *
     * dpx trick: displacement from particle to cell node (cx, cy) in sim space
     *   = cx * DX − px   (derivation in comments of MLSMPMSim.js header)
     */
    _buildP2G() {
        const { posBuf, velBuf, cBuf, jpBuf, gridBuf, uBulkK } = this;
        const N      = this.N;
        const G      = N_GRID * N_GRID;
        const DT_F   = float(this.dt);
        const INV_DX_F = float(INV_DX);
        const DX_F     = float(DX);
        const MASS_F   = float(PARTICLE_MASS);
        const NG       = int(N_GRID);

        return Fn(() => {
            const ci = instanceIndex;          // flat grid cell index
            const cy = ci.div(NG);             // integer y coord
            const cx = ci.sub(cy.mul(NG));     // integer x coord

            // Accumulators for this cell
            const mvx = property('float', 'p2g_mvx');
            const mvy = property('float', 'p2g_mvy');
            const mm  = property('float', 'p2g_mm');
            mvx.assign(float(0));
            mvy.assign(float(0));
            mm.assign(float(0));

            // Iterate all particles
            Loop({ start: 0, end: N, type: 'uint', name: 'p', condition: '<' }, ({ p }) => {
                const b2  = p.mul(2);
                const b4  = p.mul(4);
                const px_ = posBuf.element(b2);
                const py_ = posBuf.element(b2.add(1));

                // Stencil base cell for this particle
                const bxInt = floor(px_.mul(INV_DX_F).sub(0.5)).toInt();
                const byInt = floor(py_.mul(INV_DX_F).sub(0.5)).toInt();

                // Offset from stencil base to current cell
                const gx = cx.sub(bxInt);
                const gy = cy.sub(byInt);

                // Skip if this cell is not in the particle's 3×3 stencil
                If(
                    gx.greaterThanEqual(int(0)).and(gx.lessThan(int(3)))
                        .and(gy.greaterThanEqual(int(0))).and(gy.lessThan(int(3))),
                    () => {
                        // Fractional position from stencil base (∈ [0.5, 1.5))
                        const fxf = px_.mul(INV_DX_F).sub(float(bxInt));
                        const fyf = py_.mul(INV_DX_F).sub(float(byInt));

                        // Quadratic B-spline weights per axis
                        const wx0 = float(0.5).mul(float(1.5).sub(fxf).mul(float(1.5).sub(fxf)));
                        const wx1 = float(0.75).sub(fxf.sub(1.0).mul(fxf.sub(1.0)));
                        const wx2 = float(0.5).mul(fxf.sub(0.5).mul(fxf.sub(0.5)));
                        const wx  = select(gx.equal(int(0)), wx0, select(gx.equal(int(1)), wx1, wx2));

                        const wy0 = float(0.5).mul(float(1.5).sub(fyf).mul(float(1.5).sub(fyf)));
                        const wy1 = float(0.75).sub(fyf.sub(1.0).mul(fyf.sub(1.0)));
                        const wy2 = float(0.5).mul(fyf.sub(0.5).mul(fyf.sub(0.5)));
                        const wy  = select(gy.equal(int(0)), wy0, select(gy.equal(int(1)), wy1, wy2));

                        const w = wx.mul(wy);

                        // Displacement from particle to this grid node (sim space)
                        // dpx = cx * DX − px  (derived from (gx - fxf) * DX = cx*DX - px)
                        const dpx = float(cx).mul(DX_F).sub(px_);
                        const dpy = float(cy).mul(DX_F).sub(py_);

                        // Particle state
                        const vx_ = velBuf.element(b2);
                        const vy_ = velBuf.element(b2.add(1));
                        const c00 = cBuf.element(b4);
                        const c01 = cBuf.element(b4.add(1));
                        const c10 = cBuf.element(b4.add(2));
                        const c11 = cBuf.element(b4.add(3));
                        const jp_ = jpBuf.element(p);

                        // Stress factor = −2 × dt × K × (Jp − 1)
                        // (simplification of −dt × 4 × INV_DX² × vol × K × (Jp−1)
                        //  where vol = 0.5 × DX²)
                        const sf = float(-2.0).mul(DT_F).mul(uBulkK).mul(jp_.sub(1.0));

                        // Affine matrix = mass × C + stress × I
                        const a00 = MASS_F.mul(c00).add(sf);
                        const a01 = MASS_F.mul(c01);
                        const a10 = MASS_F.mul(c10);
                        const a11 = MASS_F.mul(c11).add(sf);

                        // Accumulate weighted momentum and mass
                        mvx.assign(mvx.add(w.mul(MASS_F.mul(vx_).add(a00.mul(dpx)).add(a01.mul(dpy)))));
                        mvy.assign(mvy.add(w.mul(MASS_F.mul(vy_).add(a10.mul(dpx)).add(a11.mul(dpy)))));
                        mm.assign(mm.add(w.mul(MASS_F)));
                    }
                );
            });

            // Write to this cell (no race condition — each thread owns its cell)
            const base = ci.mul(3);
            gridBuf.element(base).assign(mvx);
            gridBuf.element(base.add(1)).assign(mvy);
            gridBuf.element(base.add(2)).assign(mm);
        })().compute(G);
    }

    /** Thread per cell: normalise momentum → velocity, apply gravity + boundary. */
    _buildUpdateGrid() {
        const { gridBuf, uGravityY } = this;
        const G    = N_GRID * N_GRID;
        const DT_F = float(this.dt);
        const NG   = int(N_GRID);
        const NG3  = int(N_GRID - 3);

        return Fn(() => {
            const i    = instanceIndex;
            const base = i.mul(3);

            const mass = gridBuf.element(base.add(2));

            If(mass.greaterThan(float(0)), () => {
                const nvx = property('float', 'ug_nvx');
                const nvy = property('float', 'ug_nvy');

                // Normalise momentum → velocity
                nvx.assign(gridBuf.element(base).div(mass));
                nvy.assign(gridBuf.element(base.add(1)).div(mass).add(uGravityY.mul(DT_F)));

                // Cell coords
                const cy = i.div(NG);
                const cx = i.sub(cy.mul(NG));

                // Slip boundary: zero outward velocity within 2-cell guard band
                If(cx.lessThan(int(2)).and(nvx.lessThan(float(0))),    () => nvx.assign(float(0)));
                If(cx.greaterThan(NG3).and(nvx.greaterThan(float(0))), () => nvx.assign(float(0)));
                If(cy.lessThan(int(2)).and(nvy.lessThan(float(0))),    () => nvy.assign(float(0)));
                If(cy.greaterThan(NG3).and(nvy.greaterThan(float(0))), () => nvy.assign(float(0)));

                // Write back velocity (G2P reads directly without mass division)
                gridBuf.element(base).assign(nvx);
                gridBuf.element(base.add(1)).assign(nvy);
            });
        })().compute(G);
    }

    /** Thread per particle: gather velocity + APIC C from 3×3 grid stencil, advect. */
    _buildG2P() {
        const { posBuf, velBuf, cBuf, jpBuf, gridBuf } = this;
        const N        = this.N;
        const DT_F     = float(this.dt);
        const INV_DX_F = float(INV_DX);
        const DX_F     = float(DX);
        const NG       = int(N_GRID);
        const VEL_LIM  = float(12.0);

        return Fn(() => {
            const p  = instanceIndex;
            const b2 = p.mul(2);
            const b4 = p.mul(4);

            const px = posBuf.element(b2);
            const py = posBuf.element(b2.add(1));

            // Stencil base + fractional offsets
            const bxInt = floor(px.mul(INV_DX_F).sub(0.5)).toInt();
            const byInt = floor(py.mul(INV_DX_F).sub(0.5)).toInt();
            const fxf   = px.mul(INV_DX_F).sub(float(bxInt));
            const fyf   = py.mul(INV_DX_F).sub(float(byInt));

            // Precompute bspline weights for x and y
            const wx0 = float(0.5).mul(float(1.5).sub(fxf).mul(float(1.5).sub(fxf)));
            const wx1 = float(0.75).sub(fxf.sub(1.0).mul(fxf.sub(1.0)));
            const wx2 = float(0.5).mul(fxf.sub(0.5).mul(fxf.sub(0.5)));
            const wy0 = float(0.5).mul(float(1.5).sub(fyf).mul(float(1.5).sub(fyf)));
            const wy1 = float(0.75).sub(fyf.sub(1.0).mul(fyf.sub(1.0)));
            const wy2 = float(0.5).mul(fyf.sub(0.5).mul(fyf.sub(0.5)));

            // Velocity + APIC C matrix accumulators
            const nvx  = property('float', 'g2p_nvx');
            const nvy  = property('float', 'g2p_nvy');
            const nc00 = property('float', 'g2p_c00');
            const nc01 = property('float', 'g2p_c01');
            const nc10 = property('float', 'g2p_c10');
            const nc11 = property('float', 'g2p_c11');
            nvx.assign(float(0));  nvy.assign(float(0));
            nc00.assign(float(0)); nc01.assign(float(0));
            nc10.assign(float(0)); nc11.assign(float(0));

            // Unrolled 3×3 neighbourhood gather
            const wxArr = [wx0, wx1, wx2];
            const wyArr = [wy0, wy1, wy2];

            for (let gi = 0; gi < 3; gi++) {
                for (let gj = 0; gj < 3; gj++) {
                    const w   = wxArr[gi].mul(wyArr[gj]);
                    const cx_ = bxInt.add(int(gi));
                    const cy_ = byInt.add(int(gj));

                    If(
                        cx_.greaterThanEqual(int(0)).and(cx_.lessThan(NG))
                            .and(cy_.greaterThanEqual(int(0))).and(cy_.lessThan(NG)),
                        () => {
                            const cellIdx = cy_.mul(NG).add(cx_);
                            const base3   = cellIdx.mul(3);
                            const mass    = gridBuf.element(base3.add(2));

                            If(mass.greaterThan(float(0)), () => {
                                // After updateGrid, grid stores velocity (not momentum)
                                const gvx = gridBuf.element(base3);
                                const gvy = gridBuf.element(base3.add(1));

                                nvx.assign(nvx.add(w.mul(gvx)));
                                nvy.assign(nvy.add(w.mul(gvy)));

                                // APIC C: 4 * INV_DX * w * (gv ⊗ dpos)
                                // dpos = cx * DX − px (same trick as P2G)
                                const dpx = float(cx_).mul(DX_F).sub(px);
                                const dpy = float(cy_).mul(DX_F).sub(py);
                                const fac = w.mul(float(4.0 * INV_DX));
                                nc00.assign(nc00.add(fac.mul(gvx).mul(dpx)));
                                nc01.assign(nc01.add(fac.mul(gvx).mul(dpy)));
                                nc10.assign(nc10.add(fac.mul(gvy).mul(dpx)));
                                nc11.assign(nc11.add(fac.mul(gvy).mul(dpy)));
                            });
                        }
                    );
                }
            }

            // Clamp velocity
            nvx.assign(clamp(nvx, VEL_LIM.negate(), VEL_LIM));
            nvy.assign(clamp(nvy, VEL_LIM.negate(), VEL_LIM));

            // Update Jp: volumetric deformation = 1 + dt × div(v)
            const jp   = jpBuf.element(p);
            const divV = nc00.add(nc11);
            jp.assign(clamp(jp.mul(float(1.0).add(DT_F.mul(divV))), float(0.6), float(20.0)));

            // Write particle state
            velBuf.element(b2).assign(nvx);
            velBuf.element(b2.add(1)).assign(nvy);
            cBuf.element(b4).assign(nc00);
            cBuf.element(b4.add(1)).assign(nc01);
            cBuf.element(b4.add(2)).assign(nc10);
            cBuf.element(b4.add(3)).assign(nc11);

            // Advect + clamp inside domain
            posBuf.element(b2).assign(clamp(px.add(DT_F.mul(nvx)), float(0.01), float(0.99)));
            posBuf.element(b2.add(1)).assign(clamp(py.add(DT_F.mul(nvy)), float(0.01), float(0.99)));
        })().compute(N);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** Run one physics substep: clear → P2G → updateGrid → G2P. */
    async step() {
        const r = this.renderer;
        await r.computeAsync(this._clearKernel);
        await r.computeAsync(this._p2gKernel);
        await r.computeAsync(this._updateGridKernel);
        await r.computeAsync(this._g2pKernel);
    }

    /** Run `count` substeps (call from animation loop). */
    async substeps(count) {
        for (let i = 0; i < count; i++) await this.step();
    }
}
