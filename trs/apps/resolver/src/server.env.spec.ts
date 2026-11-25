import { DEFAULT_SERVER_CONFIG, serverConfigFromEnv } from './server.env';

describe('serverConfigFromEnv', () => {
  it('defaults to 0.0.0.0:3000', () => {
    expect(serverConfigFromEnv({})).toEqual(DEFAULT_SERVER_CONFIG);
  });

  it('reads TRS_PORT and TRS_HOST', () => {
    expect(
      serverConfigFromEnv({ TRS_PORT: '8080', TRS_HOST: '127.0.0.1' }),
    ).toEqual({ port: 8080, host: '127.0.0.1' });
  });

  it('falls back to PORT, preferring TRS_PORT', () => {
    expect(serverConfigFromEnv({ PORT: '5000' }).port).toBe(5000);
    expect(serverConfigFromEnv({ PORT: '5000', TRS_PORT: '6000' }).port).toBe(
      6000,
    );
  });

  it.each(['abc', '70000', '-1', '80.5'])('rejects port %p', (v) => {
    expect(() => serverConfigFromEnv({ TRS_PORT: v })).toThrow(
      'TRS_PORT must be a port number',
    );
  });
});
