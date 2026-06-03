import { verifyWebhook } from '@ship/sdk';

export class InMemorySlackInstallationStore {
  #installations = new Map();

  set(teamId, installation) {
    this.#installations.set(teamId, installation);
  }

  get(teamId) {
    return this.#installations.get(teamId) ?? null;
  }
}

export class SlackShipBridge {
  constructor({
    shipWebhookSecret,
    slackClientId,
    slackClientSecret,
    defaultChannel,
    installationStore = new InMemorySlackInstallationStore(),
    fetch = globalThis.fetch,
  }) {
    this.shipWebhookSecret = shipWebhookSecret;
    this.slackClientId = slackClientId;
    this.slackClientSecret = slackClientSecret;
    this.defaultChannel = defaultChannel;
    this.installationStore = installationStore;
    this.fetch = fetch;
  }

  async completeOAuth({ code, redirectUri }) {
    const body = new URLSearchParams({
      client_id: this.slackClientId,
      client_secret: this.slackClientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const response = await this.fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const installation = await response.json();
    if (!response.ok || installation.ok === false) {
      throw new Error(installation.error ?? 'Slack OAuth failed');
    }

    this.installationStore.set(installation.team.id, {
      teamId: installation.team.id,
      botToken: installation.access_token,
      channel: installation.incoming_webhook?.channel_id ?? this.defaultChannel,
    });
    return this.installationStore.get(installation.team.id);
  }

  async handleShipWebhook({ headers, rawBody, teamId }) {
    if (!verifyWebhook(headers, rawBody, this.shipWebhookSecret)) {
      return { status: 400, body: { ok: false, error: 'invalid_ship_signature' } };
    }

    const event = JSON.parse(rawBody);
    if (!['document.created', 'issue.assigned'].includes(event.type)) {
      return { status: 204, body: null };
    }

    const installation = this.installationStore.get(teamId);
    if (!installation) {
      return { status: 404, body: { ok: false, error: 'slack_installation_missing' } };
    }

    const text = event.type === 'document.created'
      ? `New Ship document: ${event.data?.document?.title ?? event.data?.title ?? 'Untitled'}`
      : `Ship issue assigned: ${event.data?.issue?.title ?? event.data?.document?.title ?? 'Untitled'}`;

    const response = await this.fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${installation.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: installation.channel,
        text,
        unfurl_links: false,
      }),
    });
    const body = await response.json();
    return { status: response.ok && body.ok !== false ? 202 : 502, body };
  }
}
