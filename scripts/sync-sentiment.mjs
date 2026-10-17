#!/usr/bin/env node
/**
 * Facebook comments → data/sentiment.json (prototype).
 *
 * Reads recent posts from the City PIO Facebook Page, and for every post whose
 * comment count is above the threshold, classifies its top-level comments as
 * supportive / critical / neutral / off-topic with Claude. Only aggregate
 * counts are written: no comment text, commenter names, or IDs ever leave
 * memory, which keeps the output safe to publish under RA 10173.
 *
 * Posts are re-scored only when their comment count has grown by
 * SENTIMENT_RESCORE_GROWTH since the last scoring, so steady-state runs are
 * mostly cheap Graph API count checks.
 *
 * ENV (live mode):
 *   FB_PAGE_ID                 page id or username (default pio.baguio)
 *   FB_ACCESS_TOKEN            token with Page Public Content Access (SECRET)
 *   ANTHROPIC_API_KEY          Claude API key (SECRET)
 *
 * ENV (optional):
 *   FB_API_VERSION             Graph API version (default v21.0)
 *   SENTIMENT_MODEL            Claude model (default claude-opus-5-5)
 *   SENTIMENT_COMMENT_THRESHOLD  score posts with MORE than this many comments (default 50)
 *   SENTIMENT_LOOKBACK_DAYS    how far back to look for new/growing posts (default 14)
 *   SENTIMENT_WINDOW_DAYS      posts included in the published meter (default 30)
 *   SENTIMENT_MAX_COMMENTS     cap on comments read per post (default 600)
 *   SENTIMENT_RESCORE_GROWTH   re-score when count >= last scored count × this (default 1.5)
 *   SENTIMENT_JSON_PATH        output path (default <repo>/data/sentiment.json)
 *
 * Fixture mode (no Facebook token needed):
 *   SENTIMENT_FIXTURE=scripts/fixtures/sentiment-sample.json
 *     Comments come from the fixture; output is marked "_status": "sample" so the
 *     home page never shows it as real data. Fixture comments carry the label a
 *     human reviewer would give, so the run also reports classifier agreement.
 *   SENTIMENT_FIXTURE_LABELS=1
 *     Skip Claude and use the fixture's labels (UI work without an API key).
 */

import { readFile, rename, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CONFIG = {
  pageId: process.env.FB_PAGE_ID || 'pio.baguio',
  token: process.env.FB_ACCESS_TOKEN || '',
  apiVersion: process.env.FB_API_VERSION || 'v21.0',
  model: process.env.SENTIMENT_MODEL || 'claude-opus-5-5',
  threshold: intEnv('SENTIMENT_COMMENT_THRESHOLD', 50),
  lookbackDays: intEnv('SENTIMENT_LOOKBACK_DAYS', 14),
  windowDays: intEnv('SENTIMENT_WINDOW_DAYS', 30),
  maxComments: intEnv('SENTIMENT_MAX_COMMENTS', 600),
  rescoreGrowth: Number(process.env.SENTIMENT_RESCORE_GROWTH || '1.5'),
  fixture: process.env.SENTIMENT_FIXTURE || '',
  fixtureLabels: process.env.SENTIMENT_FIXTURE_LABELS === '1',
  outPath: process.env.SENTIMENT_JSON_PATH || path.join(root, 'data', 'sentiment.json'),
};

const PAGE_URL = 'https://www.facebook.com/pio.baguio';
const LABELS = ['supportive', 'critical', 'neutral', 'off_topic'];
const BATCH_SIZE = 40;
const EXCERPT_MAX = 180;
const DAY_MS = 24 * 60 * 60 * 1000;
// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

function intEnv(name, fallback) {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : fallback;
}

// ---------------------------------------------------------------------------
// Facebook Graph API
// ---------------------------------------------------------------------------

async function graphGet(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const body = await response.json();
      if (body && body.error) {
        const code = body.error.code;
        // 190 = bad token; 10/200 = missing permission (e.g. no Page Public Content Access).
        if (code === 190 || code === 10 || code === 200) {
          throw new Error(`Graph auth/permission error (code ${code}): ${body.error.message}`);
        }
        const retryable = [4, 17, 32, 613].includes(code);
        throw Object.assign(new Error(`Graph error (code ${code}): ${body.error.message}`), { retryable });
      }
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { retryable: response.status >= 500 });
      return body;
    } catch (error) {
      lastError = error;
      const retryable = error.retryable || error.name === 'TypeError' || error.name === 'TimeoutError';
      if (!retryable || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  throw lastError;
}

function graphUrl(pathname, params) {
  const url = new URL(`https://graph.facebook.com/${CONFIG.apiVersion}/${pathname}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  url.searchParams.set('access_token', CONFIG.token);
  return url.toString();
}

async function fetchRecentPosts(sinceMs) {
  const posts = [];
  let url = graphUrl(`${encodeURIComponent(CONFIG.pageId)}/posts`, {
    fields: 'id,message,created_time,permalink_url,comments.limit(0).summary(true)',
    since: Math.floor(sinceMs / 1000),
    limit: 50,
  });
  while (url) {
    const page = await graphGet(url);
    for (const post of page.data || []) {
      posts.push({
        id: post.id,
        message: post.message || '',
        createdTime: new Date(post.created_time).toISOString(),
        url: post.permalink_url || PAGE_URL,
        commentCount: post.comments?.summary?.total_count ?? 0,
      });
    }
    url = page.paging?.next || null;
  }
  return posts;
}

async function fetchComments(postId) {
  const comments = [];
  let url = graphUrl(`${encodeURIComponent(postId)}/comments`, {
    fields: 'message',
    filter: 'toplevel',
    order: 'reverse_chronological',
    limit: 100,
  });
  while (url && comments.length < CONFIG.maxComments) {
    const page = await graphGet(url);
    for (const comment of page.data || []) {
      // Sticker- or photo-only comments have no text to classify.
      if (comment.message && comment.message.trim()) comments.push({ text: comment.message.trim() });
    }
    url = page.paging?.next || null;
  }
  return comments.slice(0, CONFIG.maxComments);
}

// ---------------------------------------------------------------------------
// Fixture (synthetic data for local prototyping)
// ---------------------------------------------------------------------------

async function loadFixture() {
  const raw = JSON.parse(await readFile(path.resolve(root, CONFIG.fixture), 'utf8'));
  const codes = raw._labelCodes || {};
  const now = Date.now();
  return raw.posts.map((post) => {
    const comments = post.comments.map(([text, code]) => ({ text, expected: codes[code] || code }));
    return {
      id: post.id,
      message: post.message,
      createdTime: new Date(now - post.hoursAgo * 60 * 60 * 1000).toISOString(),
      url: post.url || PAGE_URL,
      commentCount: post.commentCount ?? comments.length,
      fixtureComments: comments,
      fixtureGist: post.gist || '',
    };
  });
}

// ---------------------------------------------------------------------------
// Classification with Claude
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You label public Facebook comments left on posts by the Public Information Office (PIO) of the City Government of Baguio, Philippines. The labels feed an aggregate "public reaction" meter on an independent civic website, so consistency matters more than nuance.

Commenters write in English, Filipino/Tagalog, Ilocano, Kankanaey, and mixes of these (Taglish, Ilocano-English). Read them in whatever language they are written.

Label each comment by its stance toward the subject of the post (the announcement, policy, project, or the city office behind it):
- supportive: approves, thanks, praises, agrees, or encourages the action or office.
- critical: complains, disagrees, blames, or expresses frustration about the action, the office, or how the issue was handled. Sarcastic praise ("Galing talaga 🙄", "Wow, sana all may tubig") is critical. Rhetorical questions that imply failure ("Kailan pa po aayusin?", "Every week na lang?") are critical.
- neutral: genuine questions asking for information, factual additions, reports of local conditions without clear approval or blame, or comments that mix praise and criticism evenly.
- off_topic: tagging other people with no opinion, spam, ads, selling, prayers or greetings unrelated to the subject, or content about something else entirely.

Emoji-only comments: 👏❤️🙏👍 lean supportive; 😡👎🤬🙄 lean critical; otherwise neutral.
Do not let politeness markers ("po", "sana") change a complaint into a neutral comment.`;

const BatchSchema = z.object({
  labels: z.array(
    z.object({
      i: z.number().int(),
      label: z.enum(LABELS),
    })
  ),
});

const GistSchema = z.object({
  gist: z.string(),
});

const usage = { calls: 0, input: 0, output: 0 };

let client;
function claude() {
  if (!client) client = new Anthropic();
  return client;
}

async function callClaude(userContent, schema, maxTokens) {
  const params = {
    model: CONFIG.model,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
    messages: [{ role: 'user', content: userContent }],
  };
  if (FALLBACK_MODELS.has(CONFIG.model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  const response = await claude().beta.messages.parse(params);
  usage.calls += 1;
  usage.input += response.usage.input_tokens || 0;
  usage.output += response.usage.output_tokens || 0;
  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error(`Claude declined (${response.stop_details?.category ?? 'no category'})`), { retryable: true });
  }
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
    throw Object.assign(new Error(`Incomplete structured output (stop_reason ${response.stop_reason})`), { retryable: true });
  }
  return response.parsed_output;
}

// Worth one more try: odd model output, or network/capacity trouble that outlived
// the SDK's own retries. Auth, permission, and bad-request errors fail the run.
function isTransient(error) {
  return (
    error.retryable === true ||
    error instanceof Anthropic.APIConnectionError ||
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError
  );
}

function postContext(post) {
  return `<post>\n${post.message.slice(0, 1500)}\n</post>`;
}

async function classifyBatch(post, batch) {
  const lines = batch.map((comment, i) => `${i}\t${comment.text.replace(/\s+/g, ' ').slice(0, 600)}`).join('\n');
  const content =
    `${postContext(post)}\n\n` +
    `Label every comment below. Each line is "<i>\\t<comment>". Return one entry per index, 0 to ${batch.length - 1}.\n\n` +
    `<comments>\n${lines}\n</comments>`;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await callClaude(content, BatchSchema, 8000);
      const byIndex = new Map(result.labels.map((entry) => [entry.i, entry.label]));
      return batch.map((_, i) => byIndex.get(i) || null);
    } catch (error) {
      if (!isTransient(error)) throw error;
      console.warn(`    batch attempt ${attempt} failed: ${error.message}`);
    }
  }
  return batch.map(() => null);
}

async function summarize(post, comments, labels) {
  const onTopic = comments
    .map((comment, i) => ({ text: comment.text, label: labels[i] }))
    .filter((entry) => entry.label && entry.label !== 'off_topic')
    .slice(0, 200)
    .map((entry) => `[${entry.label}] ${entry.text.replace(/\s+/g, ' ').slice(0, 300)}`)
    .join('\n');
  if (!onTopic) return '';
  const content =
    `${postContext(post)}\n\n<labeled_comments>\n${onTopic}\n</labeled_comments>\n\n` +
    'In one plain-English sentence of at most 30 words, say what commenters mostly said about this post. ' +
    'Describe the main concerns or praise; do not quote anyone, name any person, or repeat insults.';
  try {
    const result = await callClaude(content, GistSchema, 4000);
    return result.gist.trim();
  } catch (error) {
    if (!isTransient(error)) throw error;
    console.warn(`    summary failed: ${error.message}`);
    return '';
  }
}

async function scorePost(post) {
  const comments = post.fixtureComments || (await fetchComments(post.id));
  let labels;
  if (CONFIG.fixtureLabels) {
    labels = comments.map((comment) => comment.expected || null);
  } else {
    labels = [];
    for (let start = 0; start < comments.length; start += BATCH_SIZE) {
      labels.push(...(await classifyBatch(post, comments.slice(start, start + BATCH_SIZE))));
    }
  }

  const counts = { supportive: 0, critical: 0, neutral: 0, off_topic: 0 };
  labels.forEach((label) => {
    if (label) counts[label] += 1;
  });

  const agreement = measureAgreement(comments, labels);
  const gist = CONFIG.fixtureLabels ? post.fixtureGist || '' : await summarize(post, comments, labels);

  return {
    counts,
    analyzedCount: labels.filter(Boolean).length,
    gist,
    agreement,
  };
}

// Fixture runs only: compare Claude's labels with the reviewer labels. A "flip"
// (supportive ↔ critical) is the costly mistake; neighbouring misses matter less.
function measureAgreement(comments, labels) {
  const pairs = comments
    .map((comment, i) => ({ text: comment.text, expected: comment.expected, label: labels[i] }))
    .filter((pair) => pair.expected && pair.label);
  if (!pairs.length || CONFIG.fixtureLabels) return null;
  const misses = pairs.filter((pair) => pair.expected !== pair.label);
  const isFlip = (pair) => [pair.expected, pair.label].sort().join() === 'critical,supportive';
  return { matches: pairs.length - misses.length, total: pairs.length, flips: misses.filter(isFlip).length, misses };
}

// ---------------------------------------------------------------------------
// Aggregation and output
// ---------------------------------------------------------------------------

function netScore(counts) {
  const onTopic = counts.supportive + counts.critical + counts.neutral;
  if (!onTopic) return 0;
  return Math.round(((counts.supportive - counts.critical) / onTopic) * 100);
}

function excerpt(message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (text.length <= EXCERPT_MAX) return text;
  const cut = text.slice(0, EXCERPT_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > EXCERPT_MAX * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:!-]+$/, '') + '…';
}

function buildOutput(posts, status) {
  const totals = { supportive: 0, critical: 0, neutral: 0, off_topic: 0 };
  posts.forEach((post) => LABELS.forEach((label) => (totals[label] += post.counts[label])));
  return {
    _status: status,
    _note:
      status === 'sample'
        ? 'Synthetic comments written for prototyping. Not real reactions; never publish as live data.'
        : 'Aggregate counts only. No comment text or commenter identities are stored.',
    generatedAt: new Date().toISOString(),
    source: { name: 'City of Baguio Public Information Office', url: PAGE_URL },
    method: {
      model: CONFIG.fixtureLabels ? 'fixture labels' : CONFIG.model,
      commentThreshold: CONFIG.threshold,
      windowDays: CONFIG.windowDays,
      scope: 'Top-level public comments with text',
    },
    overall: {
      posts: posts.length,
      analyzedComments: LABELS.reduce((sum, label) => sum + totals[label], 0),
      counts: totals,
      score: netScore(totals),
    },
    posts: posts
      .slice()
      .sort((a, b) => b.createdTime.localeCompare(a.createdTime))
      .map((post) => ({
        id: post.id,
        url: post.url,
        date: post.createdTime.slice(0, 10),
        excerpt: post.excerpt,
        commentCount: post.commentCount,
        analyzedCount: post.analyzedCount,
        counts: post.counts,
        score: netScore(post.counts),
        gist: post.gist,
        scoredAtCount: post.scoredAtCount,
        scoredAt: post.scoredAt,
      })),
  };
}

async function readExisting() {
  try {
    const data = JSON.parse(await readFile(CONFIG.outPath, 'utf8'));
    return new Map((data.posts || []).map((post) => [post.id, post]));
  } catch {
    return new Map();
  }
}

async function reportChanged(changed) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

function needsScoring(post, previous) {
  if (post.commentCount <= CONFIG.threshold) return false;
  if (!previous || !previous.scoredAtCount) return true;
  return post.commentCount >= previous.scoredAtCount * CONFIG.rescoreGrowth;
}

async function main() {
  const isFixture = Boolean(CONFIG.fixture);
  if (!isFixture && !CONFIG.token) {
    console.log('FB_ACCESS_TOKEN not set; skipping sentiment sync (dormant). No changes made.');
    await reportChanged(false);
    return;
  }

  const now = Date.now();
  const status = isFixture ? 'sample' : 'live';
  // Fixture runs always start clean so sample and live data never mix.
  const previous = isFixture ? new Map() : await readExisting();

  console.log(isFixture ? `Using fixture ${CONFIG.fixture}` : `Fetching posts from ${CONFIG.pageId}…`);
  const recent = isFixture ? await loadFixture() : await fetchRecentPosts(now - CONFIG.lookbackDays * DAY_MS);
  console.log(`  ${recent.length} posts in the last ${CONFIG.lookbackDays} days.`);

  const results = new Map();
  const agreement = { matches: 0, total: 0, flips: 0, misses: [] };
  for (const post of recent) {
    const prior = previous.get(post.id);
    if (!needsScoring(post, prior)) {
      if (prior) results.set(post.id, { ...prior, createdTime: prior.createdTime || `${prior.date}T00:00:00Z`, commentCount: post.commentCount });
      else console.log(`  skip ${post.id}: ${post.commentCount} comments (threshold ${CONFIG.threshold})`);
      continue;
    }
    console.log(`  scoring ${post.id}: ${post.commentCount} comments`);
    const scored = await scorePost(post);
    if (scored.agreement) {
      agreement.matches += scored.agreement.matches;
      agreement.total += scored.agreement.total;
      agreement.flips += scored.agreement.flips;
      agreement.misses.push(...scored.agreement.misses);
    }
    results.set(post.id, {
      id: post.id,
      url: post.url,
      createdTime: post.createdTime,
      excerpt: excerpt(post.message),
      commentCount: post.commentCount,
      analyzedCount: scored.analyzedCount,
      counts: scored.counts,
      gist: scored.gist,
      scoredAtCount: post.commentCount,
      scoredAt: new Date().toISOString(),
    });
  }

  // Keep earlier scored posts that fell out of the lookback but are still in the window.
  const windowStart = new Date(now - CONFIG.windowDays * DAY_MS).toISOString();
  for (const [id, prior] of previous) {
    const createdTime = prior.createdTime || `${prior.date}T00:00:00Z`;
    if (!results.has(id) && createdTime >= windowStart) results.set(id, { ...prior, createdTime });
  }

  const posts = [...results.values()].filter((post) => post.createdTime >= windowStart && post.analyzedCount > 0);
  if (agreement.total) {
    const pct = Math.round((agreement.matches / agreement.total) * 100);
    console.log(`  classifier agreement with fixture labels: ${agreement.matches}/${agreement.total} (${pct}%)`);
    console.log(`  supportive ↔ critical flips: ${agreement.flips}`);
    agreement.misses.forEach((miss) => console.log(`    expected ${miss.expected}, got ${miss.label}: ${miss.text}`));
  }

  if (!posts.length && previous.size) {
    console.warn('No scored posts this run; leaving the existing sentiment.json untouched.');
    await reportChanged(false);
    return;
  }

  if (usage.calls) {
    console.log(`  Claude usage: ${usage.calls} calls, ${usage.input} input tokens, ${usage.output} output tokens.`);
  }

  const next = JSON.stringify(buildOutput(posts, status), null, 2) + '\n';
  const temporary = CONFIG.outPath + '.tmp';
  await writeFile(temporary, next);
  await rename(temporary, CONFIG.outPath);
  console.log(`Wrote ${path.relative(root, CONFIG.outPath)}: ${posts.length} posts, status "${status}".`);
  await reportChanged(true);
}

main().catch(async (error) => {
  console.error('Sentiment sync failed:', error.message);
  await reportChanged(false);
  process.exit(1);
});
