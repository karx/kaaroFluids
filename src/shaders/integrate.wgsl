// Integration and boundary handling shader
// Symplectic Euler: v += (F/m)*dt, x += v*dt
// Boundary collision with damping

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

struct Wall {
  minPos: vec2<f32>,
  maxPos: vec2<f32>,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: SimParams;
@group(0) @binding(2) var<storage, read> walls: array<Wall>;
@group(0) @binding(3) var<uniform> numWalls: u32;

const DAMPING: f32 = 0.3;
const MAX_VEL: f32 = 50.0;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.numParticles) { return; }

  var p = particles[id.x];
  let dt = params.dt;

  // Symplectic Euler integration
  let acc = p.force / max(p.density, 0.01);
  p.vel += acc * dt;

  // Clamp velocity
  let speed = length(p.vel);
  if (speed > MAX_VEL) {
    p.vel = p.vel * (MAX_VEL / speed);
  }

  p.pos += p.vel * dt;

  // Outer boundary collision
  let eps = params.smoothingRadius * 0.1;
  if (p.pos.x < params.boundaryMinX + eps) {
    p.pos.x = params.boundaryMinX + eps;
    p.vel.x *= -DAMPING;
  }
  if (p.pos.x > params.boundaryMaxX - eps) {
    p.pos.x = params.boundaryMaxX - eps;
    p.vel.x *= -DAMPING;
  }
  if (p.pos.y < params.boundaryMinY + eps) {
    p.pos.y = params.boundaryMinY + eps;
    p.vel.y *= -DAMPING;
  }
  if (p.pos.y > params.boundaryMaxY - eps) {
    p.pos.y = params.boundaryMaxY - eps;
    p.vel.y *= -DAMPING;
  }

  // Wall collisions (AABB)
  for (var w: u32 = 0u; w < numWalls; w++) {
    let wall = walls[w];
    // Check if particle is inside the wall AABB
    if (p.pos.x > wall.minPos.x && p.pos.x < wall.maxPos.x &&
        p.pos.y > wall.minPos.y && p.pos.y < wall.maxPos.y) {
      // Find nearest edge and push out
      let dLeft = p.pos.x - wall.minPos.x;
      let dRight = wall.maxPos.x - p.pos.x;
      let dBottom = p.pos.y - wall.minPos.y;
      let dTop = wall.maxPos.y - p.pos.y;

      let minD = min(min(dLeft, dRight), min(dBottom, dTop));

      if (minD == dLeft) {
        p.pos.x = wall.minPos.x - eps;
        p.vel.x *= -DAMPING;
      } else if (minD == dRight) {
        p.pos.x = wall.maxPos.x + eps;
        p.vel.x *= -DAMPING;
      } else if (minD == dBottom) {
        p.pos.y = wall.minPos.y - eps;
        p.vel.y *= -DAMPING;
      } else {
        p.pos.y = wall.maxPos.y + eps;
        p.vel.y *= -DAMPING;
      }
    }
  }

  // Propagate temperature from params
  p.temperature = params.temperature;

  particles[id.x] = p;
}
