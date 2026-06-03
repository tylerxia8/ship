import { expect, test } from 'vitest';
import { GitHubShipBridge } from '../src/github.mjs';
import { signGitHubPayload, signShipPayload } from '../src/ship-signing.mjs';

test('GitHub integration links a Ship issue to a PR via GitHub App webhook', async () => {
  const comments = [];
  const shipClient = {
    issues: {
      async get(id) {
        expect(id).toBe('issue_123');
        return { data: { id, title: 'Fix OAuth callback' } };
      },
    },
  };
  const bridge = new GitHubShipBridge({
    shipWebhookSecret: 'whsec_github_ship',
    githubWebhookSecret: 'github_webhook_secret',
    shipClient,
    githubAppClient: {
      async createComment(input) {
        comments.push(input);
        return { id: comments.length };
      },
    },
  });

  const githubPayload = {
    action: 'opened',
    repository: {
      full_name: 'octo/ship-integration',
      name: 'ship-integration',
      owner: { login: 'octo' },
    },
    pull_request: {
      number: 42,
      title: 'Wire Ship issue',
      body: 'Ship-Issue: issue_123',
      html_url: 'https://github.com/octo/ship-integration/pull/42',
    },
  };
  const githubRawBody = JSON.stringify(githubPayload);
  const linked = await bridge.handleGitHubPullRequestWebhook({
    rawBody: githubRawBody,
    headers: { 'x-hub-signature-256': signGitHubPayload(githubRawBody, 'github_webhook_secret') },
  });

  expect(linked).toMatchObject({
    status: 202,
    body: {
      linked: true,
      link: {
        issueId: 'issue_123',
        repository: 'octo/ship-integration',
        pullRequestNumber: 42,
      },
    },
  });
  expect(comments[0]).toMatchObject({
    owner: 'octo',
    repo: 'ship-integration',
    issue_number: 42,
    body: 'Linked to Ship issue issue_123.',
  });

  const shipEvent = {
    type: 'issue.assigned',
    data: { issue: { id: 'issue_123', title: 'Fix OAuth callback' } },
  };
  const shipRawBody = JSON.stringify(shipEvent);
  const shipUpdate = await bridge.handleShipIssueWebhook({
    rawBody: shipRawBody,
    headers: { 'Ship-Signature': signShipPayload(shipRawBody, 'whsec_github_ship') },
  });

  expect(shipUpdate.status).toBe(202);
  expect(comments[1]).toMatchObject({
    owner: 'octo',
    repo: 'ship-integration',
    issue_number: 42,
    body: 'Ship issue updated: Fix OAuth callback.',
  });
});
