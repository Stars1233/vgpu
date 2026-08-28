// Emitter field derived from the frame itself: bright scene pixels occlude
// with a faint bounce tint, the orbs are stamped analytically as emitters.
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct Params {
  time: f32,
  aspect: f32,
}
@group(0) @binding(2) var<uniform> params: Params;

const FOCAL_PX = 360.0;
const FRAME = 480.0;
// Luminance above this reads as solid geometry in the light field.
const OCCLUDER_THRESHOLD = 0.30;

fn path(u: f32) -> vec3f {
  return vec3f(
    cos(u) * 1.4 + sin(u * 2.3) * 0.4,
    sin(u * 1.3) * 0.95 + cos(u * 1.7) * 0.3,
    3.2 + sin(u * 0.7) * 1.2,
  );
}

fn headUv(u: f32, aspect: f32) -> vec2f {
  let p = path(u);
  let px = p.xy * (FOCAL_PX / max(p.z, 0.01));
  return vec2f(0.5 + px.x / (FRAME * aspect), 0.5 - px.y / FRAME);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var colors = array<vec3f, 4>(
    vec3f(1.0, 0.235, 0.275),
    vec3f(0.47, 1.0, 0.51),
    vec3f(1.0, 0.39, 0.9),
    vec3f(0.47, 0.63, 1.0),
  );

  let sampled = textureSampleLevel(scene, samp, uv, 0.0).rgb;
  let luminance = dot(sampled, vec3f(0.2126, 0.7152, 0.0722));
  var radiance = vec3f(0.0);
  var occupancy = 0.0;
  if (luminance > OCCLUDER_THRESHOLD) {
    radiance = sampled * 0.22;
    occupancy = 1.0;
  }

  let p = (uv - vec2f(0.5)) * vec2f(params.aspect, 1.0);

  // Diffuse ember: wide gaussian, no hard edge.
  let emberDistance = length(p) / 0.12;
  let emberFalloff = exp(-emberDistance * emberDistance * 2.0);
  if (emberFalloff > 0.05) {
    radiance = vec3f(0.4, 0.62, 1.5) * 1.0 * emberFalloff;
    occupancy = 1.0;
  }

  for (var i = 0u; i < 4u; i++) {
    let speed = 0.45 + f32(i) * 0.08;
    let phase = f32(i) * 1.5707963;
    let head = (headUv(params.time * speed + phase, params.aspect) - uv) *
      vec2f(params.aspect, 1.0);
    if (length(head) < 0.013) {
      radiance = colors[i] * 4.0;
      occupancy = 1.0;
    }
  }

  return vec4f(radiance, occupancy);
}
