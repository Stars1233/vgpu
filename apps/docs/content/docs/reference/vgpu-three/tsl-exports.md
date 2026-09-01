---
title: "tslExports"
description: "Creates callable three.js TSL functions from selected direct exports of a resolved WGSL module. Use it to reuse pure WGSL libraries in Three node materials while Three retains ownership of shader stages and bindings."
---

## Import

```ts
import { tslExports } from "vgpu/three";
```

`three` is an optional peer of `vgpu`. Importing other `vgpu` entry points does not load Three.

## Signature

```ts
import type { ShaderFunctionExport } from "vgpu";
import type { Node } from "three/webgpu";
import type { ShaderNodeObject } from "three/tsl";

type TslExportsSource = string | {
  readonly wgsl: string;
  readonly functionExports?: readonly ShaderFunctionExport[];
};

type TslInputs = Readonly<Record<string, Node | number>>;
type TslContractShape<Contract> = Readonly<{
  [Name in keyof Contract]: TslInputs;
}>;
type TslFunctions<Contract extends TslContractShape<Contract>> = {
  readonly [Name in keyof Contract]: (
    inputs: Contract[Name],
  ) => ShaderNodeObject<Node>;
};

declare function tslExports<const Names extends readonly string[]>(
  source: TslExportsSource,
  names: Names,
): {
  readonly [Name in Names[number]]: (
    inputs: TslInputs,
  ) => ShaderNodeObject<Node>;
};

declare function tslExports<Contract extends TslContractShape<Contract>>(
  source: TslExportsSource,
  names: readonly (keyof Contract & string)[],
): TslFunctions<Contract>;
```

`TslExportsSource` describes the accepted shape; it is not a separately exported adapter type. Both a loader-emitted `ShaderSource` and the complete result of `resolveShader()` satisfy the object form.

## Parameters

| Param | Type | Required | Default | Notes |
| --- | --- | ---: | --- | --- |
| `source` | `{ wgsl, functionExports? } \| string` | ✔ | — | Prefer the complete loader or resolver artifact. A raw string is a compatibility path for non-minified hand-written or legacy WGSL. |
| `source.wgsl` | `string` | ✔ for object form | — | Final ordinary WGSL passed to one shared Three `wgsl()` include. |
| `source.functionExports` | `readonly ShaderFunctionExport[]` | ✖ for legacy objects | absent | Authoritative direct-export identity. New vgpu artifacts always emit this property, including `[]`. |
| `names` | `readonly string[]` | ✔ | — | Authored names of direct, surviving `export fn` declarations. Literal array members become keys of the return type. |
| `Contract` | `{ exportName: { parameterName: Node \| number } }` | ✖ | broad named inputs | Optional manual TypeScript contract. Its keys restrict `names`; each value types that export's input object. Its keys must exactly match the functions requested in `names`. |

**Returns:** A readonly object with one callable Three TSL node for each requested name. Every callable takes one named-input object whose keys match the authored WGSL parameter names and whose values are Three nodes or numbers.

**Throws:** `VGPU-THREE-TSL-EXPORT-NOT-FOUND` when no authoritative direct export matches; `VGPU-THREE-TSL-EXPORT-AMBIGUOUS` when multiple exports match; `VGPU-THREE-TSL-SIGNATURE-UNSUPPORTED` for a void or non-forwardable function; `VGPU-THREE-TSL-SOURCE-INVALID` when metadata and emitted WGSL disagree, the final declaration is malformed, or source uses the private adapter namespace. Errors thrown by Three are not wrapped.

## Example

```ts
import { float, positionLocal } from "three/tsl";
import { tslExports } from "vgpu/three";
import surfaceModule from "./surface.wgsl";

const { surfaceColor } = tslExports(surfaceModule, ["surfaceColor"]);

const colorNode = surfaceColor({
  position: positionLocal,
  timeSeconds: float(2),
});
```

Identifier minification is fully supported when you pass the complete imported object. The resolver records each authored export name, its authored parameter names, and the corresponding declaration name in the minified WGSL; `tslExports()` uses those references to build the callable.

## Manual TypeScript contract

The default overload infers the returned property names but accepts any named `Node | number` inputs. Supply a contract when you also want TypeScript to check function names and required parameter keys:

```ts
import type { Node } from "three/webgpu";
import { positionLocal, time } from "three/tsl";
import { tslExports } from "vgpu/three";
import surfaceModule from "./surface.wgsl";

type SurfaceExports = {
  surfaceColor: {
    position: Node;
    timeSeconds: Node | number;
  };
  surfaceRoughness: {
    position: Node;
    timeSeconds: Node | number;
  };
};

const { surfaceColor } = tslExports<SurfaceExports>(
  surfaceModule,
  ["surfaceColor", "surfaceRoughness"],
);

surfaceColor({ position: positionLocal, timeSeconds: time });

// @ts-expect-error — timeSeconds is required by the manual contract.
surfaceColor({ position: positionLocal });
```

The contract is a compile-time assertion maintained by the application; it is not generated from the WGSL. Keep its keys exactly equal to the `names` selection. TypeScript rejects a selected name outside the contract, but cannot prove that the array contains every contract key. At runtime, the shader artifact remains authoritative for export identity and authored parameter names. Three's `Node` type is not branded by WGSL value type, so this checks names and the manually chosen TypeScript value types rather than proving `f32` versus `vec3f` compatibility.

## Notes

- One call creates one shared `wgsl()` include plus one `wgslFn()` forwarding wrapper for each requested export.
- The presence of `functionExports` is authoritative. An empty array exposes nothing, even if the WGSL contains private functions whose names happen to match.
- New loader and resolver artifacts always carry `functionExports`, even when it is empty. Only raw strings and legacy artifacts without that property use the text-scanning fallback; those inputs must retain their original identifiers and do not provide a reliable export boundary.
- Only direct function declarations are exports. Import aliases and private helpers do not become callable adapter exports.
- Duplicate authored names are retained in generic WGSL metadata so the adapter can report ambiguity instead of silently choosing one.
- Export metadata keeps authored `parameterNames` in declaration order and uses `resolvedName` for the exact declaration identifier in the final WGSL.
- The `_vgpu_three_` top-level declaration namespace is reserved for private forwarding functions. Source that declares a name in that namespace fails with `VGPU-THREE-TSL-SOURCE-INVALID`.
- Functions must be pure, have no shader-stage attribute, receive values through parameters, and return a value.
- Without a manual `Contract`, TypeScript infers requested export keys but not WGSL parameter names or WGSL value and return types.
- Match thrown values by `.code`; the adapter does not export an error class.
- **See also:** [Use WGSL modules in three.js TSL](/guides/threejs), the [`tslExports` example](/examples/tsl-exports), `ShaderSource`, and `resolveShader`.
