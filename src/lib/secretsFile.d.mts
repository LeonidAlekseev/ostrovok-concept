export declare const SECRET_FILE: string
export declare function decryptEnv(
  armoredKey: string,
  encrypted: Uint8Array,
): Promise<{ text: string; env: Record<string, string> }>
