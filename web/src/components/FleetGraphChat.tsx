/**
 * FleetGraph chat panel — floating UI embedded across Ship's routes.
 *
 * Per the PRD: "chat interface must be embedded in context and scoped to
 * what the user is looking at. A chat window on an issue should know about
 * that issue. A chat window on a sprint should know about that sprint."
 *
 * Reads scope from the URL — when the user is on /documents/:id, that id
 * becomes the scopeId. The agent's reasoner then traverses Ship's document
 * graph around that scope to answer questions or surface findings.
 *
 * Floating button → expands into a chat panel. Doesn't redesign Ship's
 * 4-panel layout; sits on top of it.
 */

import { useState, useRef, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { apiGet, apiPatch, apiPost } from '../lib/api';

interface ChatMessage {
  role: 'user' | 'agent';
  text: string;
  citations?: string[];
  pendingActions?: AgentAction[];
  threadId?: string;
}

interface AgentAction {
  type: string;
  description: string;
  targetUserId?: string;
}

interface AgentChatResponse {
  ok: true;
  threadId: string;
  output?: {
    kind: 'chat' | 'notification';
    text: string;
    citations: string[];
  };
  pendingInterrupt?: {
    actions: AgentAction[];
    findingAnswer: string;
  };
  intent?: { kind: string; confidence: string };
  elapsed_ms: number;
}

interface AgentScanResponse {
  ok: true;
  threadId: string;
  output?: {
    kind: 'chat' | 'notification';
    text: string;
    citations: string[];
  };
  reasoning?: {
    confidence: 'high' | 'medium' | 'low';
    findingHash: string;
    citations: string[];
    suggestedActions: AgentAction[];
  };
  elapsed_ms: number;
}

interface FleetGraphFinding {
  id: string;
  scope_id: string;
  scope_type: string;
  title: string;
  body: string;
  confidence: 'high' | 'medium' | 'low';
  status: 'open' | 'dismissed' | 'snoozed' | 'resolved';
  last_seen_at: string;
}

export interface FleetGraphScope {
  scopeType: 'issue' | 'sprint' | 'program' | 'project' | 'person' | 'workspace';
  scopeId: string;
}

function useCurrentScope(): FleetGraphScope | null {
  const { id } = useParams<{ id?: string }>();
  const location = useLocation();

  if (!id) return null;

  // /documents/:id, /issues/:id, /sprints/:id, /projects/:id all route through
  // the unified document page. The doc id is the scope id; we'd need a fetch
  // to learn the document_type, but for the agent's intent classifier any
  // scope type works as a starting hint. Default to 'issue' since most data
  // is issues; the reasoner figures out the actual type from the fetched doc.
  let scopeType: FleetGraphScope['scopeType'] = 'issue';
  if (location.pathname.startsWith('/sprints')) scopeType = 'sprint';
  else if (location.pathname.startsWith('/projects')) scopeType = 'project';
  else if (location.pathname.startsWith('/programs')) scopeType = 'program';
  else if (location.pathname.startsWith('/persons') || location.pathname.startsWith('/team')) scopeType = 'person';

  return { scopeType, scopeId: id };
}

interface FleetGraphChatProps {
  scopeOverride?: FleetGraphScope | null;
}

export function FleetGraphChat({ scopeOverride }: FleetGraphChatProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [findings, setFindings] = useState<FleetGraphFinding[]>([]);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>();
  const routeScope = useCurrentScope();
  const scope = scopeOverride ?? routeScope;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset conversation when scope changes
  useEffect(() => {
    setMessages([]);
    setCurrentThreadId(undefined);
    setFindings([]);
  }, [scope?.scopeId]);

  useEffect(() => {
    if (!open || !scope) return;
    void loadFindings();
  }, [open, scope?.scopeId]);

  if (!scope) {
    // Don't render outside scope-bearing routes (the user isn't looking at
    // a specific document). Could be a Dashboard, My-Week aggregate, etc.
    // The PRD wants context-scoped chat, not standalone.
    return null;
  }

  async function sendMessage(): Promise<void> {
    if (!input.trim() || loading || !scope) return;

    const userMsg: ChatMessage = { role: 'user', text: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await apiPost('/api/fleetgraph/chat', {
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        userMessage: userMsg.text,
        threadId: currentThreadId,
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setMessages((m) => [
          ...m,
          {
            role: 'agent',
            text: `Error: ${errBody?.error?.message ?? response.statusText}`,
          },
        ]);
        return;
      }

      const data = (await response.json()) as AgentChatResponse;
      setCurrentThreadId(data.threadId);

      if (data.pendingInterrupt) {
        setMessages((m) => [
          ...m,
          {
            role: 'agent',
            text: data.pendingInterrupt!.findingAnswer,
            pendingActions: data.pendingInterrupt!.actions,
            threadId: data.threadId,
          },
        ]);
      } else if (data.output) {
        setMessages((m) => [
          ...m,
          {
            role: 'agent',
            text: data.output!.text,
            citations: data.output!.citations,
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          { role: 'agent', text: '(no response)' },
        ]);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'agent', text: `Network error: ${(err as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function loadFindings(): Promise<void> {
    if (!scope) return;
    setFindingsLoading(true);
    try {
      const response = await apiGet('/api/fleetgraph/findings?status=open');
      if (!response.ok) return;
      const data = (await response.json()) as { findings: FleetGraphFinding[] };
      setFindings(data.findings.filter((finding) => finding.scope_id === scope.scopeId).slice(0, 3));
    } finally {
      setFindingsLoading(false);
    }
  }

  async function runScan(): Promise<void> {
    if (!scope || scanning) return;
    setScanning(true);
    try {
      const response = await apiPost('/api/fleetgraph/scan', {
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setMessages((m) => [
          ...m,
          {
            role: 'agent',
            text: `Scan error: ${errBody?.error?.message ?? response.statusText}`,
          },
        ]);
        return;
      }

      const data = (await response.json()) as AgentScanResponse;
      setCurrentThreadId(data.threadId);
      setMessages((m) => [
        ...m,
        {
          role: 'agent',
          text: data.output?.text ?? 'Scan complete. No response text was produced.',
          citations: data.output?.citations,
        },
      ]);
      await loadFindings();
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'agent', text: `Scan network error: ${(err as Error).message}` },
      ]);
    } finally {
      setScanning(false);
    }
  }

  async function updateFindingStatus(
    findingId: string,
    status: 'dismissed' | 'resolved',
  ): Promise<void> {
    const response = await apiPatch(`/api/fleetgraph/findings/${findingId}`, { status });
    if (response.ok) {
      setFindings((current) => current.filter((finding) => finding.id !== findingId));
    }
  }

  async function handleApproval(
    threadId: string,
    decision: 'approved' | 'dismissed' | 'snoozed',
  ): Promise<void> {
    setLoading(true);
    try {
      const response = await apiPost('/api/fleetgraph/resume', {
        threadId,
        decision,
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setMessages((m) => [
          ...m,
          { role: 'agent', text: `Resume error: ${errBody?.error?.message ?? response.statusText}` },
        ]);
        return;
      }

      const data = (await response.json()) as { ok: boolean; output?: { text: string; citations: string[] } };
      setMessages((m) => {
        // Remove pendingActions from the last agent message; append a confirmation
        const last = m[m.length - 1];
        const cleared = last && last.role === 'agent' ? [...m.slice(0, -1), { ...last, pendingActions: undefined }] : m;
        return [
          ...cleared,
          {
            role: 'agent',
            text:
              decision === 'approved'
                ? `✓ Approved. ${data.output?.text ?? ''}`
                : decision === 'dismissed'
                  ? '⊘ Dismissed. Won\'t surface this again for a while.'
                  : '⏸ Snoozed.',
          },
        ];
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating action button — sits above the TanStack Query DevTools
          button which also lives in the bottom-right corner. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          aria-label="Open FleetGraph chat"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex h-[600px] w-96 flex-col rounded-lg border border-gray-200 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-lg border-b border-gray-200 bg-indigo-600 px-4 py-3 text-white">
            <div>
              <div className="text-sm font-semibold">FleetGraph</div>
              <div className="text-xs text-indigo-100">
                {scope.scopeType}: {scope.scopeId.slice(0, 8)}...
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void runScan()}
                disabled={scanning}
                className="rounded px-2 py-1 text-xs font-medium text-indigo-100 hover:bg-indigo-700 hover:text-white disabled:opacity-50"
                aria-label="Run FleetGraph scan"
              >
                {scanning ? 'Scanning...' : 'Scan'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-indigo-100 hover:bg-indigo-700 hover:text-white"
                aria-label="Close chat"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-4 py-4">
                {findings.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase text-gray-500">
                      Proactive findings
                    </div>
                    {findings.map((finding) => (
                      <div key={finding.id} className="rounded border border-amber-200 bg-amber-50 p-3 text-left">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-amber-950">{finding.title}</div>
                            <div className="mt-1 line-clamp-3 text-xs text-amber-900">{finding.body}</div>
                          </div>
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            {finding.confidence}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void updateFindingStatus(finding.id, 'resolved')}
                            className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateFindingStatus(finding.id, 'dismissed')}
                            className="rounded bg-gray-500 px-2 py-1 text-xs font-medium text-white hover:bg-gray-600"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-sm text-gray-500 text-center py-4">
                  Ask about this {scope.scopeType}. The agent traverses the document graph
                  to answer questions that span multiple docs.
                  <div className="mt-3 text-xs text-gray-400">
                    {findingsLoading ? 'Checking for proactive findings...' : 'Try: "What\'s slipping?" · "Who\'s overloaded?" · "Is this blocking anything?"'}
                  </div>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500">
                      Cites: {msg.citations.slice(0, 3).map((c) => c.slice(0, 8)).join(', ')}
                      {msg.citations.length > 3 && ` +${msg.citations.length - 3}`}
                    </div>
                  )}
                  {msg.pendingActions && msg.pendingActions.length > 0 && msg.threadId && (
                    <div className="mt-3 border-t border-gray-300 pt-3 space-y-2">
                      <div className="text-xs font-semibold text-gray-700">
                        Proposed actions ({msg.pendingActions.length}):
                      </div>
                      <ul className="text-xs space-y-1 list-disc list-inside text-gray-700">
                        {msg.pendingActions.map((a, j) => (
                          <li key={j}>
                            <span className="font-mono text-indigo-700">{a.type}</span>{' '}
                            — {a.description}
                          </li>
                        ))}
                      </ul>
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => handleApproval(msg.threadId!, 'approved')}
                          disabled={loading}
                          className="flex-1 rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproval(msg.threadId!, 'dismissed')}
                          disabled={loading}
                          className="flex-1 rounded bg-gray-500 px-2 py-1 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproval(msg.threadId!, 'snoozed')}
                          disabled={loading}
                          className="flex-1 rounded bg-yellow-500 px-2 py-1 text-xs font-medium text-white hover:bg-yellow-600 disabled:opacity-50"
                        >
                          Snooze
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500">
                  <span className="inline-block animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="border-t border-gray-200 p-3"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask about this ${scope.scopeType}...`}
                disabled={loading}
                className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
