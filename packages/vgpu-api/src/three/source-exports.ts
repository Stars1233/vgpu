import { adapterError } from "./errors.ts";
import { readFunctionSignature } from "./function-signature.ts";
import { isValidWgslIdentifier } from "./wgsl-identifiers.ts";

interface FunctionExportMetadata {
  readonly name: string;
  readonly resolvedName: string;
  readonly parameterNames: readonly string[];
}

export type TslExportsSource = string | {
  readonly wgsl: string;
  readonly functionExports?: readonly FunctionExportMetadata[];
};

export function selectFunction(
  source: TslExportsSource,
  name: string,
): FunctionExportMetadata {
  if (typeof source === "string" || !("functionExports" in source)) {
    const signature = readFunctionSignature(
      typeof source === "string" ? source : source.wgsl,
      name,
      false,
    );
    return {
      name,
      resolvedName: signature.name,
      parameterNames: signature.parameters.map((parameter) => parameter.name),
    };
  }

  if (!Array.isArray(source.functionExports)) {
    throw adapterError(
      "VGPU-THREE-TSL-SOURCE-INVALID",
      "functionExports must be an array when present.",
    );
  }
  if (!source.functionExports.every(isFunctionExportMetadata)) {
    throw adapterError(
      "VGPU-THREE-TSL-SOURCE-INVALID",
      "functionExports contains malformed metadata.",
    );
  }
  const matches = source.functionExports.filter((item) => item.name === name);
  if (matches.length === 0) {
    throw adapterError(
      "VGPU-THREE-TSL-EXPORT-NOT-FOUND",
      `WGSL module has no direct export named ${name}.`,
    );
  }
  if (matches.length > 1) {
    throw adapterError(
      "VGPU-THREE-TSL-EXPORT-AMBIGUOUS",
      `WGSL module has multiple direct exports named ${name}.`,
    );
  }
  return matches[0]!;
}

function isFunctionExportMetadata(value: unknown): value is FunctionExportMetadata {
  if (typeof value !== "object" || value === null) return false;
  const metadata = value as Record<string, unknown>;
  return typeof metadata.name === "string"
    && isValidWgslIdentifier(metadata.name)
    && typeof metadata.resolvedName === "string"
    && isValidWgslIdentifier(metadata.resolvedName)
    && areValidParameterNames(metadata.parameterNames);
}

function areValidParameterNames(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) return false;
  const names = new Set<string>();
  for (const parameterName of value) {
    if (typeof parameterName !== "string"
      || !isValidWgslIdentifier(parameterName)
      || names.has(parameterName)) return false;
    names.add(parameterName);
  }
  return true;
}
