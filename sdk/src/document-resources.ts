import type { Transport } from './documents.js';
import type { CreateIssueInput, CreateSprintInput, Page, ShipIssue, ShipSprint } from './types.js';

export class IssuesClient {
  constructor(private readonly transport: Transport) {}

  list(params: { limit?: number; cursor?: string } = {}): Promise<Page<ShipIssue>> {
    const search = new URLSearchParams();
    if (params.limit) search.set('limit', String(params.limit));
    if (params.cursor) search.set('cursor', params.cursor);
    const query = search.toString();
    return this.transport.request<Page<ShipIssue>>(`/issues${query ? `?${query}` : ''}`);
  }

  async *iterate(params: { limit?: number } = {}): AsyncIterable<ShipIssue> {
    let cursor: string | undefined;
    do {
      const page = await this.list({ ...params, cursor });
      for (const issue of page.data) {
        yield issue;
      }
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
  }

  get(id: string): Promise<{ data: ShipIssue }> {
    return this.transport.request<{ data: ShipIssue }>(`/issues/${encodeURIComponent(id)}`);
  }

  create(input: CreateIssueInput): Promise<{ data: ShipIssue }> {
    return this.transport.request<{ data: ShipIssue }>('/issues', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}

export class SprintsClient {
  constructor(private readonly transport: Transport) {}

  list(params: { limit?: number; cursor?: string } = {}): Promise<Page<ShipSprint>> {
    const search = new URLSearchParams();
    if (params.limit) search.set('limit', String(params.limit));
    if (params.cursor) search.set('cursor', params.cursor);
    const query = search.toString();
    return this.transport.request<Page<ShipSprint>>(`/sprints${query ? `?${query}` : ''}`);
  }

  async *iterate(params: { limit?: number } = {}): AsyncIterable<ShipSprint> {
    let cursor: string | undefined;
    do {
      const page = await this.list({ ...params, cursor });
      for (const sprint of page.data) {
        yield sprint;
      }
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
  }

  get(id: string): Promise<{ data: ShipSprint }> {
    return this.transport.request<{ data: ShipSprint }>(`/sprints/${encodeURIComponent(id)}`);
  }

  create(input: CreateSprintInput): Promise<{ data: ShipSprint }> {
    return this.transport.request<{ data: ShipSprint }>('/sprints', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}
