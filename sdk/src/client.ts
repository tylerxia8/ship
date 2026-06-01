import { DocumentsClient, type Transport } from './documents.js';
import { deviceLogin } from './auth.js';
import { ShipSDKError, kindForStatus, type ShipApiErrorBody } from './errors.js';
import type { DeviceLoginOptions, OAuthTokenResponse, ShipClientOptions, ShipMe } from './types.js';
import { WebhooksClient } from './webhook-client.js';

export class ShipClient implements Transport {
  readonly documents: DocumentsClient;
  readonly webhooks: WebhooksClient;
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ShipClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
    this.token = options.token;
    this.fetchImpl = options.fetch ?? fetch;
    this.documents = new DocumentsClient(this);
    this.webhooks = new WebhooksClient(this);
  }

  static deviceLogin(options: DeviceLoginOptions): Promise<OAuthTokenResponse> {
    return deviceLogin(options);
  }

  me(): Promise<ShipMe> {
    return this.request<ShipMe>('/me');
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers,
      });
    } catch (err) {
      throw new ShipSDKError('network', err instanceof Error ? err.message : 'Network error');
    }

    const text = await response.text();
    const body = text ? JSON.parse(text) as unknown : null;

    if (!response.ok) {
      const apiError = body as ShipApiErrorBody | null;
      throw new ShipSDKError(
        kindForStatus(response.status),
        apiError?.message ?? `Ship API request failed with status ${response.status}`,
        {
          status: response.status,
          requestId: apiError?.request_id,
          details: apiError?.details,
        },
      );
    }

    return body as T;
  }
}
