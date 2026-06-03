export type ShipSDKErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'not_found'
  | 'validation'
  | 'server'
  | 'network';

export type ShipSDKErrorUnion =
  | { kind: 'auth'; message: string; status?: 401 | 403; requestId?: string; details?: Record<string, unknown> }
  | { kind: 'rate_limit'; message: string; status: 429; requestId?: string; details?: Record<string, unknown>; retryAfterSeconds?: number }
  | { kind: 'not_found'; message: string; status: 404; requestId?: string; details?: Record<string, unknown> }
  | { kind: 'validation'; message: string; status?: number; requestId?: string; details?: Record<string, unknown> }
  | { kind: 'server'; message: string; status?: number; requestId?: string; details?: Record<string, unknown> }
  | { kind: 'network'; message: string; status?: undefined; requestId?: undefined; details?: undefined };

export interface ShipApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

export class ShipSDKError extends Error {
  readonly kind: ShipSDKErrorKind;
  readonly status?: number;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;

  constructor(kind: ShipSDKErrorKind, message: string, options: {
    status?: number;
    requestId?: string;
    details?: Record<string, unknown>;
    retryAfterSeconds?: number;
  } = {}) {
    super(message);
    this.name = 'ShipSDKError';
    this.kind = kind;
    this.status = options.status;
    this.requestId = options.requestId;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  toUnion(): ShipSDKErrorUnion {
    return {
      kind: this.kind,
      message: this.message,
      status: this.status,
      requestId: this.requestId,
      details: this.details,
      retryAfterSeconds: this.retryAfterSeconds,
    } as ShipSDKErrorUnion;
  }
}

export function kindForStatus(status: number): ShipSDKErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  if (status >= 400 && status < 500) return 'validation';
  return 'server';
}
