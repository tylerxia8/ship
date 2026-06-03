import { expect, test } from 'vitest';
import { IdempotentWebhookReceiver } from '../src/idempotency.mjs';
import { signShipPayload } from '../src/ship-signing.mjs';

test('idempotency-key replay drill lets subscribers dedupe replayed deliveries', () => {
  const receiver = new IdempotentWebhookReceiver({ signingSecret: 'whsec_idempotency' });
  const rawBody = JSON.stringify({
    id: 'evt_replay',
    type: 'document.created',
    data: { document: { id: 'doc_replay', title: 'Replay proof' } },
  });
  const headers = {
    'Ship-Signature': signShipPayload(rawBody, 'whsec_idempotency'),
    'Idempotency-Key': 'document.created:doc_replay',
  };

  expect(receiver.handle({ headers, rawBody })).toEqual({
    status: 200,
    body: {
      processed: true,
      duplicate: false,
      idempotency_key: 'document.created:doc_replay',
    },
  });
  expect(receiver.handle({ headers, rawBody })).toEqual({
    status: 200,
    body: {
      processed: false,
      duplicate: true,
      idempotency_key: 'document.created:doc_replay',
    },
  });

  expect(receiver.handle({
    headers,
    rawBody: `${rawBody} `,
  })).toMatchObject({
    status: 400,
    body: { reason: 'invalid_signature' },
  });
});
