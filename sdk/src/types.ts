export interface ShipClientOptions {
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface ShipUser {
  id: string;
  email: string;
  name: string;
}

export interface ShipWorkspace {
  id: string;
  name: string;
}

export interface ShipMe {
  user: ShipUser | null;
  workspace: ShipWorkspace | null;
  app: {
    client_id: string;
    scopes: string[];
  };
}

export interface ShipDocument {
  id: string;
  workspace_id: string;
  document_type: string;
  title: string;
  content?: unknown;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

export interface CreateDocumentInput {
  title?: string;
  document_type?: 'wiki' | 'issue' | 'program' | 'project' | 'sprint' | 'person' | 'weekly_plan' | 'weekly_retro';
  content?: unknown;
  properties?: Record<string, unknown>;
}
