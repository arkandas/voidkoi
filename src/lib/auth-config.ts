export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  name: string;
}

export type AuthConfig = { mode: 'local' } | { mode: 'oidc'; oidc: OidcConfig };

export function readAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const mode = (env.VOIDKOI_AUTH ?? '').trim().toLowerCase() || 'local';
  if (mode === 'local') return { mode };
  if (mode !== 'oidc') {
    throw new Error(`VOIDKOI_AUTH must be "local" or "oidc", not "${env.VOIDKOI_AUTH}".`);
  }

  const required = ['VOIDKOI_OIDC_ISSUER', 'VOIDKOI_OIDC_CLIENT_ID', 'VOIDKOI_OIDC_CLIENT_SECRET'];
  const missing = required.filter(name => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`VOIDKOI_AUTH=oidc also needs ${missing.join(', ')}.`);
  }

  return {
    mode,
    oidc: {
      issuer: env.VOIDKOI_OIDC_ISSUER!.trim().replace(/\/+$/, ''),
      clientId: env.VOIDKOI_OIDC_CLIENT_ID!.trim(),
      clientSecret: env.VOIDKOI_OIDC_CLIENT_SECRET!.trim(),
      name: env.VOIDKOI_OIDC_NAME?.trim() || 'SSO',
    },
  };
}

export const authConfig = readAuthConfig(process.env);
