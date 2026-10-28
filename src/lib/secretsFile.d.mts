export declare const SECRET_FILE: string
export declare const ORGANIZERS_FILE: string
export declare const ORGANIZERS_RECIPIENT: string
export declare const APP_RECIPIENT: string
export declare function findIdentity(value: string): string
export declare function decryptEnv(
  secretKey: string,
  encrypted: Uint8Array,
): Promise<{ text: string; env: Record<string, string> }>
export declare function encryptEnv(recipient: string, text: string): Promise<Uint8Array>
export declare function checkEnvFormat(text: string): number
