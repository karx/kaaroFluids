/**
 * ParticleRenderer — renders MLS-MPM particles using Three.js WebGPU.
 *
 * Uses InstancedMesh (tiny quads) instead of THREE.Points because:
 *  • WebGPU spec caps point size at 1 pixel — THREE.Points size is ignored.
 *  • InstancedMesh avoids gl_PointCoord (WebGL-only) in fragment shaders.
 *
 * positionNode reads (x,y) from the GPU simulation buffer directly via
 * instanceIndex — no CPU readback.  positionLocal supplies the small quad
 * vertex offsets around each particle centre.
 *
 * Camera: OrthographicCamera over [0,1]² matching the MLS-MPM sim domain.
 */

import * as THREE from 'three/webgpu';
import { float, vec3, vec4, instanceIndex, positionLocal } from 'three/tsl';

// Particle quad half-size in world units.
// ~0.006 → ~12px on a 2000px-wide display, visible with additive blending.
const QUAD_HALF = 0.006;

export class ParticleRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {import('../sim/MLSMPMSim').MLSMPMSim} sim
     */
    constructor(canvas, sim) {
        this.canvas = canvas;
        this.sim    = sim;
        this._built = false;
        this.mesh   = null;
    }

    async init() {
        const canvas = this.canvas;

        this.renderer = new THREE.WebGPURenderer({ canvas, antialias: false });
        await this.renderer.init();
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

        // Orthographic camera spanning sim space [0,1]²
        // left=0, right=1, top=1, bottom=0
        this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x070b14);

        this._buildMesh();
        this._built = true;

        this._onResize = () => {
            this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
        };
        window.addEventListener('resize', this._onResize);

        return this.renderer; // caller needs it for compute dispatch
    }

    _buildMesh() {
        const N      = this.sim.N;
        const posBuf = this.sim.posBuf;

        // Small square geometry centred at origin — one per instance (particle)
        const geometry = new THREE.PlaneGeometry(QUAD_HALF * 2, QUAD_HALF * 2);

        const material = new THREE.MeshBasicNodeMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        // positionLocal = quad vertex offset (±QUAD_HALF) from instance origin.
        // Adding the particle position from the GPU buffer centres the quad on it.
        // Direct expression — no Fn wrapper avoids the "return in inline Fn" warning.
        const i = instanceIndex;  // @builtin(instance_index) — valid per-instance
        const px = posBuf.element(i.mul(2));
        const py = posBuf.element(i.mul(2).add(1));
        material.positionNode = positionLocal.add(vec3(px, py, float(0)));

        // Solid blue-white glow — additive blending makes dense areas brighter
        material.outputNode = vec4(float(0.30), float(0.68), float(1.0), float(0.55));

        // InstancedMesh requires all instance matrices to be set;
        // default Float32Array is all-zeros (not identity) so set explicitly.
        const mesh = new THREE.InstancedMesh(geometry, material, N);
        const id   = new THREE.Matrix4(); // identity
        for (let k = 0; k < N; k++) mesh.setMatrixAt(k, id);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false; // sim domain is always inside camera frustum

        // Remove previous mesh if rebuilding on reset
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }

        this.mesh = mesh;
        this.scene.add(mesh);
    }

    render() {
        if (!this._built) return;
        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        window.removeEventListener('resize', this._onResize);
        this.renderer.dispose();
    }
}
