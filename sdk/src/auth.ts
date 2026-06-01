import { ShipSDKError, kindForStatus, type ShipApiErrorBody } from './errors.js';
import type { DeviceCodeResponse, DeviceLoginOptions, OAuthTokenResponse } from './types.js';

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

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

  return pollToken(
    fetchImpl,
    oauthBaseUrl,
    options,
    codeResponse.device_code,
    options.pollIntervalMs ?? codeResponse.interval * 1000,
  );
}
