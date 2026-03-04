// Full-screen metaball post-processing shader
// Thresholds accumulated particle density into smooth liquid surfaces
// Adds color tinting and glow effect

struct PostParams {
  threshold: f32,
  glowIntensity: f32,
  glowRadius: f32,
  _pad: f32,
  fluidColor: vec4<f32>,
  bgColor: vec4<f32>,
};

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var<uniform> postParams: PostParams;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

// Fullscreen triangle (oversized to cover the entire screen)
@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;
  // Generate a full-screen triangle
  var x: f32 = -1.0;
  var y: f32 = -1.0;
  if (vertexIndex == 1u) { x = 3.0; y = -1.0; }
  if (vertexIndex == 2u) { x = -1.0; y = 3.0; }
  output.position = vec4<f32>(x, y, 0.0, 1.0);
  output.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
  return output;
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let texSize = vec2<f32>(textureDimensions(inputTexture));
  let pixelSize = 1.0 / texSize;

  // Sample accumulated particle density
  let center = textureSample(inputTexture, inputSampler, input.uv);
  let density = center.a;

  // Threshold for liquid surface
  if (density < postParams.threshold) {
    // Below threshold — render dark background with subtle glow halo
    var glow: f32 = 0.0;
    for (var dx: i32 = -3; dx <= 3; dx++) {
      for (var dy: i32 = -3; dy <= 3; dy++) {
        let offset = vec2<f32>(f32(dx), f32(dy)) * pixelSize * postParams.glowRadius;
        let s = textureSample(inputTexture, inputSampler, input.uv + offset);
        if (s.a >= postParams.threshold) {
          let d = length(vec2<f32>(f32(dx), f32(dy))) / 3.0;
          glow = max(glow, (1.0 - d) * postParams.glowIntensity);
        }
      }
    }

    let glowColor = postParams.fluidColor.rgb * glow * 0.5;
    return vec4<f32>(postParams.bgColor.rgb + glowColor, 1.0);
  }

  // Above threshold — render fluid surface with simple lighting
  let dx_val = textureSample(inputTexture, inputSampler, input.uv + vec2<f32>(pixelSize.x, 0.0)).a
             - textureSample(inputTexture, inputSampler, input.uv - vec2<f32>(pixelSize.x, 0.0)).a;
  let dy_val = textureSample(inputTexture, inputSampler, input.uv + vec2<f32>(0.0, pixelSize.y)).a
             - textureSample(inputTexture, inputSampler, input.uv - vec2<f32>(0.0, pixelSize.y)).a;

  let normal = normalize(vec3<f32>(dx_val * 4.0, dy_val * 4.0, 1.0));
  let lightDir = normalize(vec3<f32>(0.3, -0.5, 1.0));
  let diffuse = max(dot(normal, lightDir), 0.0);

  // Specular
  let halfVec = normalize(lightDir + vec3<f32>(0.0, 0.0, 1.0));
  let specular = pow(max(dot(normal, halfVec), 0.0), 32.0);

  // Final color
  let baseColor = postParams.fluidColor.rgb;
  let lit = baseColor * (0.4 + diffuse * 0.5) + vec3<f32>(1.0, 1.0, 1.0) * specular * 0.3;

  // Edge glow
  let edgeFactor = smoothstep(postParams.threshold, postParams.threshold + 0.15, density);
  let edgeGlow = (1.0 - edgeFactor) * postParams.glowIntensity * postParams.fluidColor.rgb * 0.6;

  return vec4<f32>(lit + edgeGlow, 1.0);
}
