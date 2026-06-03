import { DocumentsClient, type Transport } from './documents.js';
import { authorizationCodeFlow, deviceLogin, refreshAccessToken } from './auth.js';
import { ShipSDKError, kindForStatus, type ShipApiErrorBody } from './errors.js';
import type { AuthorizationCodeFlow, AuthorizationCodeFlowOptions, DeviceLoginOptions, ITokenStore, OAuthTokenResponse, Page, PublicScopeDefinition, RefreshTokenOptions, ShipClientOptions, ShipMe } from './types.js';
import { WebhooksClient } from './webhook-client.js';
import { IssuesClient, SprintsClient } from './document-resources.js';
import { OAuthAppsClient } from './oauth-apps.js';

export class ShipClient implements Transport {
  readonly documents: DocumentsClient;
  readonly issues: IssuesClient;
  readonly oauthApps: OAuthAppsClient;
  readonly sprints: SprintsClient;
  readonly webhooks: WebhooksClient;
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly tokenStore?: ITokenStore;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ShipClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
    this.token = options.token;
    this.tokenStore = options.tokenStore;
    this.fetchImpl = options.fetch ?? fetch;
    this.documents = new DocumentsClient(this);
    this.issues = new IssuesClient(this);
    this.oauthApps = new OAuthAppsClient(this);
    this.sprints = new SprintsClient(this);
    this.webhooks = new WebhooksClient(this);
  }

  static authorizationCodeFlow(options: AuthorizationCodeFlowOptions): AuthorizationCodeFlow {
    return authorizationCodeFlow(options);
  }

  static deviceLogin(options: DeviceLoginOptions): Promise<OAuthTokenResponse> {
    return deviceLogin(options);
  }

  static refreshAccessToken(options: RefreshTokenOptions): Promise<OAuthTokenResponse> {
    return refreshAccessToken(options);
  }

  me(): Promise<ShipMe> {
    return this.request<ShipMe>('/me');
  }

  scopes(): Promise<Page<PublicScopeDefinition>> {
    return this.request<Page<PublicScopeDefinition>>('/scopes');
  }

  private async accessToken(): Promise<string> {
    if (this.token) return this.token;
    const tokens = await this.tokenStore?.get();
    if (tokens?.access_token) return tokens.access_token;
    throw new ShipSDKError('auth', 'ShipClient requires a token or tokenStore with an access token');
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await this.accessToken()}`);
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
          retryAfterSeconds: Number(response.headers.get('Retry-After')) || undefined,
        },
      );
    }

    return body as T;
  }
}
