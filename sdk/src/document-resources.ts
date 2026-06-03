import { DocumentsClient } from './documents.js';
import type { CreateIssueInput, CreateSprintInput, Page, ShipIssue, ShipSprint } from './types.js';

export class IssuesClient {
  constructor(private readonly documents: DocumentsClient) {}

  list(params: { limit?: number; cursor?: string } = {}): Promise<Page<ShipIssue>> {
    return this.documents.list({ ...params, type: 'issue' }) as Promise<Page<ShipIssue>>;
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
    return this.documents.get(id) as Promise<{ data: ShipIssue }>;
  }

  create(input: CreateIssueInput): Promise<{ data: ShipIssue }> {
    return this.documents.create({ ...input, document_type: 'issue' }) as Promise<{ data: ShipIssue }>;
  }
}

export class SprintsClient {
  constructor(private readonly documents: DocumentsClient) {}

  list(params: { limit?: number; cursor?: string; type?: 'sprint' | 'weekly_plan' | 'weekly_retro' } = {}): Promise<Page<ShipSprint>> {
    return this.documents.list({ ...params, type: params.type ?? 'sprint' }) as Promise<Page<ShipSprint>>;
  }

  async *iterate(params: { limit?: number; type?: 'sprint' | 'weekly_plan' | 'weekly_retro' } = {}): AsyncIterable<ShipSprint> {
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
    return this.documents.get(id) as Promise<{ data: ShipSprint }>;
  }

  create(input: CreateSprintInput): Promise<{ data: ShipSprint }> {
    return this.documents.create({ ...input, document_type: input.document_type ?? 'sprint' }) as Promise<{ data: ShipSprint }>;
  }
}
