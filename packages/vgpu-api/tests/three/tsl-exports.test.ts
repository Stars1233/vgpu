import { expect, test } from "vitest";
import { resolveShader } from "@vgpu/wgsl/runtime";
import { tslExports } from "vgpu/three";
import {
  WGSL_LEGACY_RESERVED_WORDS,
  WGSL_RESERVED_WORDS,
  WGSL_SPEC_KEYWORDS,
} from "../../../wgsl/src/runtime/wgsl-identifiers.ts";

test("turns a raw WGSL function into a callable Three node", () => {
  const { doubleValue } = tslExports(
    "fn doubleValue(value: f32) -> f32 { return value * 2.0; }",
    ["doubleValue"],
  );

  expect(doubleValue({ value: 2 })).toMatchObject({ isNode: true });
});

test("rejects declarations in the adapter's private WGSL namespace", () => {
  const source = `
fn _vgpu_three_0(value: f32) -> f32 { return value; }
fn surfaceValue(value: f32) -> f32 { return _vgpu_three_0(value); }
`;

  expect(errorCode(() => tslExports(source, ["surfaceValue"]))).toBe(
    "VGPU-THREE-TSL-SOURCE-INVALID",
  );
});

test("finds resolver-mangled functions in legacy shader artifacts", () => {
  const legacyArtifact = {
    version: 1 as const,
    wgsl: "fn _vgsl_deadbeef__doubleValue(value: f32) -> f32 { return value * 2.0; }",
  };

  const { doubleValue } = tslExports(legacyArtifact, ["doubleValue"]);

  expect(doubleValue({ value: 2 })).toMatchObject({ isNode: true });
});

test("treats an empty function export list as authoritative", () => {
  const artifact = {
    wgsl: "fn privateValue(value: f32) -> f32 { return value; }",
    functionExports: [],
  };

  expect(errorCode(() => tslExports(artifact, ["privateValue"]))).toBe(
    "VGPU-THREE-TSL-EXPORT-NOT-FOUND",
  );
});

test("rejects duplicate authored export names as ambiguous", () => {
  const artifact = {
    wgsl: `
fn firstValue(value: f32) -> f32 { return value; }
fn secondValue(value: f32) -> f32 { return value; }
`,
    functionExports: [
      { name: "surfaceValue", resolvedName: "firstValue", parameterNames: ["value"] },
      { name: "surfaceValue", resolvedName: "secondValue", parameterNames: ["value"] },
    ],
  };

  expect(errorCode(() => tslExports(artifact, ["surfaceValue"]))).toBe(
    "VGPU-THREE-TSL-EXPORT-AMBIGUOUS",
  );
});

test("reports malformed export metadata as an invalid source", () => {
  const artifact = {
    wgsl: "fn finalValue(value: f32) -> f32 { return value; }",
    functionExports: [{
      name: "surfaceValue",
      resolvedName: 42 as unknown as string,
      parameterNames: ["value"],
    }],
  };

  expect(errorCode(() => tslExports(artifact, ["surfaceValue"]))).toBe(
    "VGPU-THREE-TSL-SOURCE-INVALID",
  );
});

test("rejects invalid authored and resolved identifiers in export metadata", () => {
  const invalidArtifacts = [
    {
      wgsl: "fn finalValue(value: f32) -> f32 { return value; }",
      functionExports: [{
        name: "__proto__",
        resolvedName: "finalValue",
        parameterNames: ["value"],
      }],
      requestedName: "__proto__",
    },
    {
      wgsl: "fn _(value: f32) -> f32 { return value; }",
      functionExports: [{
        name: "surfaceValue",
        resolvedName: "_",
        parameterNames: ["value"],
      }],
      requestedName: "surfaceValue",
    },
  ];

  const codes = invalidArtifacts.map((artifact) => errorCode(() => tslExports(
    artifact,
    [artifact.requestedName],
  )));
  expect(codes).toEqual(invalidArtifacts.map(() => "VGPU-THREE-TSL-SOURCE-INVALID"));
});

test("returns exports in a null-prototype map", () => {
  const exports = tslExports(
    "fn surfaceValue(value: f32) -> f32 { return value; }",
    ["surfaceValue"],
  );

  expect(Object.getPrototypeOf(exports)).toBeNull();
  expect(Object.hasOwn(exports, "surfaceValue")).toBe(true);
});

test("rejects invalid or duplicate authored parameter names in export metadata", () => {
  const invalidParameterNames = [
    ["9value", "second"],
    ["fn", "second"],
    ["class", "second"],
    ["_", "second"],
    ["__value", "second"],
    ["value", "value"],
  ];

  const codes = invalidParameterNames.map((parameterNames) => errorCode(() => tslExports({
    wgsl: "fn finalValue(first: f32, second: f32) -> f32 { return first + second; }",
    functionExports: [{
      name: "surfaceValue",
      resolvedName: "finalValue",
      parameterNames,
    }],
  }, ["surfaceValue"])));

  expect(codes).toEqual(invalidParameterNames.map(() => "VGPU-THREE-TSL-SOURCE-INVALID"));
});

test("rejects every canonical WGSL reserved identifier in parameter metadata", () => {
  const reservedIdentifiers = new Set([
    ...WGSL_SPEC_KEYWORDS,
    ...WGSL_RESERVED_WORDS,
    ...WGSL_LEGACY_RESERVED_WORDS,
  ]);

  for (const parameterName of reservedIdentifiers) {
    const code = errorCode(() => tslExports({
      wgsl: "fn finalValue(value: f32) -> f32 { return value; }",
      functionExports: [{
        name: "surfaceValue",
        resolvedName: "finalValue",
        parameterNames: [parameterName],
      }],
    }, ["surfaceValue"]));

    expect(code, parameterName).toBe("VGPU-THREE-TSL-SOURCE-INVALID");
  }
});

test("does not consume a later function body when the selected declaration has none", () => {
  const malformedSources = [
    `fn finalValue(value: f32) -> f32;
fn laterValue(value: f32) -> f32 { return value; }`,
    `fn finalValue(value: f32) -> f32
fn laterValue(value: f32) -> f32 { return value; }`,
  ];

  const codes = malformedSources.map((wgsl) => errorCode(() => tslExports({
    wgsl,
    functionExports: [{
      name: "surfaceValue",
      resolvedName: "finalValue",
      parameterNames: ["value"],
    }],
  }, ["surfaceValue"])));

  expect(codes).toEqual(malformedSources.map(() => "VGPU-THREE-TSL-SOURCE-INVALID"));
});

test("rejects void and shader-stage functions as unsupported signatures", () => {
  const unsupported = [
    {
      wgsl: "fn logValue(value: f32) { _ = value; }",
      functionExports: [
        { name: "logValue", resolvedName: "logValue", parameterNames: ["value"] },
      ],
      name: "logValue",
    },
    {
      wgsl: "@compute @workgroup_size(1) fn simulate() {}",
      functionExports: [
        { name: "simulate", resolvedName: "simulate", parameterNames: [] },
      ],
      name: "simulate",
    },
  ];

  expect(unsupported.map((artifact) => errorCode(
    () => tslExports(artifact, [artifact.name]),
  ))).toEqual([
    "VGPU-THREE-TSL-SIGNATURE-UNSUPPORTED",
    "VGPU-THREE-TSL-SIGNATURE-UNSUPPORTED",
  ]);
});

test("parses nested parameter types while ignoring decoy comment headers", () => {
  const artifact = {
    wgsl: `
// fn sampleField(decoy: f32) -> f32 { return decoy; }
/* fn sampleField(anotherDecoy: f32) -> f32 { return anotherDecoy; } */
fn sampleField(samples: array<vec2<f32>, 2>, scale: f32) -> f32 {
  return samples[0].x * scale;
}
`,
    functionExports: [{
      name: "sampleField",
      resolvedName: "sampleField",
      parameterNames: ["samples", "scale"],
    }],
  };

  const { sampleField } = tslExports(artifact, ["sampleField"]);

  expect(sampleField({ samples: 0, scale: 2 })).toMatchObject({ isNode: true });
});

test("calls an identifier-minified export with its authored parameter names", async () => {
  const resolved = await resolveShader({
    entry: "/surface.wgsl",
    validate: false,
    minify: true,
    modules: {
      "/surface.wgsl": `
export fn scaleValue(authoredValue: f32, authoredScale: f32) -> f32 {
  return authoredValue * authoredScale;
}
`,
    },
  });

  expect(resolved.wgsl).not.toContain("scaleValue");
  expect(resolved.functionExports).toEqual([
    {
      name: "scaleValue",
      resolvedName: expect.any(String),
      parameterNames: ["authoredValue", "authoredScale"],
    },
  ]);

  const { scaleValue } = tslExports(resolved, ["scaleValue"]);
  expect(scaleValue({ authoredValue: 2, authoredScale: 3 })).toMatchObject({
    isNode: true,
  });
});

function errorCode(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return (error as { readonly code?: unknown }).code;
  }
  return undefined;
}
