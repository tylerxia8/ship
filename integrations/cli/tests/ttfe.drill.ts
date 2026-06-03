import crypto from 'node:crypto';
import http from 'node:http';
import { afterEach, expect, test } from 'vitest';
import { InMemoryTokenStore, ShipClient, verifyWebhook } from '../../../sdk/src/index.js';

interface Delivery {
  headers: http.IncomingHttpHeaders;
  rawBody: string;
  event: { type: string };
}

class TestListener {
  private readonly received: Delivery[] = [];
  private readonly waiters: Array<{
    predicate: (headers: http.IncomingHttpHeaders, body: string) => boolean;
    resolve: (delivery: Delivery) => void;
  }> = [];
  private readonly server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const delivery: Delivery = {
        headers: req.headers,
        rawBody,
        event: JSON.parse(rawBody) as { type: string },
      };
      this.received.push(delivery);
      this.flushWaiters();
      res.writeHead(204).end();
    });
  });

  url = '';

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Could not bind test listener');
    this.url = `http://127.0.0.1:${address.port}/ship-webhook`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  waitFor(
    predicate: (headers: http.IncomingHttpHeaders, body: string) => boolean,
    options: { timeoutMs: number },
  ): Promise<Delivery> {
    const existing = this.received.find((delivery) => predicate(delivery.headers, delivery.rawBody));
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.resolve === resolve);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error('Timed out waiting for signed delivery'));
      }, options.timeoutMs);

      this.waiters.push({
        predicate,
        resolve: (delivery) => {
          clearTimeout(timeout);
          resolve(delivery);
        },
      });
    });
  }

  private flushWaiters(): void {
    for (const delivery of this.received) {
      for (const waiter of [...this.waiters]) {
        if (!waiter.predicate(delivery.headers, delivery.rawBody)) continue;
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(delivery);
      }
    }
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function signWebhook(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

let originalClientId: string | undefined;

afterEach(() => {
  if (originalClientId === undefined) {
    delete process.env.SHIP_CLIENT_ID;
  } else {
    process.env.SHIP_CLIENT_ID = originalClientId;
  }
  delete process.env.SHIP_DEVICE_CODE;
});

test('time to first event', async () => {
  const t0 = performance.now();
  const testListener = new TestListener();
  await testListener.start();

  originalClientId = process.env.SHIP_CLIENT_ID;
  process.env.SHIP_CLIENT_ID = 'ship_app_drill_test';

  const signingSecret = 'ship_whsec_test_secret';
  let targetUrl = '';

  const fetchImpl: typeof fetch = async (url, init) => {
    const requestUrl = new URL(String(url));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};

    if (requestUrl.pathname === '/oauth/device/code') {
      expect(body.client_id).toBe('ship_app_drill_test');
      return json({
        device_code: 'ship_dc_test',
        user_code: 'TTFE-2026',
        verification_uri: '/oauth/device/verify',
        expires_in: 900,
        interval: 0,
      });
    }

    if (requestUrl.pathname === '/oauth/token') {
      expect(body.client_id).toBe('ship_app_drill_test');
      expect(body.device_code).toBe('ship_dc_test');
      return json({
        token_type: 'Bearer',
        access_token: 'ship_at_test',
        expires_in: 900,
        refresh_token: 'ship_rt_test',
        scope: 'documents:write webhooks:manage',
      });
    }

    if (requestUrl.pathname === '/api/v1/webhooks/subscriptions') {
      expect(body.event_type).toBe('document.created');
      targetUrl = String(body.target_url);
      return json({
        data: {
          id: 'sub_ttfe',
          event_type: 'document.created',
          target_url: targetUrl,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        signing_secret: signingSecret,
        secret_display: 'shown_once',
      });
    }

    if (requestUrl.pathname === '/api/v1/documents') {
      expect(body.title).toBe('hello');
      const doc = {
        id: 'doc_ttfe',
        workspace_id: 'workspace_ttfe',
        document_type: 'wiki',
        title: body.title,
        properties: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const rawBody = JSON.stringify({
        id: 'evt_ttfe',
        type: 'document.created',
        data: { document: doc },
      });
      await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `document.created:${doc.id}`,
          'Ship-Signature': signWebhook(rawBody, signingSecret),
        },
        body: rawBody,
      });
      return json({ data: doc }, 201);
    }

    return json({ code: 'not_found', message: 'Not found', request_id: 'req_test' }, 404);
  };

  try {
    const tokenStore = new InMemoryTokenStore();
    const client = await ShipClient.deviceLogin({
      fetch: fetchImpl,
      shipUrl: 'http://ship.test',
      pollIntervalMs: 0,
      tokenStore,
      onUserCode: (code) => {
        process.env.SHIP_DEVICE_CODE = code;
      },
    });

    expect(process.env.SHIP_DEVICE_CODE).toBe('TTFE-2026');
    expect(tokenStore.get()).toMatchObject({
      access_token: 'ship_at_test',
      refresh_token: 'ship_rt_test',
    });

    const sub = await client.webhooks.create({
      event: 'document.created',
      target_url: testListener.url,
    });
    expect(sub.data).toMatchObject({
      id: 'sub_ttfe',
      event_type: 'document.created',
      target_url: testListener.url,
      active: true,
    });
    expect(sub.signing_secret).toBe(signingSecret);
    expect(sub.secret_display).toBe('shown_once');

    const doc = await client.documents.create({ title: 'hello' });
    expect(doc.data.id).toBe('doc_ttfe');

    const delivery = await testListener.waitFor(
      (headers, body) => verifyWebhook(headers, body, sub.signing_secret),
      { timeoutMs: 5000 },
    );

    expect(delivery.event.type).toBe('document.created');
    expect(verifyWebhook(delivery.headers, delivery.rawBody, sub.signing_secret)).toBe(true);
    expect(verifyWebhook(delivery.headers, `${delivery.rawBody} `, sub.signing_secret)).toBe(false);

    const expiredTimestamp = Math.floor(Date.now() / 1000) - 301;
    const expiredHeaders = {
      ...delivery.headers,
      'Ship-Signature': signWebhook(delivery.rawBody, sub.signing_secret, expiredTimestamp),
      'ship-signature': signWebhook(delivery.rawBody, sub.signing_secret, expiredTimestamp),
    };
    expect(verifyWebhook(expiredHeaders, delivery.rawBody, sub.signing_secret)).toBe(false);
    expect(performance.now() - t0).toBeLessThan(60_000);
  } finally {
    await testListener.close();
  }
});
