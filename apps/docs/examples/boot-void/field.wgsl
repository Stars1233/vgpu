// Boot-field bars. Every bar derives its cluster slot, jitter, and dimensions
// from instance_index alone: no CPU layout pass, no instance buffers.
struct Params {
  time: f32,
  aspect: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const CCOLS = 6u;
const CROWS = 4u;
const X_RANGE = 9.0;
const Y_RANGE = 5.8;
const CLUSTER_SKIP = 0.05;
const ANCHOR_JITTER = 0.14;
const STRIDE_MIN = 0.55;
const STRIDE_MAX = 0.63;
const Z_LEVEL = 6.5;
const FACE_MIN = 0.13;
const FACE_MAX = 0.18;
const STRETCH_MIN = 4.0;
const STRETCH_MAX = 6.0;
const FOG_START = 5.4;
const FOG_DENSITY = 1.6;
// rad/s, one full camera roll every ~105 s.
const CAMERA_SPIN = 0.06;
// cot(fov/2): the 360px focal length of the source's 480px frame.
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

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) depth: f32,
}

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @builtin(instance_index) instance: u32,
) -> VertexOut {
  // Two bars per cluster cell share an anchor, a line angle, and a stride.
  let cell = instance / 2u;
  let bar = instance % 2u;
  let seed = cell * 16u;
  let col = f32(cell % CCOLS);
  let row = f32(cell / CCOLS);

  let cellW = X_RANGE / f32(CCOLS);
  let cellH = Y_RANGE / f32(CROWS);
  let anchor = vec2f(
    -X_RANGE * 0.5 + (col + 0.5) * cellW + (hash01(seed + 1u) - 0.5) * cellW * ANCHOR_JITTER,
    -Y_RANGE * 0.5 + (row + 0.5) * cellH + (hash01(seed + 2u) - 0.5) * cellH * ANCHOR_JITTER,
  );
  let lineAngle = hash01(seed + 3u) * 6.2831853;
  let stride = mix(STRIDE_MIN, STRIDE_MAX, hash01(seed + 4u));
  let offset = (f32(bar) - 0.5) * stride;

  let face = mix(FACE_MIN, FACE_MAX, hash01(seed + 8u + bar * 2u));
  let stretch = face * mix(STRETCH_MIN, STRETCH_MAX, hash01(seed + 9u + bar * 2u));
  // A skipped cluster collapses to a degenerate (invisible) pair.
  let alive = step(CLUSTER_SKIP, hash01(seed));
  // Boot assembly: each bar grows in on its own staggered schedule.
  let ignition = 0.4 + hash01(seed + 12u + bar) * 1.4;
  let grown = smoothstep(ignition, ignition + 0.7, params.time);
  let halfExtent = vec3f(face, face, stretch) * alive * grown;

  let center = anchor + vec2f(cos(lineAngle), sin(lineAngle)) * offset;
  let world = vec3f(center, Z_LEVEL) + position * 2.0 * halfExtent;

  let angle = -params.time * CAMERA_SPIN;
  let view = roll(world.xy, angle);
  var out: VertexOut;
  out.position = vec4f(view.x * FOCAL / params.aspect, view.y * FOCAL, 0.0, world.z);
  out.normal = vec3f(roll(normal.xy, angle), normal.z);
  out.depth = world.z;
  return out;
}

@fragment fn fs_main(
  @location(0) normal: vec3f,
  @location(1) depth: f32,
) -> @location(0) vec4f {
  let alpha = exp(-FOG_DENSITY * max(0.0, depth - FOG_START));
  let light = normalize(vec3f(-0.4, 0.7, -0.6));
  let lit = max(dot(normalize(normal), light), 0.0);
  let color = vec3f(0.83, 0.86, 0.93) * (0.32 + 0.68 * lit);
  return vec4f(color, alpha);
}
