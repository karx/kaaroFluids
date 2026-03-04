// Force computation shader
// Computes pressure gradient, viscosity, surface tension, and gravity forces

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

// Spiky kernel gradient (for pressure)
fn spikyGrad(r: f32, rDir: vec2<f32>, h: f32) -> vec2<f32> {
  if (r >= h || r < 0.0001) { return vec2<f32>(0.0, 0.0); }
  let coeff = -10.0 / (PI * pow(h, 5.0));
  let diff = h - r;
  return coeff * diff * diff * rDir / r;
}

// Viscosity laplacian kernel
fn viscosityLaplacian(r: f32, h: f32) -> f32 {
  if (r >= h) { return 0.0; }
  return 40.0 / (PI * pow(h, 5.0)) * (h - r);
}

// Cohesion kernel (for surface tension)
fn cohesionKernel(r: f32, h: f32) -> f32 {
  if (r >= h || r < 0.0001) { return 0.0; }
  let h6 = pow(h, 6.0);
  let halfH = h * 0.5;
  if (r < halfH) {
    return (32.0 / (PI * h6)) * (2.0 * pow(h - r, 3.0) * pow(r, 3.0) - pow(h, 6.0) / 64.0);
  }
  return (32.0 / (PI * h6)) * pow(h - r, 3.0) * pow(r, 3.0);
}

// Vogel-Tammann-Fulcher viscosity model
// μ(T) = μ₀ * exp(B / (T - T₀))
fn vtfViscosity(baseVisc: f32, temp: f32) -> f32 {
  let B = 500.0;
  let T0 = -50.0;
  let refTemp = 20.0;
  let refFactor = exp(B / (refTemp - T0));
  let curFactor = exp(B / (max(temp, T0 + 1.0) - T0));
  return baseVisc * (curFactor / refFactor);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.numParticles) { return; }

  let pi = particles[id.x];
  let pos = pi.pos;
  let h = params.smoothingRadius;

  var pressureForce = vec2<f32>(0.0, 0.0);
  var viscosityForce = vec2<f32>(0.0, 0.0);
  var cohesionForce = vec2<f32>(0.0, 0.0);

  // Temperature-dependent viscosity (VTF model)
  let effectiveVisc = vtfViscosity(params.viscosityCoeff, params.temperature);

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
        if (j == id.x) { continue; }

        let pj = particles[j];
        let diff = pos - pj.pos;
        let r = length(diff);

        if (r < h && r > 0.0001) {
          // Pressure force (spiky kernel gradient)
          let pAvg = (pi.pressure + pj.pressure) * 0.5;
          pressureForce += spikyGrad(r, diff, h) * (-pAvg / max(pj.density, 0.001));

          // Viscosity force (laplacian kernel)
          let velDiff = pj.vel - pi.vel;
          viscosityForce += velDiff * (viscosityLaplacian(r, h) / max(pj.density, 0.001));

          // Surface tension (cohesion)
          let coh = cohesionKernel(r, h);
          cohesionForce += -params.surfaceTensionCoeff * coh * diff / max(r, 0.001);
        }
      }
    }
  }

  viscosityForce *= effectiveVisc;

  // Gravity
  let gravityForce = params.gravity * pi.density;

  // Total force
  particles[id.x].force = pressureForce + viscosityForce + cohesionForce + gravityForce;
}
