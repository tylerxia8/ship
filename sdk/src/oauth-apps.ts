import type {
  CreateOAuthAppInput,
  OAuthAppSecretResponse,
  Page,
  PublicApiAuditRow,
  ShipOAuthApp,
  ShipWebhookDelivery,
  ShipWebhookSubscription,
} from './types.js';

export interface OAuthAppsTransport {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export class OAuthAppsClient {
  constructor(private readonly transport: OAuthAppsTransport) {}

  list(): Promise<Page<ShipOAuthApp>> {
    return this.transport.request<Page<ShipOAuthApp>>('/oauth/apps');
  }

  create(input: CreateOAuthAppInput): Promise<OAuthAppSecretResponse> {
    return this.transport.request<OAuthAppSecretResponse>('/oauth/apps', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  rotateSecret(appId: string): Promise<OAuthAppSecretResponse> {
    return this.transport.request<OAuthAppSecretResponse>(`/oauth/apps/${appId}/rotate-secret`, {
      method: 'POST',
    });
  }

  deactivate(appId: string): Promise<{ app: ShipOAuthApp }> {
    return this.transport.request<{ app: ShipOAuthApp }>(`/oauth/apps/${appId}/deactivate`, {
      method: 'POST',
    });
  }

  audit(appId: string): Promise<Page<PublicApiAuditRow>> {
    return this.transport.request<Page<PublicApiAuditRow>>(`/oauth/apps/${appId}/audit`);
  }

  webhookSubscriptions(appId: string): Promise<Page<ShipWebhookSubscription>> {
    return this.transport.request<Page<ShipWebhookSubscription>>(`/oauth/apps/${appId}/webhook-subscriptions`);
  }

  webhookDeliveries(appId: string): Promise<Page<ShipWebhookDelivery>> {
    return this.transport.request<Page<ShipWebhookDelivery>>(`/oauth/apps/${appId}/webhook-deliveries`);
  }

  replayWebhookDelivery(appId: string, deliveryId: string): Promise<{ replayed: true }> {
    return this.transport.request<{ replayed: true }>(`/oauth/apps/${appId}/webhook-deliveries/${deliveryId}/replay`, {
      method: 'POST',
    });
  }

  sendWebhookTest(appId: string, subscriptionId: string): Promise<{ delivery: ShipWebhookDelivery }> {
    return this.transport.request<{ delivery: ShipWebhookDelivery }>(`/oauth/apps/${appId}/webhook-subscriptions/${subscriptionId}/test`, {
      method: 'POST',
    });
  }
}
