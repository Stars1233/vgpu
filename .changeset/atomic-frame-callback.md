---
"vgpu": minor
---

`frame(gpu, cb)` and `frameLoop(gpu, cb)` now cancel the frame when the callback throws instead of submitting whatever was encoded. A callback that returns still submits once; a callback that throws submits no command buffer, releases the timer/visibility retains its passes took, and rethrows the original error unchanged. A callback that already called `frame.submit()` keeps that submit (the error is rethrown without a cancel attempt), and one that already called `frame.cancel()` stays canceled. The guarantee covers only the frame's command buffer: the clock tick, CPU-side mutations and independent submissions are not rolled back. Manual `frame(gpu)` is unchanged.

A `frameLoop` tick that throws now also stops the loop properly — the handle is released from the gpu as if `stop()` had been called — instead of leaving a loop that never ticks again registered until `gpu.dispose()`.

BREAKING CHANGE (pre-1.0): code that relied on a throwing callback still presenting its partial frame must now submit explicitly before rethrowing:

```ts
frame(gpu, (currentFrame) => {
  try {
    encode(currentFrame);
  } catch (error) {
    currentFrame.submit();
    throw error;
  }
});
```
