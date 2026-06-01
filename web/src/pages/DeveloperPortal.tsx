import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';

interface CreatedApp {
  app: {
    name: string;
    client_id: string;
    redirect_uris: string[];
    requested_scopes: string[];
  };
  client_secret: string;
  secret_display: 'shown_once';
}

interface OAuthApp {
  id: string;
  name: string;
  client_id: string;
  redirect_uris: string[];
  requested_scopes: string[];
  active: boolean;
  created_at: string;
}

const DEFAULT_SCOPES = ['documents:read', 'documents:write', 'webhooks:manage'];

export function DeveloperPortalPage() {
  const [name, setName] = useState('Plugforge Demo App');
  const [redirectUri, setRedirectUri] = useState('https://example.com/callback');
  const [targetUrl, setTargetUrl] = useState('https://example.com/ship/webhook');
  const [createdApp, setCreatedApp] = useState<CreatedApp | null>(null);
  const [apps, setApps] = useState<OAuthApp[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadApps();
  }, []);

  async function loadApps() {
    const response = await apiGet('/api/v1/oauth/apps');
    if (!response.ok) return;
    const body = await response.json();
    setApps(body.data ?? []);
  }

  async function createApp(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setCreatedApp(null);

    const response = await apiPost('/api/v1/oauth/apps', {
      name,
      redirect_uris: [redirectUri],
      requested_scopes: DEFAULT_SCOPES,
    });
    const body = await response.json();
    setSubmitting(false);

    if (!response.ok) {
      setError(body.message || 'Could not create the OAuth app.');
      return;
    }

    setCreatedApp(body);
    setApps((previous) => [body.app, ...previous]);
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Developer Portal</h1>
          <p className="text-xs text-muted">OAuth apps, scopes, webhooks, and CLI setup for Plugforge.</p>
        </div>
        <a
          href="/api/v1/openapi.json"
          target="_blank"
          rel="noreferrer"
          className="rounded border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/10"
        >
          OpenAPI
        </a>
      </header>

      <main className="grid flex-1 gap-6 overflow-auto p-6 lg:grid-cols-[minmax(0,420px),1fr]">
        <section>
          <h2 className="text-base font-semibold text-foreground">Create OAuth App</h2>
          <form onSubmit={createApp} className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-foreground">App name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Redirect URI</span>
              <input
                value={redirectUri}
                onChange={(event) => setRedirectUri(event.target.value)}
                className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Webhook target for CLI demo</span>
              <input
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
                className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_SCOPES.map((scope) => (
                <span key={scope} className="rounded border border-border px-2 py-1 text-xs text-muted">
                  {scope}
                </span>
              ))}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create app'}
            </button>
          </form>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">Demo Commands</h2>
          <div className="mt-4 space-y-4">
            <CommandBlock title="1. Device login">
              node integrations/cli/src/index.mjs login --client-id {createdApp?.app.client_id || 'ship_app_...'} --ship-url http://localhost:3000
            </CommandBlock>
            <CommandBlock title="2. Create a document">
              node integrations/cli/src/index.mjs docs create "Plugforge webhook proof" --ship-url http://localhost:3000
            </CommandBlock>
            <CommandBlock title="3. Subscribe to document.created">
              node integrations/cli/src/index.mjs webhooks subscribe --url {targetUrl || 'https://example.com/ship/webhook'} --ship-url http://localhost:3000
            </CommandBlock>
          </div>

          {createdApp && (
            <div className="mt-6 border border-border bg-muted/5 p-4">
              <h3 className="text-sm font-semibold text-foreground">OAuth app created</h3>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-muted">Client ID</dt>
                  <dd className="break-all font-mono text-foreground">{createdApp.app.client_id}</dd>
                </div>
                <div>
                  <dt className="text-muted">Client secret</dt>
                  <dd className="break-all font-mono text-foreground">{createdApp.client_secret}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted">The client secret is shown once. Store it before leaving this page.</p>
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-foreground">Registered Apps</h3>
            <div className="mt-3 divide-y divide-border border border-border">
              {apps.length === 0 ? (
                <div className="p-3 text-sm text-muted">No OAuth apps registered yet.</div>
              ) : apps.map((app) => (
                <div key={app.id} className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{app.name}</div>
                      <div className="break-all font-mono text-xs text-muted">{app.client_id}</div>
                    </div>
                    <span className="shrink-0 rounded border border-border px-2 py-1 text-xs text-muted">
                      {app.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {app.requested_scopes.map((scope) => (
                      <span key={scope} className="rounded border border-border px-2 py-0.5 text-xs text-muted">
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function CommandBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium text-foreground">{title}</div>
      <pre className="overflow-auto rounded bg-foreground p-3 text-xs text-background">
        <code>{children}</code>
      </pre>
    </div>
  );
}
