import { verifyWebhook } from '@ship/sdk';

export class IdempotentWebhookReceiver {
  #seen = new Set();

  constructor({ signingSecret }) {
    this.signingSecret = signingSecret;
  }

  handle({ headers, rawBody }) {
    if (!verifyWebhook(headers, rawBody, this.signingSecret)) {
      return { status: 400, body: { processed: false, reason: 'invalid_signature' } };
    }

    const idempotencyKey = headers['idempotency-key'] ?? headers['Idempotency-Key'];
    if (!idempotencyKey) {
      return { status: 400, body: { processed: false, reason: 'missing_idempotency_key' } };
    }

    if (this.#seen.has(idempotencyKey)) {
      return { status: 200, body: { processed: false, duplicate: true, idempotency_key: idempotencyKey } };
    }

    this.#seen.add(idempotencyKey);
    return { status: 200, body: { processed: true, duplicate: false, idempotency_key: idempotencyKey } };
  }
}
