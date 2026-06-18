export interface SyncedLyricLine {
    time: number;
    endTime?: number;
    hasExplicitEnd?: boolean;
    text: string;
}

function cleanLyricText(text: string): string {
    return text
        .split('\n')
        .map(line => line
            .replace(/\[(?:intro|verse|pre[-\s]?chorus|chorus|bridge|outro|hook|refrain|interlude|guitar|breakdown|drop|build|solo|spoken|fade|final(?:\s+chorus)?|post[-\s]?chorus|prelude|ending|song\s+ends?|main\s+section)[^\]]*\]/gi, '')
            .replace(/\[[^\]]+\]/g, '')
            .trim()
        )
        .filter(Boolean)
        .join('\n');
}

function capitalizeLatinLineStart(text: string): string {
    return text.replace(/^(\s*["'([{]*)([a-z])/, (_match, prefix: string, letter: string) =>
        `${prefix}${letter.toUpperCase()}`
    );
}

function formatDisplayLyricText(text: string): string {
    return text
        .split('\n')
        .map(line => capitalizeLatinLineStart(line))
        .join('\n');
}

function parseTimestamp(timestamp: string): number {
    const [minutes, seconds] = timestamp.split(':');
    return (parseInt(minutes, 10) || 0) * 60 + (parseFloat(seconds) || 0);
}

function parseLrcText(lrc: string): SyncedLyricLine[] {
    const lines: SyncedLyricLine[] = [];
    lrc.split('\n').forEach(rawLine => {
        const matches = [...rawLine.matchAll(/\[(\d{2}:\d{2}(?:\.\d{1,3})?)\]/g)];
        if (matches.length === 0) return;

        const lyricText = formatDisplayLyricText(cleanLyricText(rawLine.replace(/\[(\d{2}:\d{2}(?:\.\d{1,3})?)\]/g, '')));
        if (!lyricText) return;

        matches.forEach(match => {
            lines.push({ time: parseTimestamp(match[1]), text: lyricText });
        });
    });

    return lines.sort((a, b) => a.time - b.time);
}

function vttTimeToSeconds(time: string): number {
    const parts = time.trim().split(':');
    if (parts.length === 3) {
        return (parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60 + (parseFloat(parts[2]) || 0);
    }
    if (parts.length === 2) {
        return (parseInt(parts[0], 10) || 0) * 60 + (parseFloat(parts[1]) || 0);
    }
    return parseFloat(time) || 0;
}

export function parseSyncedLyrics(raw: string): SyncedLyricLine[] {
    if (!raw.trim()) return [];
    if (!raw.trim().startsWith('WEBVTT') && !raw.includes('-->')) {
        return parseLrcText(raw);
    }

    const lines: SyncedLyricLine[] = [];
    const blocks = raw.replace(/\r/g, '').split(/\n\s*\n/);
    blocks.forEach(block => {
        const blockLines = block.split('\n').map(line => line.trim()).filter(Boolean);
        const timingLineIndex = blockLines.findIndex(line => line.includes('-->'));
        if (timingLineIndex === -1) return;

        const [start, end] = blockLines[timingLineIndex].split('-->').map(value => value.trim().split(/\s+/)[0]);
        const text = formatDisplayLyricText(cleanLyricText(blockLines.slice(timingLineIndex + 1).join('\n')));
        if (!text) return;

        lines.push({
            time: vttTimeToSeconds(start),
            endTime: end ? vttTimeToSeconds(end) : undefined,
            hasExplicitEnd: Boolean(end),
            text,
        });
    });

    return lines.sort((a, b) => a.time - b.time);
}

export function hasRenderableSyncedLyrics(raw: string): boolean {
    return parseSyncedLyrics(raw).length > 0;
}
