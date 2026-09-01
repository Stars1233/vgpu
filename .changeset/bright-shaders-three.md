---
"vgpu": minor
"@vgpu/wgsl": minor
---

Add the `vgpu/three` adapter for calling resolved WGSL function exports from three.js TSL, including manually typed input contracts and identifier-minified shader support.

Expose authored function-export metadata from the WGSL resolver and bundler loaders so integrations can address direct `export fn` declarations after mangling and minification.
