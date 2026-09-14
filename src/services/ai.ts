import { CATEGORIES } from '@/constants/categories';
import { EnrichmentResult, Category } from '@/types';
import { extractCreatorHandle, getHostLabel } from '@/services/url';

const enrichEndpoint = process.env.EXPO_PUBLIC_ENRICH_ENDPOINT;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export async function enrichSavedMetadata(
  url: string,
  rawTitle: string,
  rawDescription = ''
): Promise<EnrichmentResult> {
  if (enrichEndpoint && !enrichEndpoint.includes('your-project')) {
    try {
      const response = await fetch(enrichEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(supabaseAnonKey ? { Authorization: `Bearer ${supabaseAnonKey}` } : {})
        },
        body: JSON.stringify({ url, rawTitle, rawDescription })
      });
      if (response.ok) {
        return normalizeEnrichment(await response.json(), rawTitle, rawDescription);
      }
    } catch {
      // The local fallback below keeps saving non-blocking.
    }
  }

  return heuristicEnrichment(url, rawTitle, rawDescription);
}

export function heuristicEnrichment(url: string, rawTitle: string, rawDescription = ''): EnrichmentResult {
  const caption = withoutHashtags(rawDescription);
  const titleSource = caption.length > 14 ? caption : rawTitle || getHostLabel(url);
  const title = cleanTitle(titleSource);
  const haystack = `${url} ${rawTitle} ${rawDescription} ${title}`.toLowerCase();
  const creatorHandle = extractCreatorHandle(rawTitle, rawDescription);

  const category: Category =
    matchAny(haystack, ['recipe', 'pasta', 'food', 'cook', 'meal', 'kitchen'])
      ? 'Cooking'
      : matchAny(haystack, ['workout', 'fitness', 'gym', 'run', 'yoga', 'strength'])
        ? 'Fitness'
        : matchAny(haystack, ['code', 'ai', 'software', 'react', 'tech', 'phone', 'startup'])
          ? 'Tech'
          : matchAny(haystack, ['money', 'stock', 'finance', 'invest', 'budget', 'crypto'])
            ? 'Finance'
            : matchAny(haystack, ['travel', 'hotel', 'flight', 'city guide', 'trip'])
              ? 'Travel'
              : matchAny(haystack, ['design', 'figma', 'ui', 'ux', 'interior'])
                ? 'Design'
                : matchAny(haystack, ['course', 'learn', 'tutorial', 'lesson', 'explain'])
                  ? 'Education'
                  : matchAny(haystack, ['buy', 'deal', 'amazon', 'shop', 'review'])
                    ? 'Shopping'
                    : matchAny(haystack, ['movie', 'music', 'game', 'comedy', 'trailer'])
                      ? 'Entertainment'
                      : 'Lifestyle';

  const urgencyScore = matchAny(haystack, ['news', 'breaking', 'today', 'launch', 'sale'])
    ? 5
    : category === 'Shopping'
      ? 4
      : category === 'Finance'
        ? 3
        : category === 'Cooking' || category === 'Entertainment'
          ? 2
          : 1;

  return {
    cleanTitle: title,
    category,
    summary: buildSummary(caption || title, category),
    urgencyScore,
    creatorHandle
  };
}

function normalizeEnrichment(value: unknown, rawTitle: string, rawDescription: string): EnrichmentResult {
  const data = value as Partial<EnrichmentResult>;
  const cleanTitleValue = typeof data.cleanTitle === 'string' ? data.cleanTitle : rawTitle;
  const categoryValue = CATEGORIES.includes(data.category as Category) ? (data.category as Category) : 'Other';
  const summaryValue = typeof data.summary === 'string' ? data.summary : '';
  const urgency = Number(data.urgencyScore);
  const creatorHandle =
    typeof data.creatorHandle === 'string' && data.creatorHandle.trim()
      ? normalizeHandle(data.creatorHandle)
      : extractCreatorHandle(rawTitle, rawDescription);

  return {
    cleanTitle: cleanTitle(cleanTitleValue),
    category: categoryValue,
    summary: summaryValue,
    urgencyScore: Number.isInteger(urgency) ? Math.min(5, Math.max(1, urgency)) : 3,
    creatorHandle
  };
}

function cleanTitle(rawTitle: string): string {
  const withoutPlatform = rawTitle
    .replace(/\s*[-|]\s*(YouTube|TikTok|Instagram|X|Twitter|Facebook).*$/i, '')
    .replace(/\s*#\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const sentence = withoutPlatform ? withoutPlatform[0].toUpperCase() + withoutPlatform.slice(1) : 'Untitled save';
  return sentence.length > 60 ? `${sentence.slice(0, 57).trim()}...` : sentence;
}

function withoutHashtags(value: string): string {
  return value
    .replace(/(^|\s)#[^\s#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHandle(value: string): string | null {
  const match = value.trim().match(/^@?([A-Za-z0-9._]{2,30})$/);
  return match ? `@${match[1]}` : extractCreatorHandle(value);
}

function buildSummary(source: string, category: Category): string {
  const subject = source.length > 150 ? `${source.slice(0, 147).trim()}...` : source;
  const first = `This saved item appears to be about ${subject.toLowerCase()}.`;
  const second =
    category === 'Cooking'
      ? 'It likely includes practical ideas or steps you can come back to when you are ready to try it.'
      : category === 'Shopping'
        ? 'It may be worth revisiting soon while the product, price, or recommendation is still relevant.'
        : category === 'Education' || category === 'Tech'
          ? 'It likely contains useful information or a tutorial that can be reviewed when you have focus.'
          : 'It is saved for later so you can decide whether it still deserves your attention.';
  return `${first} ${second}`;
}

function matchAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}
