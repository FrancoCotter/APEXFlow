import { Song } from '../types';

const MAX_TAG_LENGTH = 36;
const MAX_TAG_WORDS = 5;

const toCleanTag = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const tag = value.trim();
  if (!tag) return null;
  if (tag.length > MAX_TAG_LENGTH) return null;
  if (tag.split(/\s+/).length > MAX_TAG_WORDS) return null;
  if (/[.!?]/.test(tag)) return null;
  return tag;
};

const parseRawTags = (rawTags: unknown): string[] => {
  const candidates = (() => {
    if (Array.isArray(rawTags)) {
      return rawTags;
    }

    if (typeof rawTags === 'string') {
      try {
        const parsed = JSON.parse(rawTags);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        return rawTags.split(',');
      }
    }

    return [];
  })();

  return candidates
    .map(toCleanTag)
    .filter((tag): tag is string => Boolean(tag));
};

const getStyleTagList = (style: string): string[] => {
  if (!style.includes(',')) return [];
  const parts = style.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return [];

  const tags = parts
    .map(toCleanTag)
    .filter((tag): tag is string => Boolean(tag));

  return tags.length === parts.length ? tags : [];
};

const getTagLikeList = (value: string): string[] => {
  if (!value.includes(',')) return [];
  const parts = value.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return [];

  const tags = parts
    .map(toCleanTag)
    .filter((tag): tag is string => Boolean(tag));

  return tags.length === parts.length ? tags : [];
};

export const getSongCaption = (song: Song): string => {
  const record = song as Song & { caption?: unknown };
  const caption = typeof record.caption === 'string' ? record.caption.trim() : '';
  const style = (song.style || '').trim();
  if (caption) {
    return getTagLikeList(caption).length > 0 ? '' : caption;
  }
  return getStyleTagList(style).length > 0 ? '' : style;
};

export const getSongTags = (song: Song): string[] => {
  const rawTags = (song as Song & { tags?: unknown }).tags;
  const tags = parseRawTags(rawTags);
  if (tags.length > 0) return tags;
  const record = song as Song & { caption?: unknown };
  const caption = typeof record.caption === 'string' ? record.caption.trim() : '';
  const captionTags = getTagLikeList(caption);
  if (captionTags.length > 0) return captionTags;
  return getStyleTagList((song.style || '').trim());
};
