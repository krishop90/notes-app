
const API_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

function enabled() {
  return Boolean(API_KEY);
}

async function callGroq(prompt, { jsonOnly = false } = {}) {
  if (!enabled()) {
    const err = new Error('AI features disabled: GROQ_API_KEY is not configured');
    err.status = 503;
    throw err;
  }

  const messages = [];
  if (jsonOnly) {
    messages.push({
      role: 'system',
      content:
        'You respond ONLY with valid JSON matching the schema in the user message. ' +
        'No prose, no markdown fences, no commentary.',
    });
  }
  messages.push({ role: 'user', content: prompt });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 512,
        ...(jsonOnly ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    const err = new Error('AI provider request failed');
    err.status = 502;
    err.cause = e;
    throw err;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`AI provider error (${res.status}): ${text.slice(0, 200)}`);
    err.status = 502;
    throw err;
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    const err = new Error('AI provider returned empty response');
    err.status = 502;
    throw err;
  }
  return text.trim();
}

/**
 * 2-4 sentence summary of a note's content.
 */
async function summarize({ title, content }) {
  const prompt = [
    'You are a concise note summarizer.',
    'Write a clear 2-4 sentence summary of the note below.',
    'Do not add a preamble like "Here is a summary" - just write the summary.',
    'Stay faithful to the content; do not invent facts.',
    '',
    `TITLE: ${title || '(untitled)'}`,
    'CONTENT:',
    content || '(empty)',
  ].join('\n');
  return callGroq(prompt);
}

/**
 * Suggest 3-5 short topical tags. Returns array of strings; never throws on normal failure.
 */
async function suggestTags({ title, content }) {
  if (!enabled()) return [];

  // Don't waste a call on trivial input
  const meaningful = `${(title || '').trim()} ${(content || '').trim()}`.trim();
  if (meaningful.length < 15 || /^untitled$/i.test((title || '').trim())) {
    return [];
  }

  const prompt = [
    'You suggest topical tags for a note. Schema: {"tags": ["tag1","tag2",...]}',
    'Rules:',
    '- 3 to 5 tags. Each 1-3 words, lowercase, hyphenated if multi-word (e.g. "ancient-greece").',
    '- Tags must describe the SPECIFIC SUBJECT of the note (people, places, topics, events).',
    '- AVOID generic filler: never use "notes", "ideas", "thoughts", "writing", "personal", "brainstorming", "general", "misc".',
    '- If the note is too short or vague to tag specifically, respond with {"tags": []}.',
    '',
    'Examples:',
    'Note about Aristotle and Greek city-states → {"tags":["politics","ancient-greece","aristotle","philosophy"]}',
    'Note titled "groceries" listing milk and eggs → {"tags":["groceries","shopping-list"]}',
    'Note saying "hi testing 123" → {"tags":[]}',
    '',
    `TITLE: ${title || '(untitled)'}`,
    'CONTENT:',
    (content || '').slice(0, 4000),
  ].join('\n');

  try {
    const raw = await callGroq(prompt, { jsonOnly: true });
    const parsed = JSON.parse(raw);
    const tagList = Array.isArray(parsed?.tags) ? parsed.tags : [];

    const BANNED = new Set([
      'notes', 'note', 'ideas', 'idea', 'thoughts', 'writing', 'personal',
      'brainstorming', 'general', 'misc', 'miscellaneous', 'untitled', 'random',
    ]);

    return tagList
      .filter((t) => typeof t === 'string')
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter((t) => t.length > 1 && t.length <= 40 && !BANNED.has(t))
      .slice(0, 5);
  } catch (e) {
    console.warn('Tag suggestion failed:', e.message);
    return [];
  }
}

module.exports = { enabled, summarize, suggestTags };