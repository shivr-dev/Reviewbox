import { activePagesConfig } from './pages-vault';

let serverReader: ((name: string) => string) | undefined;
export function installAIEnvironment(reader: (name: string) => string) {
  serverReader = reader;
}
/** Browser code only reads the explicitly unlocked vault; server code uses runtime bindings. */
export function aiEnvironment(name: string): string {
  if (typeof window !== 'undefined') {
    const config = activePagesConfig();
    if (!config) return '';
    if (name === 'CF_ACCOUNT_ID' || name === 'CF_ACCOUNT_IDS')
      return config.cloudflareAccountId;
    if (name === 'CF_AI_TOKENS') return JSON.stringify(config.cloudflareTokens);
    return '';
  }
  return (
    serverReader?.(name) ??
    (typeof process !== 'undefined' ? (process.env[name] ?? '') : '')
  );
}
