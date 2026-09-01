import { adapterError } from "./errors.ts";
import { scanWgslTokens, type WgslToken } from "./wgsl-tokens.ts";

export const privateNamespacePrefix = "_vgpu_three_";
const namedDeclarationKinds = new Set(["alias", "const", "fn", "override", "struct", "var"]);

export function assertPrivateNamespaceAvailable(source: string): void {
  const tokens = scanWgslTokens(source);
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.text === "{") { depth++; continue; }
    if (token.text === "}") { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0 || !namedDeclarationKinds.has(token.text)) continue;

    const name = declarationName(tokens, i);
    if (name?.text.startsWith(privateNamespacePrefix)) {
      throw adapterError(
        "VGPU-THREE-TSL-SOURCE-INVALID",
        `WGSL declaration ${name.text} uses the private ${privateNamespacePrefix} namespace.`,
      );
    }
  }
}

function declarationName(tokens: readonly WgslToken[], kindIndex: number): WgslToken | undefined {
  let index = kindIndex + 1;
  if (tokens[kindIndex]?.text === "var" && tokens[index]?.text === "<") {
    index = afterAngleList(tokens, index);
  }
  return tokens[index]?.kind === "identifier" ? tokens[index] : undefined;
}

function afterAngleList(tokens: readonly WgslToken[], start: number): number {
  let depth = 0;
  for (let index = start; index < tokens.length; index++) {
    if (tokens[index]?.text === "<") depth++;
    else if (tokens[index]?.text === ">" && --depth === 0) return index + 1;
  }
  return tokens.length;
}
