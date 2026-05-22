# ShipShape — Discoveries

Three patterns I picked up reading the Ship codebase that I expect to carry into future projects. Each one was a surprise to me — either because I'd seen the problem before and would have reached for a heavier solution, or because I'd never thought to put a safety net at the layer Ship put it at.

---

## 1. Enforce tree invariants in the database, not the application

**What it is**

A PL/pgSQL `BEFORE INSERT OR UPDATE` trigger on `documents` that refuses to let `parent_id` create a cycle. The walk is depth-bounded by an explicit constant (`max_depth := 100`) so a corrupt graph can't hang the database — if depth ever hits 100, the trigger raises rather than loops.

**Where**

[api/src/db/schema.sql:165-197](api/src/db/schema.sql#L165-L197), with the trigger registration at lines 193-197 and a migration that re-creates it on existing deployments at [api/src/db/migrations/025_prevent_circular_parent.sql](api/src/db/migrations/025_prevent_circular_parent.sql).

```sql
CREATE OR REPLACE FUNCTION prevent_circular_parent()
RETURNS TRIGGER AS $$
DECLARE
  current_parent UUID;
  depth INT := 0;
  max_depth INT := 100;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.parent_id IS NOT DISTINCT FROM NEW.parent_id THEN
    RETURN NEW;
  END IF;
  current_parent := NEW.parent_id;
  WHILE current_parent IS NOT NULL AND depth < max_depth LOOP
    IF current_parent = NEW.id THEN
      RAISE EXCEPTION 'Circular reference detected: document % cannot be a descendant of itself', NEW.id;
    END IF;
    SELECT parent_id INTO current_parent FROM documents WHERE id = current_parent;
    depth := depth + 1;
  END LOOP;
  IF depth >= max_depth THEN
    RAISE EXCEPTION 'Maximum nesting depth (%) exceeded while checking for circular reference', max_depth;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Why it matters**

In every previous codebase I'd seen handle a hierarchical model — comments threading, folder trees, issue parent-child — the cycle check lived in the application layer. Three problems with that:

1. **A second writer bypasses it.** Direct psql access, a one-off migration script, a future ORM-less route handler — all routes around the JS guard. The Ship trigger means literally any path that sets `parent_id` gets the same enforcement.
2. **The check is incidental, not contractual.** A new engineer reading the schema has no signal that "rows have a tree invariant" — they have to read every writer. The trigger lives next to the column it constrains.
3. **App-level checks usually skip the depth cap.** I've debugged Node processes that hung walking a corrupt tree because the cycle check was `while (parent !== null) parent = parent.parent`. Ship's `max_depth INT := 100` is the kind of safety net that doesn't matter 99.99% of the time and catastrophically matters the other 0.01%.

**How I'd apply this**

Any time I have a column whose values implicitly form a graph (parent_id, reports_to, depends_on, …), I'll reach for a `BEFORE INSERT OR UPDATE` trigger first now, not last. The pattern generalises:

- For "no cycles" — Ship's depth-bounded walk.
- For "graph stays acyclic AND single-rooted" — add a check that exactly one row has `parent_id IS NULL`.
- For "max depth ≤ N" — pull the depth-counting logic out into its own trigger that fires when the depth exceeds a configured ceiling.

The cost is one `CREATE OR REPLACE FUNCTION` + one `CREATE TRIGGER` — about 30 lines including the corner cases. Cheap insurance.

---

## 2. Make CSRF protection auth-scheme-aware via one middleware

**What it is**

A single Express middleware that decides at request time whether to enforce CSRF. If the request carries `Authorization: Bearer <token>`, CSRF is skipped — Bearer tokens are never auto-attached by browsers, so the CSRF threat model doesn't apply. Otherwise, the normal `csrf-sync` protection runs.

**Where**

[api/src/app.ts:51-61](api/src/app.ts#L51-L61):

```ts
const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,
});

const conditionalCsrf = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();  // API token — CSRF doesn't apply
  }
  return csrfSynchronisedProtection(req, res, next);
};
```

Then every CSRF-protected router is mounted as `app.use('/api/x', conditionalCsrf, xRoutes)`. The decision is per-request, not per-route — so a route doesn't have to know whether its caller is a browser or an automation client.

**Why it matters**

Before this, the only patterns I'd seen for "browser sessions plus machine tokens" were:

- **Two separate route trees.** `/api/v1/*` for cookie auth, `/api/v1/automation/*` for tokens. Each route duplicated under each tree. Drift between the two became a permanent maintenance cost.
- **Disable CSRF entirely.** "Just use SameSite cookies." Works until someone introduces a cross-origin embed or someone exfiltrates a CSRF token via XSS.
- **Set a header opt-out on browser routes too.** Browser clients send `X-CSRF-Skip: true` along with the token. Defeats the purpose.

Ship's pattern is the simplest correct one: the CSRF threat model only applies to credentials a browser will auto-attach (cookies, basic auth, NTLM). Bearer tokens require explicit client cooperation to send, so a malicious page can't replay them. **The CSRF guard's relevance is determined by the auth scheme, not the route**, so the decision belongs on the auth scheme.

**How I'd apply this**

Any application I build that exposes both a browser frontend and machine-to-machine APIs:

- Routes get one middleware mount, not two. `conditionalCsrf` does the per-request branching.
- Bearer-token authentication needs no separate route tree.
- The pattern extends to other browser-only protections: `Origin`/`Referer` checks, double-submit cookies, etc. Anything whose threat model is "browser auto-attaches credentials" should be conditional on auth scheme.

Bonus: this composes well with rate limiting. Cookie sessions get one rate-limit budget, API tokens get another — the same conditional pattern applies.

---

## 3. Encode AI provenance at the schema layer, not in opaque metadata

**What it is**

The `document_history` table has an `automated_by TEXT` column alongside the usual `changed_by` (user ID), `field`, `old_value`, `new_value`. Human edits set `changed_by` to a real user; Claude Code-driven edits leave that null and set `automated_by = 'claude'`. The history view filters on it; the dashboard distinguishes them visually; future automations (a cron, a workflow tool) get their own discriminator.

**Where**

Schema: [api/src/db/schema.sql:225-234](api/src/db/schema.sql#L225-L234). Migration that added it to existing deployments: [api/src/db/migrations/016_document_history_automated_by.sql](api/src/db/migrations/016_document_history_automated_by.sql).

```sql
CREATE TABLE IF NOT EXISTS document_history (
  id SERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES users(id),
  automated_by TEXT,  -- Identifies automated change source (e.g., "claude")
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The Claude Code metadata also leaks into per-issue properties via `properties.claude_metadata.updated_by: 'claude'`, with telemetry (iterations, type-check failures, time elapsed) stored alongside (see [shared/src/types/document.ts](shared/src/types/document.ts) `ClaudeMetadata` interface, and [docs/application-architecture.md](docs/application-architecture.md) under "Claude Code Integration"). But the history-level signal is the load-bearing one — it lets you ask "which changes were made by humans?" with a SQL `WHERE`, not a regex over JSONB.

**Why it matters**

I've seen plenty of apps that integrate an LLM or an automation tool. The integrations I'd seen up to now treated provenance as a UI concern: a "robot" icon next to the change, with the actual origin buried in event-log metadata. That's fine until someone asks the question the audit/compliance team actually wants answered — "Which of these decisions were made by a person and which by software?" — and you find yourself JOIN-grepping through opaque event payloads.

Ship's choice is to give automated provenance a first-class column. The query is `WHERE automated_by = 'claude'`. You can index it. You can foreign-key to a registry of automations. You can build a UI filter without re-deriving "is this AI" from a bag of metadata.

The forward-looking part: `automated_by TEXT` (free-form string), not `automated_by BOOL`. Anyone integrating a second AI tool — a different code agent, an editor copilot, a workflow automation — gets a slot for free. **The schema admits there will be more than one automation source.**

**How I'd apply this**

In any app that mixes human and machine writers — which, in 2026, is most new apps — I'll add an `automated_by` (or `agent_id`, or `produced_by`) field to the table that captures who-did-what, separate from the user FK. Not as a join to an "automations" table that may or may not get built; just a free-form string. The cost is one column; the benefit is that auditability, billing, and UX filtering all have somewhere to attach.

The corollary is to **resist** the temptation to put this in a JSONB metadata blob. JSONB is for properties that vary per-row; provenance is a property that asks the same question of every row, and it deserves a column.

---

## 4. Bridge REST writers and CRDT writers with a one-shot conversion + client cache-bust signal

**What it is**

Ship has two ways content gets written: the REST endpoints (`POST /api/documents` sets `content` as TipTap JSON directly) and the WebSocket collaboration server (Yjs operations apply to a `Y.Doc` and serialize to `yjs_state` blob). These produce different bytes for the same document. When a client opens a doc whose content was last written via REST, the server has to (a) detect it, (b) convert JSON → Yjs once, (c) tell the *client* to throw away its IndexedDB cache before sync — otherwise the client's stale Yjs state would merge with the freshly converted server state and overwrite the REST changes.

**Where**

[api/src/collaboration/index.ts:191-279](api/src/collaboration/index.ts#L191-L279). The pattern is three coordinated pieces:

```ts
// 1. Module-level set tracks which docs need a cache-clear on next connect.
const freshFromJsonDocs = new Set<string>();

async function getOrCreateDoc(docName: string): Promise<Y.Doc> {
  // ...
  if (result.rows[0]?.yjs_state) {
    // Preferred path: Yjs state was already persisted; just load.
    Y.applyUpdate(doc, result.rows[0].yjs_state);
  } else if (result.rows[0]?.content) {
    // Fallback: a REST write was the last writer. Convert JSON → Yjs ONCE.
    jsonToYjs(doc, fragment, jsonContent);
    freshFromJsonDocs.add(docName);          // ← mark for cache-clear signal
    schedulePersist(docName, doc);           // ← write back as yjs_state
  }
}
```

```ts
// 2. When a client connects, if this doc was just converted, send a synthetic
//    `messageClearCache` frame BEFORE the normal sync handshake.
if (freshFromJsonDocs.has(docName)) {
  const clearCacheEncoder = encoding.createEncoder();
  encoding.writeVarUint(clearCacheEncoder, messageClearCache);  // varuint = 3
  ws.send(encoding.toUint8Array(clearCacheEncoder));
  freshFromJsonDocs.delete(docName);  // ← one-shot: next connection doesn't need it
}
```

The client side ([web/src/components/.../useCollaboration](web/src/components/Editor.tsx) consumes `messageClearCache=3` and calls `indexedDB.deleteDatabase(<doc-name>)` before letting Yjs's sync protocol run.

**Why it matters**

This is the bug that every "we'll add CRDT collab later" project hits eventually:

1. **You can't just convert JSON → Yjs on every read.** That throws away every collaboration session in progress (clients hold their own Yjs state and would diff against a freshly-minted server state with new opIDs).
2. **You can't just convert once and forget.** Clients that previously edited this doc still have the *pre-conversion* Yjs state in IndexedDB. When they reconnect, Yjs's sync protocol will helpfully merge their stale ops into the freshly converted server doc — and the user's REST edit silently reverts to what was there before.
3. **You can't trust the client to know it's stale.** The client doesn't have visibility into what wrote the database last; only the server does.

Ship solves it by inventing a custom Yjs message type (`messageClearCache = 3`, sitting alongside the protocol's standard `messageSync = 0` and `messageAwareness = 1`) and burning it once per stale doc. The `Set<string>` is the minimum state needed. The `one-shot` semantic (delete after send) means a doc that's been opened once doesn't need the signal again — subsequent clients sync against the now-canonical `yjs_state`.

**How I'd apply this**

Three reusable parts:

- **Source-of-truth rotation.** Any system where multiple writers produce different on-disk encodings of the same logical content (e.g. JSON store + columnar analytics store, or REST + CRDT) needs an explicit "the canonical writer just changed; downstream caches are stale" signal. Ship's signal is server → client; the same pattern works server → analytics, or primary → replica.
- **Inventing a protocol message vs. piggybacking on existing ones.** I would have been tempted to use a 4xx WebSocket close code to force the client to reconnect and resync. Ship's choice — a new Yjs message type at the application layer — is better: the client *stays connected*, the cache clears, the existing reconnection logic doesn't get involved, the close-code namespace stays clean for actual errors.
- **One-shot state with explicit deletion.** `freshFromJsonDocs.add()` + `freshFromJsonDocs.delete()` is a deliberately ephemeral signal — not stored in the DB, not replayed across server restarts. The cost of "lost signal on restart" is acceptable: the next client gets `yjs_state` (which exists because `schedulePersist` ran), and the bridge from JSON has already been crossed once. I'd reach for this `Set<string>` pattern for any signal whose value is "fix the next consumer; no need to remember after that."

---

## Honorable mentions (didn't pick, but worth keeping)

These three are also new to me; I just couldn't fit them under the format above. Stashing them so I don't forget:

- **CloudFront `Via`-header rewrite of `x-forwarded-proto`** ([api/src/app.ts:99-107](api/src/app.ts#L99-L107)) — CloudFront-to-EB hops over HTTP even when the viewer is HTTPS, so the API sees `X-Forwarded-Proto: http` and would issue insecure cookies. Detect the CloudFront `Via` header, override the proto to https. A one-paragraph file for "things that bit a previous engineer; don't touch."
- **Per-worker testcontainers + `vite preview` (not `vite dev`) for E2E** ([playwright.config.ts:9-18](playwright.config.ts#L9-L18) + [e2e/fixtures/isolated-env.ts:7-13](e2e/fixtures/isolated-env.ts#L7-L13)) — the docstring preserves the 90 GB-OOM war story that justifies the choice. Lesson: write the reason for a "weird" choice in a place where the next engineer's "let me just clean this up" instinct will find it.
- **`@asteasolutions/zod-to-openapi`** — one zod schema feeds both runtime validation AND the published OpenAPI spec. I've kept those in sync by hand in too many projects; learning that one tool does both was a "why didn't I look for this two years ago" moment.
