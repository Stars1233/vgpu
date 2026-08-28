import { frame, type Gpu, type Target } from 'vgpu';

import {
  createEffects,
  createTargets,
  destroyTargets,
  prewarm,
  recordScenes,
  renderChain,
  setBindings,
  setTime,
  type Targets,
} from './pipeline';
import { createDust, type Dust } from './dust';
import { createDustVgpu, type DustVgpu } from './dust-vgpu';
import {
  createRadiance,
  destroyRadiance,
  prewarmRadiance,
  type Radiance,
} from './radiance';

interface ThumbOptions {
  readonly warmupFrames?: number;
  readonly time?: number;
  readonly dt?: number;
}

export async function renderThumbnail(
  gpu: Gpu,
  output: Target,
  options: ThumbOptions = {},
): Promise<void> {
  let targets: Targets | undefined;
  let radiance: Radiance | undefined;
  let dust: Dust | undefined;
  let dustVgpu: DustVgpu | undefined;
  let dustBuffer: { dispose(): void } | undefined;
  try {
    const effects = createEffects(gpu);
    targets = createTargets(gpu, output.size);
    radiance = createRadiance(gpu, output.size);
    dustVgpu = createDustVgpu(gpu);
    effects.starsVgpu.set({ particles: dustVgpu.particles });
    dust = createDust(gpu.gpu as GPUDevice);
    dustBuffer = gpu.device.wrapBuffer(dust.buffer);
    effects.stars.set({ particles: dustBuffer });
    dust.setLightField(radiance.irradiance.color.view);
    setBindings(effects, targets, radiance);
    await Promise.all([prewarm(effects, targets, output), prewarmRadiance(radiance)]);
    // The thumbnail showcases the full duet: the TypeGPU-simulated mode.
    const scene = recordScenes(gpu, effects)['vgpu + TypeGPU'];

    let time = options.time ?? 2;
    const dt = options.dt ?? 1 / 60;
    const aspect = output.size[0] / output.size[1];
    for (let i = 0; i < Math.max(1, options.warmupFrames ?? 60); i++) {
      time += dt;
      dust.update(time, dt, aspect);
      setTime(effects, radiance, time);
      const currentTargets = targets;
      const currentRadiance = radiance;
      frame(gpu, (currentFrame) =>
        renderChain(currentFrame, effects, currentTargets, output, scene, currentRadiance),
      );
    }
  } finally {
    await Promise.allSettled([
      Promise.resolve().then(() => gpu.gpu.queue.onSubmittedWorkDone()),
      Promise.resolve().then(() => gpu.settled()),
    ]);
    dustBuffer?.dispose();
    dust?.destroy();
    dustVgpu?.destroy();
    if (radiance) destroyRadiance(radiance);
    if (targets) destroyTargets(targets);
  }
}
