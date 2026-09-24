type Category =
  | 'Cooking'
  | 'Fitness'
  | 'Tech'
  | 'Finance'
  | 'Travel'
  | 'Design'
  | 'Lifestyle'
  | 'Education'
  | 'Entertainment'
  | 'Shopping'
  | 'Other';

type EnrichmentResponse = {
  cleanTitle: string;
  category: Category;
  summary: string;
  urgencyScore: number;
  creatorHandle: string | null;
};

const CATEGORIES: Category[] = [
  'Cooking',
  'Fitness',
  'Tech',
  'Finance',
  'Travel',
  'Design',
  'Lifestyle',
  'Education',
  'Entertainment',
  'Shopping',
  'Other'
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url, rawTitle, rawDescription } = await request.json();
    if (!url || !rawTitle) {
      return json(fallback(String(rawTitle ?? ''), 3), 400);
    }

    const provider = (Deno.env.get('AI_PROVIDER') ?? 'openai').toLowerCase();
    const result =
      provider === 'anthropic' && Deno.env.get('ANTHROPIC_API_KEY')
        ? await enrichWithAnthropic(url, rawTitle, rawDescription ?? '')
        : await enrichWithOpenAI(url, rawTitle, rawDescription ?? '');

    return json(validate(result, rawTitle, rawDescription ?? ''), 200);
  } catch {
    return json(fallback('', 3), 200);
  }
});

async function enrichWithOpenAI(url: string, rawTitle: string, rawDescription: string): Promise<unknown> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return fallback(rawTitle, 3);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'Return only valid JSON for a personal saved-content enrichment app.'
        },
        {
          role: 'user',
          content: buildPrompt(url, rawTitle, rawDescription)
        }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) return fallback(rawTitle, 3);
  const data = await response.json();
  return JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
}

async function enrichWithAnthropic(url: string, rawTitle: string, rawDescription: string): Promise<unknown> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return fallback(rawTitle, 3);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-3-5-haiku-latest',
      max_tokens: 500,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: buildPrompt(url, rawTitle, rawDescription)
        }
      ]
    })
  });

  if (!response.ok) return fallback(rawTitle, 3);
  const data = await response.json();
  const text = data.content?.find((part: { type: string }) => part.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
}

function buildPrompt(url: string, rawTitle: string, rawDescription: string): string {
  return `You are an AI assistant that enriches saved content metadata for a personal library app.

Given this URL, raw title, and raw description/caption, return a JSON object with these exact fields:
- cleanTitle: string (human-readable title, sentence case, max 60 chars)
- category: one of [Cooking, Fitness, Tech, Finance, Travel, Design, Lifestyle, Education, Entertainment, Shopping, Other]
- summary: string (3-4 lines maximum. Write in plain, everyday language. No jargon, no deep technical breakdowns. Give a simple, human-readable summary of what this content is actually about at a glance, so the user instantly remembers why they saved it.)
- urgencyScore: integer 1-5 (1 = timeless content, 5 = time-sensitive content like news)
- creatorHandle: string or null (the creator username/handle if present, formatted like @username)

Separate the actual caption/title from hashtags. Hashtags are tokens starting with # and are usually clustered together; do not use them as the main title.
Extract the creator's username/handle from the title or description when present, such as "Name (@handle) - Instagram" or "@handle".

URL: ${url}
Raw title: ${rawTitle}
Raw description: ${rawDescription}

Return ONLY valid JSON. No markdown, no explanation, no extra keys.`;
}

function validate(value: unknown, rawTitle: string, rawDescription: string): EnrichmentResponse {
  const record = value as Partial<EnrichmentResponse>;
  const category = CATEGORIES.includes(record.category as Category) ? (record.category as Category) : 'Other';
  const urgency = Number(record.urgencyScore);
  return {
    cleanTitle: trimTitle(typeof record.cleanTitle === 'string' ? record.cleanTitle : rawTitle),
    category,
    summary: typeof record.summary === 'string' ? formatSummary(record.summary) : '',
    urgencyScore: Number.isInteger(urgency) ? Math.min(5, Math.max(1, urgency)) : 3,
    creatorHandle:
      typeof record.creatorHandle === 'string' && record.creatorHandle.trim()
        ? normalizeHandle(record.creatorHandle)
        : extractCreatorHandle(rawTitle, rawDescription)
  };
}

function fallback(rawTitle: string, urgencyScore: number): EnrichmentResponse {
  return {
    cleanTitle: trimTitle(rawTitle || 'Untitled save'),
    category: 'Other',
    summary: '',
    urgencyScore,
    creatorHandle: extractCreatorHandle(rawTitle)
  };
}

function normalizeHandle(value: string): string | null {
  const match = value.trim().match(/^@?([A-Za-z0-9._]{2,30})$/);
  return match ? `@${match[1]}` : extractCreatorHandle(value);
}

function extractCreatorHandle(...values: Array<string | null | undefined>): string | null {
  const text = values.filter(Boolean).join(' ');
  const instagramStyle = text.match(/\(@([A-Za-z0-9._]{2,30})\)/);
  const plainHandle = text.match(/(?:^|[\s([{"'•|:])@([A-Za-z0-9._]{2,30})(?=$|[\s)\]}"'•|:,.!?])/);
  const handle = instagramStyle?.[1] ?? plainHandle?.[1];
  return handle ? `@${handle}` : null;
}

function trimTitle(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.slice(0, 57).trim()}...` : clean;
}

function formatSummary(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}
