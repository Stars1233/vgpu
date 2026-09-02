import GUI from 'lil-gui';
import {
  clock,
  frameLoop,
  surface,
  type Bundle,
  type Gpu,
  type Surface,
} from 'vgpu';

import {
  createEffects,
  createTargets,
  DEFAULT_DUST_MODE,
  destroyTargets,
  DUST_MODES,
  prewarm,
  recordScenes,
  renderChain,
  setBindings,
  setPointer,
  setTime,
  type DustMode,
} from './pipeline';
import { createDust, type Dust } from './dust';
import { createDustVgpu, type DustVgpu } from './dust-vgpu';
import {
  createRadiance,
  destroyRadiance,
  prewarmRadiance,
  type Radiance,
} from './radiance';

interface RendererOptions {
  canvas: HTMLCanvasElement;
}

interface RenderSize {
  width: number;
  height: number;
  dpr: number;
}

export function createRenderer(options: RendererOptions) {
  let disposed = false;
  let gpu: Gpu | undefined;
  let canvasSurface: Surface | undefined;
  let effects: ReturnType<typeof createEffects> | undefined;
  let targets: ReturnType<typeof createTargets> | undefined;
  let radiance: Radiance | undefined;
  let dust: Dust | undefined;
  let dustVgpu: DustVgpu | undefined;
  let dustBuffer: { dispose(): void } | undefined;
  let scenes: Record<DustMode, Bundle> | undefined;
  let mode: DustMode = DEFAULT_DUST_MODE;
  let gui: GUI | undefined;
  let input: ReturnType<typeof installParallaxInput> | undefined;
  let observer: ResizeObserver | undefined;
  let resizeFrame = 0;
  let pendingSize: RenderSize | undefined;
  let lastDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio;

  const applyResize = () => {
    resizeFrame = 0;
    const size = pendingSize;
    pendingSize = undefined;
    if (disposed || !size || !gpu || !effects || !targets || !radiance || !canvasSurface) return;

    try {
      const previousTargets = targets;
      const previousRadiance = radiance;
      const pixels: [number, number] = [
        Math.max(1, Math.round(size.width * size.dpr)),
        Math.max(1, Math.round(size.height * size.dpr)),
      ];
      const nextTargets = createTargets(gpu, pixels);
      let nextRadiance: Radiance | undefined;

      try {
        // Size-dependent (jump count, cascade count), rebuilt with the targets.
        nextRadiance = createRadiance(gpu, pixels);
        setBindings(effects, nextTargets, nextRadiance);
        dustVgpu?.setLightField(nextRadiance.irradiance);
        dust?.setLightField(nextRadiance.irradiance.color.view);
        void prewarmRadiance(nextRadiance).catch(() => {});
      } catch (error) {
        if (nextRadiance) destroyRadiance(nextRadiance);
        destroyTargets(nextTargets);
        throw error;
      }

      targets = nextTargets;
      radiance = nextRadiance;
      destroyTargets(previousTargets);
      destroyRadiance(previousRadiance);
    } catch (error) {
      fail(error);
    }
  };

  const resize = (size: RenderSize) => {
    if (disposed || size.width <= 0 || size.height <= 0) return;
    pendingSize = size;
    if (!resizeFrame) resizeFrame = requestAnimationFrame(applyResize);
  };

  const measure = () => {
    const rect = options.canvas.getBoundingClientRect();
    resize({
      width: rect.width,
      height: rect.height,
      dpr: Math.min(1.6, Math.max(1, window.devicePixelRatio || 1)),
    });
  };

  const onWindowResize = () => {
    if (window.devicePixelRatio === lastDpr) return;
    lastDpr = window.devicePixelRatio;
    measure();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    observer?.disconnect();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', onWindowResize);
    }
    input?.dispose();
    gui?.destroy();
    gpu?.dispose();
    dustBuffer?.dispose();
    dust?.destroy();
    dustVgpu?.destroy();
  };

  const initialize = async () => {
    const { init } = await import('vgpu');
    if (disposed) return;

    const nextGpu = await init({
      requiredLimits: { maxStorageBuffersInVertexStage: 1 },
    });
    if (disposed) {
      nextGpu.dispose();
      return;
    }

    gpu = nextGpu;
    canvasSurface = surface(gpu, options.canvas, { dpr: [1, 1.6] });
    effects = createEffects(gpu);
    targets = createTargets(gpu, canvasSurface.size);
    radiance = createRadiance(gpu, canvasSurface.size);
    // Two authorings of the same simulation; the switch picks which one runs.
    dustVgpu = createDustVgpu(gpu);
    effects.starsVgpu.set({ particles: dustVgpu.particles });
    dust = createDust(gpu.gpu as GPUDevice);
    dustBuffer = gpu.device.wrapBuffer(dust.buffer);
    effects.stars.set({ particles: dustBuffer });
    dustVgpu.setLightField(radiance.irradiance);
    dust.setLightField(radiance.irradiance.color.view);
    setBindings(effects, targets, radiance);
    await Promise.all([
      prewarm(effects, targets, canvasSurface),
      prewarmRadiance(radiance),
    ]);
    if (disposed) return;
    // Record after prewarm; one bundle per dust mode.
    scenes = recordScenes(gpu, effects);

    gui = new GUI({
      title: 'Boot Void',
      container: options.canvas.parentElement ?? undefined,
      width: 200,
    });
    Object.assign(gui.domElement.style, {
      position: 'absolute',
      top: '16px',
      right: '16px',
      zIndex: '10',
    });
    gui
      .add({ mode }, 'mode', [...DUST_MODES])
      .name('Dust')
      .onChange((next: DustMode) => {
        mode = next;
      });

    input = installParallaxInput(options.canvas);
    observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(options.canvas);
    window.addEventListener('resize', onWindowResize);
    measure();

    const gpuClock = clock(gpu);
    frameLoop(gpu, (currentFrame) => {
      if (
        disposed ||
        !effects ||
        !targets ||
        !radiance ||
        !dust ||
        !dustVgpu ||
        !canvasSurface ||
        !scenes ||
        !input
      ) {
        return;
      }
      const aspect = targets.scene.size[0] / targets.scene.size[1];
      if (mode === 'vgpu + TypeGPU') {
        dust.update(gpuClock.time, gpuClock.deltaTime, aspect);
      } else {
        dustVgpu.update(gpuClock.time, gpuClock.deltaTime, aspect);
      }
      setTime(effects, radiance, gpuClock.time);
      setPointer(effects, input.update());
      renderChain(currentFrame, effects, targets, canvasSurface, scenes[mode], radiance);
    });
  };

  function fail(error: unknown): never {
    dispose();
    throw error;
  }

  const ready = initialize().catch((error: unknown) => {
    if (disposed) return;
    fail(error);
  });

  return { ready, resize, dispose };
}

function installParallaxInput(canvas: HTMLCanvasElement) {
  let x = 0;
  let y = 0;
  let targetX = 0;
  let targetY = 0;

  const move = (event: PointerEvent) => {
    if (!event.isPrimary) return;
    const rect = canvas.getBoundingClientRect();
    targetX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    targetY = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
  };

  const leave = () => {
    targetX = 0;
    targetY = 0;
  };

  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerleave', leave);

  return {
    update(): readonly [number, number] {
      x += (targetX - x) * 0.06;
      y += (targetY - y) * 0.06;
      return [x, y];
    },
    dispose() {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
    },
  };
}
