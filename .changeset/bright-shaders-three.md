---
"vgpu": minor
"@vgpu/wgsl": minor
---

Add the `vgpu/three` adapter for calling resolved WGSL function exports from three.js TSL, including manually typed input contracts, identifier-minified shader support, and early rejection of global WGSL directives that Three cannot place correctly.

Expose authored function-export metadata from the WGSL resolver and bundler loaders so integrations can address direct `export fn` declarations after mangling and minification. Add the `isShaderFunctionExport()` type guard to `@vgpu/wgsl`, with a convenience re-export from `vgpu`, for validating unknown metadata at integration boundaries.
