import type {
  CreateWebhookSubscriptionInput,
  CreateWebhookSubscriptionResponse,
  Page,
  RotateWebhookSubscriptionSecretResponse,
  ShipWebhookDelivery,
  ShipWebhookSubscription,
} from './types.js';

export interface WebhookTransport {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export class WebhooksClient {
  constructor(private readonly transport: WebhookTransport) {}

  listSubscriptions(): Promise<Page<ShipWebhookSubscription>> {
    return this.transport.request<Page<ShipWebhookSubscription>>('/webhooks/subscriptions');
  }

  createSubscription(input: CreateWebhookSubscriptionInput): Promise<CreateWebhookSubscriptionResponse> {
    return this.transport.request<CreateWebhookSubscriptionResponse>('/webhooks/subscriptions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  rotateSubscriptionSecret(subscriptionId: string): Promise<RotateWebhookSubscriptionSecretResponse> {
    return this.transport.request<RotateWebhookSubscriptionSecretResponse>(`/webhooks/subscriptions/${subscriptionId}/rotate-secret`, {
      method: 'POST',
    });
  }

  deactivateSubscription(subscriptionId: string): Promise<{ data: ShipWebhookSubscription }> {
    return this.transport.request<{ data: ShipWebhookSubscription }>(`/webhooks/subscriptions/${subscriptionId}/deactivate`, {
      method: 'POST',
    });
  }

  listDeliveries(): Promise<Page<ShipWebhookDelivery>> {
    return this.transport.request<Page<ShipWebhookDelivery>>('/webhooks/deliveries');
  }

  replayDelivery(deliveryId: string): Promise<{ replayed: true }> {
    return this.transport.request<{ replayed: true }>(`/webhooks/deliveries/${deliveryId}/replay`, {
      method: 'POST',
    });
  }
}
