import crypto from 'node:crypto';
import { verifyWebhook } from '@ship/sdk';

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export class InMemoryIssuePrLinkStore {
  #links = new Map();

  set(issueId, pullRequest) {
    this.#links.set(issueId, pullRequest);
  }

  get(issueId) {
    return this.#links.get(issueId) ?? null;
  }
}

export class GitHubShipBridge {
  constructor({
    shipWebhookSecret,
    githubWebhookSecret,
    githubAppClient,
    shipClient,
    linkStore = new InMemoryIssuePrLinkStore(),
  }) {
    this.shipWebhookSecret = shipWebhookSecret;
    this.githubWebhookSecret = githubWebhookSecret;
    this.githubAppClient = githubAppClient;
    this.shipClient = shipClient;
    this.linkStore = linkStore;
  }

  verifyGitHubWebhook(headers, rawBody) {
    const header = headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256'];
    if (!header) return false;
    const expected = `sha256=${crypto.createHmac('sha256', this.githubWebhookSecret).update(rawBody).digest('hex')}`;
    return timingSafeEqualText(header, expected);
  }

  async handleGitHubPullRequestWebhook({ headers, rawBody }) {
    if (!this.verifyGitHubWebhook(headers, rawBody)) {
      return { status: 400, body: { ok: false, error: 'invalid_github_signature' } };
    }

    const payload = JSON.parse(rawBody);
    if (!['opened', 'edited', 'synchronize', 'reopened'].includes(payload.action)) {
      return { status: 204, body: null };
    }

    const issueId = this.extractIssueId(payload.pull_request);
    if (!issueId) {
      return { status: 202, body: { linked: false, reason: 'ship_issue_id_missing' } };
    }

    await this.shipClient.issues.get(issueId);
    const link = {
      issueId,
      repository: payload.repository.full_name,
      pullRequestNumber: payload.pull_request.number,
      pullRequestUrl: payload.pull_request.html_url,
    };
    this.linkStore.set(issueId, link);
    await this.githubAppClient.createComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.pull_request.number,
      body: `Linked to Ship issue ${issueId}.`,
    });
    return { status: 202, body: { linked: true, link } };
  }

  async handleShipIssueWebhook({ headers, rawBody }) {
    if (!verifyWebhook(headers, rawBody, this.shipWebhookSecret)) {
      return { status: 400, body: { ok: false, error: 'invalid_ship_signature' } };
    }

    const event = JSON.parse(rawBody);
    if (!['issue.created', 'issue.assigned'].includes(event.type)) {
      return { status: 204, body: null };
    }

    const issue = event.data?.issue ?? event.data?.document;
    const link = this.linkStore.get(issue?.id);
    if (!link) {
      return { status: 202, body: { linked: false, reason: 'pull_request_missing' } };
    }

    await this.githubAppClient.createComment({
      owner: link.repository.split('/')[0],
      repo: link.repository.split('/')[1],
      issue_number: link.pullRequestNumber,
      body: `Ship issue updated: ${issue.title ?? issue.id}.`,
    });
    return { status: 202, body: { linked: true, link } };
  }

  extractIssueId(pullRequest) {
    const text = `${pullRequest?.title ?? ''}\n${pullRequest?.body ?? ''}`;
    return text.match(/Ship-Issue:\s*([A-Za-z0-9_-]+)/i)?.[1] ?? null;
  }
}
