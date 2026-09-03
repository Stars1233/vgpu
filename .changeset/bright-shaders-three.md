---
"vgpu": minor
"@vgpu/wgsl": minor
---

Add the `vgpu/three` adapter for calling resolved WGSL function exports from three.js TSL, including a sound curried selector with positional export names, manually typed input contracts, identifier-minified shader support, a type-only `TslExportsErrorCode` union, and early rejection of global WGSL directives that Three cannot place correctly.

Expose authored function-export metadata from the WGSL resolver and bundler loaders so integrations can address direct `export fn` declarations after mangling and minification. Add the `isShaderFunctionExport()` type guard to `@vgpu/wgsl`, with a convenience re-export from `vgpu`, for validating unknown metadata at integration boundaries.

Treat WGSL comments as trivia around stage and resource-binding attributes so declaration DCE, emitted identifiers, and reflection metadata stay aligned.

Use the entry source supplied by Vite and webpack during imported-graph resolution, preserving upstream transforms and virtual entries while resolving dependencies from their normal locations.
