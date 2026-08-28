import * as d from 'typegpu/data';
import { expect, test } from 'vitest';

import { initialParticles, Particle, simulationWgsl } from './dust';
import { seedData } from './dust-vgpu';
import { DUST_COUNT } from './pipeline';

test('particle layout matches the WGSL struct the star shader declares', () => {
  // stars.wgsl declares { position: vec2f, velocity: vec2f, seed: f32,
  // energy: f32, tint: vec3f } by hand; the TypeGPU schema must agree byte
  // for byte.
  expect(d.sizeOf(Particle)).toBe(48);
  expect(d.alignmentOf(Particle)).toBe(16);
});

test('the resolved compute shader carries the generated declarations', () => {
  const wgsl = simulationWgsl();
  expect(wgsl).toContain('struct Particle');
  expect(wgsl).toContain('struct SimParams');
  expect(wgsl).toContain('var<storage, read_write> particles: array<Particle>');
  expect(wgsl).toContain('textureSampleLevel');
});

test('both authorings seed byte-identical particle fields', () => {
  // dust-vgpu.ts packs the 48-byte layout by hand; TypeGPU derives it from
  // the schema. Same values, same offsets, or the modes would not match.
  const packed = seedData();
  const typed = initialParticles();
  expect(packed.length).toBe(DUST_COUNT * 12);
  typed.forEach((particle, index) => {
    const base = index * 12;
    expect(packed[base]).toBeCloseTo(particle.position.x, 4);
    expect(packed[base + 1]).toBeCloseTo(particle.position.y, 4);
    expect(packed[base + 4]).toBeCloseTo(particle.seed, 6);
  });
});

test('seeding is deterministic and bounded', () => {
  const first = initialParticles();
  const second = initialParticles();
  expect(first).toHaveLength(DUST_COUNT);
  expect(first).toEqual(second);
  for (const particle of first) {
    const radius = Math.hypot(particle.position.x, particle.position.y);
    expect(radius).toBeGreaterThanOrEqual(70);
    expect(radius).toBeLessThanOrEqual(260);
    expect(particle.energy).toBe(0);
    expect(particle.tint).toEqual(d.vec3f(0, 0, 0));
  }
});
