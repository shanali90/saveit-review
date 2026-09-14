import { MetadataPreview, Platform } from '@/types';

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'igsh',
  'si',
  'feature',
  'pp',
  'ref'
];

export function detectPlatform(url: string): Platform {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('tiktok.com')) return 'tiktok';
  return 'other';
}

export function normalizeUrl(input: string): string {
  const trimmed = extractFirstUrl(input).trim();
  if (!trimmed) return '';

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    TRACKING_PARAMS.forEach((param) => parsed.searchParams.delete(param));
    Array.from(parsed.searchParams.keys()).forEach((key) => {
      if (key.startsWith('utm_')) parsed.searchParams.delete(key);
    });
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return withProtocol;
  }
}

export function extractFirstUrl(input: string): string {
  const match = input.match(/https?:\/\/[^\s<>"']+/i);
  return match?.[0] ?? input;
}

export function getHostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Saved from web';
  }
}

export function extractCreatorHandle(...values: Array<string | null | undefined>): string | null {
  const text = values.filter(Boolean).join(' ');
  if (!text) return null;

  const instagramStyle = text.match(/\(@([A-Za-z0-9._]{2,30})\)/);
  const plainHandle = text.match(/(?:^|[\s([{"'•|:])@([A-Za-z0-9._]{2,30})(?=$|[\s)\]}"'•|:,.!?])/);
  const handle = instagramStyle?.[1] ?? plainHandle?.[1];
  return handle ? `@${handle.replace(/[._]+$/, '')}` : null;
}

export function getYoutubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.searchParams.has('v')) return parsed.searchParams.get('v');
      const shortsMatch = parsed.pathname.match(/\/shorts\/([^/?]+)/);
      if (shortsMatch) return shortsMatch[1];
      const embedMatch = parsed.pathname.match(/\/embed\/([^/?]+)/);
      if (embedMatch) return embedMatch[1];
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeThumbnail(url: string): string {
  const videoId = getYoutubeVideoId(url);
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
}

export function platformDisplayName(platform: Platform): string {
  switch (platform) {
    case 'youtube':
      return 'YouTube';
    case 'instagram':
      return 'Instagram';
    case 'tiktok':
      return 'TikTok';
    default:
      return 'Other';
  }
}

export async function fetchMetadataPreview(inputUrl: string, options?: { signal?: AbortSignal }): Promise<MetadataPreview> {
  const normalizedUrl = normalizeUrl(inputUrl);
  const platform = detectPlatform(normalizedUrl);
  const fallbackTitle = getHostLabel(normalizedUrl);
  const youtubeImage = platform === 'youtube' ? youtubeThumbnail(normalizedUrl) : '';

  if (!normalizedUrl) {
    return {
      url: inputUrl,
      normalizedUrl,
      platform: 'other',
      rawTitle: 'Untitled save',
      rawDescription: '',
      thumbnailUrl: '',
      creatorHandle: null
    };
  }

  if (platform === 'youtube') {
    try {
      const noembed = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(normalizedUrl)}`, {
        signal: options?.signal
      });
      if (noembed.ok) {
        const data = await noembed.json();
        return {
          url: inputUrl,
          normalizedUrl,
          platform,
          rawTitle: data.title || fallbackTitle,
          rawDescription: '',
          thumbnailUrl: data.thumbnail_url || youtubeImage,
          creatorHandle: extractCreatorHandle(data.author_name)
        };
      }
    } catch {
      // Fall through to regular metadata fetching.
    }
  }

  try {
    const response = await fetch(normalizedUrl, {
      headers: { 'User-Agent': 'SaveIt/1.0 metadata preview' },
      signal: options?.signal
    });
    const html = await response.text();
    const rawTitle = pickMeta(html, ['og:title', 'twitter:title']) || pickTitle(html) || fallbackTitle;
    const rawDescription = pickMeta(html, ['og:description', 'twitter:description', 'description']);
    const thumbnailUrl = youtubeImage || pickMeta(html, ['og:image', 'twitter:image']) || '';
    return {
      url: inputUrl,
      normalizedUrl,
      platform,
      rawTitle,
      rawDescription,
      thumbnailUrl,
      creatorHandle: extractCreatorHandle(rawTitle, rawDescription)
    };
  } catch {
    return {
      url: inputUrl,
      normalizedUrl,
      platform,
      rawTitle: fallbackTitle,
      rawDescription: '',
      thumbnailUrl: youtubeImage,
      creatorHandle: null
    };
  }
}

function pickMeta(html: string, names: string[]): string {
  for (const name of names) {
    const regexes = [
      new RegExp(`<meta[^>]+property=["']${escapeRegex(name)}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+name=["']${escapeRegex(name)}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escapeRegex(name)}["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escapeRegex(name)}["'][^>]*>`, 'i')
    ];
    for (const regex of regexes) {
      const match = html.match(regex);
      if (match?.[1]) return decodeHtml(match[1]);
    }
  }
  return '';
}

function pickTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1]) : '';
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
