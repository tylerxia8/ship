# ShipShape Security Probe Report

- **Target API:** `http://localhost:3000`
- **Target Web:** `http://localhost:5173`
- **Scanned at:** 2026-05-22T00:50:42.185Z
- **Probe version:** 1.0.0

## Summary

| Severity | Count |
|---|---:|
| 🔴 critical | 0 |
| 🟠 high | 25 |
| 🟡 medium | 32 |
| ⚪ low | 11 |
| 🔵 info | 2 |
| 🟢 ok | 15 |

## deps

### 🟠 [minimatch] minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern

- **ID:** `deps-cve-1113461`
- **Severity:** high
- **CWE:** CWE-1333
- **CVE:** CVE-2026-26996

### Summary
`minimatch` is vulnerable to Regular Expression Denial of Service (ReDoS) when a glob pattern contains many consecutive `*` wildcards followed by a literal character that doesn't appear in the test string. Each `*` compiles to a separate `[^/]*?` regex group, and when the match fails, V8's regex engine backtracks exponentially across all possible splits.

The time complexity is O(4^N) where N is the number of `*` characters. With N=15, a single `minimatch()` call takes ~2 seconds. With N=34, it hangs effectively forever.


### Details
_Give all details on the vulnerability. Pointing to the incriminated source code is very helpful for the maintainer._

### PoC
When minimatch compiles a glob pattern, each `*` becomes `[^/]*?` in the generated regex. For a pattern like `***************X***`:

```
/^(?!\.)[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?X[^/]*?[^/]*?[^/]*?$/
```

When the test string doesn't contain `X`, the regex engine

**Evidence:**
```
{
  "module": "minimatch",
  "vulnerable_versions": ">=5.0.0 <5.1.7",
  "patched_versions": ">=5.1.7",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "    │   └── minimatch 9.0.5",
    "    │ └── minimatch 5.1.6",
    "          └── minimatch 9.0.5",
    "  │   └── minimatch 9.0.5",
    "  │ └── minimatch 5.1.6"
  ],
  "auditPathsField": [
    ".>testcontainers>archiver>readdir-glob>minimatch"
  ],
  "url": "https://github.com/advisories/GHSA-3ppc-4f35-3m26"
}
```

**Remediation:** Upgrade to version 5.1.7 or later

### 🟠 [minimatch] minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern

- **ID:** `deps-cve-1113465`
- **Severity:** high
- **CWE:** CWE-1333
- **CVE:** CVE-2026-26996

### Summary
`minimatch` is vulnerable to Regular Expression Denial of Service (ReDoS) when a glob pattern contains many consecutive `*` wildcards followed by a literal character that doesn't appear in the test string. Each `*` compiles to a separate `[^/]*?` regex group, and when the match fails, V8's regex engine backtracks exponentially across all possible splits.

The time complexity is O(4^N) where N is the number of `*` characters. With N=15, a single `minimatch()` call takes ~2 seconds. With N=34, it hangs effectively forever.


### Details
_Give all details on the vulnerability. Pointing to the incriminated source code is very helpful for the maintainer._

### PoC
When minimatch compiles a glob pattern, each `*` becomes `[^/]*?` in the generated regex. For a pattern like `***************X***`:

```
/^(?!\.)[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?[^/]*?X[^/]*?[^/]*?[^/]*?$/
```

When the test string doesn't contain `X`, the regex engine

**Evidence:**
```
{
  "module": "minimatch",
  "vulnerable_versions": ">=9.0.0 <9.0.6",
  "patched_versions": ">=9.0.6",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "    │   └── minimatch 9.0.5",
    "    │ └── minimatch 5.1.6",
    "          └── minimatch 9.0.5",
    "  │   └── minimatch 9.0.5",
    "  │ └── minimatch 5.1.6"
  ],
  "auditPathsField": [
    ".>testcontainers>archiver>archiver-utils>glob>minimatch"
  ],
  "url": "https://github.com/advisories/GHSA-3ppc-4f35-3m26"
}
```

**Remediation:** Upgrade to version 9.0.6 or later

### 🟠 [rollup] Rollup 4 has Arbitrary File Write via Path Traversal

- **ID:** `deps-cve-1113515`
- **Severity:** high
- **CWE:** CWE-22
- **CVE:** CVE-2026-27606

### Summary
The Rollup module bundler (specifically v4.x and present in current source) is vulnerable to an Arbitrary File Write via Path Traversal. Insecure file name sanitization in the core engine allows an attacker to control output filenames (e.g., via CLI named inputs, manual chunk aliases, or malicious plugins) and use traversal sequences (`../`) to overwrite files anywhere on the host filesystem that the build process has permissions for. This can lead to persistent Remote Code Execution (RCE) by overwriting critical system or user configuration files.

### Details
The vulnerability is caused by the combination of two flawed components in the Rollup core:

1.  **Improper Sanitization**: In `src/utils/sanitizeFileName.ts`, the `INVALID_CHAR_REGEX` used to clean user-provided names for chunks and assets excludes the period (`.`) and forward/backward slashes (`/`, `\`). 
    ```typescript
    // src/utils/sanitizeFileName.ts (Line 3)
    const INVALID_CHAR_REGEX = /[\u0000-\u001F"

**Evidence:**
```
{
  "module": "rollup",
  "vulnerable_versions": ">=4.0.0 <4.59.0",
  "patched_versions": ">=4.59.0",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "  │   └── rollup 4.55.1",
    "    └── rollup 4.55.1",
    "│   └── rollup 4.55.1",
    "  └── rollup 4.55.1",
    "  │   └── rollup 4.55.1"
  ],
  "auditPathsField": [
    "web>rollup-plugin-visualizer>rollup"
  ],
  "url": "https://github.com/advisories/GHSA-mw96-cpmx-2vgc"
}
```

**Remediation:** Upgrade to version 4.59.0 or later

### 🟠 [minimatch] minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments

- **ID:** `deps-cve-1113540`
- **Severity:** high
- **CWE:** CWE-407
- **CVE:** CVE-2026-27903

### Summary

`matchOne()` performs unbounded recursive backtracking when a glob pattern contains multiple non-adjacent `**` (GLOBSTAR) segments and the input path does not match. The time complexity is O(C(n, k)) -- binomial -- where `n` is the number of path segments and `k` is the number of globstars. With k=11 and n=30, a call to the default `minimatch()` API stalls for roughly 5 seconds. With k=13, it exceeds 15 seconds. No memoization or call budget exists to bound this behavior.

---

### Details

The vulnerable loop is in `matchOne()` at [`src/index.ts#L960`](https://github.com/isaacs/minimatch/blob/v10.2.2/src/index.ts#L960):

```typescript
while (fr < fl) {
  ..
  if (this.matchOne(file.slice(fr), pattern.slice(pr), partial)) {
    ..
    return true
  }
  ..
  fr++
}
```

When a GLOBSTAR is encountered, the function tries to match the remaining pattern against every suffix of the remaining file segments. Each `**` multiplies the number of recursive calls by the number of rema

**Evidence:**
```
{
  "module": "minimatch",
  "vulnerable_versions": ">=5.0.0 <5.1.8",
  "patched_versions": ">=5.1.8",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "    │   └── minimatch 9.0.5",
    "    │ └── minimatch 5.1.6",
    "          └── minimatch 9.0.5",
    "  │   └── minimatch 9.0.5",
    "  │ └── minimatch 5.1.6"
  ],
  "auditPathsField": [
    ".>testcontainers>archiver>readdir-glob>minimatch"
  ],
  "url": "https://github.com/advisories/GHSA-7r86-cg39-jmmj"
}
```

**Remediation:** Upgrade to version 5.1.8 or later

### 🟠 [minimatch] minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments

- **ID:** `deps-cve-1113544`
- **Severity:** high
- **CWE:** CWE-407
- **CVE:** CVE-2026-27903

### Summary

`matchOne()` performs unbounded recursive backtracking when a glob pattern contains multiple non-adjacent `**` (GLOBSTAR) segments and the input path does not match. The time complexity is O(C(n, k)) -- binomial -- where `n` is the number of path segments and `k` is the number of globstars. With k=11 and n=30, a call to the default `minimatch()` API stalls for roughly 5 seconds. With k=13, it exceeds 15 seconds. No memoization or call budget exists to bound this behavior.

---

### Details

The vulnerable loop is in `matchOne()` at [`src/index.ts#L960`](https://github.com/isaacs/minimatch/blob/v10.2.2/src/index.ts#L960):

```typescript
while (fr < fl) {
  ..
  if (this.matchOne(file.slice(fr), pattern.slice(pr), partial)) {
    ..
    return true
  }
  ..
  fr++
}
```

When a GLOBSTAR is encountered, the function tries to match the remaining pattern against every suffix of the remaining file segments. Each `**` multiplies the number of recursive calls by the number of rema

**Evidence:**
```
{
  "module": "minimatch",
  "vulnerable_versions": ">=9.0.0 <9.0.7",
  "patched_versions": ">=9.0.7",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "    │   └── minimatch 9.0.5",
    "    │ └── minimatch 5.1.6",
    "          └── minimatch 9.0.5",
    "  │   └── minimatch 9.0.5",
    "  │ └── minimatch 5.1.6"
  ],
  "auditPathsField": [
    ".>testcontainers>archiver>archiver-utils>glob>minimatch"
  ],
  "url": "https://github.com/advisories/GHSA-7r86-cg39-jmmj"
}
```

**Remediation:** Upgrade to version 9.0.7 or later

### 🟠 [minimatch] minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions

- **ID:** `deps-cve-1113548`
- **Severity:** high
- **CWE:** CWE-1333
- **CVE:** CVE-2026-27904

### Summary

Nested `*()` extglobs produce regexps with nested unbounded quantifiers (e.g. `(?:(?:a|b)*)*`), which exhibit catastrophic backtracking in V8. With a 12-byte pattern `*(*(*(a|b)))` and an 18-byte non-matching input, `minimatch()` stalls for over 7 seconds. Adding a single nesting level or a few input characters pushes this to minutes. This is the most severe finding: it is triggered by the default `minimatch()` API with no special options, and the minimum viable pattern is only 12 bytes. The same issue affects `+()` extglobs equally.

---

### Details

The root cause is in `AST.toRegExpSource()` at [`src/ast.ts#L598`](https://github.com/isaacs/minimatch/blob/v10.2.2/src/ast.ts#L598). For the `*` extglob type, the close token emitted is `)*` or `)?`, wrapping the recursive body in `(?:...)*`. When extglobs are nested, each level adds another `*` quantifier around the previous group:

```typescript
: this.type === '*' && bodyDotAllowed ? `)?`
: `)${this.type}`
```

This prod

**Evidence:**
```
{
  "module": "minimatch",
  "vulnerable_versions": ">=5.0.0 <5.1.8",
  "patched_versions": ">=5.1.8",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "    │   └── minimatch 9.0.5",
    "    │ └── minimatch 5.1.6",
    "          └── minimatch 9.0.5",
    "  │   └── minimatch 9.0.5",
    "  │ └── minimatch 5.1.6"
  ],
  "auditPathsField": [
    ".>testcontainers>archiver>readdir-glob>minimatch"
  ],
  "url": "https://github.com/advisories/GHSA-23c5-xmqv-rm74"
}
```

**Remediation:** Upgrade to version 5.1.8 or later

### 🟠 [minimatch] minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions

- **ID:** `deps-cve-1113552`
- **Severity:** high
- **CWE:** CWE-1333
- **CVE:** CVE-2026-27904

### Summary

Nested `*()` extglobs produce regexps with nested unbounded quantifiers (e.g. `(?:(?:a|b)*)*`), which exhibit catastrophic backtracking in V8. With a 12-byte pattern `*(*(*(a|b)))` and an 18-byte non-matching input, `minimatch()` stalls for over 7 seconds. Adding a single nesting level or a few input characters pushes this to minutes. This is the most severe finding: it is triggered by the default `minimatch()` API with no special options, and the minimum viable pattern is only 12 bytes. The same issue affects `+()` extglobs equally.

---

### Details

The root cause is in `AST.toRegExpSource()` at [`src/ast.ts#L598`](https://github.com/isaacs/minimatch/blob/v10.2.2/src/ast.ts#L598). For the `*` extglob type, the close token emitted is `)*` or `)?`, wrapping the recursive body in `(?:...)*`. When extglobs are nested, each level adds another `*` quantifier around the previous group:

```typescript
: this.type === '*' && bodyDotAllowed ? `)?`
: `)${this.type}`
```

This prod

**Evidence:**
```
{
  "module": "minimatch",
  "vulnerable_versions": ">=9.0.0 <9.0.7",
  "patched_versions": ">=9.0.7",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "    │   └── minimatch 9.0.5",
    "    │ └── minimatch 5.1.6",
    "          └── minimatch 9.0.5",
    "  │   └── minimatch 9.0.5",
    "  │ └── minimatch 5.1.6"
  ],
  "auditPathsField": [
    ".>testcontainers>archiver>archiver-utils>glob>minimatch"
  ],
  "url": "https://github.com/advisories/GHSA-23c5-xmqv-rm74"
}
```

**Remediation:** Upgrade to version 9.0.7 or later

### 🟠 [hono] Hono vulnerable to arbitrary file access via serveStatic vulnerability 

- **ID:** `deps-cve-1114006`
- **Severity:** high
- **CWE:** CWE-177
- **CVE:** CVE-2026-29045

## Summary

When using `serveStatic` together with route-based middleware protections (e.g. `app.use('/admin/*', ...)`), inconsistent URL decoding allowed protected static resources to be accessed without authorization.

The router used `decodeURI`, while `serveStatic` used `decodeURIComponent`. This mismatch allowed paths containing encoded slashes (`%2F`) to bypass middleware protections while still resolving to the intended filesystem path.


## Details

The routing layer preserved `%2F` as a literal string, while `serveStatic` decoded it into `/` before resolving the file path.

Example:

Request: `/admin%2Fsecret.html`

- Router sees: `/admin%2Fsecret.html` → does not match `/admin/*`
- Static handler resolves: `/admin/secret.html`

As a result, static files under the configured static root could be served without triggering route-based protections.

This only affects applications that both:

- Protect subpaths using route-based middleware, and
- Serve files from the same static r

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.4",
  "patched_versions": ">=4.12.4",
  "consumingWorkspace": "@ship/api",
  "dependencyChains": [
    "├─┬ @hono/node-server 1.19.9",
    "│ └── hono 4.11.7 peer",
    "└── hono 4.11.7"
  ],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-q5qw-h33p-qvwr"
}
```

**Remediation:** Upgrade to version 4.12.4 or later

### 🟠 [svgo] SVGO DoS through entity expansion in DOCTYPE (Billion Laughs)

- **ID:** `deps-cve-1114151`
- **Severity:** high
- **CWE:** CWE-776
- **CVE:** CVE-2026-29074

### Summary

SVGO accepts XML with custom entities, without guards against entity expansion or recursion. This can result in a small XML file (811 bytes) stalling the application and even crashing the Node.js process with `JavaScript heap out of memory`.

### Details

The upstream XML parser ([sax](https://www.npmjs.com/package/sax)) doesn't interpret custom XML entities by default. We pattern matched custom XML entities from the `DOCTYPE`, inserting them into `parser.ENTITIES`, and enabled `unparsedEntities`. This gives us the desired behavior of supporting SVGs with entities declared in the `DOCTYPE`.

However, entities can reference other entities, which can enable small SVGs to explode exponentially when we try to parse them.

#### Proof of Concept

```js
import { optimize } from 'svgo';

/** Presume that this string was obtained in some other way, such as network. */
const original = `
  <?xml version="1.0"?>
  <!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ELEMENT lolz (#PCDATA)>
  <

**Evidence:**
```
{
  "module": "svgo",
  "vulnerable_versions": ">=3.0.0 <3.3.3",
  "patched_versions": ">=3.3.3",
  "consumingWorkspace": "@ship/web",
  "dependencyChains": [
    "└── svgo 3.3.2"
  ],
  "auditPathsField": [
    "web>@svgr/plugin-svgo>svgo"
  ],
  "url": "https://github.com/advisories/GHSA-xpqw-6gx7-v673"
}
```

**Remediation:** Upgrade to version 3.3.3 or later

### 🟠 [@hono/node-server] @hono/node-server has authorization bypass for protected static paths via encoded slashes in Serve Static Middleware

- **ID:** `deps-cve-1114170`
- **Severity:** high
- **CWE:** CWE-863
- **CVE:** CVE-2026-29087

## Summary

When using @hono/node-server's static file serving together with route-based middleware protections (e.g. protecting `/admin/*`), inconsistent URL decoding can allow protected static resources to be accessed without authorization.

In particular, paths containing encoded slashes (`%2F`) may be evaluated differently by routing/middleware matching versus static file path resolution, enabling a bypass where middleware does not run but the static file is still served.

## Details

The routing layer and the node-server static handler normalize request paths differently. The router preserves `%2F` as a literal string when matching routes, while the static handler decodes `%2F` into `/` before resolving the filesystem path.

Example request:

- `/admin%2Fsecret.html`

This may:
- fail to match middleware intended for `/admin/*`, but
- still be resolved by the static handler as `/admin/secret.html` under the configured static root.

This does not allow access outside the configured

**Evidence:**
```
{
  "module": "@hono/node-server",
  "vulnerable_versions": "<1.19.10",
  "patched_versions": ">=1.19.10",
  "consumingWorkspace": "@ship/api",
  "dependencyChains": [
    "└── @hono/node-server 1.19.9"
  ],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>@hono/node-server"
  ],
  "url": "https://github.com/advisories/GHSA-wc8c-qw6v-h7f6"
}
```

**Remediation:** Upgrade to version 1.19.10 or later

### 🟠 [express-rate-limit] express-rate-limit: IPv4-mapped IPv6 addresses bypass per-client rate limiting on servers with dual-stack network

- **ID:** `deps-cve-1114194`
- **Severity:** high
- **CWE:** CWE-770
- **CVE:** CVE-2026-30827

## Summary

The default `keyGenerator` in express-rate-limit applies IPv6 subnet masking (`/56` by default) to all addresses that `net.isIPv6()` returns true for. This includes IPv4-mapped IPv6 addresses (`::ffff:x.x.x.x`), which Node.js returns as `request.ip` on dual-stack servers.

Because the first 80 bits of all IPv4-mapped addresses are zero, a `/56` (or any `/32` to `/80`) subnet mask produces the same network key (`::/56`) for **every** IPv4 client. This collapses all IPv4 traffic into a single rate-limit bucket: one client exhausting the limit causes HTTP 429 for all other IPv4 clients.

## Details

### Root Cause

In `source/ip-key-generator.ts`:

```typescript
export function ipKeyGenerator(ip: string, ipv6Subnet: number | false = 56) {
  if (ipv6Subnet && isIPv6(ip)) {
    return `${new Address6(`${ip}/${ipv6Subnet}`).startAddress().correctForm()}/${ipv6Subnet}`
  }
  return ip
}
```

`net.isIPv6('::ffff:192.168.1.1')` returns `true`, so IPv4-mapped addresses enter the subn

**Evidence:**
```
{
  "module": "express-rate-limit",
  "vulnerable_versions": ">=8.2.0 <8.2.2",
  "patched_versions": ">=8.2.2",
  "consumingWorkspace": "@ship/api",
  "dependencyChains": [
    "└── express-rate-limit 8.2.1"
  ],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>express-rate-limit"
  ],
  "url": "https://github.com/advisories/GHSA-46wh-pxpv-q5gq"
}
```

**Remediation:** Upgrade to version 8.2.2 or later

### 🟠 [flatted] flatted vulnerable to unbounded recursion DoS in parse() revive phase

- **ID:** `deps-cve-1114526`
- **Severity:** high
- **CWE:** CWE-674
- **CVE:** CVE-2026-32141

## Summary

flatted's `parse()` function uses a recursive `revive()` phase to resolve circular references in deserialized JSON. When given a crafted payload with deeply nested or self-referential `$` indices, the recursion depth is unbounded, causing a stack overflow that crashes the Node.js process.

## Impact

Denial of Service (DoS). Any application that passes untrusted input to `flatted.parse()` can be crashed by an unauthenticated attacker with a single request.

flatted has ~87M weekly npm downloads and is used as the circular-JSON serialization layer in many caching and logging libraries.

## Proof of Concept

```javascript
const flatted = require('flatted');

// Build deeply nested circular reference chain
const depth = 20000;
const arr = new Array(depth + 1);
arr[0] = '{"a":"1"}';
for (let i = 1; i <= depth; i++) {
  arr[i] = `{"a":"${i + 1}"}`;
}
arr[depth] = '{"a":"leaf"}';

const payload = JSON.stringify(arr);
flatted.parse(payload); // RangeError: Maximum call stack size 

**Evidence:**
```
{
  "module": "flatted",
  "vulnerable_versions": "<3.4.0",
  "patched_versions": ">=3.4.0",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "└── flatted 3.3.3",
    "  └── flatted 3.3.3",
    "└── flatted 3.3.3",
    "  └── flatted 3.3.3",
    "  └── flatted 3.3.3"
  ],
  "auditPathsField": [
    ".>@vitest/ui>flatted"
  ],
  "url": "https://github.com/advisories/GHSA-25h7-pfq9-p65f"
}
```

**Remediation:** Upgrade to version 3.4.0 or later

### 🟠 [undici] Undici: Malicious WebSocket 64-bit length overflows parser and crashes the client

- **ID:** `deps-cve-1114591`
- **Severity:** high
- **CWE:** CWE-248,CWE-1284
- **CVE:** CVE-2026-1528

### Impact
A server can reply with a WebSocket frame using the 64-bit length form and an extremely large length. undici's ByteParser overflows internal math, ends up in an invalid state, and throws a fatal TypeError that terminates the process. 

### Patches


 Patched in the undici version v7.24.0 and v6.24.0. Users should upgrade to this version or later.

### Workarounds

There are no workarounds.

**Evidence:**
```
{
  "module": "undici",
  "vulnerable_versions": ">=7.0.0 <7.24.0",
  "patched_versions": ">=7.24.0",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "  └── undici 7.18.2",
    "└── undici 7.18.2"
  ],
  "auditPathsField": [
    ".>testcontainers>undici"
  ],
  "url": "https://github.com/advisories/GHSA-f269-vfmq-vjvj"
}
```

**Remediation:** Upgrade to version 7.24.0 or later

### 🟠 [undici] Undici has Unbounded Memory Consumption in WebSocket permessage-deflate Decompression

- **ID:** `deps-cve-1114637`
- **Severity:** high
- **CWE:** CWE-409
- **CVE:** CVE-2026-1526

## Description

The undici WebSocket client is vulnerable to a denial-of-service attack via unbounded memory consumption during permessage-deflate decompression. When a WebSocket connection negotiates the permessage-deflate extension, the client decompresses incoming compressed frames without enforcing any limit on the decompressed data size. A malicious WebSocket server can send a small compressed frame (a "decompression bomb") that expands to an extremely large size in memory, causing the Node.js process to exhaust available memory and crash or become unresponsive.

The vulnerability exists in the `PerMessageDeflate.decompress()` method, which accumulates all decompressed chunks in memory and concatenates them into a single Buffer without checking whether the total size exceeds a safe threshold.

## Impact

- Remote denial of service against any Node.js application using undici's WebSocket client
- A single compressed WebSocket frame of ~6 MB can decompress to ~1 GB or more
- Memory 

**Evidence:**
```
{
  "module": "undici",
  "vulnerable_versions": ">=7.0.0 <7.24.0",
  "patched_versions": ">=7.24.0",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "  └── undici 7.18.2",
    "└── undici 7.18.2"
  ],
  "auditPathsField": [
    ".>testcontainers>undici"
  ],
  "url": "https://github.com/advisories/GHSA-vrm6-8vpv-qv8q"
}
```

**Remediation:** Upgrade to version 7.24.0 or later

### 🟠 [undici] Undici has Unhandled Exception in WebSocket Client Due to Invalid server_max_window_bits Validation

- **ID:** `deps-cve-1114639`
- **Severity:** high
- **CWE:** CWE-248
- **CVE:** CVE-2026-2229

### Impact

The undici WebSocket client is vulnerable to a denial-of-service attack due to improper validation of the `server_max_window_bits` parameter in the permessage-deflate extension. When a WebSocket client connects to a server, it automatically advertises support for permessage-deflate compression. A malicious server can respond with an out-of-range `server_max_window_bits` value (outside zlib's valid range of 8-15). When the server subsequently sends a compressed frame, the client attempts to create a zlib InflateRaw instance with the invalid windowBits value, causing a synchronous RangeError exception that is not caught, resulting in immediate process termination.

The vulnerability exists because:

1. The `isValidClientWindowBits()` function only validates that the value contains ASCII digits, not that it falls within the valid range 8-15
2. The `createInflateRaw()` call is not wrapped in a try-catch block
3. The resulting exception propagates up through the call stack and c

**Evidence:**
```
{
  "module": "undici",
  "vulnerable_versions": ">=7.0.0 <7.24.0",
  "patched_versions": ">=7.24.0",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "  └── undici 7.18.2",
    "└── undici 7.18.2"
  ],
  "auditPathsField": [
    ".>testcontainers>undici"
  ],
  "url": "https://github.com/advisories/GHSA-v9p9-hfj2-hcw8"
}
```

**Remediation:** Upgrade to version 7.24.0 or later

### 🟠 [flatted] Prototype Pollution via parse() in NodeJS flatted

- **ID:** `deps-cve-1115357`
- **Severity:** high
- **CWE:** CWE-1321
- **CVE:** CVE-2026-33228

---
  **Summary**

  The parse() function in flatted can use attacker-controlled string values from the parsed JSON as direct array index
  keys, without validating that they are numeric. Since the internal input buffer is a JavaScript Array, accessing it
  with the key "\_\_proto\_\_" returns Array.prototype via the inherited getter. This object is then treated as a legitimate
   parsed value and assigned as a property of the output object, effectively leaking a live reference to Array.prototype
   to the consumer. Any code that subsequently writes to that property will pollute the global prototype.

  ---
  **Root Cause**

  File: esm/index.js:29 (identical in cjs/index.js)
```
  const resolver = (input, lazy, parsed, $) => output => {
    for (let ke = keys(output), {length} = ke, y = 0; y < length; y++) {
      const k = ke[y];
      const value = output[k];    
      if (value instanceof Primitive) {
        const tmp = input[value];      // Bug is here
```

No validation that val

**Evidence:**
```
{
  "module": "flatted",
  "vulnerable_versions": "<=3.4.1",
  "patched_versions": ">=3.4.2",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "└── flatted 3.3.3",
    "  └── flatted 3.3.3",
    "└── flatted 3.3.3",
    "  └── flatted 3.3.3",
    "  └── flatted 3.3.3"
  ],
  "auditPathsField": [
    ".>@vitest/ui>flatted"
  ],
  "url": "https://github.com/advisories/GHSA-rf6f-7fwh-wjgh"
}
```

**Remediation:** Upgrade to version 3.4.2 or later

### 🟠 [path-to-regexp] path-to-regexp vulnerable to Regular Expression Denial of Service via multiple route parameters

- **ID:** `deps-cve-1115527`
- **Severity:** high
- **CWE:** CWE-1333
- **CVE:** CVE-2026-4867

### Impact

A bad regular expression is generated any time you have three or more parameters within a single segment, separated by something that is not a period (`.`). For example, `/:a-:b-:c` or `/:a-:b-:c-:d`. The backtrack protection added in `path-to-regexp@0.1.12` only prevents ambiguity for two parameters. With three or more, the generated lookahead does not block single separator characters, so capture groups overlap and cause catastrophic backtracking.

### Patches

Upgrade to [path-to-regexp@0.1.13](https://github.com/pillarjs/path-to-regexp/releases/tag/v.0.1.13)

Custom regex patterns in route definitions (e.g., `/:a-:b([^-/]+)-:c([^-/]+)`) are not affected because they override the default capture group.

### Workarounds

All versions can be patched by providing a custom regular expression for parameters after the first in a single segment. As long as the custom regular expression does not match the text before the parameter, you will be safe. For example, change `/:a-:b-:

**Evidence:**
```
{
  "module": "path-to-regexp",
  "vulnerable_versions": "<0.1.13",
  "patched_versions": ">=0.1.13",
  "consumingWorkspace": "@ship/api",
  "dependencyChains": [
    "│   └── path-to-regexp 8.3.0",
    "      └── path-to-regexp 8.3.0",
    "└── path-to-regexp 0.1.12",
    "  └── path-to-regexp 0.1.12",
    "  └── path-to-regexp 0.1.12"
  ],
  "auditPathsField": [
    "api>express>path-to-regexp"
  ],
  "url": "https://github.com/advisories/GHSA-37ch-88jc-xwx2"
}
```

**Remediation:** Upgrade to version 0.1.13 or later

### 🟠 [picomatch] Picomatch has a ReDoS vulnerability via extglob quantifiers

- **ID:** `deps-cve-1115552`
- **Severity:** high
- **CWE:** CWE-1333
- **CVE:** CVE-2026-33671

### Impact
`picomatch` is vulnerable to Regular Expression Denial of Service (ReDoS) when processing crafted extglob patterns. Certain patterns using extglob quantifiers such as `+()` and `*()`, especially when combined with overlapping alternatives or nested extglobs, are compiled into regular expressions that can exhibit catastrophic backtracking on non-matching input.

Examples of problematic patterns include `+(a|aa)`, `+(*|?)`, `+(+(a))`, `*(+(a))`, and `+(+(+(a)))`. In local reproduction, these patterns caused multi-second event-loop blocking with relatively short inputs. For example, `+(a|aa)` compiled to `^(?:(?=.)(?:a|aa)+)$` and took about 2 seconds to reject a 41-character non-matching input, while nested patterns such as `+(+(a))` and `*(+(a))` took around 29 seconds to reject a 33-character input on a modern M1 MacBook.

Applications are impacted when they allow untrusted users to supply glob patterns that are passed to `picomatch` for compilation or matching. In those cas

**Evidence:**
```
{
  "module": "picomatch",
  "vulnerable_versions": "<2.3.2",
  "patched_versions": ">=2.3.2",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "│ │ └── picomatch 4.0.3 peer",
    "│ └── picomatch 4.0.3",
    "  │   │ └── picomatch 4.0.3 peer",
    "  │   ├── picomatch 4.0.3",
    "  │     │ └── picomatch 4.0.3 peer"
  ],
  "auditPathsField": [
    "web>tailwindcss>chokidar>anymatch>picomatch"
  ],
  "url": "https://github.com/advisories/GHSA-c2c7-rcm5-vvqj"
}
```

**Remediation:** Upgrade to version 2.3.2 or later

### 🟠 [picomatch] Picomatch has a ReDoS vulnerability via extglob quantifiers

- **ID:** `deps-cve-1115554`
- **Severity:** high
- **CWE:** CWE-1333
- **CVE:** CVE-2026-33671

### Impact
`picomatch` is vulnerable to Regular Expression Denial of Service (ReDoS) when processing crafted extglob patterns. Certain patterns using extglob quantifiers such as `+()` and `*()`, especially when combined with overlapping alternatives or nested extglobs, are compiled into regular expressions that can exhibit catastrophic backtracking on non-matching input.

Examples of problematic patterns include `+(a|aa)`, `+(*|?)`, `+(+(a))`, `*(+(a))`, and `+(+(+(a)))`. In local reproduction, these patterns caused multi-second event-loop blocking with relatively short inputs. For example, `+(a|aa)` compiled to `^(?:(?=.)(?:a|aa)+)$` and took about 2 seconds to reject a 41-character non-matching input, while nested patterns such as `+(+(a))` and `*(+(a))` took around 29 seconds to reject a 33-character input on a modern M1 MacBook.

Applications are impacted when they allow untrusted users to supply glob patterns that are passed to `picomatch` for compilation or matching. In those cas

**Evidence:**
```
{
  "module": "picomatch",
  "vulnerable_versions": ">=4.0.0 <4.0.4",
  "patched_versions": ">=4.0.4",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "│ │ └── picomatch 4.0.3 peer",
    "│ └── picomatch 4.0.3",
    "  │   │ └── picomatch 4.0.3 peer",
    "  │   ├── picomatch 4.0.3",
    "  │     │ └── picomatch 4.0.3 peer"
  ],
  "auditPathsField": [
    ".>@vitest/ui>tinyglobby>picomatch"
  ],
  "url": "https://github.com/advisories/GHSA-c2c7-rcm5-vvqj"
}
```

**Remediation:** Upgrade to version 4.0.4 or later

### 🟠 [path-to-regexp] path-to-regexp vulnerable to Denial of Service via sequential optional groups

- **ID:** `deps-cve-1115573`
- **Severity:** high
- **CWE:** CWE-400,CWE-1333
- **CVE:** CVE-2026-4926

### Impact

A bad regular expression is generated any time you have multiple sequential optional groups (curly brace syntax), such as `{a}{b}{c}:z`. The generated regex grows exponentially with the number of groups, causing denial of service.

### Patches

Fixed in version 8.4.0.

### Workarounds

Limit the number of sequential optional groups in route patterns. Avoid passing user-controlled input as route patterns.

**Evidence:**
```
{
  "module": "path-to-regexp",
  "vulnerable_versions": ">=8.0.0 <8.4.0",
  "patched_versions": ">=8.4.0",
  "consumingWorkspace": "@ship/api",
  "dependencyChains": [
    "│   └── path-to-regexp 8.3.0",
    "      └── path-to-regexp 8.3.0",
    "└── path-to-regexp 0.1.12",
    "  └── path-to-regexp 0.1.12",
    "  └── path-to-regexp 0.1.12"
  ],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>express>router>path-to-regexp"
  ],
  "url": "https://github.com/advisories/GHSA-j3q9-mxjg-w52f"
}
```

**Remediation:** Upgrade to version 8.4.0 or later

### 🟠 [lodash] lodash vulnerable to Code Injection via `_.template` imports key names

- **ID:** `deps-cve-1115806`
- **Severity:** high
- **CWE:** CWE-94
- **CVE:** CVE-2026-4800

### Impact

The fix for [CVE-2021-23337](https://github.com/advisories/GHSA-35jh-r3h4-6jhm) added validation for the `variable` option in `_.template` but did not apply the same validation to `options.imports` key names. Both paths flow into the same `Function()` constructor sink.

When an application passes untrusted input as `options.imports` key names, an attacker can inject default-parameter expressions that execute arbitrary code at template compilation time.

Additionally, `_.template` uses `assignInWith` to merge imports, which enumerates inherited properties via `for..in`. If `Object.prototype` has been polluted by any other vector, the polluted keys are copied into the imports object and passed to `Function()`.

### Patches

Users should upgrade to version 4.18.0.

The fix applies two changes:
1. Validate `importsKeys` against the existing `reForbiddenIdentifierChars` regex (same check already used for the `variable` option)
2. Replace `assignInWith` with `assignWith` when mer

**Evidence:**
```
{
  "module": "lodash",
  "vulnerable_versions": ">=4.0.0 <=4.17.23",
  "patched_versions": ">=4.18.0",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "    │ └── lodash 4.17.21",
    "        └── lodash 4.17.21",
    "  │ └── lodash 4.17.21",
    "      └── lodash 4.17.21"
  ],
  "auditPathsField": [
    ".>testcontainers>archiver>archiver-utils>lodash"
  ],
  "url": "https://github.com/advisories/GHSA-r5fr-rjxr-66jc"
}
```

**Remediation:** Upgrade to version 4.18.0 or later

### 🟠 [vite] Vite Vulnerable to Arbitrary File Read via Vite Dev Server WebSocket

- **ID:** `deps-cve-1116234`
- **Severity:** high
- **CWE:** CWE-200,CWE-306
- **CVE:** CVE-2026-39363

### Summary

[`server.fs`](https://vite.dev/config/server-options#server-fs-strict) check was not enforced to the `fetchModule` method that is exposed in Vite dev server's WebSocket. 

### Impact

Only apps that match the following conditions are affected:

- explicitly exposes the Vite dev server to the network (using `--host` or [`server.host` config option](https://vitejs.dev/config/server-options.html#server-host))
- WebSocket is not disabled by `server.ws: false`

Arbitrary files on the server (development machine, CI environment, container, etc.) can be exposed.

### Details

If it is possible to connect to the Vite dev server’s WebSocket **without an `Origin` header**, an attacker can invoke `fetchModule` via the custom WebSocket event `vite:invoke` and combine `file://...` with `?raw` (or `?inline`) to retrieve the contents of arbitrary files on the server as a JavaScript string (e.g., `export default "..."`).

The access control enforced in the HTTP request path (such as `serv

**Evidence:**
```
{
  "module": "vite",
  "vulnerable_versions": ">=6.0.0 <=6.4.1",
  "patched_versions": ">=6.4.2",
  "consumingWorkspace": "ship",
  "dependencyChains": [
    "└─┬ vitest 4.0.17 peer",
    "  ├─┬ @vitest/mocker 4.0.17",
    "  │ └── vite 6.4.1 peer",
    "  └── vite 6.4.1",
    "├─┬ @vitest/mocker 4.0.17"
  ],
  "auditPathsField": [
    "web>vite"
  ],
  "url": "https://github.com/advisories/GHSA-p9ff-h696-f583"
}
```

**Remediation:** Upgrade to version 6.4.2 or later

### 🟠 [fast-uri] fast-uri vulnerable to path traversal via percent-encoded dot segments

- **ID:** `deps-cve-1117870`
- **Severity:** high
- **CWE:** CWE-22
- **CVE:** CVE-2026-6321

### Impact

`fast-uri` v3.1.0 and earlier decodes percent-encoded path separators (`%2F`) and dot segments (`%2E`) before applying dot-segment removal in `normalize()` and `equal()`. This makes encoded path data behave like real `/` and `..`, so distinct URIs collapse onto the same normalized path.

For example, `http://example.com/public/%2e%2e/admin` normalizes to `http://example.com/admin`, and `equal()` considers them the same URI.

Applications that normalize or compare attacker-controlled URLs to enforce path-based policy can be bypassed. A path that looks confined under an allowed prefix can normalize to a different location.

### Patches

Upgrade to `fast-uri` >= 3.1.1.

### Workarounds

None. Upgrade to the patched version.

**Evidence:**
```
{
  "module": "fast-uri",
  "vulnerable_versions": "<=3.1.0",
  "patched_versions": ">=3.1.1",
  "consumingWorkspace": "@ship/api",
  "dependencyChains": [
    "│ └── fast-uri 3.1.0",
    "    └── fast-uri 3.1.0"
  ],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>ajv>fast-uri"
  ],
  "url": "https://github.com/advisories/GHSA-q3j6-qgpj-74h6"
}
```

**Remediation:** Upgrade to version 3.1.1 or later

### 🟠 [fast-uri] fast-uri vulnerable to host confusion via percent-encoded authority delimiters

- **ID:** `deps-cve-1117884`
- **Severity:** high
- **CWE:** CWE-436
- **CVE:** CVE-2026-6322

### Impact

`fast-uri` v3.1.1 and earlier decodes percent-encoded authority delimiters (`%40` as `@`, `%3A` as `:`) inside the host component and serializes them back as raw characters. This changes the URI structure, turning a hostname into userinfo plus a different host.

For example, `http://trusted.com%40evil.com/` normalizes to `http://trusted.com@evil.com/`, which reparses as host `evil.com` with userinfo `trusted.com`.

Applications that normalize untrusted URLs before host allowlist checks, redirect validation, or outbound request routing can be steered to a different authority than the original URL appeared to contain.

### Patches

Upgrade to `fast-uri` >= 3.1.2.

### Workarounds

None. Upgrade to the patched version.

**Evidence:**
```
{
  "module": "fast-uri",
  "vulnerable_versions": "<=3.1.1",
  "patched_versions": ">=3.1.2",
  "consumingWorkspace": "@ship/api",
  "dependencyChains": [
    "│ └── fast-uri 3.1.0",
    "    └── fast-uri 3.1.0"
  ],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>ajv>fast-uri"
  ],
  "url": "https://github.com/advisories/GHSA-v39h-62p7-jpjc"
}
```

**Remediation:** Upgrade to version 3.1.2 or later

### 🟡 [lodash] Lodash has Prototype Pollution Vulnerability in `_.unset` and `_.omit` functions

- **ID:** `deps-cve-1112455`
- **Severity:** medium
- **CWE:** CWE-1321
- **CVE:** CVE-2025-13465

### Impact

Lodash versions 4.0.0 through 4.17.22 are vulnerable to prototype pollution in the `_.unset` and `_.omit` functions. An attacker can pass crafted paths which cause Lodash to delete methods from global prototypes. 

The issue permits deletion of properties but does not allow overwriting their original behavior.  

### Patches

This issue is patched on 4.17.23.

**Evidence:**
```
{
  "module": "lodash",
  "vulnerable_versions": ">=4.0.0 <=4.17.22",
  "patched_versions": ">=4.17.23",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    ".>testcontainers>archiver>archiver-utils>lodash"
  ],
  "url": "https://github.com/advisories/GHSA-xxjr-mmjv-4gpg"
}
```

**Remediation:** Upgrade to version 4.17.23 or later

### 🟡 [markdown-it] markdown-it is has a Regular Expression Denial of Service (ReDoS)

- **ID:** `deps-cve-1113190`
- **Severity:** medium
- **CWE:** CWE-1333
- **CVE:** CVE-2026-2327

Versions of the package markdown-it from 13.0.0 and before 14.1.1 are vulnerable to Regular Expression Denial of Service (ReDoS) due to the use of the regex /\*+$/ in the linkify function. An attacker can supply a long sequence of * characters followed by a non-matching character, which triggers excessive backtracking and may lead to a denial-of-service condition.

**Evidence:**
```
{
  "module": "markdown-it",
  "vulnerable_versions": ">=13.0.0 <14.1.1",
  "patched_versions": ">=14.1.1",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "web>@tiptap/pm>prosemirror-markdown>markdown-it"
  ],
  "url": "https://github.com/advisories/GHSA-38c4-r59v-3vqw"
}
```

**Remediation:** Upgrade to version 14.1.1 or later

### 🟡 [ajv] ajv has ReDoS when using `$data` option

- **ID:** `deps-cve-1113715`
- **Severity:** medium
- **CWE:** CWE-400,CWE-1333
- **CVE:** CVE-2025-69873

ajv (Another JSON Schema Validator) through version 8.17.1 is vulnerable to Regular Expression Denial of Service (ReDoS) when the `$data` option is enabled. The pattern keyword accepts runtime data via JSON Pointer syntax (`$data` reference), which is passed directly to the JavaScript `RegExp()` constructor without validation. An attacker can inject a malicious regex pattern (e.g., `\"^(a|a)*$\"`) combined with crafted input to cause catastrophic backtracking. A 31-character payload causes approximately 44 seconds of CPU blocking, with each additional character doubling execution time. This enables complete denial of service with a single HTTP request against any API using ajv with `$data`: true for dynamic schema validation.

**Evidence:**
```
{
  "module": "ajv",
  "vulnerable_versions": ">=7.0.0-alpha.0 <8.18.0",
  "patched_versions": ">=8.18.0",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>ajv"
  ],
  "url": "https://github.com/advisories/GHSA-2g4f-4pwh-qvx6"
}
```

**Remediation:** Upgrade to version 8.18.0 or later

### 🟡 [hono] Hono Vulnerable to Cookie Attribute Injection via Unsanitized domain and path in setCookie()

- **ID:** `deps-cve-1114004`
- **Severity:** medium
- **CWE:** CWE-113,CWE-1113
- **CVE:** CVE-2026-29086

## Summary

The `setCookie()` utility did not validate semicolons (`;`), carriage returns (`\r`), or newline characters (`\n`) in the `domain` and `path` options when constructing the `Set-Cookie` header.

Because cookie attributes are delimited by semicolons, this could allow injection of additional cookie attributes if untrusted input was passed into these fields.

## Details

`setCookie()` builds the `Set-Cookie` header by concatenating option values. While the cookie value itself is URL-encoded, the `domain` and `path` options were previously interpolated without rejecting unsafe characters.

Including `;`, `\r`, or `\n` in these fields could result in unintended additional attributes (such as `SameSite`, `Secure`, `Domain`, or `Path`) being appended to the cookie header.

Modern runtimes prevent full header injection via CRLF, so this issue is limited to attribute-level manipulation within a single `Set-Cookie` header.

The issue has been fixed by rejecting these characters in the

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.4",
  "patched_versions": ">=4.12.4",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-5pq2-9x2x-5p6w"
}
```

**Remediation:** Upgrade to version 4.12.4 or later

### 🟡 [hono] Hono Vulnerable to SSE Control Field Injection via CR/LF in writeSSE()

- **ID:** `deps-cve-1114005`
- **Severity:** medium
- **CWE:** CWE-74
- **CVE:** CVE-2026-29085

## Summary

When using `streamSSE()` in Streaming Helper, the `event`, `id`, and `retry` fields were not validated for carriage return (`\r`) or newline (`\n`) characters.

Because the SSE protocol uses line breaks as field delimiters, this could allow injection of additional SSE fields within the same event frame if untrusted input was passed into these fields.

## Details

The SSE helper builds event frames by joining lines with `\n`. While multi-line `data:` fields are handled according to the SSE specification, the `event`, `id`, and `retry` fields previously allowed raw values without rejecting embedded CR/LF characters.

Including CR/LF in these control fields could allow unintended additional fields (such as `data:`, `id:`, or `retry:`) to be injected into the event stream.

The issue has been fixed by rejecting CR/LF characters in these fields.

## Impact

An attacker could manipulate the structure of SSE event frames if an application passed user-controlled input directly into

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.4",
  "patched_versions": ">=4.12.4",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-p6xx-57qc-3wxr"
}
```

**Remediation:** Upgrade to version 4.12.4 or later

### 🟡 [hono] Hono vulnerable to Prototype Pollution possible through __proto__ key allowed in parseBody({ dot: true })

- **ID:** `deps-cve-1114341`
- **Severity:** medium
- **CWE:** CWE-1321

## Summary

When using `parseBody({ dot: true })` in HonoRequest, specially crafted form field names such as `__proto__.x` could create objects containing a `__proto__` property.

If the parsed result is later merged into regular JavaScript objects using unsafe merge patterns, this may lead to prototype pollution in the target object.

## Details

The `parseBody({ dot: true })` feature supports dot notation to construct nested objects from form field names.

In previous versions, the `__proto__` path segment was not filtered. As a result, specially crafted keys such as `__proto__.x` could produce objects containing `__proto__` properties.

While this behavior does not directly modify `Object.prototype` within Hono itself, it may become exploitable if the parsed result is later merged into regular JavaScript objects using unsafe merge patterns.

## Impact

Applications that merge parsed form data into regular objects using unsafe patterns (for example recursive deep merge utilities) may

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.7",
  "patched_versions": ">=4.12.7",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-v8w9-8mx6-g223"
}
```

**Remediation:** Upgrade to version 4.12.7 or later

### 🟡 [undici] Undici has an HTTP Request/Response Smuggling issue

- **ID:** `deps-cve-1114593`
- **Severity:** medium
- **CWE:** CWE-444
- **CVE:** CVE-2026-1525

### Impact

Undici allows duplicate HTTP `Content-Length` headers when they are provided in an array with case-variant names (e.g., `Content-Length` and `content-length`). This produces malformed HTTP/1.1 requests with multiple conflicting `Content-Length` values on the wire.

**Who is impacted:**
  - Applications using `undici.request()`, `undici.Client`, or similar low-level APIs with headers passed as flat arrays
  - Applications that accept user-controlled header names without case-normalization

**Potential consequences:**
  - **Denial of Service**: Strict HTTP parsers (proxies, servers) will reject requests with duplicate `Content-Length` headers (400 Bad Request)
  - **HTTP Request Smuggling**: In deployments where an intermediary and backend interpret duplicate headers inconsistently (e.g., one uses the first value, the other uses the last), this can enable request smuggling attacks leading to ACL bypass, cache poisoning, or credential hijacking

### Patches

 Patched in the un

**Evidence:**
```
{
  "module": "undici",
  "vulnerable_versions": ">=7.0.0 <7.24.0",
  "patched_versions": ">=7.24.0",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    ".>testcontainers>undici"
  ],
  "url": "https://github.com/advisories/GHSA-2mjp-6q6p-2qxm"
}
```

**Remediation:** Upgrade to version 7.24.0 or later

### 🟡 [undici] Undici has CRLF Injection in undici via `upgrade` option

- **ID:** `deps-cve-1114641`
- **Severity:** medium
- **CWE:** CWE-93
- **CVE:** CVE-2026-1527

### Impact

When an application passes user-controlled input to the `upgrade` option of `client.request()`, an attacker can inject CRLF sequences (`\r\n`) to:

1. Inject arbitrary HTTP headers
2. Terminate the HTTP request prematurely and smuggle raw data to non-HTTP services (Redis, Memcached, Elasticsearch)

The vulnerability exists because undici writes the `upgrade` value directly to the socket without validating for invalid header characters:

```javascript
// lib/dispatcher/client-h1.js:1121
if (upgrade) {
  header += `connection: upgrade\r\nupgrade: ${upgrade}\r\n`
}
```

### Patches

 Patched in the undici version v7.24.0 and v6.24.0. Users should upgrade to this version or later.

### Workarounds

Sanitize the `upgrade` option string before passing to undici:

```javascript
function sanitizeUpgrade(value) {
  if (/[\r\n]/.test(value)) {
    throw new Error('Invalid upgrade value')
  }
  return value
}

client.request({
  upgrade: sanitizeUpgrade(userInput)
})
```

**Evidence:**
```
{
  "module": "undici",
  "vulnerable_versions": ">=7.0.0 <7.24.0",
  "patched_versions": ">=7.24.0",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    ".>testcontainers>undici"
  ],
  "url": "https://github.com/advisories/GHSA-4992-7rv2-5pvq"
}
```

**Remediation:** Upgrade to version 7.24.0 or later

### 🟡 [undici] Undici has Unbounded Memory Consumption in its DeduplicationHandler via Response Buffering that leads to DoS

- **ID:** `deps-cve-1114643`
- **Severity:** medium
- **CWE:** CWE-770
- **CVE:** CVE-2026-2581

## Impact
This is an uncontrolled resource consumption vulnerability (CWE-400) that can lead to Denial of Service (DoS).

In vulnerable Undici versions, when `interceptors.deduplicate()` is enabled, response data for deduplicated requests could be accumulated in memory for downstream handlers. An attacker-controlled or untrusted upstream endpoint can exploit this with large/chunked responses and concurrent identical requests, causing high memory usage and potential OOM process termination.

Impacted users are applications that use Undici’s deduplication interceptor against endpoints that may produce large or long-lived response bodies.

## Patches

The issue has been patched by changing deduplication behavior to stream response chunks to downstream handlers as they arrive (instead of full-body accumulation), and by preventing late deduplication when body streaming has already started.

Users should upgrade to the first official Undici (and Node.js, where applicable) releases that inclu

**Evidence:**
```
{
  "module": "undici",
  "vulnerable_versions": ">=7.17.0 <7.24.0",
  "patched_versions": ">=7.24.0",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    ".>testcontainers>undici"
  ],
  "url": "https://github.com/advisories/GHSA-phc3-fgpg-7m6h"
}
```

**Remediation:** Upgrade to version 7.24.0 or later

### 🟡 [brace-expansion] brace-expansion: Zero-step sequence causes process hang and memory exhaustion

- **ID:** `deps-cve-1115541`
- **Severity:** medium
- **CWE:** CWE-400
- **CVE:** CVE-2026-33750

### Impact

A brace pattern with a zero step value (e.g., `{1..2..0}`) causes the sequence generation loop to run indefinitely, making the process hang for seconds and allocate heaps of memory.

The loop in question:

https://github.com/juliangruber/brace-expansion/blob/daa71bcb4a30a2df9bcb7f7b8daaf2ab30e5794a/src/index.ts#L184

`test()` is one of

https://github.com/juliangruber/brace-expansion/blob/daa71bcb4a30a2df9bcb7f7b8daaf2ab30e5794a/src/index.ts#L107-L113

The increment is computed as `Math.abs(0) = 0`, so the loop variable never advances. On a test machine, the process hangs for about 3.5 seconds and allocates roughly 1.9 GB of memory before throwing a `RangeError`. Setting max to any value has no effect because the limit is only checked at the output combination step, not during sequence generation.

This affects any application that passes untrusted strings to expand(), or by error sets a step value of `0`. That includes tools built on minimatch/glob that resolve patterns fr

**Evidence:**
```
{
  "module": "brace-expansion",
  "vulnerable_versions": ">=2.0.0 <2.0.3",
  "patched_versions": ">=2.0.3",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    ".>testcontainers>archiver>archiver-utils>glob>minimatch>brace-expansion"
  ],
  "url": "https://github.com/advisories/GHSA-f886-m6hf-6m8v"
}
```

**Remediation:** Upgrade to version 2.0.3 or later

### 🟡 [picomatch] Picomatch: Method Injection in POSIX Character Classes causes incorrect Glob Matching

- **ID:** `deps-cve-1115549`
- **Severity:** medium
- **CWE:** CWE-1321
- **CVE:** CVE-2026-33672

### Impact
picomatch is vulnerable to a **method injection vulnerability (CWE-1321)** affecting the `POSIX_REGEX_SOURCE` object. Because the object inherits from `Object.prototype`, specially crafted POSIX bracket expressions (e.g., `[[:constructor:]]`) can reference inherited method names. These methods are implicitly converted to strings and injected into the generated regular expression.

This leads to **incorrect glob matching behavior (integrity impact)**, where patterns may match unintended filenames. The issue does **not enable remote code execution**, but it can cause security-relevant logic errors in applications that rely on glob matching for filtering, validation, or access control.

All users of affected `picomatch` versions that process untrusted or user-controlled glob patterns are potentially impacted.

### Patches

This issue is fixed in picomatch 4.0.4, 3.0.2 and 2.3.2.

Users should upgrade to one of these versions or later, depending on their supported release line.


**Evidence:**
```
{
  "module": "picomatch",
  "vulnerable_versions": "<2.3.2",
  "patched_versions": ">=2.3.2",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "web>tailwindcss>chokidar>anymatch>picomatch"
  ],
  "url": "https://github.com/advisories/GHSA-3v7f-55p6-f55p"
}
```

**Remediation:** Upgrade to version 2.3.2 or later

### 🟡 [picomatch] Picomatch: Method Injection in POSIX Character Classes causes incorrect Glob Matching

- **ID:** `deps-cve-1115551`
- **Severity:** medium
- **CWE:** CWE-1321
- **CVE:** CVE-2026-33672

### Impact
picomatch is vulnerable to a **method injection vulnerability (CWE-1321)** affecting the `POSIX_REGEX_SOURCE` object. Because the object inherits from `Object.prototype`, specially crafted POSIX bracket expressions (e.g., `[[:constructor:]]`) can reference inherited method names. These methods are implicitly converted to strings and injected into the generated regular expression.

This leads to **incorrect glob matching behavior (integrity impact)**, where patterns may match unintended filenames. The issue does **not enable remote code execution**, but it can cause security-relevant logic errors in applications that rely on glob matching for filtering, validation, or access control.

All users of affected `picomatch` versions that process untrusted or user-controlled glob patterns are potentially impacted.

### Patches

This issue is fixed in picomatch 4.0.4, 3.0.2 and 2.3.2.

Users should upgrade to one of these versions or later, depending on their supported release line.


**Evidence:**
```
{
  "module": "picomatch",
  "vulnerable_versions": ">=4.0.0 <4.0.4",
  "patched_versions": ">=4.0.4",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    ".>@vitest/ui>tinyglobby>picomatch"
  ],
  "url": "https://github.com/advisories/GHSA-3v7f-55p6-f55p"
}
```

**Remediation:** Upgrade to version 4.0.4 or later

### 🟡 [yaml] yaml is vulnerable to Stack Overflow via deeply nested YAML collections

- **ID:** `deps-cve-1115556`
- **Severity:** medium
- **CWE:** CWE-674
- **CVE:** CVE-2026-33532

Parsing a YAML document with `yaml` may throw a RangeError due to a stack overflow.

The node resolution/composition phase uses recursive function calls without a depth bound. An attacker who can supply YAML for parsing can trigger a `RangeError: Maximum call stack size exceeded` with a small payload (~2–10 KB). The `RangeError` is not a `YAMLParseError`, so applications that only catch YAML-specific errors will encounter an unexpected exception type. Depending on the host application's exception handling, this can fail requests or terminate the Node.js process.

Flow sequences allow deep nesting with minimal bytes (2 bytes per level: one `[` and one `]`). On the default Node.js stack, approximately 1,000–5,000 levels of nesting (2–10 KB input) exhaust the call stack. The exact threshold is environment-dependent (Node.js version, stack size, call stack depth at invocation).

Note: the library's `Parser` (CST phase) uses a stack-based iterative approach and is not affected. Only the com

**Evidence:**
```
{
  "module": "yaml",
  "vulnerable_versions": ">=2.0.0 <2.8.3",
  "patched_versions": ">=2.8.3",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    ".>testcontainers>docker-compose>yaml"
  ],
  "url": "https://github.com/advisories/GHSA-48c2-rrv3-qjmp"
}
```

**Remediation:** Upgrade to version 2.8.3 or later

### 🟡 [path-to-regexp] path-to-regexp vulnerable to Regular Expression Denial of Service via multiple wildcards

- **ID:** `deps-cve-1115582`
- **Severity:** medium
- **CWE:** CWE-1333
- **CVE:** CVE-2026-4923

### Impact

When using multiple wildcards, combined with at least one parameter, a regular expression can be generated that is vulnerable to ReDoS. This backtracking vulnerability requires the second wildcard to be somewhere other than the end of the path.

**Unsafe examples:**

```
/*foo-*bar-:baz
/*a-:b-*c-:d
/x/*a-:b/*c/y
```

**Safe examples:**

```
/*foo-:bar
/*foo-:bar-*baz
```

### Patches

Upgrade to version `8.4.0`.

### Workarounds

If developers are using multiple wildcard parameters, they can check the regex output with a tool such as https://makenowjust-labs.github.io/recheck/playground/ to confirm whether a path is vulnerable.

**Evidence:**
```
{
  "module": "path-to-regexp",
  "vulnerable_versions": ">=8.0.0 <8.4.0",
  "patched_versions": ">=8.4.0",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>express>router>path-to-regexp"
  ],
  "url": "https://github.com/advisories/GHSA-27v5-c462-wpq7"
}
```

**Remediation:** Upgrade to version 8.4.0 or later

### 🟡 [lodash] lodash vulnerable to Prototype Pollution via array path bypass in `_.unset` and `_.omit`

- **ID:** `deps-cve-1115810`
- **Severity:** medium
- **CWE:** CWE-1321
- **CVE:** CVE-2026-2950

### Impact

Lodash versions 4.17.23 and earlier are vulnerable to prototype pollution in the `_.unset` and `_.omit` functions. The fix for [CVE-2025-13465](https://github.com/lodash/lodash/security/advisories/GHSA-xxjr-mmjv-4gpg) only guards against string key members, so an attacker can bypass the check by passing array-wrapped path segments. This allows deletion of properties from built-in prototypes such as `Object.prototype`, `Number.prototype`, and `String.prototype`.

The issue permits deletion of prototype properties but does not allow overwriting their original behavior.

### Patches

This issue is patched in 4.18.0.

### Workarounds

None. Upgrade to the patched version.

**Evidence:**
```
{
  "module": "lodash",
  "vulnerable_versions": "<=4.17.23",
  "patched_versions": ">=4.18.0",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    ".>testcontainers>archiver>archiver-utils>lodash"
  ],
  "url": "https://github.com/advisories/GHSA-f23m-r3pf-42rh"
}
```

**Remediation:** Upgrade to version 4.18.0 or later

### 🟡 [vite] Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling

- **ID:** `deps-cve-1116229`
- **Severity:** medium
- **CWE:** CWE-22,CWE-200
- **CVE:** CVE-2026-39365

### Summary

Any files ending with `.map` even out side the project can be returned to the browser.

### Impact

Only apps that match the following conditions are affected:

- explicitly exposes the Vite dev server to the network (using `--host` or [`server.host` config option](https://vitejs.dev/config/server-options.html#server-host))
- have a sensitive content in files ending with `.map` and the path is predictable

### Details

In Vite v7.3.1, the dev server’s handling of `.map` requests for optimized dependencies resolves file paths and calls `readFile` without restricting `../` segments in the URL. As a result, it is possible to bypass the [`server.fs.strict`](https://vite.dev/config/server-options#server-fs-strict) allow list and retrieve `.map` files located outside the project root, provided they can be parsed as valid source map JSON.

### PoC
1. Create a minimal PoC sourcemap outside the project root
    ```bash
    cat > /tmp/poc.map <<'EOF'
    {"version":3,"file":"x.js","

**Evidence:**
```
{
  "module": "vite",
  "vulnerable_versions": "<=6.4.1",
  "patched_versions": ">=6.4.2",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "web>vite"
  ],
  "url": "https://github.com/advisories/GHSA-4w7w-66w2-5vf9"
}
```

**Remediation:** Upgrade to version 6.4.2 or later

### 🟡 [hono] Hono missing validation of cookie name on write path in setCookie()

- **ID:** `deps-cve-1116244`
- **Severity:** medium
- **CWE:** CWE-113

## Summary

Cookie names are not validated on the write path when using `setCookie()`, `serialize()`, or `serializeSigned()` to generate Set-Cookie headers.

While certain cookie attributes such as domain and path are validated, the cookie name itself may contain invalid characters.

This results in inconsistent handling of cookie names between parsing (read path) and serialization (write path).

## Details

When applications use `setCookie()`, `serialize()`, or `serializeSigned()` with a user-controlled cookie name, invalid values (e.g., containing control characters such as `\r` or `\n`) can be used to construct malformed `Set-Cookie` header values.

For example:

```
Set-Cookie: legit
X-Injected: evil=value
```

However, in modern runtimes such as Node.js and Cloudflare Workers, such invalid header values are rejected and result in a runtime error before the response is sent.

As a result, the reported header injection / response splitting behavior could not be reproduced in these e

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.12",
  "patched_versions": ">=4.12.12",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-26pp-8wgv-hjvm"
}
```

**Remediation:** Upgrade to version 4.12.12 or later

### 🟡 [hono] Hono: Non-breaking space prefix bypass in cookie name handling in getCookie()

- **ID:** `deps-cve-1116277`
- **Severity:** medium
- **CWE:** CWE-20
- **CVE:** CVE-2026-39410

## Summary

A discrepancy between browser cookie parsing and `parse()` handling allows cookie prefix protections to be bypassed.

Cookie names that are treated as distinct by the browser may be normalized to the same key by `parse()`, allowing attacker-controlled cookies to override legitimate ones.

## Details

Browsers follow RFC 6265bis and only trim SP (`0x20`) and HTAB (`0x09`) from cookie names. Other characters, such as the non-breaking space (`U+00A0`), are preserved as part of the cookie name.

For example, the browser treats the following cookies as distinct:

```
"dummy-cookie"
"\u00a0dummy-cookie"
```

However, `parse()` previously used JavaScript's `trim()`, which removes a broader set of characters including `U+00A0`. As a result, both names are normalized to:

```
"dummy-cookie"
```

This mismatch allows attacker-controlled cookies with a `U+00A0` prefix to shadow or override legitimate cookies when accessed via `getCookie()`.

## Impact

An attacker who can set cookies 

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.12",
  "patched_versions": ">=4.12.12",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-r5rp-j6wh-rvv4"
}
```

**Remediation:** Upgrade to version 4.12.12 or later

### 🟡 [hono] Hono: Path traversal in toSSG() allows writing files outside the output directory

- **ID:** `deps-cve-1116279`
- **Severity:** medium
- **CWE:** CWE-22
- **CVE:** CVE-2026-39408

## Summary

A path traversal issue in `toSSG()` allows files to be written outside the configured output directory during static site generation. When using dynamic route parameters via `ssgParams`, specially crafted values can cause generated file paths to escape the intended output directory.

## Details

The static site generation process creates output files based on route paths derived from application routes and parameters. When `ssgParams` is used to provide values for dynamic routes, those values are used to construct output file paths. If these values contain traversal sequences (e.g. `..`), the resulting output path may resolve outside the configured output directory. As a result, files may be written to unintended locations instead of being confined within the specified output directory.

For example:
 
```ts
import { Hono } from 'hono'
import { toSSG, ssgParams } from 'hono/ssg'

const app = new Hono()

app.get('/:id', ssgParams([{ id: '../pwned' }]), (c) => {
  return c.te

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": ">=4.0.0 <=4.12.11",
  "patched_versions": ">=4.12.12",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-xf4j-xp2r-rqqx"
}
```

**Remediation:** Upgrade to version 4.12.12 or later

### 🟡 [hono] Hono: Middleware bypass via repeated slashes in serveStatic

- **ID:** `deps-cve-1116280`
- **Severity:** medium
- **CWE:** CWE-22
- **CVE:** CVE-2026-39407

## Summary

A path handling inconsistency in `serveStatic` allows protected static files to be accessed by using repeated slashes (`//`) in the request path.

When route-based middleware (e.g., `/admin/*`) is used for authorization, the router may not match paths containing repeated slashes, while serveStatic resolves them as normalized paths. This can lead to a middleware bypass.

## Details

The routing layer and `serveStatic` handle repeated slashes differently.

For example:

```
/admin/secret.txt => matches /admin/*
/admin//secret.txt => may not match /admin/*
```

However, `serveStatic` may interpret both paths as the same file location (e.g., `admin/secret.txt`) and return the file.

This inconsistency allows a request such as:

```
GET //admin/secret.txt
```

to bypass middleware registered on `/admin/*` and access protected files.

The issue has been fixed by rejecting paths that contain repeated slashes, ensuring consistent behavior between route matching and static file reso

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.12",
  "patched_versions": ">=4.12.12",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-wmmm-f939-6g9c"
}
```

**Remediation:** Upgrade to version 4.12.12 or later

### 🟡 [@hono/node-server] @hono/node-server: Middleware bypass via repeated slashes in serveStatic

- **ID:** `deps-cve-1116281`
- **Severity:** medium
- **CWE:** CWE-22
- **CVE:** CVE-2026-39406

## Summary

A path handling inconsistency in `serveStatic` allows protected static files to be accessed by using repeated slashes (`//`) in the request path.

When route-based middleware (e.g., `/admin/*`) is used for authorization, the router may not match paths containing repeated slashes, while `serveStatic` resolves them as normalized paths. This can lead to a middleware bypass.

## Details

The routing layer and `serveStatic` handle repeated slashes differently.

For example:

- `/admin/secret.txt` => matches `/admin/*`
- `//admin/secret.txt` => may not match `/admin/*`

This inconsistency allows a request such as:

```
GET //admin/secret.txt
```

to bypass middleware registered on `/admin/*` and access protected files.

## Impact

An attacker can access static files that are intended to be protected by route-based middleware by using repeated slashes in the request path.

This can lead to unauthorized access to sensitive files under the static root.

This issue affects applicatio

**Evidence:**
```
{
  "module": "@hono/node-server",
  "vulnerable_versions": "<1.19.13",
  "patched_versions": ">=1.19.13",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>@hono/node-server"
  ],
  "url": "https://github.com/advisories/GHSA-92pp-h63x-v22m"
}
```

**Remediation:** Upgrade to version 1.19.13 or later

### 🟡 [hono] hono Improperly Handles JSX Attribute Names Allows HTML Injection in hono/jsx SSR

- **ID:** `deps-cve-1116669`
- **Severity:** medium
- **CWE:** CWE-79

## Summary

Improper handling of JSX attribute names in hono/jsx allows malformed attribute keys to corrupt the generated HTML output.

When untrusted input is used as attribute keys during server-side rendering, specially crafted keys can break out of attribute or tag boundaries and inject unintended HTML.

## Details

When rendering JSX elements to HTML strings, attribute values are escaped, but attribute names (keys) were previously inserted into the output without validation.

If an attribute name contains characters such as `"`, `>`, or whitespace, it can alter the structure of the generated HTML.

For example, malformed attribute names can:

* Break out of the current attribute and introduce unintended additional attributes
* Break out of the current HTML tag and inject new elements into the output

This issue arises when untrusted input (such as query parameters or form data) is used as JSX attribute keys during server-side rendering.

## Impact

An attacker who can control attr

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.14",
  "patched_versions": ">=4.12.14",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-458j-xx4x-4375"
}
```

**Remediation:** Upgrade to version 4.12.14 or later

### 🟡 [postcss] PostCSS has XSS via Unescaped </style> in its CSS Stringify Output

- **ID:** `deps-cve-1117015`
- **Severity:** medium
- **CWE:** CWE-79
- **CVE:** CVE-2026-41305

# PostCSS: XSS via Unescaped `</style>` in CSS Stringify Output

## Summary

PostCSS v8.5.5 (latest) does not escape `</style>` sequences when stringifying CSS ASTs. When user-submitted CSS is parsed and re-stringified for embedding in HTML `<style>` tags, `</style>` in CSS values breaks out of the style context, enabling XSS.

## Proof of Concept

```javascript
const postcss = require('postcss');

// Parse user CSS and re-stringify for page embedding
const userCSS = 'body { content: "</style><script>alert(1)</script><style>"; }';
const ast = postcss.parse(userCSS);
const output = ast.toResult().css;
const html = `<style>${output}</style>`;

console.log(html);
// <style>body { content: "</style><script>alert(1)</script><style>"; }</style>
//
// Browser: </style> closes the style tag, <script> executes
```

**Tested output** (Node.js v22, postcss v8.5.5):
```
Input: body { content: "</style><script>alert(1)</script><style>"; }
Output: body { content: "</style><script>alert(1)</script><s

**Evidence:**
```
{
  "module": "postcss",
  "vulnerable_versions": "<8.5.10",
  "patched_versions": ">=8.5.10",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "web>postcss"
  ],
  "url": "https://github.com/advisories/GHSA-qx2v-qp2m-jg93"
}
```

**Remediation:** Upgrade to version 8.5.10 or later

### 🟡 [hono] Hono has incorrect IP matching in ipRestriction() for IPv4-mapped IPv6 addresses

- **ID:** `deps-cve-1117087`
- **Severity:** medium
- **CWE:** CWE-180
- **CVE:** CVE-2026-39409

## Summary

`ipRestriction()` does not canonicalize IPv4-mapped IPv6 client addresses (e.g. `::ffff:127.0.0.1`) before applying IPv4 allow or deny rules. In environments such as Node.js dual-stack, this can cause IPv4 rules to fail to match, leading to unintended authorization behavior.

## Details

The middleware classifies client addresses based on their textual form. Addresses containing "`:`" are treated as IPv6, including IPv4-mapped IPv6 addresses such as `::ffff:127.0.0.1`. These addresses are not normalized to IPv4 before matching.

As a result:

* IPv4 static rules (e.g. `127.0.0.1`) do not match because the raw string differs
* IPv4 CIDR rules (e.g. `127.0.0.0/8`, `10.0.0.0/8`) are skipped because the address is treated as IPv6

For example, with:

`denyList: ['127.0.0.1']`

a request from `127.0.0.1` may be represented as `::ffff:127.0.0.1` and bypass the deny rule.

This behavior commonly occurs in Node.js environments where IPv4 clients are exposed as IPv4-mapped IPv6 addr

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.12",
  "patched_versions": ">=4.12.12",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-xpcf-pg52-r92g"
}
```

**Remediation:** Upgrade to version 4.12.12 or later

### 🟡 [hono] Hono has CSS Declaration Injection via Style Object Values in JSX SSR

- **ID:** `deps-cve-1117915`
- **Severity:** medium
- **CWE:** CWE-74,CWE-116
- **CVE:** CVE-2026-44458

### Summary

The JSX renderer escapes `style` attribute object values for HTML but not for CSS. Untrusted input in a `style` object value or property name can therefore inject additional CSS declarations into the rendered `style` attribute. The impact is limited to CSS and does not allow JavaScript execution or HTML attribute breakout.

### Details

`style` object values are serialized into a CSS declaration list and escaped for HTML attribute context only. Characters that act as CSS declaration boundaries — such as `;`, comment markers, quoted strings, and block delimiters — are valid in HTML attribute content and can extend a value beyond its assigned property.

This issue arises when untrusted input is interpolated into a JSX `style` object and rendered server-side.

### Impact

An attacker who can control the value or property name of a `style` object may inject arbitrary CSS declarations. This may lead to:

- Visual manipulation of the page, including full-viewport overlays usable

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.18",
  "patched_versions": ">=4.12.18",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-qp7p-654g-cw7p"
}
```

**Remediation:** Upgrade to version 4.12.18 or later

### 🟡 [ip-address] ip-address has XSS in Address6 HTML-emitting methods

- **ID:** `deps-cve-1118827`
- **Severity:** medium
- **CWE:** CWE-79
- **CVE:** CVE-2026-42338

### Summary

`Address6.group()` and `Address6.link()` do not HTML-escape attacker-controlled content before embedding it in the HTML strings they return, and `AddressError.parseMessage` (emitted by the `Address6` constructor for invalid input) can contain unescaped attacker-controlled content in one branch. An application that (1) passes untrusted input to `Address6` and (2) renders the output of these methods, or the thrown error's `parseMessage`, as HTML (e.g. via `innerHTML`) is vulnerable to cross-site scripting. A related issue in `v6.helpers.spanAll()` produced malformed markup but was not exploitable; it is hardened in the same release for consistency.

### Details

Four related issues were identified and fixed together:

1. **`Address6.group()`: zone ID injection.** The `Address6` constructor stores the raw input (including any IPv6 zone ID) in `this.address` before zone stripping. `group()` then passed `this.address` to `helpers.simpleGroup()`, which wrapped each `:`-separated

**Evidence:**
```
{
  "module": "ip-address",
  "vulnerable_versions": "<=10.1.0",
  "patched_versions": ">=10.1.1",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>express-rate-limit>ip-address"
  ],
  "url": "https://github.com/advisories/GHSA-v2v4-37r5-5v8g"
}
```

**Remediation:** Upgrade to version 10.1.1 or later

### 🟡 [hono] Hono's Cache Middleware ignores Vary: Authorization / Vary: Cookie leading to cross-user cache leakage

- **ID:** `deps-cve-1118964`
- **Severity:** medium
- **CWE:** CWE-524
- **CVE:** CVE-2026-44457

### Summary

Cache Middleware does not skip caching for responses that declare per-user variance via `Vary: Authorization` or `Vary: Cookie`. As a result, a response cached for one authenticated user may be served to subsequent requests from different users.

### Details

The Cache Middleware skips caching when a response carries `Vary: *`, certain `Cache-Control` directives (`private`, `no-store`, `no-cache`), or `Set-Cookie`. However, `Vary: Authorization` and `Vary: Cookie` — the standard signals defined in RFC 9110 / RFC 9111 to indicate per-user responses — are not treated as cache-skip reasons.

This issue arises when applications use the Cache Middleware on endpoints that return user-specific data and rely on `Vary: Authorization` or `Vary: Cookie` to scope the response per user, without also setting `Cache-Control: private`.

### Impact

A user may receive a cached response that was originally generated for a different authenticated user. This may lead to:

- Disclosure of pers

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.18",
  "patched_versions": ">=4.12.18",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-p77w-8qqv-26rm"
}
```

**Remediation:** Upgrade to version 4.12.18 or later

### 🟡 [hono] Hono: bodyLimit() can be bypassed for chunked / unknown-length requests

- **ID:** `deps-cve-1118982`
- **Severity:** medium
- **CWE:** CWE-400
- **CVE:** CVE-2026-44456

## Summary

`bodyLimit()` does not reliably enforce `maxSize` for requests without a usable `Content-Length` (e.g. `Transfer-Encoding: chunked`). Oversized requests can reach handlers and return `200` instead of `413`.

## Details

For chunked / unknown-length requests, `bodyLimit()` wraps the body in a stream that counts bytes asynchronously, then runs the handler before the size decision is final. The `413` is only applied afterwards by checking `c.error`.

This lets the limit be bypassed when:

- the handler does not read the body,
- the handler reads only the first chunk(s) and returns, or
- the handler reads the body but swallows the read error in `try/catch`.

In all three cases the handler returns `200` before the limit check completes (or its result is observed).

The fix is to enforce the size decision before `next()` runs, instead of retrofitting the response via `c.error` afterwards.

## Impact

Applications relying on `bodyLimit()` as a hard boundary can be bypassed: oversi

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.16",
  "patched_versions": ">=4.12.16",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-9vqf-7f2p-gf9v"
}
```

**Remediation:** Upgrade to version 4.12.16 or later

### 🟡 [hono] hono/jsx has Unvalidated JSX Tag Names that May Allow HTML Injection

- **ID:** `deps-cve-1118983`
- **Severity:** medium
- **CWE:** CWE-74
- **CVE:** CVE-2026-44455

## Summary

Improper handling of JSX element tag names in hono/jsx allowed unvalidated tag names to be directly inserted into the generated HTML output.

When untrusted input is used as a tag name via the programmatic `jsx()` or `createElement()` APIs during server-side rendering, specially crafted values may break out of the intended element context and inject unintended HTML.

## Details

When rendering JSX elements to HTML strings, attribute values are escaped and attribute names are validated. However, element tag names were previously inserted into the output without validation.

If a tag name contains characters such as `<`, `>`, quotes, or whitespace, it may alter the structure of the generated HTML.

For example, malformed tag names can:

* Break out of the intended element and introduce unintended HTML elements
* Inject attributes or event handlers into the rendered output

This issue arises when untrusted input (such as query parameters or database content) is used as JSX tag

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.16",
  "patched_versions": ">=4.12.16",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-69xw-7hcm-h432"
}
```

**Remediation:** Upgrade to version 4.12.16 or later

### 🟡 [ws] ws: Uninitialized memory disclosure

- **ID:** `deps-cve-1119108`
- **Severity:** medium
- **CWE:** CWE-908
- **CVE:** CVE-2026-45736

### Impact

The `websocket.close()` implementation is vulnerable to uninitialized memory disclosure when a `TypedArray` is passed as the reason argument.

### Proof of concept

```js
import { deepStrictEqual } from 'node:assert';
import { WebSocket, WebSocketServer } from 'ws';

const wss = new WebSocketServer(
  { port: 0, skipUTF8Validation: true },
  function () {
    const { port } = wss.address();
    const ws = new WebSocket(`ws://localhost:${port}`, {
      skipUTF8Validation: true
    });

    ws.on('close', function (code, reason) {
      deepStrictEqual(reason, Buffer.alloc(80));
    });
  }
);

wss.on('connection', function (ws) {
  ws.close(1000, new Float32Array(20));
});
```

### Patches

The vulnerability was fixed in ws@8.20.1 (https://github.com/websockets/ws/commit/c0327ec15a54d701eb6ccefaa8bef328cfc03086).

### Credits

Credit for the private and responsible disclosure of this issue goes to [Nikita Skovoroda](https://github.com/ChALkeR).

### Remarks

Although the ca

**Evidence:**
```
{
  "module": "ws",
  "vulnerable_versions": ">=8.0.0 <8.20.1",
  "patched_versions": ">=8.20.1",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>ws"
  ],
  "url": "https://github.com/advisories/GHSA-58qx-3vcg-4xpx"
}
```

**Remediation:** Upgrade to version 8.20.1 or later

### 🟡 [uuid] uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided

- **ID:** `deps-cve-1119441`
- **Severity:** medium
- **CWE:** CWE-787,CWE-1285
- **CVE:** CVE-2026-41907

### Summary

The `v3()`, `v5()`, and `v6()` [API methods](https://github.com/uuidjs/uuid#api-summary) (not `uuid` release versions) accept external output buffers but do not reject out-of-range writes (small `buf` or large `offset`).  
By contrast, `v4()`, `v1()`, and `v7()` API methods explicitly throw `RangeError` on invalid bounds.

This inconsistency allows **silent partial writes** into caller-provided buffers.


### Affected code

- `src/v35.ts` (`v3()`/`v5()` path) writes `buf[offset + i]` without bounds validation.
- `src/v6.ts` writes `buf[offset + i]` without bounds validation.

### Reproducible PoC

```bash
cd /home/StrawHat/uuid
npm ci
npm run build

node --input-type=module -e "
import {v4,v5,v6} from './dist-node/index.js';
const ns='6ba7b810-9dad-11d1-80b4-00c04fd430c8';
for (const [name,fn] of [
  ['v4()',()=>v4({},new Uint8Array(8),4)],
  ['v5()',()=>v5('x',ns,new Uint8Array(8),4)],
  ['v6()',()=>v6({},new Uint8Array(8),4)],
]) {
  try { fn(); console.log(name,'NO_THRO

**Evidence:**
```
{
  "module": "uuid",
  "vulnerable_versions": "<11.1.1",
  "patched_versions": ">=11.1.1",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    ".>testcontainers>dockerode>uuid"
  ],
  "url": "https://github.com/advisories/GHSA-w5hq-g745-h8pq"
}
```

**Remediation:** Upgrade to version 11.1.1 or later

### ⚪ [qs] qs's arrayLimit bypass in comma parsing allows denial of service

- **ID:** `deps-cve-1113161`
- **Severity:** low
- **CWE:** CWE-20
- **CVE:** CVE-2026-2391

### Summary
The `arrayLimit` option in qs does not enforce limits for comma-separated values when `comma: true` is enabled, allowing attackers to cause denial-of-service via memory exhaustion. This is a bypass of the array limit enforcement, similar to the bracket notation bypass addressed in GHSA-6rw7-vpxm-498p (CVE-2025-15284).

### Details
When the `comma` option is set to `true` (not the default, but configurable in applications), qs allows parsing comma-separated strings as arrays (e.g., `?param=a,b,c` becomes `['a', 'b', 'c']`). However, the limit check for `arrayLimit` (default: 20) and the optional throwOnLimitExceeded occur after the comma-handling logic in `parseArrayValue`, enabling a bypass. This permits creation of arbitrarily large arrays from a single parameter, leading to excessive memory allocation.

**Vulnerable code** (lib/parse.js: lines ~40-50):
```js
if (val && typeof val === 'string' && options.comma && val.indexOf(',') > -1) {
    return val.split(',');
}

if (o

**Evidence:**
```
{
  "module": "qs",
  "vulnerable_versions": ">=6.7.0 <=6.14.1",
  "patched_versions": ">=6.14.2",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    ".>supertest>superagent>qs"
  ],
  "url": "https://github.com/advisories/GHSA-w7fw-mjwx-w883"
}
```

**Remediation:** Upgrade to version 6.14.2 or later

### ⚪ [hono] Hono added timing comparison hardening in basicAuth and bearerAuth

- **ID:** `deps-cve-1113311`
- **Severity:** low
- **CWE:** CWE-208

## Summary

The `basicAuth` and `bearerAuth` middlewares previously used a comparison that was not fully timing-safe.

The `timingSafeEqual` function used normal string equality (`===`) when comparing hash values. This comparison may stop early if values differ, which can theoretically cause small timing differences.

The implementation has been updated to use a safer comparison method.


## Details

The issue was caused by the use of normal string equality (`===`) when comparing hash values inside the `timingSafeEqual` function.

In JavaScript, string comparison may stop as soon as a difference is found. This means the comparison time can slightly vary depending on how many characters match.

Under very specific and controlled conditions, this behavior could theoretically allow timing-based analysis.

The implementation has been updated to:

- Avoid early termination during comparison
- Use a constant-time-style comparison method

## Impact

This issue is unlikely to be exploited in n

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.11.10",
  "patched_versions": ">=4.11.10",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-gq3j-xvxp-8hrf"
}
```

**Remediation:** Upgrade to version 4.11.10 or later

### ⚪ [hono] Hono has improper validation of NumericDate claims (exp, nbf, iat) in JWT verify()

- **ID:** `deps-cve-1118963`
- **Severity:** low
- **CWE:** CWE-1284
- **CVE:** CVE-2026-44459

### Summary

Improper validation of the JWT NumericDate claims `exp`, `nbf`, and `iat` in `hono/utils/jwt` allows tokens with non-spec-compliant claim values to silently bypass time-based checks. This issue is not exploitable by an anonymous attacker; it only manifests when a malformed claim value reaches `verify()` — typically when the application itself issues such tokens, or when the signing key is otherwise under attacker control.

### Details

The validation routine combined option, presence, and threshold checks in a single short-circuiting expression, so several classes of malformed values were silently skipped instead of rejected:

- A falsy numeric value short-circuited the presence check.
- A non-finite numeric value compared as never-after-now and never-expired.
- A non-numeric type produced NaN comparisons that evaluated false.

This deviates from RFC 7519 §4.1.4, which defines NumericDate as a finite JSON numeric value.

### Impact

An actor able to issue tokens accepted b

**Evidence:**
```
{
  "module": "hono",
  "vulnerable_versions": "<4.12.18",
  "patched_versions": ">=4.12.18",
  "consumingWorkspace": null,
  "dependencyChains": [],
  "auditPathsField": [
    "api>@modelcontextprotocol/sdk>hono"
  ],
  "url": "https://github.com/advisories/GHSA-hm8q-7f3q-5f36"
}
```

**Remediation:** Upgrade to version 4.12.18 or later

## manual-error-verbosity

### 🟠 Error responses leak stack traces / file paths to clients

- **ID:** `error-stack-leak`
- **Severity:** high
- **CWE:** CWE-209 (Information Exposure Through an Error Message)

1 probe response(s) include Node.js stack-trace format. Production builds should sanitize.

**Evidence:**
```
[
  {
    "probe": "non-JSON body to POST /api/issues",
    "status": 400,
    "body": "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>SyntaxError: Unexpected token &#39;t&#39;, &quot;this-is-not-json&quot; is not valid JSON<br> &nbsp; &nbsp;at JSON.parse (&lt;anonymous&gt;)<br> &nbsp; &nbsp;at createStrictSyntaxError (C:\\Users\\tyler\\ship\\node_modules\\.pnpm\\body-parser@1.20.4\\node_modules\\body-parser\\lib\\types\\json.js:169:10)<br> &nbsp; &nbsp;at parse (C:\\Users\\tyler\\ship\\node_modules\\.pnpm\\body-parser@1.20.4\\node_modules\\bod"
  }
]
```

## input

### 🟡 Search response echoes raw query (reflected XSS surface)

- **ID:** `input-xss-reflected`
- **Severity:** medium

3 payloads were echoed verbatim in the search response. Since the response is JSON and Ship's web renders results via React (which escapes), the risk is low in the browser — but a third-party consumer of the API could interpret the JSON differently.

**Evidence:**
```
[
  {
    "payload": "<script>alert(1)</script>",
    "status": 200,
    "reflectedVerbatim": true
  },
  {
    "payload": "<img src=x onerror=alert(1)>",
    "status": 200,
    "reflectedVerbatim": true
  },
  {
    "payload": "javascript:alert(1)",
    "status": 200,
    "reflectedVerbatim": true
  }
]
```

### ⚪ XSS-shaped strings accepted as issue title (stored vector)

- **ID:** `input-xss-stored-in-title`
- **Severity:** low
- **CWE:** CWE-79 (XSS)

All 5 XSS payloads were stored verbatim in the issue title. This is NOT a vulnerability on its own — Ship renders titles via React, which text-escapes by default — but it relies on no consumer ever using `dangerouslySetInnerHTML` on a title. Recommend explicit input sanitization OR a render-side test that catches dangerous-html usage on title fields.

**Evidence:**
```
[
  {
    "payload": "<script>alert(1)</script>",
    "status": 201
  },
  {
    "payload": "<img src=x onerror=alert(1)>",
    "status": 201
  },
  {
    "payload": "javascript:alert(1)",
    "status": 201
  },
  {
    "payload": "\"><script>alert(1)</script>",
    "status": 201
  },
  {
    "payload": "<svg onload=alert(1)>",
    "status": 201
  }
]
```

**Remediation:** Add a unit test that fails if any title-rendering call site uses dangerouslySetInnerHTML, OR sanitize title server-side via a allowlist regex.

### ⚪ document title (wiki): XSS-shaped input accepted (stored verbatim)

- **ID:** `input-document-title-wiki--accepts-xss`
- **Severity:** low
- **CWE:** CWE-79

/api/documents accepted XSS payloads. Same render-side safety story as the issue-title case: React text-escape prevents execution as long as no consumer uses dangerouslySetInnerHTML on this field. Server-side allowlist or render-side test would harden the surface.

**Evidence:**
```
[
  {
    "payload": "<script>alert(1)</script>",
    "status": 201,
    "echoedVerbatim": true
  },
  {
    "payload": "<img src=x onerror=alert(1)>",
    "status": 201,
    "echoedVerbatim": true
  }
]
```

### ⚪ document content (wiki TipTap): XSS-shaped input accepted (stored verbatim)

- **ID:** `input-document-content-wiki-tiptap--accepts-xss`
- **Severity:** low
- **CWE:** CWE-79

/api/documents accepted XSS payloads. Same render-side safety story as the issue-title case: React text-escape prevents execution as long as no consumer uses dangerouslySetInnerHTML on this field. Server-side allowlist or render-side test would harden the surface.

**Evidence:**
```
[
  {
    "payload": "<script>alert(1)</script>",
    "status": 201,
    "echoedVerbatim": true
  },
  {
    "payload": "<img src=x onerror=alert(1)>",
    "status": 201,
    "echoedVerbatim": true
  }
]
```

### ⚪ project title: XSS-shaped input accepted (stored verbatim)

- **ID:** `input-project-title-accepts-xss`
- **Severity:** low
- **CWE:** CWE-79

/api/projects accepted XSS payloads. Same render-side safety story as the issue-title case: React text-escape prevents execution as long as no consumer uses dangerouslySetInnerHTML on this field. Server-side allowlist or render-side test would harden the surface.

**Evidence:**
```
[
  {
    "payload": "<script>alert(1)</script>",
    "status": 201,
    "echoedVerbatim": true
  },
  {
    "payload": "<img src=x onerror=alert(1)>",
    "status": 201,
    "echoedVerbatim": true
  }
]
```

### 🟢 SQL injection payloads are inert (parameterized queries verified)

- **ID:** `input-sql-injection-inert`
- **Severity:** ok

4 SQL injection payloads were stored as literal text. No pg_sleep delay observed (all responses <4s). Parameterized queries via `pg` are preventing execution.

**Evidence:**
```
[
  {
    "payload": "'; DROP TABLE documents; --",
    "status": 201,
    "elapsedMs": 18
  },
  {
    "payload": "' OR '1'='1",
    "status": 201,
    "elapsedMs": 14
  },
  {
    "payload": "' UNION SELECT password_hash FROM users --",
    "status": 201,
    "elapsedMs": 18
  },
  {
    "payload": "1; SELECT pg_sleep(5)",
    "status": 201,
    "elapsedMs": 15
  }
]
```

### 🟢 Oversized inputs are rejected with 400/413

- **ID:** `input-length-rejected`
- **Severity:** ok

10 KB / 100 KB / 1 MB inputs all rejected. Zod validation + body-parser size limits are working.

**Evidence:**
```
[
  {
    "probe": "10KB string",
    "status": 400
  },
  {
    "probe": "100KB string",
    "status": 400
  },
  {
    "probe": "1MB string",
    "status": 400
  }
]
```

## websocket

### ⚪ Server silently accepted 64-byte random binary on WS

- **ID:** `ws-malformed-silently-accepted-64-byte-random-binary`
- **Severity:** low

Sent 64-byte random binary; WS stayed open and server stayed responsive. No error, no rejection. Indicates the frame was discarded by Yjs's parser without explicit validation feedback.

**Evidence:**
```
{
  "frameRejected": false,
  "closeCode": 1005,
  "serverAliveAfter": true
}
```

### ⚪ Server silently accepted text frame to binary Yjs endpoint on WS

- **ID:** `ws-malformed-silently-accepted-text-frame-to-binary-yjs-endpoint`
- **Severity:** low

Sent text frame to binary Yjs endpoint; WS stayed open and server stayed responsive. No error, no rejection. Indicates the frame was discarded by Yjs's parser without explicit validation feedback.

**Evidence:**
```
{
  "frameRejected": false,
  "closeCode": 1005,
  "serverAliveAfter": true
}
```

### ⚪ Server silently accepted unknown messageType varuint=99 on WS

- **ID:** `ws-malformed-silently-accepted-unknown-messagetype-varuint-99`
- **Severity:** low

Sent unknown messageType varuint=99; WS stayed open and server stayed responsive. No error, no rejection. Indicates the frame was discarded by Yjs's parser without explicit validation feedback.

**Evidence:**
```
{
  "frameRejected": false,
  "closeCode": 1005,
  "serverAliveAfter": true
}
```

### 🟢 /events WebSocket rejects unauthenticated upgrade

- **ID:** `ws-events-requires-auth`
- **Severity:** ok

Connection without session_id cookie was refused at the upgrade handshake (closeCode=1006, gotOpenEvent=false).

**Evidence:**
```
{
  "openedSuccessfully": false,
  "gotErrorBeforeOpen": true,
  "gotOpenEvent": false,
  "closeCode": 1006,
  "closeReason": "",
  "elapsedMs": 18
}
```

### 🟢 /collaboration WebSocket rejects unauthenticated upgrade

- **ID:** `ws-collab-requires-auth`
- **Severity:** ok

Connection to a Yjs collab endpoint without session_id was refused at the upgrade (closeCode=1006).

**Evidence:**
```
{
  "openedSuccessfully": false,
  "gotErrorBeforeOpen": true,
  "gotOpenEvent": false,
  "closeCode": 1006,
  "closeReason": "",
  "elapsedMs": 14
}
```

### 🟢 Unknown WebSocket paths are dropped without server error

- **ID:** `ws-unknown-path-handled`
- **Severity:** ok

Connection to /this-is-not-a-real-ws-endpoint was rejected at upgrade. No server panic, no resource leak detected.

**Evidence:**
```
{
  "openedSuccessfully": false,
  "gotErrorBeforeOpen": true,
  "gotOpenEvent": false,
  "closeCode": 1006,
  "closeReason": "",
  "elapsedMs": 7
}
```

### 🟢 Authenticated /collaboration connection succeeds

- **ID:** `ws-collab-auth-works`
- **Severity:** ok

Connection to /collaboration/wiki:<docId> with valid session_id opened successfully.

**Evidence:**
```
{
  "docId": "071af6d1-6bf6-4f83-b84a-909a8e9ae7e0",
  "openedAfterMs": 4005
}
```

### 🟢 Server correctly rejects 11 MB binary payload on WS

- **ID:** `ws-malformed-11-mb-binary-payload`
- **Severity:** ok

Sent 11 MB binary payload; WS closed with code 1009, but /health still 200 immediately after — server unaffected.

**Evidence:**
```
{
  "frameRejected": true,
  "closeCode": 1009,
  "serverAliveAfter": true
}
```

## manual-csp

### ⚪ CSP is set but includes unsafe-inline (low-impact concession)

- **ID:** `csp-present`
- **Severity:** low

Header includes 'unsafe-inline' — common for apps that need inline styles (TipTap, USWDS), but a strict CSP would use hashes or nonces.

**Evidence:**
```
{
  "csp": "default-src 'self';script-src 'self' 'unsafe-inline';style-src 'self' 'unsafe-inline';img-src 'self' data: blob: https:;connect-src 'self' wss: ws:;font-src 'self' data:;object-src 'none';frame-src 'none';base-uri 'self';form-action 'self';frame-ancestors 'self';script-src-attr 'none';upgrade-insecu"
}
```

## auth

### 🔵 Super-admin routes accessible with super-admin session

- **ID:** `auth-admin-route-access-as-superadmin`
- **Severity:** info

The seeded dev account has is_super_admin=true. Vertical check: admin can access admin routes (expected). Horizontal escalation tested separately below if --member-email/--member-password supplied.

**Evidence:**
```
[
  {
    "route": "/api/admin/users",
    "status": 401
  },
  {
    "route": "/api/admin/workspaces",
    "status": 401
  }
]
```

### 🔵 Horizontal privilege escalation not tested (no --member-* credentials supplied)

- **ID:** `auth-horizontal-escalation-not-configured`
- **Severity:** info

Run with --member-email=<non-admin-email> --member-password=<password> to verify that a regular workspace member cannot access /api/admin/* routes. Without this, only the vertical "admin can access admin" direction is verified.

### 🟢 All protected routes correctly require authentication

- **ID:** `auth-unauthenticated-access`
- **Severity:** ok

Probed 9 protected routes without credentials; every one returned 401/403/404. No unauthenticated access to authenticated data.

**Evidence:**
```
[
  {
    "route": "/api/auth/me",
    "status": 401
  },
  {
    "route": "/api/issues",
    "status": 401
  },
  {
    "route": "/api/documents?type=wiki",
    "status": 401
  },
  {
    "route": "/api/dashboard/my-work",
    "status": 401
  },
  {
    "route": "/api/weeks/my-week",
    "status": 401
  },
  {
    "route": "/api/projects",
    "status": 401
  },
  {
    "route": "/api/programs",
    "status": 401
  },
  {
    "route": "/api/team",
    "status": 404
  },
  {
    "route": "/api/workspaces",
    "status": 401
  }
]
```

### 🟢 Session token is 256 bits of entropy, hex-encoded

- **ID:** `auth-session-token-format`
- **Severity:** ok

Captured session_id is 64 hex chars (256 bits) — matches the documented `crypto.randomBytes(32).toString('hex')` shape in api/src/routes/auth.ts.

**Evidence:**
```
{
  "length": 64,
  "sample": "c6a3e4b6…b6b0"
}
```

### 🟢 Logout correctly invalidates the session token

- **ID:** `auth-logout-invalidates-session`
- **Severity:** ok

After POST /api/auth/logout, reusing the same session_id returns 401.

### 🟢 Malformed session IDs are rejected with 401

- **ID:** `auth-malformed-session-rejected`
- **Severity:** ok

Empty, oversized, SQL-shaped, and random-string session_ids all return 401.

**Evidence:**
```
[
  {
    "probe": "not-a-session-id",
    "status": 401
  },
  {
    "probe": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "status": 401
  },
  {
    "probe": "'); DROP TABLE sessions; --",
    "status": 401
  },
  {
    "probe": "",
    "status": 401
  }
]
```

### 🟢 Session timeouts are configured within sane bounds

- **ID:** `auth-session-timeout-configured`
- **Severity:** ok

Idle timeout: 900000ms (15 min); absolute timeout: 43200000ms (12 hr). Both used by api/src/middleware/auth.ts to enforce expiry. Runtime expiry not probed (would need a 15-min wait); empirically verified by api/src/__tests__/auth.test.ts.

**Evidence:**
```
{
  "SESSION_TIMEOUT_MS": 900000,
  "ABSOLUTE_SESSION_TIMEOUT_MS": 43200000
}
```

## manual-cors

### 🟢 CORS restricts cross-origin requests to a single configured origin

- **ID:** `cors-restricts-origin`
- **Severity:** ok

OPTIONS preflight from `https://evil.example.com` did NOT echo back the origin in Access-Control-Allow-Origin. Server returned `http://localhost:5173` (the configured CORS_ORIGIN).

**Evidence:**
```
{
  "access-control-allow-origin": "http://localhost:5173",
  "access-control-allow-credentials": "true"
}
```

## manual-secrets

### 🟢 No known secret patterns found in client bundle

- **ID:** `secrets-no-leaks-in-client-bundle`
- **Severity:** ok

Scanned web/dist for AWS keys, GitHub PATs, PEM-format private keys, database URLs, and inline SESSION_SECRET literals. Zero matches.

## manual-ratelimit

### 🟢 Login endpoint rate-limited after 6 failed attempts

- **ID:** `ratelimit-login-active`
- **Severity:** ok

POST /api/auth/login returned 429 on attempt #6. Brute-force protection is active. The skipSuccessfulRequests:true means only failed attempts count.

**Evidence:**
```
{
  "rateLimitedAtAttempt": 6
}
```
