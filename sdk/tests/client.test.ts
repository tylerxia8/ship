import { describe, expect, it } from 'vitest';
import { ShipClient } from '../src/client.js';
import { ShipSDKError } from '../src/errors.js';
import type { Page, ShipDocument, ShipMe } from '../src/types.js';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
}

function document(id: string, title: string): ShipDocument {
  return {
    id,
    workspace_id: 'workspace_1',
    document_type: 'wiki',
    title,
    properties: {},
    created_at: '2026-06-05T00:00:00.000Z',
    updated_at: '2026-06-05T00:00:00.000Z',
  };
}

describe('ShipClient', () => {
  it('calls me() with the configured bearer token and returns the authenticated user', async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const me: ShipMe = {
      user: { id: 'user_1', email: 'tyler@example.com', name: 'Tyler' },
      workspace: { id: 'workspace_1', name: 'Ship' },
      app: { client_id: 'ship_app_test', scopes: ['documents:read'] },
    };
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return jsonResponse(me);
    };

    const client = new ShipClient({
      token: 'ship_at_test',
      baseUrl: 'https://ship.example/api/v1/',
      fetch: fetchImpl as typeof fetch,
    });

    await expect(client.me()).resolves.toEqual(me);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://ship.example/api/v1/me');
    expect(calls[0].headers.get('Authorization')).toBe('Bearer ship_at_test');
  });

  it('exposes resource clients and hides cursors behind document async iteration', async () => {
    const first = document('doc_1', 'first');
    const second = document('doc_2', 'second');
    const calls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/documents?limit=1')) {
        return jsonResponse({ data: [first], next_cursor: 'cursor_1' } satisfies Page<ShipDocument>);
      }
      if (url.endsWith('/documents?limit=1&cursor=cursor_1')) {
        return jsonResponse({ data: [second], next_cursor: null } satisfies Page<ShipDocument>);
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const client = new ShipClient({
      token: 'ship_at_test',
      baseUrl: 'https://ship.example/api/v1',
      fetch: fetchImpl as typeof fetch,
    });

    expect(client.documents).toBeDefined();
    expect(client.issues).toBeDefined();
    expect(client.sprints).toBeDefined();
    expect(client.webhooks).toBeDefined();

    const titles: string[] = [];
    for await (const doc of client.documents.iterate({ limit: 1 })) {
      titles.push(doc.title);
    }

    expect(titles).toEqual(['first', 'second']);
    expect(calls).toEqual([
      'https://ship.example/api/v1/documents?limit=1',
      'https://ship.example/api/v1/documents?limit=1&cursor=cursor_1',
    ]);
  });

  it('maps public ApiError responses into typed SDK errors', async () => {
    const fetchImpl = async () => jsonResponse(
      {
        code: 'rate_limited',
        message: 'Too many requests',
        details: { bucket: 'token' },
        request_id: 'req_123',
      },
      {
        status: 429,
        headers: { 'Retry-After': '7' },
      },
    );

    const client = new ShipClient({
      token: 'ship_at_test',
      baseUrl: 'https://ship.example/api/v1',
      fetch: fetchImpl as typeof fetch,
    });

    await expect(client.scopes()).rejects.toMatchObject({
      kind: 'rate_limit',
      message: 'Too many requests',
      status: 429,
      requestId: 'req_123',
      details: { bucket: 'token' },
      retryAfterSeconds: 7,
    } satisfies Partial<ShipSDKError>);
  });

  it('creates an authenticated client with the OAuth client credentials helper', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (String(input).endsWith('/oauth/token')) {
        return jsonResponse({
          token_type: 'Bearer',
          access_token: 'ship_at_agent',
          expires_in: 900,
          scope: 'documents:read',
        });
      }
      return jsonResponse({
        user: { id: 'user_1', email: 'agent-owner@example.com', name: 'Agent Owner' },
        workspace: { id: 'workspace_1', name: 'Ship' },
        app: { client_id: 'ship_app_agent', scopes: ['documents:read'] },
      } satisfies ShipMe);
    };

    const client = await ShipClient.clientCredentials({
      clientId: 'ship_app_agent',
      clientSecret: 'ship_sk_agent_secret',
      scope: 'documents:read',
      shipUrl: 'https://ship.example',
      fetch: fetchImpl as typeof fetch,
    });

    await expect(client.me()).resolves.toMatchObject({
      app: { client_id: 'ship_app_agent', scopes: ['documents:read'] },
    });
    expect(calls).toEqual([
      {
        url: 'https://ship.example/oauth/token',
        body: {
          grant_type: 'client_credentials',
          client_id: 'ship_app_agent',
          client_secret: 'ship_sk_agent_secret',
          scope: 'documents:read',
        },
      },
      { url: 'https://ship.example/api/v1/me', body: null },
    ]);
  });
});
