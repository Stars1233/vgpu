// Same simulation as dust.ts, authored in plain vgpu: WGSL owns the layout.
import { compute, sampler, storage, type Gpu, type Target } from 'vgpu';

import { DUST_COUNT } from './pipeline';
import dustSimWgsl from './dust-sim.wgsl';

// The hand-computed layout of the Particle struct in dust-sim.wgsl:
// position (8) + velocity (8) + seed (4) + energy (4) = 24 bytes, then
// vec3f aligns to 16, so tint starts at 32 and pads the struct to 48.
const PARTICLE_BYTES = 48;
const FLOATS_PER_PARTICLE = PARTICLE_BYTES / 4;
const WORKGROUP_SIZE = 64;

// Matches dust.ts seeding so both modes start from the same field.
function hash01(seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export function seedData(): Float32Array<ArrayBuffer> {
  const data = new Float32Array(DUST_COUNT * FLOATS_PER_PARTICLE);
  for (let index = 0; index < DUST_COUNT; index++) {
    const ring = 70 + hash01(index * 4) * 190;
    const angle = hash01(index * 4 + 1) * Math.PI * 2;
    const base = index * FLOATS_PER_PARTICLE;
    data[base] = Math.cos(angle) * ring; // position.x
    data[base + 1] = Math.sin(angle) * ring; // position.y
    // velocity (2), energy, tint (3) stay zero; seed is the only other field.
    data[base + 4] = hash01(index * 4 + 2); // seed
  }
  return data;
}

export function createDustVgpu(gpu: Gpu) {
  const particles = storage(gpu, DUST_COUNT * PARTICLE_BYTES, 'read-write');
  particles.write(seedData());
  const samp = sampler(gpu, { minFilter: 'linear', magFilter: 'linear' });
  const simulate = compute(gpu, dustSimWgsl, { set: { particles, samp } });
  let ready = false;

  return {
    particles,
    // Rebound whenever a resize rebuilds the light field.
    setLightField(light: Target): void {
      simulate.set({ light });
      ready = true;
    },
    update(time: number, dt: number, aspect: number): void {
      if (!ready) return;
      simulate.set({ params: { time, dt: Math.min(dt, 1 / 30), aspect } });
      simulate.dispatch(Math.ceil(DUST_COUNT / WORKGROUP_SIZE));
    },
    destroy(): void {
      (particles as { destroy?: () => void }).destroy?.();
    },
  };
}

export type DustVgpu = ReturnType<typeof createDustVgpu>;
