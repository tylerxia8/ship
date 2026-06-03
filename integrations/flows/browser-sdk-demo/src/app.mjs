import { BrowserLocalStorageTokenStore, ShipClient } from '@ship/sdk';

function appendText(document, parent, tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

export async function startBrowserSdkDemo({
  root,
  shipUrl,
  clientId,
  redirectUri,
  scope = 'documents:read',
  location = globalThis.location,
  storage = globalThis.localStorage,
  fetch = globalThis.fetch,
}) {
  const document = root.ownerDocument;
  const tokenStore = new BrowserLocalStorageTokenStore('ship.browser-demo.tokens', storage);
  const status = appendText(document, root, 'p', 'Loading Ship documents');

  async function renderDocuments() {
    const client = new ShipClient({
      tokenStore,
      baseUrl: `${shipUrl.replace(/\/$/, '')}/api/v1`,
      fetch,
    });
    const page = await client.documents.list({ limit: 25 });
    status.textContent = `Loaded ${page.data.length} documents`;
    const list = document.createElement('ul');
    for (const doc of page.data) {
      appendText(document, list, 'li', doc.title);
    }
    root.appendChild(list);
    return page;
  }

  const url = new URL(location.href);
  if (url.searchParams.has('code')) {
    const flowState = JSON.parse(storage.getItem('ship.browser-demo.pkce') ?? '{}');
    const flow = ShipClient.authorizationCodeFlow({
      clientId,
      redirectUri,
      shipUrl,
      scope,
      codeVerifier: flowState.codeVerifier,
      state: flowState.state,
      fetch,
    });
    const tokens = await flow.exchange(location.href);
    tokenStore.set(tokens);
    storage.removeItem('ship.browser-demo.pkce');
    return renderDocuments();
  }

  if (tokenStore.get()) {
    return renderDocuments();
  }

  const flow = ShipClient.authorizationCodeFlow({ clientId, redirectUri, shipUrl, scope, fetch });
  storage.setItem('ship.browser-demo.pkce', JSON.stringify({
    codeVerifier: flow.codeVerifier,
    state: flow.state,
  }));
  status.textContent = 'Redirecting to Ship OAuth';
  location.assign(flow.authorizationUrl);
  return null;
}
