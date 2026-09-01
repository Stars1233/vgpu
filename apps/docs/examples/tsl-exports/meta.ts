export const meta = {
  slug: "tsl-exports",
  title: "tslExports",
  description:
    "Turn one exported WGSL function into a callable Three.js TSL node and use it on a physical material.",
  tags: ["3d", "shader", "rendering"],
  guide: "/docs/guides/threejs",
  capabilities: ["webgpu", "continuous-rendering", "responsive-canvas"],
  thumb: { time: 2.4 },
  files: ["index.tsx", "renderer.ts", "surface.wgsl"],
} as const;
