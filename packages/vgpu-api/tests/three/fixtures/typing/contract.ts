import type { Node } from "three/webgpu";
import { positionLocal } from "three/tsl";
import type { ShaderFunctionExport } from "vgpu";
import type { ShaderSource } from "vgpu/client";
import { tslExports } from "vgpu/three";
import surfaceModule from "./surface.wgsl";

const source = `
fn surfaceColor(position: vec3f, timeSeconds: f32) -> vec3f {
  return position * timeSeconds;
}

fn surfaceRoughness(position: vec3f, timeSeconds: f32) -> f32 {
  return length(position) * timeSeconds;
}
`;

const inferred = tslExports(source, ["surfaceColor", "surfaceRoughness"]);
inferred.surfaceColor({ position: positionLocal, timeSeconds: 1 });

// @ts-expect-error — only requested literal names are returned.
inferred.unselected({ position: positionLocal, timeSeconds: 1 });

interface SurfaceExports {
  surfaceColor: {
    position: Node;
    timeSeconds: Node | number;
  };
  surfaceRoughness: {
    position: Node;
    timeSeconds: Node | number;
  };
}

const typed = tslExports<SurfaceExports>(
  source,
  ["surfaceColor", "surfaceRoughness"],
);

typed.surfaceColor({ position: positionLocal, timeSeconds: 1 });

// @ts-expect-error — selected names must belong to the manual contract.
tslExports<SurfaceExports>(source, ["surfaceColour"]);

// @ts-expect-error — timeSeconds is required by the manual contract.
typed.surfaceColor({ position: positionLocal });

// @ts-expect-error — unknown inputs are rejected by the manual contract.
typed.surfaceColor({ position: positionLocal, timeSeconds: 1, extra: 1 });

// @ts-expect-error — the manual contract accepts only its declared value types.
typed.surfaceColor({ position: positionLocal, timeSeconds: "now" });

const surfaceColorExport: ShaderFunctionExport = {
  name: "surfaceColor",
  resolvedName: "surfaceColor",
  parameterNames: ["position", "timeSeconds"],
};
const publicArtifact: ShaderSource = {
  version: 1,
  wgsl: source,
  functionExports: [surfaceColorExport],
};
const importedExports: readonly ShaderFunctionExport[] | undefined =
  surfaceModule.functionExports;

tslExports(publicArtifact, ["surfaceColor"]);
tslExports(surfaceModule, ["surfaceColor"]);
void importedExports;
