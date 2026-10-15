import type { EvalCase } from './cases';

export interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}

const URL_PATTERN = /https?:\/\/[^\s)\]>"'`]+/g;
const LINK_PATTERN = /\[[^\]]+\]\(([^)\s]+)\)/g;
const RAW_JSON_PATTERN = /\{\s*"(id|url|doc|title)"\s*:/;
const BRACKET_CITATION_PATTERN = /【[^】]*】/;
const PRICE_PATTERN = /[$₩€]\s?\d|\d+(\.\d+)?\s?(USD|usd|달러|원)\b/;
const UNKNOWN_EN =
  /\bnot (documented|covered|listed|available|mentioned|specified|included|provided|found)\b|\b(doesn'?t|does not|don'?t|do not) (cover|list|mention|include|specify|provide|contain)\b|\bno (information|details|pricing)\b|\bcould(n'?t| not) find\b|\b(isn'?t|is not|aren'?t|are not) (documented|covered|listed|mentioned|specified)\b|\bI don'?t know\b/i;
const UNKNOWN_KO =
  /나와 있지|나와있지|없습니다|없어요|없네요|확인되지|확인할 수 없|다루지|찾을 수 없|찾지 못|명시되어 있지|포함되어 있지|언급되어 있지|알 수 없/;

/** The docs the answers are checked against. */
export interface Corpus {
  /** Full text of every page, for spotting URLs that the docs never mention. */
  text: string;
  /** Path of every page, such as "/" or "/token-factory/quickstart". */
  paths: Set<string>;
}

/** Runs every check that applies to the case. */
export function runChecks(answer: string, evalCase: EvalCase, corpus: Corpus): CheckResult[] {
  const { expect } = evalCase;
  // An empty answer usually means the model kept calling tools until the step limit. Report that
  // alone instead of failing every other check for the same reason.
  if (!answer.trim()) return [{ name: 'answered', pass: false, detail: 'empty answer' }];

  const results: CheckResult[] = [{ name: 'answered', pass: true }];
  const prose = stripCode(answer);

  // Korean answers keep product and API names in English, so a modest Hangul share is enough.
  const ratio = hangulRatio(prose);
  results.push({
    name: 'language',
    pass: expect.language === 'ko' ? ratio > 0.15 : ratio < 0.02,
    detail: `hangul ratio ${ratio.toFixed(2)}`,
  });

  const invented = [...answer.matchAll(URL_PATTERN)]
    .map((match) => match[0].replace(/[.,;:!?]+$/, ''))
    .filter((url) => !corpus.text.includes(url));
  results.push({
    name: 'no-invented-urls',
    pass: invented.length === 0,
    detail: invented.join(' ') || undefined,
  });

  results.push({ name: 'no-raw-json', pass: !RAW_JSON_PATTERN.test(answer) });
  results.push({
    name: 'no-bracket-citations',
    pass: !BRACKET_CITATION_PATTERN.test(answer),
    detail: answer.match(BRACKET_CITATION_PATTERN)?.[0].slice(0, 80),
  });

  // Links to docs pages, whether the model wrote them as paths or added a scheme and domain.
  const docLinks = [...answer.matchAll(LINK_PATTERN)]
    .map((match) => ({ target: match[1], path: pathOf(match[1]) }))
    .filter((link) => corpus.paths.has(link.path));
  const absolute = docLinks.filter((link) => /^[a-z]+:\/\//i.test(link.target));
  results.push({
    name: 'relative-doc-links',
    pass: absolute.length === 0,
    detail: absolute.map((link) => link.target).join(' ') || undefined,
  });

  if (expect.cites) {
    const paths = docLinks.map((link) => link.path);
    results.push({
      name: 'cites-expected',
      pass: expect.cites.some((path) => paths.includes(path)),
      detail: paths.join(' ') || 'no docs links',
    });
  }

  for (const placeholder of expect.placeholders ?? []) {
    results.push({ name: `keeps ${placeholder}`, pass: answer.includes(placeholder) });
  }

  for (const word of expect.mentions ?? []) {
    results.push({
      name: `mentions ${word}`,
      pass: answer.toLowerCase().includes(word.toLowerCase()),
    });
  }

  if (expect.admitsUnknown) {
    results.push({
      name: 'admits-unknown',
      pass: UNKNOWN_EN.test(prose) || UNKNOWN_KO.test(prose),
    });
  }

  if (expect.noPrices) {
    results.push({ name: 'no-prices', pass: !PRICE_PATTERN.test(answer) });
  }

  return results;
}

function pathOf(target: string): string {
  return new URL(target, 'http://docs.local').pathname.replace(/\/$/, '') || '/';
}

/** Removes fenced and inline code, which stays in English whatever the answer language. */
function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
}

function hangulRatio(text: string): number {
  const hangul = text.match(/[가-힣]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  return hangul + latin === 0 ? 0 : hangul / (hangul + latin);
}
