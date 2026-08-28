// Five translucent glass cubes tumbling slowly in front of the bar field.
struct Params {
  time: f32,
  aspect: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const FOG_START = 5.4;
const FOG_DENSITY = 1.6;
const CAMERA_SPIN = 0.06;
const FOCAL = 1.5;

fn pcg(seed: u32) -> u32 {
  var state = seed * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn hash01(seed: u32) -> f32 {
  return f32(pcg(seed)) * (1.0 / 4294967295.0);
}

fn roll(p: vec2f, angle: f32) -> vec2f {
  let c = cos(angle);
  let s = sin(angle);
  return vec2f(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn rotation(angles: vec3f) -> mat3x3f {
  let cx = cos(angles.x);
  let sx = sin(angles.x);
  let cy = cos(angles.y);
  let sy = sin(angles.y);
  let cz = cos(angles.z);
  let sz = sin(angles.z);
  let rx = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, cx, sx), vec3f(0.0, -sx, cx));
  let ry = mat3x3f(vec3f(cy, 0.0, -sy), vec3f(0.0, 1.0, 0.0), vec3f(sy, 0.0, cy));
  let rz = mat3x3f(vec3f(cz, sz, 0.0), vec3f(-sz, cz, 0.0), vec3f(0.0, 0.0, 1.0));
  return rz * ry * rx;
}

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) viewPos: vec3f,
}

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @builtin(instance_index) instance: u32,
) -> VertexOut {
  // Four corner cubes; the source's fifth center cube would silhouette
  // against the ember, so the orb keeps the center to itself.
  var centers = array<vec3f, 4>(
    vec3f(-1.9, 1.1, 4.6),
    vec3f(1.9, 1.1, 4.6),
    vec3f(-1.9, -1.1, 4.6),
    vec3f(1.9, -1.1, 4.6),
  );
  var scales = array<f32, 4>(0.62, 0.78, 0.55, 0.7);

  let seed = instance * 8u;
  // Slow independent tumble per axis, from a random initial orientation.
  let spin = vec3f(
    (hash01(seed + 0u) - 0.5) * 0.2,
    (hash01(seed + 1u) - 0.5) * 0.25,
    (hash01(seed + 2u) - 0.5) * 0.12,
  );
  let base = vec3f(hash01(seed + 3u), hash01(seed + 4u), hash01(seed + 5u));
  let rotate = rotation(base + spin * params.time);

  let world = centers[instance] + rotate * (position * scales[instance]);
  let angle = -params.time * CAMERA_SPIN;
  let view = vec3f(roll(world.xy, angle), world.z);
  let viewNormal = rotate * normal;

  var out: VertexOut;
  out.position = vec4f(view.x * FOCAL / params.aspect, view.y * FOCAL, 0.0, view.z);
  out.normal = vec3f(roll(viewNormal.xy, angle), viewNormal.z);
  out.viewPos = view;
  return out;
}

@fragment fn fs_main(
  @location(0) normal: vec3f,
  @location(1) viewPos: vec3f,
) -> @location(0) vec4f {
  let n = normalize(normal);
  let towardCamera = normalize(-viewPos);
  let fresnel = pow(1.0 - abs(dot(n, towardCamera)), 1.6);
  var alpha = 0.10 + fresnel * 0.65;
  alpha *= exp(-FOG_DENSITY * max(0.0, viewPos.z - FOG_START));
  let color = mix(vec3f(0.55, 0.70, 0.95), vec3f(0.92, 0.97, 1.0), fresnel);
  return vec4f(color, alpha);
}
