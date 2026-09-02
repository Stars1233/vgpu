import {
  bundle,
  draw,
  effect,
  geometry,
  sampler,
  target,
  type Bundle,
  type Frame,
  type Gpu,
  type Surface,
  type Target,
} from 'vgpu';
import { box } from 'vgpu/scene';

import atmosphereWgsl from './atmosphere.wgsl';
import {
  encodeRadiance,
  setRadianceScene,
  setRadianceTime,
  type Radiance,
} from './radiance';
import blurWgsl from './blur.wgsl';
import brightWgsl from './bright.wgsl';
import fieldWgsl from './field.wgsl';
import glassWgsl from './glass.wgsl';
import nebulaWgsl from './nebula.wgsl';
import postWgsl from './post.wgsl';
import starsWgsl from './stars.wgsl';
import trailsWgsl from './trails.wgsl';

type Output = Surface | Target;

const CLEAR = [0, 0, 0, 1] as const;
const SCENE_FORMAT = 'rgba16float' as const;
// 6×4 cluster cells, two bars per cell. The layout lives in field.wgsl.
export const BAR_INSTANCES = 48;
export const GLASS_INSTANCES = 4;
// 4 trails × (21 segments + 1 head halo).
export const TRAIL_INSTANCES = 88;
export const DUST_COUNT = 224;

const BLURS = [
  { direction: [1, 0], radius: 1 },
  { direction: [0, 1], radius: 1 },
  { direction: [1, 0], radius: 2.4 },
  { direction: [0, 1], radius: 2.4 },
] as const;

export function createEffects(gpu: Gpu) {
  const samp = sampler(gpu, { minFilter: 'linear', magFilter: 'linear' });
  const cube = geometry(gpu, box({ size: 1 }));
  const additive = {
    color: { src: 'src-alpha', dst: 'one' },
    alpha: { src: 'one', dst: 'one' },
  } as const;
  return {
    nebula: effect(gpu, nebulaWgsl),
    stars: draw(gpu, {
      shader: starsWgsl,
      vertices: 6,
      instances: DUST_COUNT,
      blend: additive,
      label: 'boot-void-stars',
    }),
    // Alpha-blended painter's-order 3D: the source relied on draw order, so a
    // depth buffer would change the look rather than preserve it.
    bars: draw(gpu, {
      shader: fieldWgsl,
      geometry: cube,
      instances: BAR_INSTANCES,
      blend: 'alpha',
      cull: 'back',
      frontFace: 'cw',
      label: 'boot-void-bars',
    }),
    glass: draw(gpu, {
      shader: glassWgsl,
      geometry: cube,
      instances: GLASS_INSTANCES,
      blend: 'alpha',
      cull: 'back',
      frontFace: 'cw',
      label: 'boot-void-glass',
    }),
    atmosphere: effect(gpu, atmosphereWgsl, { set: { samp } }),
    trails: draw(gpu, {
      shader: trailsWgsl,
      vertices: 6,
      instances: TRAIL_INSTANCES,
      blend: additive,
      label: 'boot-void-trails',
    }),
    bright: effect(gpu, brightWgsl, { set: { samp } }),
    blur: BLURS.map((options) => effect(gpu, blurWgsl, { set: { samp, blur: options } })),
    post: effect(gpu, postWgsl, { set: { samp, params: { pointer: [0, 0] } } }),
  };
}

export type Effects = ReturnType<typeof createEffects>;

export function createTargets(gpu: Gpu, size: readonly [number, number]) {
  const owned: Target[] = [];
  const own = (created: Target) => {
    owned.push(created);
    return created;
  };
  try {
    const bloomHeight = Math.min(360, size[1]);
    const bloomSize: [number, number] = [
      Math.max(1, Math.round((bloomHeight * size[0]) / size[1])),
      bloomHeight,
    ];
    return {
      // 4× MSAA: passes resolve into a sampleable single-sample color.
      scene: own(target(gpu, { size, format: SCENE_FORMAT, msaa: true })),
      composite: own(target(gpu, { size, format: SCENE_FORMAT })),
      bloom: [
        own(target(gpu, { size: bloomSize, format: SCENE_FORMAT })),
        own(target(gpu, { size: bloomSize, format: SCENE_FORMAT })),
      ] as const,
    };
  } catch (error) {
    for (const created of owned.reverse()) destroy(created);
    throw error;
  }
}

export type Targets = ReturnType<typeof createTargets>;

export function destroyTargets(targets: Targets): void {
  destroy(targets.bloom[1]);
  destroy(targets.bloom[0]);
  destroy(targets.composite);
  destroy(targets.scene);
}

function destroy(color: Target | undefined): void {
  (color as { destroy?: () => void } | undefined)?.destroy?.();
}

export function setBindings(effects: Effects, targets: Targets, radiance: Radiance): void {
  const aspect = targets.scene.size[0] / targets.scene.size[1];
  effects.nebula.set({ params: { aspect } });
  effects.stars.set({ params: { aspect } });
  effects.bars.set({ params: { aspect } });
  effects.glass.set({ params: { aspect } });
  effects.atmosphere.set({ src: targets.scene, params: { aspect } });
  effects.trails.set({ params: { aspect } });
  effects.bright.set({ src: targets.composite });
  effects.blur.forEach((pass, i) =>
    pass.set({
      src: targets.bloom[i % 2],
      blur: { texelSize: targets.bloom[i % 2].texelSize },
    }),
  );
  effects.post.set({
    src: targets.composite,
    bloom: targets.bloom[0],
    radiance: radiance.irradiance,
    params: { aspect },
  });
  setRadianceScene(radiance, targets.scene);
}

export function setTime(effects: Effects, radiance: Radiance, time: number): void {
  const params = { params: { time } };
  effects.nebula.set(params);
  effects.stars.set(params);
  effects.bars.set(params);
  effects.glass.set(params);
  effects.atmosphere.set(params);
  effects.trails.set(params);
  effects.post.set(params);
  setRadianceTime(radiance, time);
}

export function setPointer(effects: Effects, pointer: readonly [number, number]): void {
  effects.post.set({ params: { pointer } });
}

export async function prewarm(effects: Effects, targets: Targets, output: Output): Promise<void> {
  await Promise.all([
    effects.nebula.compile(targets.scene),
    effects.stars.compile(targets.scene),
    effects.bars.compile(targets.scene),
    effects.glass.compile(targets.scene),
    effects.atmosphere.compile(targets.composite),
    effects.trails.compile(targets.composite),
    effects.bright.compile(targets.bloom[0]),
    ...effects.blur.map((pass, i) => pass.compile(targets.bloom[(i + 1) % 2])),
    effects.post.compile({ colors: [output.format] }),
  ]);
}

// Bundles freeze the render signature, not the target, so they survive resizes.
export function recordScene(gpu: Gpu, effects: Effects): Bundle {
  return bundle(
    gpu,
    { target: { colors: [SCENE_FORMAT], sampleCount: 4 }, label: 'boot-void-scene' },
    (pass) => {
      pass.draw(effects.nebula);
      pass.draw(effects.stars);
      pass.draw(effects.bars);
      pass.draw(effects.glass);
    },
  );
}

export function renderChain(
  frame: Frame,
  effects: Effects,
  targets: Targets,
  output: Output,
  scene: Bundle,
  radiance: Radiance,
): void {
  frame.pass({ target: targets.scene, clear: CLEAR }, (pass) => pass.bundles(scene));
  encodeRadiance(frame, radiance);
  frame.pass({ target: targets.composite, clear: CLEAR }, (pass) => {
    pass.draw(effects.atmosphere);
    pass.draw(effects.trails);
  });
  frame.pass({ target: targets.bloom[0], clear: CLEAR }, (pass) => pass.draw(effects.bright));
  effects.blur.forEach((pass, i) => {
    frame.pass({ target: targets.bloom[(i + 1) % 2], clear: CLEAR }, (framePass) =>
      framePass.draw(pass),
    );
  });
  frame.pass({ target: output, clear: CLEAR }, (pass) => pass.draw(effects.post));
}
