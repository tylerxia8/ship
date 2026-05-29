/**
 * Build a FleetGraph trace matrix for final submission.
 *
 * The early submission used two representative public traces to prove
 * different graph shapes. Final feedback said unique traces are expected per
 * use case. This script finds distinct top-level LangSmith runs that match the
 * documented FleetGraph test cases so each row in FLEETGRAPH.md can get its own
 * public share URL.
 *
 * Run:
 *   LANGSMITH_API_KEY=... LANGSMITH_PROJECT=fleetgraph-prod \
 *     pnpm --filter @ship/agent exec tsx src/scripts/list-use-case-traces.ts
 *
 * Then open each run in LangSmith, use Share -> Create public link, and paste
 * the resulting URL into FLEETGRAPH.md.
 */

import { Client } from 'langsmith';
import { config } from '../config.js';

interface RunSummary {
  id: string;
  name: string;
  start: string;
  status: string;
  childCount: number;
  hasHumanGate: boolean;
  matchedText: string;
  score: number;
}

interface TraceTarget {
  id: string;
  label: string;
  needles: string[];
}

const traceTargets: TraceTarget[] = [
  {
    id: 'TC1',
    label: 'Issue blocker traversal',
    needles: ['fc466b06', 'blocking anything', 'blocker_check'],
  },
  {
    id: 'TC2',
    label: 'Sprint slip / planning risk',
    needles: ['09e44014', 'slipping', 'confidence_score', '42.4'],
  },
  {
    id: 'TC3',
    label: 'Proactive scan',
    needles: ['proactive_scan', 'scan-', 'mode":"proactive'],
  },
  {
    id: 'TC4',
    label: 'HITL approve/resume',
    needles: ['approved', 'human_gate', 'resume'],
  },
  {
    id: 'TC5',
    label: 'Browser end-to-end issue chat',
    needles: ['dev@ship.local', 'fc466b06', 'chat-'],
  },
  {
    id: 'TC6',
    label: 'Latency check',
    needles: ['action_decision', 'finalize', 'human_gate'],
  },
  {
    id: 'TC7',
    label: 'Production manual scan on Week 17',
    needles: ['9fd08ede', 'fleetgraph-prod', 'e722608b'],
  },
  {
    id: 'TC8',
    label: 'Production load query on Week 17',
    needles: ['chat-1779824300747-raspkji9', 'load_check', 'overloaded'],
  },
  {
    id: 'TC9',
    label: 'Production diff query on Week 17',
    needles: ['chat-1779824310181-e78tjiaa', 'diff_query', 'retro'],
  },
  {
    id: 'TC10',
    label: 'Timed production proactive scan',
    needles: ['timed-1779824299857', '883dec33', 'proactive_scan'],
  },
];

function stringifyRun(run: unknown): string {
  return JSON.stringify(run, (_key, value) => {
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return value.toISOString();
    return value;
  }).toLowerCase();
}

function matchingNeedles(haystack: string, needles: string[]): string[] {
  return needles.filter((needle) => haystack.includes(needle.toLowerCase()));
}

async function summarizeRun(
  run: { id: string; name?: string | null; status?: string | null; start_time?: Date | string | number | null },
  childCount: number,
  hasHumanGate: boolean,
  matchedText: string,
  score: number,
): Promise<RunSummary> {
  return {
    id: run.id,
    name: run.name ?? '(no name)',
    start: run.start_time?.toString() ?? '',
    status: run.status ?? '',
    childCount,
    hasHumanGate,
    matchedText,
    score,
  };
}

async function main(): Promise<void> {
  const client = new Client({
    apiKey: config.langsmith.apiKey,
    apiUrl: config.langsmith.endpoint,
  });

  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const candidates = new Map<string, RunSummary[]>();

  console.log(`[trace-matrix] project: ${config.langsmith.project}`);
  console.log(`[trace-matrix] searching top-level runs since ${cutoff.toISOString()}`);
  console.log('');

  for await (const run of client.listRuns({
    projectName: config.langsmith.project,
    executionOrder: 1,
    startTime: cutoff,
  })) {
    let haystack = stringifyRun(run);
    let childCount = 0;
    let hasHumanGate = false;

    for await (const child of client.listRuns({ traceId: run.id })) {
      childCount++;
      if (child.name === 'human_gate') hasHumanGate = true;
      haystack += stringifyRun(child);
      if (childCount > 100) break;
    }

    for (const target of traceTargets) {
      const matchedNeedles = matchingNeedles(haystack, target.needles);
      if (matchedNeedles.length === 0) continue;
      const summary = await summarizeRun(
        run,
        childCount,
        hasHumanGate,
        matchedNeedles.join(', '),
        matchedNeedles.length,
      );
      candidates.set(target.id, [...(candidates.get(target.id) ?? []), summary]);
    }
  }

  const matches = new Map<string, RunSummary>();
  const usedRunIds = new Set<string>();

  for (const target of traceTargets) {
    const sortedCandidates = (candidates.get(target.id) ?? []).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.start.localeCompare(a.start);
    });
    const uniqueCandidate = sortedCandidates.find((candidate) => !usedRunIds.has(candidate.id));
    if (!uniqueCandidate) continue;
    matches.set(target.id, uniqueCandidate);
    usedRunIds.add(uniqueCandidate.id);
  }

  console.log('| Test Case | Unique LangSmith Run ID | Shape | Public Trace URL |');
  console.log('|---|---|---|---|');

  for (const target of traceTargets) {
    const match = matches.get(target.id);
    if (!match) {
      console.log(`| ${target.id} - ${target.label} | MISSING - rerun this scenario | TBD | TBD |`);
      continue;
    }

    const shape = match.hasHumanGate ? 'HITL / human_gate' : 'read-only or proactive finalize';
    console.log(`| ${target.id} - ${target.label} | ${match.id} | ${shape}; matched ${match.matchedText} | TODO: Share this run in LangSmith |`);
  }

  console.log('');
  console.log('Share workflow:');
  console.log('1. Open https://smith.langchain.com and select the project above.');
  console.log('2. Search each run ID from the table.');
  console.log('3. Open the run, click Share, create a public link, and paste it into FLEETGRAPH.md.');
  console.log('4. Do not reuse a public URL across rows; each test case should point to a distinct run.');
}

main().catch((err) => {
  console.error('[trace-matrix] FAILED:', err);
  process.exit(1);
});
