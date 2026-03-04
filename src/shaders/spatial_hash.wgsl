// Spatial hash compute shader
// Assigns each particle to a grid cell for efficient neighbor lookup

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

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> cellCount: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> cellParticles: array<u32>;
@group(0) @binding(3) var<uniform> params: SimParams;

fn getCellIndex(pos: vec2<f32>) -> u32 {
  let cellX = clamp(u32(pos.x / params.smoothingRadius), 0u, params.gridSizeX - 1u);
  let cellY = clamp(u32(pos.y / params.smoothingRadius), 0u, params.gridSizeY - 1u);
  return cellY * params.gridSizeX + cellX;
}

@compute @workgroup_size(64)
fn clearGrid(@builtin(global_invocation_id) id: vec3<u32>) {
  let totalCells = params.gridSizeX * params.gridSizeY;
  if (id.x < totalCells) {
    atomicStore(&cellCount[id.x], 0u);
  }
}

@compute @workgroup_size(64)
fn assignCells(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.numParticles) { return; }

  let p = particles[id.x];
  let cell = getCellIndex(p.pos);
  let maxPerCell = 64u;
  let slot = atomicAdd(&cellCount[cell], 1u);
  if (slot < maxPerCell) {
    cellParticles[cell * maxPerCell + slot] = id.x;
  }
}
