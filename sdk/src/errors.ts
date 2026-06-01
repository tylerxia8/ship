export type ShipSDKErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'not_found'
  | 'validation'
  | 'server'
  | 'network';

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

  constructor(kind: ShipSDKErrorKind, message: string, options: {
    status?: number;
    requestId?: string;
    details?: Record<string, unknown>;
  } = {}) {
    super(message);
    this.name = 'ShipSDKError';
    this.kind = kind;
    this.status = options.status;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

export function kindForStatus(status: number): ShipSDKErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  if (status >= 400 && status < 500) return 'validation';
  return 'server';
}
