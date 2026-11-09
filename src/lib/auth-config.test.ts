import { describe, expect, it } from 'vitest';
import { readAuthConfig } from './auth-config';

const oidcEnv = {
  VOIDKOI_AUTH: 'oidc',
  VOIDKOI_OIDC_ISSUER: 'https://id.example.com/files/',
  VOIDKOI_OIDC_CLIENT_ID: 'client',
  VOIDKOI_OIDC_CLIENT_SECRET: 'secret',
};

describe('readAuthConfig', () => {
  it('uses local accounts when VOIDKOI_AUTH is unset or empty', () => {
    expect(readAuthConfig({})).toEqual({ mode: 'local' });
    expect(readAuthConfig({ VOIDKOI_AUTH: '' })).toEqual({ mode: 'local' });
  });

  it('ignores OIDC settings in local mode', () => {
    expect(readAuthConfig({ ...oidcEnv, VOIDKOI_AUTH: 'local' })).toEqual({ mode: 'local' });
  });

  it('reads the OIDC settings, dropping the trailing slash from the issuer', () => {
    expect(readAuthConfig(oidcEnv)).toEqual({
      mode: 'oidc',
      oidc: {
        issuer: 'https://id.example.com/files',
        clientId: 'client',
        clientSecret: 'secret',
        name: 'SSO',
      },
    });
  });

  it('accepts the mode in any case and uses the configured button name', () => {
    const config = readAuthConfig({ ...oidcEnv, VOIDKOI_AUTH: ' OIDC ', VOIDKOI_OIDC_NAME: 'Company SSO' });
    expect(config).toMatchObject({ mode: 'oidc', oidc: { name: 'Company SSO' } });
  });

  it('names every missing OIDC setting', () => {
    expect(() => readAuthConfig({ VOIDKOI_AUTH: 'oidc', VOIDKOI_OIDC_CLIENT_ID: 'client' })).toThrow(
      'VOIDKOI_AUTH=oidc also needs VOIDKOI_OIDC_ISSUER, VOIDKOI_OIDC_CLIENT_SECRET.'
    );
  });

  it('rejects an unknown mode', () => {
    expect(() => readAuthConfig({ VOIDKOI_AUTH: 'both' })).toThrow('VOIDKOI_AUTH must be "local" or "oidc"');
  });
});
