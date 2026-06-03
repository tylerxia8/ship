# PlugForge Five-Line Developer Story

The headline narrative for the demo is a tiny loop:

```bash
$ pnpm install @ship/sdk
$ ship login
$ ship docs create --title "hello"
$ ship webhooks tail
# document.created event arrives, signature verified
```

What each line proves:

| Line | Meaning |
|---|---|
| `pnpm install @ship/sdk` | The SDK is the developer-facing package surface. |
| `ship login` | Device Authorization Grant gets the developer a scoped token. |
| `ship docs create --title "hello"` | The CLI uses the SDK under the hood to create a public document. |
| `ship webhooks tail` | The CLI streams public delivery records while the subscriber verifies signed webhook payloads with the SDK helper. |
| `document.created event arrives, signature verified` | The useful loop closes: write through the API, receive a signed event, verify it, and observe it. |

CI runs the scripted version through `corepack.cmd pnpm drill ttfe`: install the
packed SDK into a temporary clean project, start the containerized Ship API when
needed, create a subscription, create a document, receive the webhook, verify
`Ship-Signature`, and confirm the delivery log under the configured target.
