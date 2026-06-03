export interface ITokenStore {
  get(): Promise<OAuthTokenResponse | null> | OAuthTokenResponse | null;
  set(tokens: OAuthTokenResponse): Promise<void> | void;
  clear(): Promise<void> | void;
}

export interface ShipClientOptions {
  token?: string;
  tokenStore?: ITokenStore;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'rate_limited'
  | 'server_error';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
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
  onUserCode?: (code: string, verifyUrl: string) => void | Promise<void>;
  tokenStore?: ITokenStore;
}

export type DeviceLoginClientOptions = Omit<DeviceLoginOptions, 'onCode'> & {
  onUserCode: (code: string, verifyUrl: string) => void | Promise<void>;
};

export interface RefreshTokenOptions {
  clientId: string;
  refreshToken: string;
  clientSecret?: string;
  shipUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export interface AuthorizationCodeFlowOptions {
  clientId: string;
  redirectUri: string;
  scope?: string;
  shipUrl?: string;
  fetch?: typeof fetch;
  state?: string;
  codeVerifier?: string;
  signal?: AbortSignal;
}

export interface AuthorizationCodeFlow {
  authorizationUrl: string;
  codeVerifier: string;
  state?: string;
  exchange(callbackUrlOrCode: string): Promise<OAuthTokenResponse>;
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

export interface ShipOAuthApp {
  id: string;
  workspace_id: string;
  owner_user_id: string;
  name: string;
  client_id: string;
  redirect_uris: string[];
  requested_scopes: PublicScope[];
  active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CreateOAuthAppInput {
  name: string;
  redirect_uris: string[];
  requested_scopes?: PublicScope[];
}

export interface OAuthAppSecretResponse {
  app: ShipOAuthApp;
  client_secret: string;
  secret_display: 'shown_once';
}

export interface PublicApiAuditRow {
  request_id: string;
  client_id: string;
  method: string;
  route: string;
  scope_used: PublicScope | null;
  status: number;
  latency_ms: number | null;
  created_at: string;
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

export type ShipIssue = ShipDocument & {
  document_type: 'issue';
};

export type ShipSprint = ShipDocument & {
  document_type: 'sprint' | 'weekly_plan' | 'weekly_retro';
};

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

export type PublicScope =
  | 'documents:read'
  | 'documents:write'
  | 'issues:read'
  | 'issues:write'
  | 'sprints:read'
  | 'sprints:write'
  | 'webhooks:manage';

export interface PublicScopeDefinition {
  name: PublicScope;
  description: string;
}

export interface CreateDocumentInput {
  title?: string;
  document_type?: 'wiki' | 'issue' | 'program' | 'project' | 'sprint' | 'person' | 'weekly_plan' | 'weekly_retro';
  content?: unknown;
  properties?: Record<string, unknown>;
}

export type CreateIssueInput = Omit<CreateDocumentInput, 'document_type'> & {
  document_type?: 'issue';
};

export type CreateSprintInput = Omit<CreateDocumentInput, 'document_type'> & {
  document_type?: 'sprint' | 'weekly_plan' | 'weekly_retro';
};

export type WebhookEventType =
  | 'document.created'
  | 'document.updated'
  | 'document.deleted'
  | 'issue.created'
  | 'issue.assigned'
  | 'issue.status_changed'
  | 'sprint.started'
  | 'sprint.completed';

export interface WebhookEventDefinition {
  type: WebhookEventType;
  description: string;
  required_scope: PublicScope;
}

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
