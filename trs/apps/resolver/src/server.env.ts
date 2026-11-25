export const SERVER_ENV = {
  port: 'TRS_PORT',
  host: 'TRS_HOST',
} as const;

export interface ServerConfig {
  port: number;
  host: string;
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: 3000,
  host: '0.0.0.0',
};

/** Listen address for the resolver. `PORT` is honored as a fallback for PaaS hosts. */
export function serverConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const rawPort = (env[SERVER_ENV.port] ?? env.PORT)?.trim();
  let port = DEFAULT_SERVER_CONFIG.port;
  if (rawPort) {
    port = Number(rawPort);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(
        `${SERVER_ENV.port} must be a port number (0-65535), got "${rawPort}"`,
      );
    }
  }
  const host = env[SERVER_ENV.host]?.trim() || DEFAULT_SERVER_CONFIG.host;
  return { port, host };
}
