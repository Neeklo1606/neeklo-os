/** @typedef {{ neekloApiKey: string, neekloApiBase: string, openrouterApiKey: string, openrouterModel: string, port: number, pollIntervalMs: number, jobTimeoutMs: number }} AppConfig */

/** @returns {AppConfig} */
export function loadConfig() {
  const neekloApiKey = process.env.NEEKLO_API_KEY?.trim();
  const openrouterApiKey = process.env.OPENROUTER_API_KEY?.trim();

  if (!neekloApiKey) {
    throw new Error('NEEKLO_API_KEY is required (set in server .env or environment)');
  }
  if (!openrouterApiKey) {
    throw new Error('OPENROUTER_API_KEY is required (set in server .env or environment)');
  }

  return {
    neekloApiKey,
    neekloApiBase: (process.env.NEEKLO_API_BASE ?? 'https://neekloai.ru/api/v1').replace(/\/$/, ''),
    openrouterApiKey,
    openrouterModel: process.env.OPENROUTER_MODEL?.trim() || 'deepseek/deepseek-v4-flash',
    port: Number(process.env.PORT ?? process.env.WEB_PORT ?? 8787),
    pollIntervalMs: Number(process.env.PARSER_POLL_INTERVAL_MS ?? 6000),
    jobTimeoutMs: Number(process.env.PARSER_JOB_TIMEOUT_MS ?? 600_000),
  };
}
