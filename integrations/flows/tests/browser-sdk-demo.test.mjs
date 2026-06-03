import { expect, test } from 'vitest';
import { startBrowserSdkDemo } from '../browser-sdk-demo/src/app.mjs';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

class Element {
  constructor(tag, ownerDocument) {
    this.tag = tag;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.textContent = '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

function createDocument() {
  return {
    createElement(tag) {
      return new Element(tag, this);
    },
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('browser SDK demo completes Authorization Code + PKCE and lists documents', async () => {
  const storage = new MemoryStorage();
  const document = createDocument();
  const root = new Element('main', document);
  let assignedUrl = '';

  await startBrowserSdkDemo({
    root,
    shipUrl: 'https://ship.test',
    clientId: 'ship_browser_demo',
    redirectUri: 'https://demo.test/callback',
    location: {
      href: 'https://demo.test/callback',
      assign(url) {
        assignedUrl = url;
      },
    },
    storage,
    fetch: async () => {
      throw new Error('The first render should redirect before fetching');
    },
  });

  const authorizationUrl = new URL(assignedUrl);
  expect(authorizationUrl.pathname).toBe('/oauth/authorize');
  expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorizationUrl.searchParams.get('client_id')).toBe('ship_browser_demo');

  const state = authorizationUrl.searchParams.get('state');
  const requests = [];
  const callbackRoot = new Element('main', document);
  const page = await startBrowserSdkDemo({
    root: callbackRoot,
    shipUrl: 'https://ship.test',
    clientId: 'ship_browser_demo',
    redirectUri: 'https://demo.test/callback',
    location: {
      href: `https://demo.test/callback?code=oauth_code&state=${state}`,
      assign() {
        throw new Error('Callback render should not redirect');
      },
    },
    storage,
    fetch: async (url, init) => {
      requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      if (String(url) === 'https://ship.test/oauth/token') {
        expect(requests.at(-1).body).toMatchObject({
          grant_type: 'authorization_code',
          client_id: 'ship_browser_demo',
          code: 'oauth_code',
          redirect_uri: 'https://demo.test/callback',
        });
        expect(requests.at(-1).body.code_verifier).toBeTruthy();
        return json({
          token_type: 'Bearer',
          access_token: 'ship_at_browser',
          expires_in: 900,
          refresh_token: 'ship_rt_browser',
          scope: 'documents:read',
        });
      }

      if (String(url) === 'https://ship.test/api/v1/documents?limit=25') {
        expect(init.headers.get('Authorization')).toBe('Bearer ship_at_browser');
        return json({
          data: [
            {
              id: 'doc_1',
              workspace_id: 'workspace_1',
              document_type: 'wiki',
              title: 'Browser SDK proof',
              properties: {},
              created_at: '2026-06-03T00:00:00.000Z',
              updated_at: '2026-06-03T00:00:00.000Z',
            },
          ],
          next_cursor: null,
        });
      }

      throw new Error(`Unexpected demo URL: ${url}`);
    },
  });

  expect(page.data[0].title).toBe('Browser SDK proof');
  expect(callbackRoot.children.map((child) => child.textContent)).toContain('Loaded 1 documents');
  expect(storage.getItem('ship.browser-demo.tokens')).toContain('ship_at_browser');
});
