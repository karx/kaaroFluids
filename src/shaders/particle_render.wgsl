// Particle rendering shader
// Vertex: instanced quads at each particle position
// Fragment: radial gradient falloff for metaball accumulation

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
};

struct RenderParams {
  canvasWidth: f32,
  canvasHeight: f32,
  simWidth: f32,
  simHeight: f32,
  particleRadius: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
  fluidColor: vec4<f32>,
};

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

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> renderParams: RenderParams;

// Quad vertices: 2 triangles forming a quad
var<private> quadVerts: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>(-1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
);

@vertex
fn vsMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  var output: VertexOutput;

  let p = particles[instanceIndex];
  let qv = quadVerts[vertexIndex];

  // UV for fragment
  output.uv = qv * 0.5 + 0.5;

  // Transform particle sim-space position to clip space
  let ndcX = (p.pos.x / renderParams.simWidth) * 2.0 - 1.0;
  let ndcY = 1.0 - (p.pos.y / renderParams.simHeight) * 2.0;

  // Particle size in NDC
  let sizeX = (renderParams.particleRadius * 2.0 / renderParams.canvasWidth) * 2.0;
  let sizeY = (renderParams.particleRadius * 2.0 / renderParams.canvasHeight) * 2.0;

  output.position = vec4<f32>(
    ndcX + qv.x * sizeX,
    ndcY + qv.y * sizeY,
    0.0,
    1.0
  );

  // Color based on fluid type and velocity
  let speed = length(p.vel);
  let speedFactor = clamp(speed / 20.0, 0.0, 1.0);
  var baseColor = renderParams.fluidColor;

  // Tint faster particles slightly brighter
  baseColor = mix(baseColor, vec4<f32>(1.0, 1.0, 1.0, baseColor.a), speedFactor * 0.2);

  output.color = baseColor;

  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  // Radial gradient from center
  let center = vec2<f32>(0.5, 0.5);
  let dist = distance(input.uv, center) * 2.0;

  if (dist > 1.0) {
    discard;
  }

  // Smooth falloff for metaball blending
  let alpha = 1.0 - smoothstep(0.0, 1.0, dist);
  let intensity = alpha * alpha;

  return vec4<f32>(input.color.rgb, intensity * input.color.a);
}
