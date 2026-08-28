// Four lissajous trails, one instance per segment plus a head halo, all
// derived from instance_index and time.
struct Params {
  time: f32,
  aspect: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

const POINTS = 22u;
// History spacing: the source pushed one point per 60Hz frame.
const HISTORY_DT = 1.0 / 60.0;
const FOCAL_PX = 360.0;
const HALF_HEIGHT_PX = 240.0;
const HALO_RADIUS_PX = 7.0;

fn path(u: f32) -> vec3f {
  return vec3f(
    cos(u) * 1.4 + sin(u * 2.3) * 0.4,
    sin(u * 1.3) * 0.95 + cos(u * 1.7) * 0.3,
    3.2 + sin(u * 0.7) * 1.2,
  );
}

fn project(p: vec3f) -> vec2f {
  return p.xy * (FOCAL_PX / max(p.z, 0.01));
}

fn clip(px: vec2f, aspect: f32) -> vec4f {
  return vec4f(px.x / (HALF_HEIGHT_PX * aspect), px.y / HALF_HEIGHT_PX, 0.0, 1.0);
}

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) alpha: f32,
  @location(2) local: vec2f,
  @location(3) halo: f32,
}

@vertex fn vs_main(
  @builtin(vertex_index) vertex: u32,
  @builtin(instance_index) instance: u32,
) -> VertexOut {
  var quad = array<vec2f, 6>(
    vec2f(0.0, -1.0), vec2f(1.0, -1.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  var colors = array<vec3f, 4>(
    vec3f(1.0, 0.235, 0.275),
    vec3f(0.47, 1.0, 0.51),
    vec3f(1.0, 0.39, 0.9),
    vec3f(0.47, 0.63, 1.0),
  );
  let trail = instance / POINTS;
  let segment = instance % POINTS;
  let speed = 0.45 + f32(trail) * 0.08;
  let phase = f32(trail) * 1.5707963;
  let corner = quad[vertex];

  var out: VertexOut;
  out.color = colors[trail];
  out.local = corner;

  if (segment == POINTS - 1u) {
    // Head halo: a small screen-aligned quad with a radial falloff.
    let head = project(path(params.time * speed + phase));
    let centered = vec2f(corner.x * 2.0 - 1.0, corner.y);
    out.position = clip(head + centered * HALO_RADIUS_PX, params.aspect);
    out.local = centered;
    out.alpha = smoothstep(1.2, 2.4, params.time);
    out.halo = 1.0;
    return out;
  }

  let fade = 1.0 - f32(segment + 1u) / f32(POINTS);
  let u0 = (params.time - f32(segment) * HISTORY_DT) * speed + phase;
  let u1 = (params.time - f32(segment + 1u) * HISTORY_DT) * speed + phase;
  let p0 = project(path(u0));
  let p1 = project(path(u1));
  let dir = p1 - p0;
  let axis = dir / max(length(dir), 0.0001);
  let perp = vec2f(-axis.y, axis.x);
  let halfWidth = (1.4 * fade + 0.5) * 0.5;
  let px = mix(p0, p1, corner.x) + perp * halfWidth * corner.y;
  out.position = clip(px, params.aspect);
  out.alpha = 0.85 * fade * fade * smoothstep(1.2, 2.4, params.time);
  out.halo = 0.0;
  return out;
}

@fragment fn fs_main(
  @location(0) color: vec3f,
  @location(1) alpha: f32,
  @location(2) local: vec2f,
  @location(3) halo: f32,
) -> @location(0) vec4f {
  // Halo: canvas radial-gradient stops 1.0 at the center, 0.5 midway, 0 at the rim.
  let r = length(local);
  let ring = select(
    clamp(mix(0.5, 0.0, (r - 0.5) * 2.0), 0.0, 1.0),
    mix(1.0, 0.5, r * 2.0),
    r < 0.5,
  );
  return vec4f(color, mix(alpha, ring, halo));
}
