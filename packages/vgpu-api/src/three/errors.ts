export type TslAdapterErrorCode =
  | "VGPU-THREE-TSL-EXPORT-NOT-FOUND"
  | "VGPU-THREE-TSL-EXPORT-AMBIGUOUS"
  | "VGPU-THREE-TSL-SIGNATURE-UNSUPPORTED"
  | "VGPU-THREE-TSL-SOURCE-INVALID";

export function adapterError(
  code: TslAdapterErrorCode,
  message: string,
): Error & { readonly code: TslAdapterErrorCode } {
  return Object.assign(new Error(message), { code });
}
