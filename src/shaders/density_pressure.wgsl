// Density and pressure compute shader
// Accumulates SPH density using poly6 kernel, computes pressure via Tait equation

struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  force: vec2<f32>,
  density: f32,
  pressure: f32,
  temperature: f32,
  fluidType: f32,
  _pad0: f32,
  _pad1: f32,
};

struct SimParams {
  numParticles: u32,
  gridSizeX: u32,
  gridSizeY: u32,
  smoothingRadius: f32,
  restDensity: f32,
  gasConstant: f32,
  viscosityCoeff: f32,
  surfaceTensionCoeff: f32,
  gravity: vec2<f32>,
  dt: f32,
  temperature: f32,
  boundaryMinX: f32,
  boundaryMinY: f32,
  boundaryMaxX: f32,
  boundaryMaxY: f32,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> cellCount: array<u32>;
@group(0) @binding(2) var<storage, read> cellParticles: array<u32>;
@group(0) @binding(3) var<uniform> params: SimParams;

const PI: f32 = 3.14159265359;
const MAX_PER_CELL: u32 = 64u;

// Poly6 kernel (for density)
fn poly6(r2: f32, h: f32) -> f32 {
  let h2 = h * h;
  if (r2 >= h2) { return 0.0; }
  let diff = h2 - r2;
  return (4.0 / (PI * pow(h, 8.0))) * diff * diff * diff;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.numParticles) { return; }

  let pi = &particles[id.x];
  let pos = (*pi).pos;
  let h = params.smoothingRadius;

  var density: f32 = 0.0;

  // Grid-based neighbor search
  let cellX = i32(pos.x / h);
  let cellY = i32(pos.y / h);

  for (var dx: i32 = -1; dx <= 1; dx++) {
    for (var dy: i32 = -1; dy <= 1; dy++) {
      let nx = cellX + dx;
      let ny = cellY + dy;
      if (nx < 0 || ny < 0 || u32(nx) >= params.gridSizeX || u32(ny) >= params.gridSizeY) { continue; }
      let cellIdx = u32(ny) * params.gridSizeX + u32(nx);
      let count = min(cellCount[cellIdx], MAX_PER_CELL);

      for (var k: u32 = 0u; k < count; k++) {
        let j = cellParticles[cellIdx * MAX_PER_CELL + k];
        let diff = pos - particles[j].pos;
        let r2 = dot(diff, diff);
        density += poly6(r2, h);
      }
    }
  }

  // Mass = 1.0 (unit mass per particle)
  particles[id.x].density = max(density, params.restDensity * 0.01);

  // Tait equation of state: P = B * ((ρ/ρ₀)^γ - 1)
  let ratio = particles[id.x].density / params.restDensity;
  particles[id.x].pressure = params.gasConstant * (pow(ratio, 7.0) - 1.0);
}
