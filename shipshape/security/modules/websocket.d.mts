/**
 * WebSocket probe — auth on upgrade, malformed-frame DoS, Origin allow-list.
 * See probe-types.d.mts for shared shapes.
 */
import type { ProbeConfig, ProbeResult } from '../probe-types.d.mts';

/**
 * Runs the WebSocket probe. Checks:
 *  - Unauthenticated /events and /collaboration upgrades are rejected
 *  - Unknown WS paths are dropped at handshake
 *  - CSWSH defense: WS upgrade carrying Origin: https://evil.example.com
 *    is refused before the auth check (Cat 8 Fix #4)
 *  - Malformed binary, oversized binary (>10 MB), text frames to binary
 *    Yjs endpoint, and unknown Yjs `messageType` varuint=99 — server must
 *    stay alive after each (Cat 8 Fix #1; the original critical finding)
 *
 * The `/health` endpoint is polled after each malformed frame to detect
 * process crashes. Six attempts with 500ms backoff absorbs tsx-watch
 * restart latency in dev.
 */
export function runWebSocketProbe(config: ProbeConfig): Promise<ProbeResult>;
