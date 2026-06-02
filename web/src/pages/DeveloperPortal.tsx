import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';

interface CreatedApp {
  app: OAuthApp;
  client_secret: string;
  secret_display: 'shown_once';
}

interface SecretResult extends CreatedApp {
  action: 'created' | 'rotated';
}

interface OAuthApp {
  id: string;
  name: string;
  client_id: string;
  redirect_uris: string[];
  requested_scopes: string[];
  active: boolean;
  created_at: string;
  updated_at?: string;
}

interface WebhookSubscription {
  id: string;
  event_type: string;
  target_url: string;
  active: boolean;
  created_at: string;
  updated_at?: string;
}

interface WebhookDelivery {
  id: string;
  subscription_id: string;
  event_id: string;
  event_type: string;
  attempt_number: number;
  response_status: number | null;
  response_excerpt: string | null;
  latency_ms: number | null;
  idempotency_key: string;
  status: string;
  next_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

interface AuditRow {
  request_id: string;
  client_id: string;
  method: string;
  route: string;
  scope_used: string | null;
  status: number;
  latency_ms: number | null;
  created_at: string;
}

const DEFAULT_SCOPES = ['documents:read', 'documents:write', 'webhooks:manage'];

export function DeveloperPortalPage() {
  const [name, setName] = useState('Plugforge Demo App');
  const [redirectUri, setRedirectUri] = useState('https://example.com/callback');
  const [targetUrl, setTargetUrl] = useState('https://example.com/ship/webhook');
  const [secretResult, setSecretResult] = useState<SecretResult | null>(null);
  const [apps, setApps] = useState<OAuthApp[]>([]);
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [portalDetails, setPortalDetails] = useState<Record<string, {
    subscriptions: WebhookSubscription[];
    deliveries: WebhookDelivery[];
    auditRows: AuditRow[];
  }>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rotatingAppId, setRotatingAppId] = useState<string | null>(null);
  const [deactivatingAppId, setDeactivatingAppId] = useState<string | null>(null);
  const [testingSubscriptionId, setTestingSubscriptionId] = useState<string | null>(null);
  const [selectedDelivery, setSelectedDelivery] = useState<WebhookDelivery | null>(null);
  const shipUrl = window.location.origin;

  useEffect(() => {
    void loadApps();
  }, []);

  const selectedApp = useMemo(
    () => apps.find((app) => app.id === expandedAppId) ?? null,
    [apps, expandedAppId],
  );

  async function loadApps() {
    const response = await apiGet('/api/v1/oauth/apps');
    if (!response.ok) return;
    const body = await response.json();
    setApps(body.data ?? []);
  }

  async function loadPortalDetails(appId: string) {
    const [subscriptionsResponse, deliveriesResponse, auditResponse] = await Promise.all([
      apiGet(`/api/v1/oauth/apps/${appId}/webhook-subscriptions`),
      apiGet(`/api/v1/oauth/apps/${appId}/webhook-deliveries`),
      apiGet(`/api/v1/oauth/apps/${appId}/audit`),
    ]);

    const [subscriptionsBody, deliveriesBody, auditBody] = await Promise.all([
      subscriptionsResponse.json(),
      deliveriesResponse.json(),
      auditResponse.json(),
    ]);

    setPortalDetails((previous) => ({
      ...previous,
      [appId]: {
        subscriptions: subscriptionsBody.data ?? [],
        deliveries: deliveriesBody.data ?? [],
        auditRows: auditBody.data ?? [],
      },
    }));
  }

  async function createApp(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    setSecretResult(null);

    const response = await apiPost('/api/v1/oauth/apps', {
      name,
      redirect_uris: [redirectUri],
      requested_scopes: DEFAULT_SCOPES,
    });
    const body = await response.json();
    setSubmitting(false);

    if (!response.ok) {
      setError(body.error?.message || body.message || 'Could not create the OAuth app.');
      return;
    }

    setSecretResult({ ...body, action: 'created' });
    setApps((previous) => [body.app, ...previous]);
    setExpandedAppId(body.app.id);
    setNotice('OAuth app created. Copy the secret now; Ship will not show it again.');
  }

  async function rotateSecret(app: OAuthApp) {
    setRotatingAppId(app.id);
    setError('');
    setNotice('');
    setSecretResult(null);

    const response = await apiPost(`/api/v1/oauth/apps/${app.id}/rotate-secret`);
    const body = await response.json();
    setRotatingAppId(null);

    if (!response.ok) {
      setError(body.error?.message || body.message || 'Could not rotate the client secret.');
      return;
    }

    setSecretResult({ ...body, action: 'rotated' });
    setApps((previous) => previous.map((existing) => (existing.id === app.id ? body.app : existing)));
    setNotice('Client secret rotated. Existing secrets stopped working immediately.');
  }

  async function deactivateApp(app: OAuthApp) {
    const confirmed = window.confirm(`Disable ${app.name}? Existing access tokens for this app will stop working immediately.`);
    if (!confirmed) return;

    setDeactivatingAppId(app.id);
    setError('');
    setNotice('');
    setSecretResult(null);

    const response = await apiPost(`/api/v1/oauth/apps/${app.id}/deactivate`);
    const body = await response.json();
    setDeactivatingAppId(null);

    if (!response.ok) {
      setError(body.error?.message || body.message || 'Could not deactivate the OAuth app.');
      return;
    }

    setApps((previous) => previous.map((existing) => (existing.id === app.id ? body.app : existing)));
    setNotice('App disabled. Public API tokens for this app are no longer accepted.');
  }

  async function toggleExpanded(app: OAuthApp) {
    const nextId = expandedAppId === app.id ? null : app.id;
    setExpandedAppId(nextId);
    if (nextId && !portalDetails[nextId]) {
      await loadPortalDetails(nextId);
    }
  }

  async function sendTestEvent(app: OAuthApp, subscription: WebhookSubscription) {
    setTestingSubscriptionId(subscription.id);
    setError('');
    setNotice('');

    const response = await apiPost(`/api/v1/oauth/apps/${app.id}/webhook-subscriptions/${subscription.id}/test`);
    const body = await response.json();
    setTestingSubscriptionId(null);

    if (!response.ok) {
      setError(body.error?.message || body.message || 'Could not send the test webhook event.');
      return;
    }

    await loadPortalDetails(app.id);
    const status = body.delivery?.status;
    const readableStatus = status === 'delivered'
      ? 'Test event delivered. The delivery row below has the response code and latency.'
      : status === 'retry_pending'
        ? 'Test event accepted. Delivery is pending retry; check the delivery row below.'
        : status === 'dead_letter'
          ? 'Test event failed permanently. Review the delivery row below before relying on this subscriber.'
          : 'Test event sent. Refresh activity if the delivery row has not appeared yet.';
    setNotice(readableStatus);
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(''), 1600);
  }

  const demoCommands = [
    {
      title: 'Device login',
      text: `node integrations/cli/src/index.mjs login --client-id ${secretResult?.app.client_id || selectedApp?.client_id || 'ship_app_...'} --ship-url ${shipUrl}`,
    },
    {
      title: 'Create a document',
      text: `node integrations/cli/src/index.mjs docs create "Plugforge webhook proof" --ship-url ${shipUrl}`,
    },
    {
      title: 'Subscribe to document.created',
      text: `node integrations/cli/src/index.mjs webhooks subscribe --url ${targetUrl || 'https://example.com/ship/webhook'} --ship-url ${shipUrl}`,
    },
  ];

  const curlExamples = [
    {
      title: 'Get scopes',
      text: `curl "${shipUrl}/api/v1/scopes"`,
    },
    {
      title: 'List documents',
      text: `curl -H "Authorization: Bearer $SHIP_TOKEN" "${shipUrl}/api/v1/documents?limit=10"`,
    },
    {
      title: 'Create document',
      text: `curl -X POST "${shipUrl}/api/v1/documents" -H "Authorization: Bearer $SHIP_TOKEN" -H "Content-Type: application/json" -d '{ "title": "Plugforge curl proof", "document_type": "wiki" }'`,
    },
    {
      title: 'List webhook deliveries',
      text: `curl -H "Authorization: Bearer $SHIP_TOKEN" "${shipUrl}/api/v1/webhooks/deliveries"`,
    },
  ];

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Developer Portal</h1>
          <p className="text-xs text-muted">Connected apps, permissions, event notifications, and API activity.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copyText('openapi', `${shipUrl}/api/v1/openapi.json`)}
            className="rounded border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/10"
          >
            {copied === 'openapi' ? 'Copied' : 'Copy OpenAPI URL'}
          </button>
          <a
            href="/api/v1/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="rounded border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/10"
          >
            OpenAPI
          </a>
        </div>
      </header>

      <main className="grid flex-1 gap-6 overflow-auto p-6 xl:grid-cols-[minmax(340px,420px),1fr]">
        <section>
          <OnboardingChecklist hasApps={apps.length > 0} hasExpandedApp={Boolean(selectedApp)} />

          <h2 className="text-base font-semibold text-foreground">Register A Connected App</h2>
          <form onSubmit={createApp} className="mt-4 space-y-4">
            <Field label="App name" value={name} onChange={setName} />
            <Field label="Redirect URI" value={redirectUri} onChange={setRedirectUri} />
            <Field label="Webhook target for CLI demo" value={targetUrl} onChange={setTargetUrl} />
            <div>
              <div className="text-sm font-medium text-foreground">Permissions</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {DEFAULT_SCOPES.map((scope) => (
                  <span key={scope} className="rounded border border-border px-2 py-1 text-xs text-muted">
                    {scope}
                  </span>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {notice && <p className="text-sm text-green-700">{notice}</p>}
            <button
              type="submit"
              disabled={submitting}
              aria-label="Create connected app"
              className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create app'}
            </button>
          </form>

          {secretResult && (
            <div className="mt-6 border border-border bg-muted/5 p-4">
              <h3 className="text-sm font-semibold text-foreground">
                App {secretResult.action === 'created' ? 'created' : 'secret rotated'}
              </h3>
              <SecretRow
                label="Client ID"
                value={secretResult.app.client_id}
                copied={copied}
                copyKey="client-id"
                onCopy={copyText}
              />
              <SecretRow
                label="Client secret"
                value={secretResult.client_secret}
                copied={copied}
                copyKey="client-secret"
                onCopy={copyText}
              />
              <p className="mt-3 text-xs text-muted">
                Ship shows this secret once. Rotate the secret if it is lost or exposed.
              </p>
            </div>
          )}

          <div className="mt-6">
            <h2 className="text-base font-semibold text-foreground">Demo Commands</h2>
            <div className="mt-4 space-y-4">
              {demoCommands.map((command, index) => (
                <CommandBlock
                  key={command.title}
                  title={`${index + 1}. ${command.title}`}
                  command={command.text}
                  copied={copied}
                  onCopy={copyText}
                />
              ))}
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-base font-semibold text-foreground">Copy Curl Examples</h2>
            <div className="mt-4 space-y-4">
              {curlExamples.map((example) => (
                <CommandBlock
                  key={example.title}
                  title={example.title}
                  command={example.text}
                  copied={copied}
                  onCopy={copyText}
                />
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Connected Apps</h2>
            <button
              type="button"
              onClick={() => void loadApps()}
              className="rounded border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/10"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 divide-y divide-border border border-border">
            {apps.length === 0 ? (
              <div className="p-4 text-sm text-muted">No connected apps registered yet.</div>
            ) : apps.map((app) => {
              const details = portalDetails[app.id];
              const isExpanded = expandedAppId === app.id;
              return (
                <div key={app.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleExpanded(app)}
                          aria-expanded={isExpanded}
                          aria-controls={`app-details-${app.id}`}
                          className="text-left text-sm font-semibold text-foreground hover:underline"
                        >
                          {app.name}
                        </button>
                        <StatusBadge active={app.active} />
                      </div>
                      <div className="mt-1 break-all font-mono text-xs text-muted">{app.client_id}</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void copyText(`client-${app.id}`, app.client_id)}
                          aria-label={`Copy client ID for ${app.name}`}
                          className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/10"
                        >
                        {copied === `client-${app.id}` ? 'Copied' : 'Copy ID'}
                      </button>
                        <button
                          type="button"
                          onClick={() => void rotateSecret(app)}
                          disabled={!app.active || rotatingAppId === app.id}
                          aria-label={`Rotate client secret for ${app.name}`}
                          className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                        {rotatingAppId === app.id ? 'Rotating...' : 'Rotate secret'}
                      </button>
                        <button
                          type="button"
                          onClick={() => void deactivateApp(app)}
                          disabled={!app.active || deactivatingAppId === app.id}
                          aria-label={`Disable ${app.name}`}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                        {deactivatingAppId === app.id ? 'Disabling...' : 'Disable'}
                      </button>
                        <button
                          type="button"
                          onClick={() => void toggleExpanded(app)}
                          aria-expanded={isExpanded}
                          aria-controls={`app-details-${app.id}`}
                          className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/10"
                        >
                        {isExpanded ? 'Hide details' : 'View details'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {app.requested_scopes.map((scope) => (
                      <span key={scope} className="rounded border border-border px-2 py-0.5 text-xs text-muted">
                        {scope}
                      </span>
                    ))}
                  </div>

                  {isExpanded && (
                    <AppDetails
                      app={app}
                      details={details}
                      copied={copied}
                      testingSubscriptionId={testingSubscriptionId}
                      onCopy={copyText}
                      onRefresh={() => void loadPortalDetails(app.id)}
                      onSendTest={sendTestEvent}
                      onSelectDelivery={setSelectedDelivery}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {selectedDelivery && (
        <DeliveryDetailDrawer
          delivery={selectedDelivery}
          onClose={() => setSelectedDelivery(null)}
        />
      )}
    </div>
  );
}

function OnboardingChecklist({ hasApps, hasExpandedApp }: { hasApps: boolean; hasExpandedApp: boolean }) {
  const items = [
    { label: 'Create app', done: hasApps },
    { label: 'Copy client ID', done: hasApps },
    { label: 'Run device login', done: false },
    { label: 'Create first document', done: false },
    { label: 'Subscribe to webhook', done: hasExpandedApp },
    { label: 'Verify delivery', done: hasExpandedApp },
  ];

  return (
    <section aria-labelledby="getting-started-title" className="mb-6 border border-border p-4">
      <h2 id="getting-started-title" className="text-base font-semibold text-foreground">Get Started</h2>
      <ol className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={`inline-flex h-5 min-w-12 items-center justify-center rounded-full border px-2 text-xs ${
                item.done ? 'border-green-300 text-green-700' : 'border-border text-muted'
              }`}
            >
              {item.done ? 'Done' : ''}
            </span>
            <span className={item.done ? 'text-foreground' : 'text-muted'}>{item.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
    </label>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-xs ${active ? 'border-green-200 text-green-700' : 'border-border text-muted'}`}>
      {active ? 'Active' : 'Disabled'}
    </span>
  );
}

function SecretRow({
  label,
  value,
  copied,
  copyKey,
  onCopy,
}: {
  label: string;
  value: string;
  copied: string;
  copyKey: string;
  onCopy: (label: string, text: string) => Promise<void>;
}) {
  return (
    <div className="mt-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 flex items-start gap-2">
        <span className="min-w-0 flex-1 break-all font-mono text-sm text-foreground">{value}</span>
        <button
          type="button"
          onClick={() => void onCopy(copyKey, value)}
          aria-label={`Copy ${label}`}
          className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/10"
        >
          {copied === copyKey ? 'Copied' : 'Copy'}
        </button>
      </dd>
    </div>
  );
}

function CommandBlock({
  title,
  command,
  copied,
  onCopy,
}: {
  title: string;
  command: string;
  copied: string;
  onCopy: (label: string, text: string) => Promise<void>;
}) {
  const copyKey = `cmd-${title}`;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <button
          type="button"
          onClick={() => void onCopy(copyKey, command)}
          aria-label={`Copy ${title}`}
          className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/10"
        >
          {copied === copyKey ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-auto rounded bg-foreground p-3 text-xs text-background">
        <code>{command}</code>
      </pre>
    </div>
  );
}

function AppDetails({
  app,
  details,
  copied,
  testingSubscriptionId,
  onCopy,
  onRefresh,
  onSendTest,
  onSelectDelivery,
}: {
  app: OAuthApp;
  details?: { subscriptions: WebhookSubscription[]; deliveries: WebhookDelivery[]; auditRows: AuditRow[] };
  copied: string;
  testingSubscriptionId: string | null;
  onCopy: (label: string, text: string) => Promise<void>;
  onRefresh: () => void;
  onSendTest: (app: OAuthApp, subscription: WebhookSubscription) => Promise<void>;
  onSelectDelivery: (delivery: WebhookDelivery) => void;
}) {
  if (!details) {
    return <div className="mt-4 text-sm text-muted">Loading app activity...</div>;
  }

  return (
    <div id={`app-details-${app.id}`} className="mt-4 space-y-5 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted">
          Created {formatDate(app.created_at)}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label={`Refresh activity for ${app.name}`}
          className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/10"
        >
          Refresh activity
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground">Event Notifications</h3>
        <div className="mt-2 overflow-auto border border-border">
          {details.subscriptions.length === 0 ? (
            <div className="p-3 text-sm text-muted">No webhook subscriptions for this app yet.</div>
          ) : (
            <table className="min-w-full text-left text-xs">
              <caption className="sr-only">Webhook subscriptions for {app.name}</caption>
              <thead className="bg-muted/10 text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {details.subscriptions.map((subscription) => (
                  <tr key={subscription.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">{subscription.event_type}</td>
                    <td className="max-w-[320px] break-all px-3 py-2 text-muted">{subscription.target_url}</td>
                    <td className="px-3 py-2">{subscription.active ? 'Active' : 'Disabled'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void onCopy(`sub-${subscription.id}`, subscription.id)}
                          aria-label={`Copy webhook subscription ID for ${subscription.event_type}`}
                          className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/10"
                        >
                          {copied === `sub-${subscription.id}` ? 'Copied' : 'Copy ID'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onSendTest(app, subscription)}
                          disabled={!subscription.active || testingSubscriptionId === subscription.id}
                          aria-label={`Send test ${subscription.event_type} webhook`}
                          className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {testingSubscriptionId === subscription.id ? 'Sending...' : 'Send test'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground">Webhook Deliveries</h3>
        <DeliveryTable deliveries={details.deliveries} onSelectDelivery={onSelectDelivery} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground">API Activity</h3>
        <AuditTable rows={details.auditRows} />
      </div>
    </div>
  );
}

function DeliveryTable({
  deliveries,
  onSelectDelivery,
}: {
  deliveries: WebhookDelivery[];
  onSelectDelivery: (delivery: WebhookDelivery) => void;
}) {
  if (deliveries.length === 0) {
    return <div className="mt-2 border border-border p-3 text-sm text-muted">No webhook deliveries recorded yet.</div>;
  }

  return (
    <div className="mt-2 overflow-auto border border-border">
      <table className="min-w-full text-left text-xs">
        <caption className="sr-only">Webhook delivery attempts</caption>
        <thead className="bg-muted/10 text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Event</th>
            <th className="px-3 py-2 font-medium">Response</th>
            <th className="px-3 py-2 font-medium">Latency</th>
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.slice(0, 10).map((delivery) => (
            <tr key={delivery.id} className="border-t border-border">
              <td className="px-3 py-2">{delivery.status}</td>
              <td className="px-3 py-2 font-mono">{delivery.event_type}</td>
              <td className="px-3 py-2">{delivery.response_status ?? 'n/a'}</td>
              <td className="px-3 py-2">{delivery.latency_ms === null ? 'n/a' : `${delivery.latency_ms}ms`}</td>
              <td className="px-3 py-2 text-muted">{formatDate(delivery.created_at)}</td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => onSelectDelivery(delivery)}
                  aria-label={`View delivery details for ${delivery.event_type}`}
                  className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/10"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTable({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return <div className="mt-2 border border-border p-3 text-sm text-muted">No public API calls recorded yet.</div>;
  }

  return (
    <div className="mt-2 overflow-auto border border-border">
      <table className="min-w-full text-left text-xs">
        <caption className="sr-only">Public API activity for this connected app</caption>
        <thead className="bg-muted/10 text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Route</th>
            <th className="px-3 py-2 font-medium">Scope</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Latency</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row) => (
            <tr key={`${row.request_id}-${row.created_at}`} className="border-t border-border">
              <td className="px-3 py-2 font-mono">{row.method} {row.route}</td>
              <td className="px-3 py-2">{row.scope_used ?? 'none'}</td>
              <td className="px-3 py-2">{row.status}</td>
              <td className="px-3 py-2">{row.latency_ms === null ? 'n/a' : `${row.latency_ms}ms`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeliveryDetailDrawer({
  delivery,
  onClose,
}: {
  delivery: WebhookDelivery;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true" aria-labelledby="delivery-detail-title">
      <aside className="h-full w-full max-w-[460px] overflow-auto border-l border-border bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="delivery-detail-title" className="text-lg font-semibold text-foreground">Webhook Delivery</h2>
            <p className="mt-1 text-sm text-muted">{delivery.event_type}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close webhook delivery details"
            className="rounded border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/10"
          >
            Close
          </button>
        </div>

        <dl className="mt-6 space-y-4 text-sm">
          <DetailRow label="Delivery ID" value={delivery.id} />
          <DetailRow label="Event ID" value={delivery.event_id} />
          <DetailRow label="Subscription ID" value={delivery.subscription_id} />
          <DetailRow label="Status" value={delivery.status} />
          <DetailRow label="Attempt" value={String(delivery.attempt_number)} />
          <DetailRow label="Response" value={delivery.response_status === null ? 'No response recorded' : String(delivery.response_status)} />
          <DetailRow label="Latency" value={delivery.latency_ms === null ? 'No latency recorded' : `${delivery.latency_ms}ms`} />
          <DetailRow label="Idempotency key" value={delivery.idempotency_key} />
          <DetailRow label="Next retry" value={delivery.next_attempt_at ? formatDate(delivery.next_attempt_at) : 'No retry scheduled'} />
          <DetailRow label="Delivered at" value={delivery.delivered_at ? formatDate(delivery.delivered_at) : 'Not delivered yet'} />
          <DetailRow label="Created" value={formatDate(delivery.created_at)} />
        </dl>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground">Response Excerpt</h3>
          <pre className="mt-2 max-h-40 overflow-auto rounded border border-border bg-muted/5 p-3 text-xs text-foreground">
            <code>{delivery.response_excerpt || 'No response body captured.'}</code>
          </pre>
        </div>

        <div className="mt-6 border border-border p-4 text-sm text-muted">
          Verify incoming events with the SDK helper using the raw request body,
          the `Ship-Signature` header, and the subscription signing secret. Replay
          is safe because consumers dedupe with the idempotency key above.
        </div>
      </aside>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted">{label}</dt>
      <dd className="mt-1 break-all font-mono text-sm text-foreground">{value}</dd>
    </div>
  );
}

function formatDate(value: string | undefined): string {
  if (!value) return 'unknown';
  return new Date(value).toLocaleString();
}
