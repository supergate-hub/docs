/**
 * Ask AI eval. Runs each case against the pre-change baseline and the current assistant with one
 * fixed OpenRouter model, scores the answers with rule-based checks, and writes a JSON report.
 *
 *   pnpm eval:ask-ai [--variants baseline,current] [--cases id,id] [--reps 1]
 *   pnpm eval:ask-ai --rescore scripts/ask-ai-eval/results/<report>.json
 *
 * Needs the docs dev server for /llms-full.txt (DOCS_URL, default http://localhost:3000) and
 * OPENROUTER_API_KEY in .env.local. EVAL_MODEL picks the model; free models are capped per day,
 * so the run stops early when the remaining free requests run low. --rescore re-applies the
 * checks to a saved report without calling the model.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel, ModelMessage } from 'ai';
import {
  createDocsIndex,
  type DocsIndex,
  type DocsPage,
  parseLlmsText,
  rewriteCitations,
  streamDocsAnswer,
  toModelMessages,
} from '../../lib/ai/assistant';
import type { ChatUIMessage } from '../../lib/ai/types';
import { streamBaselineAnswer } from './baseline';
import { cases, type EvalCase } from './cases';
import { type CheckResult, type Corpus, runChecks } from './checks';

type Variant = 'baseline' | 'current';

/** The parts of a streamText result the eval reads, shared by both variants. */
interface RunResult {
  fullStream: AsyncIterable<{ type: string; error?: unknown }>;
  text: PromiseLike<string>;
  steps: PromiseLike<
    { toolCalls: { toolName: string; input: unknown }[]; response: { modelId: string } }[]
  >;
  totalUsage: PromiseLike<{ outputTokens?: number }>;
}
type Runner = (args: {
  model: LanguageModel;
  index: DocsIndex;
  messages: ModelMessage[];
}) => RunResult;

const runners: Record<Variant, Runner> = {
  baseline: streamBaselineAnswer,
  current: streamDocsAnswer,
};

const DOCS_URL = process.env.DOCS_URL ?? 'http://localhost:3000';
const MODEL = process.env.EVAL_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b:free';
/** Model calls one run may take: search, read, answer. */
const CALLS_PER_RUN = 3;
const DAILY_LIMIT_ERROR = /free-models-per-day/;

interface RunRecord {
  caseId: string;
  variant: Variant;
  rep: number;
  answer: string;
  tools: { name: string; input: unknown }[];
  steps: number;
  models: string[];
  latencyMs: number;
  outputTokens?: number;
  error?: string;
  checks: CheckResult[];
}

async function main() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Fall back to the environment as-is.
  }
  const args = parseArgs(process.argv.slice(2));
  if (args.rescore) return rescore(args.rescore);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set.');

  const variants = (args.variants?.split(',') ?? ['baseline', 'current']) as Variant[];
  const selected = args.cases ? cases.filter((c) => args.cases?.split(',').includes(c.id)) : cases;
  const reps = Number(args.reps ?? 1);

  const pages = await loadPages();
  const corpus = toCorpus(pages);
  const index = createDocsIndex(pages);
  const model = createOpenRouter({ apiKey }).chat(MODEL);

  const planned = selected.length * variants.length * reps;
  console.log(`model ${MODEL} | ${pages.length} pages | ${planned} runs`);

  const records: RunRecord[] = [];
  outer: for (const evalCase of selected) {
    for (let rep = 1; rep <= reps; rep++) {
      for (const variant of variants) {
        const remaining = await remainingFreeRequests(apiKey);
        if (remaining !== undefined && remaining < CALLS_PER_RUN) {
          console.log(`stopping: ${remaining} free requests left today`);
          break outer;
        }
        const record = await runOnce({ evalCase, variant, rep, model, index, corpus });
        records.push(record);
        const failed = record.checks.filter((check) => !check.pass).map((check) => check.name);
        console.log(
          `${evalCase.id} ${variant} #${rep}: ${record.error ? `error ${record.error}` : failed.length ? `fail ${failed.join(', ')}` : 'pass'} (${record.latencyMs} ms, ${record.steps} steps)`,
        );
        if (record.error && DAILY_LIMIT_ERROR.test(record.error)) {
          console.log('stopping: daily free-model limit reached');
          break outer;
        }
      }
    }
  }

  const outDir = join('scripts', 'ask-ai-eval', 'results');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(outFile, JSON.stringify({ model: MODEL, docsUrl: DOCS_URL, records }, null, 2));

  printSummary(records, variants);
  console.log(`\nreport: ${outFile}`);
}

async function runOnce({
  evalCase,
  variant,
  rep,
  model,
  index,
  corpus,
}: {
  evalCase: EvalCase;
  variant: Variant;
  rep: number;
  model: LanguageModel;
  index: DocsIndex;
  corpus: Corpus;
}): Promise<RunRecord> {
  const message: ChatUIMessage = {
    id: `${evalCase.id}-${rep}`,
    role: 'user',
    parts: [
      ...(evalCase.page
        ? [
            {
              type: 'data-client' as const,
              data: { location: `${DOCS_URL}${evalCase.page.path}`, title: evalCase.page.title },
            },
          ]
        : []),
      { type: 'text' as const, text: evalCase.question },
    ],
  };
  const messages = await toModelMessages([message]);
  const started = Date.now();

  for (let attempt = 1; ; attempt++) {
    try {
      const result = runners[variant]({ model, index, messages });
      // streamText reports provider errors, such as rate limits, as stream parts instead of
      // rejecting, so a run cut short would otherwise look like an empty answer.
      for await (const part of result.fullStream) {
        if (part.type === 'error') throw part.error;
      }
      const [text, steps, usage] = await Promise.all([
        result.text,
        result.steps,
        result.totalUsage,
      ]);
      // The chat endpoints rewrite bracket citations on the way out; score what users see.
      const answer = variant === 'current' ? rewriteCitations(text, index) : text;
      return {
        caseId: evalCase.id,
        variant,
        rep,
        answer,
        tools: steps.flatMap((step) =>
          step.toolCalls.map((call) => ({ name: call.toolName, input: call.input })),
        ),
        steps: steps.length,
        models: [...new Set(steps.map((step) => step.response.modelId))],
        latencyMs: Date.now() - started,
        outputTokens: usage.outputTokens,
        checks: runChecks(answer, evalCase, corpus),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Free models are often rate-limited upstream for a short while; retry once. The daily
      // free-model cap only resets at midnight UTC, so retrying it is pointless.
      if (attempt === 1 && /429|rate.?limit/i.test(message) && !DAILY_LIMIT_ERROR.test(message)) {
        await new Promise((resolve) => setTimeout(resolve, 30_000));
        continue;
      }
      return {
        caseId: evalCase.id,
        variant,
        rep,
        answer: '',
        tools: [],
        steps: 0,
        models: [],
        latencyMs: Date.now() - started,
        error: message.slice(0, 300),
        checks: [],
      };
    }
  }
}

async function rescore(file: string) {
  const report = JSON.parse(readFileSync(file, 'utf8')) as { records: RunRecord[] };
  const corpus = toCorpus(await loadPages());
  const records = report.records.map((record): RunRecord => {
    if (record.error) return record;
    // Reports from before stream-error detection: a run cut off by an error has no usage.
    if (!record.answer && record.outputTokens === undefined)
      return { ...record, error: 'interrupted (no usage reported)', checks: [] };
    const evalCase = cases.find((c) => c.id === record.caseId);
    return evalCase ? { ...record, checks: runChecks(record.answer, evalCase, corpus) } : record;
  });

  const outFile = file.replace(/(\.rescored)?\.json$/, '.rescored.json');
  writeFileSync(outFile, JSON.stringify({ ...report, records }, null, 2));
  printSummary(records, [...new Set(records.map((record) => record.variant))]);
  console.log(`\nreport: ${outFile}`);
}

function toCorpus(pages: DocsPage[]): Corpus {
  return {
    text: pages.map((page) => page.content).join('\n'),
    paths: new Set(pages.map((page) => page.url)),
  };
}

/** Loads the docs the same way the Worker gets them: from llms-full.txt and llms.txt. */
async function loadPages(): Promise<DocsPage[]> {
  const [full, list] = await Promise.all(
    ['/llms-full.txt', '/llms.txt'].map(async (path) => {
      const res = await fetch(`${DOCS_URL}${path}`);
      if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}. Is the dev server up?`);
      return res.text();
    }),
  );
  return parseLlmsText(full, list);
}

async function remainingFreeRequests(apiKey: string): Promise<number | undefined> {
  if (!MODEL.endsWith(':free')) return undefined;
  const res = await fetch('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return undefined;
  const body = (await res.json()) as {
    data?: { free_model_daily_requests?: { remaining?: number } };
  };
  return body.data?.free_model_daily_requests?.remaining;
}

function printSummary(records: RunRecord[], variants: Variant[]) {
  console.log('\nvariant   runs  errors  checks passed   avg latency  avg steps');
  for (const variant of variants) {
    const runs = records.filter((record) => record.variant === variant);
    const done = runs.filter((record) => !record.error);
    const checks = done.flatMap((record) => record.checks);
    const passed = checks.filter((check) => check.pass).length;
    const avg = (values: number[]) =>
      values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    console.log(
      `${variant.padEnd(9)} ${String(runs.length).padStart(4)}  ${String(runs.length - done.length).padStart(6)}  ${`${passed}/${checks.length}`.padStart(13)}   ${`${(avg(done.map((r) => r.latencyMs)) / 1000).toFixed(1)} s`.padStart(11)}  ${avg(
        done.map((r) => r.steps),
      )
        .toFixed(1)
        .padStart(9)}`,
    );
  }

  console.log('\nfailed checks by name:');
  const names = [...new Set(records.flatMap((record) => record.checks.map((check) => check.name)))];
  for (const name of names) {
    const row = variants.map((variant) => {
      const checks = records
        .filter((record) => record.variant === variant)
        .flatMap((record) => record.checks.filter((check) => check.name === name));
      return `${variant} ${checks.filter((check) => !check.pass).length}/${checks.length}`;
    });
    console.log(`  ${name.padEnd(36)} ${row.join('   ')}`);
  }

  console.log('\nby case:');
  for (const caseId of [...new Set(records.map((record) => record.caseId))]) {
    const row = variants.map((variant) => {
      const runs = records.filter((r) => r.caseId === caseId && r.variant === variant);
      const verdicts = runs.map((r) => {
        if (r.error) return 'error';
        const failed = r.checks.filter((check) => !check.pass).map((check) => check.name);
        return failed.length ? `fail(${failed.join(', ')})` : 'pass';
      });
      return `${variant}: ${verdicts.join(' / ') || '-'}`;
    });
    console.log(`  ${caseId.padEnd(26)} ${row.join(' | ')}`);
  }
}

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i += 2) {
    out[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return out;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
