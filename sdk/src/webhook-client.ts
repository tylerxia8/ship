import type {
  CreateWebhookSubscriptionInput,
  CreateWebhookSubscriptionResponse,
  Page,
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

  listDeliveries(): Promise<Page<ShipWebhookDelivery>> {
    return this.transport.request<Page<ShipWebhookDelivery>>('/webhooks/deliveries');
  }

  replayDelivery(deliveryId: string): Promise<{ replayed: true }> {
    return this.transport.request<{ replayed: true }>(`/webhooks/deliveries/${deliveryId}/replay`, {
      method: 'POST',
    });
  }
}
