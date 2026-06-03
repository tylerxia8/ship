import { ShipSDKError, kindForStatus, type ShipApiErrorBody } from './errors.js';
import type { AuthorizationCodeFlow, AuthorizationCodeFlowOptions, DeviceCodeResponse, DeviceLoginOptions, OAuthTokenResponse, RefreshTokenOptions } from './types.js';
import crypto from 'node:crypto';

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const VERIFIER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

function randomString(length: number): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => VERIFIER_ALPHABET[byte % VERIFIER_ALPHABET.length]).join('');
}

function s256(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ShipSDKError('network', 'Device login was aborted'));
      return;
    }

    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new ShipSDKError('network', 'Device login was aborted'));
    }, { once: true });
  });
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) as unknown : null;
}

async function requestJson(fetchImpl: typeof fetch, url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new ShipSDKError('network', err instanceof Error ? err.message : 'Network error');
  }

  const parsed = await parseResponse(response);
  if (!response.ok) {
    const apiError = parsed as ShipApiErrorBody | null;
    throw new ShipSDKError(
      kindForStatus(response.status),
      apiError?.message ?? `Ship OAuth request failed with status ${response.status}`,
      {
        status: response.status,
        requestId: apiError?.request_id,
        details: apiError?.details,
        retryAfterSeconds: Number(response.headers.get('Retry-After')) || undefined,
      },
    );
  }

  return parsed;
}

async function pollToken(
  fetchImpl: typeof fetch,
  oauthBaseUrl: string,
  options: DeviceLoginOptions,
  deviceCode: string,
  intervalMs: number,
): Promise<OAuthTokenResponse> {
  let waitMs = intervalMs;

  while (true) {
    await sleep(waitMs, options.signal);

    let response: Response;
    try {
      response = await fetchImpl(`${oauthBaseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: DEVICE_GRANT,
          client_id: options.clientId,
          device_code: deviceCode,
        }),
        signal: options.signal,
      });
    } catch (err) {
      throw new ShipSDKError('network', err instanceof Error ? err.message : 'Network error');
    }

    const parsed = await parseResponse(response);
    if (response.ok) {
      return parsed as OAuthTokenResponse;
    }

    const apiError = parsed as ShipApiErrorBody | null;
    if (apiError?.code === 'authorization_pending') {
      continue;
    }

    if (apiError?.code === 'slow_down') {
      waitMs += 5000;
      continue;
    }

    throw new ShipSDKError(
      kindForStatus(response.status),
      apiError?.message ?? `Ship OAuth request failed with status ${response.status}`,
      {
        status: response.status,
        requestId: apiError?.request_id,
        details: apiError?.details,
        retryAfterSeconds: Number(response.headers.get('Retry-After')) || undefined,
      },
    );
  }
}

export async function deviceLogin(options: DeviceLoginOptions): Promise<OAuthTokenResponse> {
  const fetchImpl = options.fetch ?? fetch;
  const shipUrl = (options.shipUrl ?? 'http://localhost:3000').replace(/\/$/, '');
  const oauthBaseUrl = `${shipUrl}/oauth`;

  const codeResponse = await requestJson(fetchImpl, `${oauthBaseUrl}/device/code`, {
    client_id: options.clientId,
    scope: options.scope,
  }, options.signal) as DeviceCodeResponse;

  await options.onCode?.(codeResponse);
  await options.onUserCode?.(codeResponse.user_code, `${shipUrl}${codeResponse.verification_uri}`);

  const tokens = await pollToken(
    fetchImpl,
    oauthBaseUrl,
    options,
    codeResponse.device_code,
    options.pollIntervalMs ?? codeResponse.interval * 1000,
  );
  await options.tokenStore?.set(tokens);
  return tokens;
}

export function authorizationCodeFlow(options: AuthorizationCodeFlowOptions): AuthorizationCodeFlow {
  const shipUrl = (options.shipUrl ?? 'http://localhost:3000').replace(/\/$/, '');
  const codeVerifier = options.codeVerifier ?? randomString(64);
  const state = options.state ?? randomString(24);
  const authorizationUrl = new URL(`${shipUrl}/oauth/authorize`);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', options.clientId);
  authorizationUrl.searchParams.set('redirect_uri', options.redirectUri);
  authorizationUrl.searchParams.set('code_challenge', s256(codeVerifier));
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');
  authorizationUrl.searchParams.set('state', state);
  if (options.scope) authorizationUrl.searchParams.set('scope', options.scope);

  return {
    authorizationUrl: authorizationUrl.toString(),
    codeVerifier,
    state,
    async exchange(callbackUrlOrCode: string): Promise<OAuthTokenResponse> {
      let code = callbackUrlOrCode;
      if (/^https?:\/\//.test(callbackUrlOrCode)) {
        const callbackUrl = new URL(callbackUrlOrCode);
        const callbackState = callbackUrl.searchParams.get('state');
        if (callbackState !== state) {
          throw new ShipSDKError('auth', 'OAuth state mismatch');
        }
        code = callbackUrl.searchParams.get('code') ?? '';
      }

      if (!code) {
        throw new ShipSDKError('auth', 'OAuth authorization code missing');
      }

      return requestJson(options.fetch ?? fetch, `${shipUrl}/oauth/token`, {
        grant_type: 'authorization_code',
        client_id: options.clientId,
        code,
        redirect_uri: options.redirectUri,
        code_verifier: codeVerifier,
      }, options.signal) as Promise<OAuthTokenResponse>;
    },
  };
}

export async function refreshAccessToken(options: RefreshTokenOptions): Promise<OAuthTokenResponse> {
  const fetchImpl = options.fetch ?? fetch;
  const shipUrl = (options.shipUrl ?? 'http://localhost:3000').replace(/\/$/, '');

  return requestJson(fetchImpl, `${shipUrl}/oauth/token`, {
    grant_type: 'refresh_token',
    client_id: options.clientId,
    client_secret: options.clientSecret,
    refresh_token: options.refreshToken,
  }, options.signal) as Promise<OAuthTokenResponse>;
}
