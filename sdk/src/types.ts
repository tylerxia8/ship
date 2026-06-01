export interface ShipClientOptions {
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface OAuthTokenResponse {
  token_type: 'Bearer';
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface DeviceLoginOptions {
  clientId: string;
  scope?: string;
  shipUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  onCode?: (code: DeviceCodeResponse) => void | Promise<void>;
}

export interface RefreshTokenOptions {
  clientId: string;
  refreshToken: string;
  clientSecret?: string;
  shipUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export interface ShipUser {
  id: string;
  email: string;
  name: string;
}

export interface ShipWorkspace {
  id: string;
  name: string;
}

export interface ShipMe {
  user: ShipUser | null;
  workspace: ShipWorkspace | null;
  app: {
    client_id: string;
    scopes: string[];
  };
}

export interface ShipDocument {
  id: string;
  workspace_id: string;
  document_type: string;
  title: string;
  content?: unknown;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

export interface CreateDocumentInput {
  title?: string;
  document_type?: 'wiki' | 'issue' | 'program' | 'project' | 'sprint' | 'person' | 'weekly_plan' | 'weekly_retro';
  content?: unknown;
  properties?: Record<string, unknown>;
}

export type WebhookEventType = 'document.created';

export interface ShipWebhookSubscription {
  id: string;
  event_type: WebhookEventType;
  target_url: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShipWebhookDelivery {
  id: string;
  subscription_id: string;
  event_id: string;
  event_type: WebhookEventType;
  attempt_number: number;
  response_status: number | null;
  response_excerpt: string | null;
  latency_ms: number | null;
  idempotency_key: string;
  status: 'delivered' | 'retry_pending' | 'dead_letter';
  next_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface CreateWebhookSubscriptionInput {
  event_type: WebhookEventType;
  target_url: string;
}

export interface CreateWebhookSubscriptionResponse {
  data: ShipWebhookSubscription;
  signing_secret: string;
  secret_display: 'shown_once';
}

export type RotateWebhookSubscriptionSecretResponse = CreateWebhookSubscriptionResponse;
