// Same physics as dust-sim-tgsl.ts, written directly in WGSL. The struct
// must agree with stars.wgsl and the packing in dust-vgpu.ts.
struct Particle {
  position: vec2f,
  velocity: vec2f,
  seed: f32,
  energy: f32,
  tint: vec3f,
}

struct SimParams {
  time: f32,
  dt: f32,
  aspect: f32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: SimParams;
@group(0) @binding(2) var light: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

const FOCAL_PX = 360.0;
const HALF_HEIGHT_PX = 240.0;

fn path(u: f32) -> vec3f {
  return vec3f(
    cos(u) * 1.4 + sin(u * 2.3) * 0.4,
    sin(u * 1.3) * 0.95 + cos(u * 1.7) * 0.3,
    3.2 + sin(u * 0.7) * 1.2,
  );
}

fn headPx(index: f32, time: f32) -> vec2f {
  let speed = 0.45 + index * 0.08;
  let phase = index * 1.5707963;
  let p = path(time * speed + phase);
  return p.xy * (FOCAL_PX / max(p.z, 0.01));
}

fn lightUv(px: vec2f, aspect: f32) -> vec2f {
  return vec2f(
    0.5 + px.x / (2.0 * HALF_HEIGHT_PX * aspect),
    0.5 - px.y / (2.0 * HALF_HEIGHT_PX),
  );
}

fn irradianceAt(px: vec2f, aspect: f32) -> vec3f {
  return textureSampleLevel(light, samp, lightUv(px, aspect), 0.0).rgb;
}

fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

// Ring spring + swirl + head shove + climb toward the light field.
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= arrayLength(&particles)) {
    return;
  }
  var p = particles[gid.x];

  let distance = max(length(p.position), 1.0);
  let outward = p.position / distance;
  let tangent = vec2f(-outward.y, outward.x);

  let ring = 70.0 + p.seed * 190.0;
  var accel = (outward * ring - p.position) * 0.9;
  accel += tangent * (26.0 + p.seed * 42.0) * (140.0 / (distance + 60.0));

  var nearest = 1e9;
  for (var i = 0u; i < 4u; i++) {
    let away = p.position - headPx(f32(i), params.time);
    let d2 = dot(away, away);
    nearest = min(nearest, d2);
    accel += away * (2600.0 / (d2 + 300.0));
  }

  let eps = 14.0;
  let glow = irradianceAt(p.position, params.aspect);
  let gradient = vec2f(
    luminance(irradianceAt(p.position + vec2f(eps, 0.0), params.aspect)) -
      luminance(irradianceAt(p.position - vec2f(eps, 0.0), params.aspect)),
    luminance(irradianceAt(p.position + vec2f(0.0, eps), params.aspect)) -
      luminance(irradianceAt(p.position - vec2f(0.0, eps), params.aspect)),
  );
  accel += gradient * 900.0;
  p.tint = mix(p.tint, glow, 1.0 - exp(-params.dt * 3.0));

  p.velocity = (p.velocity + accel * params.dt) * exp(-params.dt * 1.6);
  p.position += p.velocity * params.dt;

  let excited = clamp(2400.0 / (nearest + 240.0), 0.0, 1.0);
  p.energy = max(excited, p.energy * exp(-params.dt * 2.2));

  particles[gid.x] = p;
}
