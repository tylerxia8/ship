# Production deployment verification — Cat 8

- API: https://ship-api-76ez.onrender.com
- Web: https://ship-henna.vercel.app
- Run at: 2026-05-22T20:25:54.812Z

## Severity counts

- **ok**: 12

## Checks

### ✓ prod-api-health — ok

API /health → 200

```json
{
  "status": 200,
  "headers": {
    "access-control-allow-credentials": "true",
    "access-control-allow-origin": "https://ship-henna.vercel.app",
    "alt-svc": "h3=\":443\"; ma=86400",
    "cf-cache-status": "DYNAMIC",
    "cf-ray": "9ffe8d74cf386a82-DFW",
    "connection": "keep-alive",
    "content-encoding": "br",
    "content-length": "19",
    "content-security-policy": "default-src 'self';script-src 'self' 'unsafe-inline';style-src 'self' 'unsafe-inline';img-src 'self' data: blob: https:;connect-src 'self' wss: ws:;font-src 'self' data:;object-src 'none';frame-src 'none';base-uri 'self';form-action 'self';frame-ancestors 'self';script-src-attr 'none';upgrade-insecure-requests",
    "content-type": "application/json; charset=utf-8",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "cross-origin",
    "date": "Fri, 22 May 2026 20:25:52 GMT",
    "etag": "W/\"f-VaSQ4oDUiZblZNAEkkN+sX+q3Sg\"",
    "origin-agent-cluster": "?1",
    "referrer-policy": "no-referrer",
    "rndr-id": "acb936b7-3561-4104",
    "server": "cloudflare",
    "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
    "vary": "Origin, Accept-Encoding",
    "x-content-type-options": "nosniff",
    "x-dns-prefetch-control": "off",
    "x-download-options": "noopen",
    "x-frame-options": "SAMEORIGIN",
    "x-permitted-cross-domain-policies": "none",
    "x-render-origin-server": "Render",
    "x-xss-protection": "0"
  }
}
```

### ✓ prod-web-root — ok

Web / → 200

```json
{
  "status": 200
}
```

### ✓ prod-security-headers — ok

All required hardening headers present

```json
{
  "present": [
    "strict-transport-security",
    "x-content-type-options",
    "referrer-policy",
    "content-security-policy",
    "cross-origin-opener-policy"
  ],
  "missing": [],
  "csp": "default-src 'self';script-src 'self' 'unsafe-inline';style-src 'self' 'unsafe-inline';img-src 'self' data: blob: https:;connect-src 'self' wss: ws:;font-src 'self' data:;object-src 'none';frame-src 'none';base-uri 'self';form-action 'self';"
}
```

### ✓ prod-cors-evil-origin — ok

CORS preflight rejects evil.example.com origin

```json
{
  "responseStatus": 204,
  "allowOrigin": "https://ship-henna.vercel.app"
}
```

### ✓ prod-cors-legit-origin — ok

CORS allows production web origin (https://ship-henna.vercel.app)

```json
{
  "responseStatus": 204,
  "allowOrigin": "https://ship-henna.vercel.app"
}
```

### ✓ prod-body-parser-sanitized — ok

Malformed JSON → sanitized {code: VALIDATION_ERROR} envelope, no stack leak (Fix #3 live)

```json
{
  "status": 400,
  "body": "{\"success\":false,\"error\":{\"code\":\"VALIDATION_ERROR\",\"message\":\"Request body is not valid JSON\"}}"
}
```

### ✓ prod-ws-events-unauth-rejected — ok

/events WS rejected at handshake (closeCode=1006, openedFirst=false)

```json
{
  "opened": false,
  "closeCode": 1006,
  "reason": ""
}
```

### ✓ prod-ws-collab-unauth-rejected — ok

/collaboration WS rejected at handshake (closeCode=1006, openedFirst=false)

```json
{
  "opened": false,
  "closeCode": 1006,
  "reason": ""
}
```

### ✓ prod-ws-unknown-path-rejected — ok

unknown WS path rejected at handshake (closeCode=1006, openedFirst=false)

```json
{
  "opened": false,
  "closeCode": 1006,
  "reason": ""
}
```

### ✓ prod-ws-collab-rejects-evil-origin — ok

/collaboration WS with evil Origin (Fix #4) rejected at handshake (closeCode=1006, openedFirst=false)

```json
{
  "opened": false,
  "closeCode": 1006,
  "reason": ""
}
```

### ✓ prod-ws-events-rejects-evil-origin — ok

/events WS with evil Origin (Fix #4) rejected at handshake (closeCode=1006, openedFirst=false)

```json
{
  "opened": false,
  "closeCode": 1006,
  "reason": ""
}
```

### ✓ prod-api-alive-after-ws-probes — ok

API /health still 200 after unauthenticated WS upgrade attempts (no crash)

```json
{
  "status": 200
}
```
