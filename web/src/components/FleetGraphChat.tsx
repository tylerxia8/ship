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

interface AgentErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
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

const scopeLabels: Record<FleetGraphScope['scopeType'], string> = {
  issue: 'issue',
  sprint: 'sprint',
  program: 'program',
  project: 'project',
  person: 'team member',
  workspace: 'workspace',
};

const actionLabels: Record<string, string> = {
  notify_user: 'Notify someone',
  change_state: 'Update status',
  reassign: 'Reassign work',
  comment: 'Add a comment',
  descope: 'Move work out of scope',
};

const confidenceLabels: Record<FleetGraphFinding['confidence'], string> = {
  high: 'Strong signal',
  medium: 'Worth review',
  low: 'Early signal',
};

const MAX_ASSISTANT_MESSAGE_CHARS = 4_000;

function friendlyScope(scope: FleetGraphScope): string {
  return scopeLabels[scope.scopeType] ?? 'item';
}

function friendlyAction(type: string): string {
  return actionLabels[type] ?? type.replace(/_/g, ' ');
}

function assistantErrorMessage(
  errBody: AgentErrorBody | null,
  fallback: string,
  scopeLabel: string,
): string {
  switch (errBody?.error?.code) {
    case 'AGENT_TIMEOUT':
      return `The project assistant is taking longer than expected. Please try again in a minute, or use "Check page" later for this ${scopeLabel}.`;
    case 'AGENT_UNREACHABLE':
      return 'The project assistant service is temporarily unavailable. Your Ship data is still safe, and you can keep working here.';
    case 'VALIDATION_ERROR':
      return `I could not check this ${scopeLabel} because some page context was missing. Refresh the page and try again.`;
    default:
      return errBody?.error?.message
        ? `I could not check this ${scopeLabel} yet. ${errBody.error.message}`
        : fallback;
  }
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
  const panelRef = useRef<HTMLDivElement>(null);
  const scopeLabel = scope ? friendlyScope(scope) : 'item';

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

  useEffect(() => {
    if (!open) return;

    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

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
        const errBody = (await response.json().catch(() => null)) as AgentErrorBody | null;
        setMessages((m) => [
          ...m,
          {
            role: 'agent',
            text: assistantErrorMessage(
              errBody,
              `I could not check this ${scopeLabel} yet. ${response.statusText}`,
              scopeLabel,
            ),
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
        {
          role: 'agent',
          text: `I could not reach the project assistant. Please try again in a minute. ${(
            err as Error
          ).message}`,
        },
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
        const errBody = (await response.json().catch(() => null)) as AgentErrorBody | null;
        setMessages((m) => [
          ...m,
          {
            role: 'agent',
            text: assistantErrorMessage(
              errBody,
              `I could not check this ${scopeLabel} yet. ${response.statusText}`,
              scopeLabel,
            ),
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
          text: data.output?.text ?? 'I checked this page and did not find anything new to flag.',
          citations: data.output?.citations,
        },
      ]);
      await loadFindings();
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: 'agent',
          text: `I could not run the page check. Please try again in a minute. ${(err as Error).message}`,
        },
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
        const errBody = (await response.json().catch(() => null)) as AgentErrorBody | null;
        setMessages((m) => [
          ...m,
          {
            role: 'agent',
            text:
              errBody?.error?.code === 'AGENT_TIMEOUT'
                ? 'I could not record that choice because the assistant took too long to respond. Please try again.'
                : `I could not record that choice. ${errBody?.error?.message ?? response.statusText}`,
          },
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
            text: approvalMessage(decision, data.output?.text),
          },
        ];
      });
    } finally {
      setLoading(false);
    }
  }

  function approvalMessage(
    decision: 'approved' | 'dismissed' | 'snoozed',
    outputText?: string,
  ): string {
    if (decision === 'approved') {
      return `Approved. ${outputText ?? 'I recorded your approval.'}`;
    }
    if (decision === 'dismissed') {
      return 'Dismissed. I will keep this out of your way for now.';
    }
    return 'Snoozed. I will bring this back later.';
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
          aria-label="Open project assistant"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="project-assistant-title"
          aria-describedby="project-assistant-scope"
          tabIndex={-1}
          className="fixed bottom-20 right-6 z-50 flex h-[640px] w-[440px] max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-gray-200 bg-white shadow-xl focus:outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-lg border-b border-gray-200 bg-indigo-600 px-4 py-3 text-white">
            <div>
              <div id="project-assistant-title" className="text-sm font-semibold">Project Assistant</div>
              <div id="project-assistant-scope" className="text-xs text-indigo-100">
                Reviewing this {scopeLabel}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void runScan()}
                disabled={scanning}
                className="rounded px-2 py-1 text-xs font-medium text-indigo-100 hover:bg-indigo-700 hover:text-white disabled:opacity-50"
                aria-label="Check this page for project risks"
              >
                {scanning ? 'Checking...' : 'Check page'}
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
          <div className="flex-1 overflow-y-auto p-4 space-y-3" role="log" aria-live="polite" aria-relevant="additions">
            {messages.length === 0 && (
              <div className="space-y-4 py-4">
                {findings.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase text-gray-500">
                      Things to review
                    </div>
                    {findings.map((finding) => (
                      <div key={finding.id} className="rounded border border-amber-200 bg-amber-50 p-3 text-left">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-amber-950">{finding.title}</div>
                            <div className="mt-1 line-clamp-3 text-xs text-amber-900">{finding.body}</div>
                          </div>
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            {confidenceLabels[finding.confidence]}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void updateFindingStatus(finding.id, 'resolved')}
                            className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                          >
                            Mark resolved
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateFindingStatus(finding.id, 'dismissed')}
                            className="rounded bg-gray-500 px-2 py-1 text-xs font-medium text-white hover:bg-gray-600"
                          >
                            Not useful
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-sm text-gray-500 text-center py-4">
                  Ask about this {scopeLabel}. I can help spot risks, blockers, and next steps.
                  <div className="mt-3 text-xs text-gray-400">
                    {findingsLoading ? 'Checking for items that may need attention...' : 'Try: "What needs attention?" or "Who may need help?"'}
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
                      Sources checked: {msg.citations.slice(0, 3).map((c) => c.slice(0, 8)).join(', ')}
                      {msg.citations.length > 3 && ` +${msg.citations.length - 3}`}
                    </div>
                  )}
                  {msg.pendingActions && msg.pendingActions.length > 0 && msg.threadId && (
                    <div className="mt-3 border-t border-gray-300 pt-3 space-y-2">
                      <div className="text-xs font-semibold text-gray-700">
                        Suggested next steps ({msg.pendingActions.length}):
                      </div>
                      <ul className="text-xs space-y-1 list-disc list-inside text-gray-700">
                        {msg.pendingActions.map((a, j) => (
                          <li key={j}>
                            <span className="font-medium text-indigo-700">{friendlyAction(a.type)}</span>{' '}
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
                          Approve action
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproval(msg.threadId!, 'dismissed')}
                          disabled={loading}
                          className="flex-1 rounded bg-gray-500 px-2 py-1 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-50"
                        >
                          Not now
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproval(msg.threadId!, 'snoozed')}
                          disabled={loading}
                          className="flex-1 rounded bg-yellow-500 px-2 py-1 text-xs font-medium text-white hover:bg-yellow-600 disabled:opacity-50"
                        >
                          Remind later
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
                  <span className="inline-block animate-pulse">Checking the project details...</span>
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
                aria-label={`Ask the project assistant about this ${scopeLabel}`}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, MAX_ASSISTANT_MESSAGE_CHARS))}
                placeholder={`Ask about this ${scopeLabel}...`}
                maxLength={MAX_ASSISTANT_MESSAGE_CHARS}
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
