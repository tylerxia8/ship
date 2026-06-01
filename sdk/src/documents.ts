import type { CreateDocumentInput, Page, ShipDocument } from './types.js';

export interface Transport {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export class DocumentsClient {
  constructor(private readonly transport: Transport) {}

  list(params: { limit?: number; cursor?: string; type?: string } = {}): Promise<Page<ShipDocument>> {
    const search = new URLSearchParams();
    if (params.limit) search.set('limit', String(params.limit));
    if (params.cursor) search.set('cursor', params.cursor);
    if (params.type) search.set('type', params.type);
    const query = search.toString();
    return this.transport.request<Page<ShipDocument>>(`/documents${query ? `?${query}` : ''}`);
  }

  async *iterate(params: { limit?: number; type?: string } = {}): AsyncIterable<ShipDocument> {
    let cursor: string | undefined;
    do {
      const page = await this.list({ ...params, cursor });
      for (const document of page.data) {
        yield document;
      }
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
  }

  get(id: string): Promise<{ data: ShipDocument }> {
    return this.transport.request<{ data: ShipDocument }>(`/documents/${encodeURIComponent(id)}`);
  }

  create(input: CreateDocumentInput): Promise<{ data: ShipDocument }> {
    return this.transport.request<{ data: ShipDocument }>('/documents', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}
