import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { verifyWebhook } from '../sdk/dist/webhooks.js';

const thresholdMs = Number(process.env.SHIP_SIGNATURE_VERIFY_TARGET_MS ?? 1);
const iterations = Number(process.env.SHIP_SIGNATURE_VERIFY_ITERATIONS ?? 50_000);
const warmup = Number(process.env.SHIP_SIGNATURE_VERIFY_WARMUP ?? 1_000);
const secret = 'ship_whsec_perf_target';
const rawBody = JSON.stringify({
  id: 'evt_perf',
  type: 'document.created',
  data: {
    document: {
      id: 'doc_perf',
      title: 'Signature performance proof',
    },
  },
});
const timestamp = Math.floor(Date.now() / 1000);
const signature = crypto
  .createHmac('sha256', secret)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex');
const headers = {
  'Ship-Signature': `t=${timestamp},v1=${signature}`,
};

for (let index = 0; index < warmup; index += 1) {
  if (!verifyWebhook(headers, rawBody, secret)) {
    throw new Error('Webhook signature warmup verification failed');
  }
}

const started = performance.now();
for (let index = 0; index < iterations; index += 1) {
  if (!verifyWebhook(headers, rawBody, secret)) {
    throw new Error(`Webhook signature verification failed at iteration ${index}`);
  }
}
const elapsedMs = performance.now() - started;
const averageMs = elapsedMs / iterations;

const proof = {
  target_ms_per_call: thresholdMs,
  iterations,
  elapsed_ms: Number(elapsedMs.toFixed(3)),
  average_ms_per_call: Number(averageMs.toFixed(6)),
  passed: averageMs < thresholdMs,
};
console.log(JSON.stringify(proof, null, 2));

if (!proof.passed) {
  throw new Error(`verifyWebhook averaged ${averageMs.toFixed(6)}ms, target < ${thresholdMs}ms`);
}
