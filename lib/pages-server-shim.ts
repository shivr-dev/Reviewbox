import { activePagesConfig } from './pages-vault';
export const env = (name:string) => {
  const config = activePagesConfig();
  if (!config) return '';
  if (name === 'CF_ACCOUNT_ID' || name === 'CF_ACCOUNT_IDS') return config.cloudflareAccountId;
  if (name === 'CF_AI_TOKENS') return JSON.stringify(config.cloudflareTokens);
  return '';
};
