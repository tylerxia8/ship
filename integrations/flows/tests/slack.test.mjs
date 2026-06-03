import { expect, test } from 'vitest';
import { SlackShipBridge } from '../src/slack.mjs';
import { signShipPayload } from '../src/ship-signing.mjs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Slack integration receives signed Ship events and posts document and issue messages', async () => {
  const posted = [];
  const fetch = async (url, init) => {
    if (url === 'https://slack.com/api/oauth.v2.access') {
      const body = new URLSearchParams(String(init.body));
      expect(body.get('code')).toBe('slack_oauth_code');
      return json({
        ok: true,
        team: { id: 'T_ship' },
        access_token: 'xoxb-ship',
        incoming_webhook: { channel_id: 'C_docs' },
      });
    }

    if (url === 'https://slack.com/api/chat.postMessage') {
      posted.push({
        token: init.headers.Authorization,
        body: JSON.parse(String(init.body)),
      });
      return json({ ok: true, ts: `1715985600.${posted.length}` });
    }

    throw new Error(`Unexpected Slack URL: ${url}`);
  };

  const bridge = new SlackShipBridge({
    shipWebhookSecret: 'whsec_slack',
    slackClientId: 'slack_client',
    slackClientSecret: 'slack_secret',
    defaultChannel: 'C_fallback',
    fetch,
  });

  const installation = await bridge.completeOAuth({
    code: 'slack_oauth_code',
    redirectUri: 'https://ship.example/slack/callback',
  });
  expect(installation).toMatchObject({ teamId: 'T_ship', botToken: 'xoxb-ship', channel: 'C_docs' });

  for (const event of [
    { type: 'document.created', data: { document: { title: 'Launch brief' } } },
    { type: 'issue.assigned', data: { issue: { title: 'Follow up with grader' } } },
  ]) {
    const rawBody = JSON.stringify(event);
    const response = await bridge.handleShipWebhook({
      teamId: 'T_ship',
      rawBody,
      headers: { 'Ship-Signature': signShipPayload(rawBody, 'whsec_slack') },
    });
    expect(response.status).toBe(202);
  }

  expect(posted).toEqual([
    {
      token: 'Bearer xoxb-ship',
      body: {
        channel: 'C_docs',
        text: 'New Ship document: Launch brief',
        unfurl_links: false,
      },
    },
    {
      token: 'Bearer xoxb-ship',
      body: {
        channel: 'C_docs',
        text: 'Ship issue assigned: Follow up with grader',
        unfurl_links: false,
      },
    },
  ]);

  const invalid = await bridge.handleShipWebhook({
    teamId: 'T_ship',
    rawBody: JSON.stringify({ type: 'document.created' }),
    headers: { 'Ship-Signature': 't=1,v1=bad' },
  });
  expect(invalid).toMatchObject({ status: 400, body: { error: 'invalid_ship_signature' } });
});
