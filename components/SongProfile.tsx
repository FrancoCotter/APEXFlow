import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Song } from '../types';
import { songsApi, getAudioUrl, getCoverUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { ArrowLeft, Star, MoreHorizontal, ThumbsDown, Music as MusicIcon, Edit3, Eye, Quote } from 'lucide-react';
import { SongDropdownMenu } from './SongDropdownMenu';
import { getAvatarUrl } from '../utils/avatar';
import { getSongCaption, getSongTags } from '../utils/songMetadata';
import { getSongLyricsUrl } from '../utils/songPlayback';

interface SongProfileProps {
    songId: string;
    initialSong?: Song | null;
    onBack: () => void;
    onPlay: (song: Song, list?: Song[]) => void;
    onNavigateToProfile: (username: string) => void;
    currentSong?: Song | null;
    isPlaying?: boolean;
    currentTime?: number;
    onPlayAtTime?: (song: Song, time: number) => void;
    likedSongIds?: Set<string>;
    onToggleLike?: (songId: string) => void;
    onDelete?: (song: Song) => void;
}

interface SyncedLyricLine {
    time: number;
    endTime?: number;
    hasExplicitEnd?: boolean;
    text: string;
}

function cleanLyricText(text: string): string {
    return text
        .split('\n')
        .map(line => line
            .replace(/\[(?:intro|verse|pre[-\s]?chorus|chorus|bridge|outro|hook|refrain|interlude|guitar|breakdown|drop|build|solo|spoken|fade|final(?:\s+chorus)?|post[-\s]?chorus|prelude|ending|song\s+ends?)[^\]]*\]/gi, '')
            .replace(/\[[^\]]+\]/g, '')
            .trim()
        )
        .filter(Boolean)
        .join('\n');
}

function capitalizeLatinLineStart(text: string): string {
    return text.replace(/^(\s*["'([{¿¡]*)([a-z])/, (_match, prefix: string, letter: string) =>
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

function parseSyncedLyrics(raw: string): SyncedLyricLine[] {
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

function getActiveSyncedLyricIndex(lines: SyncedLyricLine[], time: number): number {
    return lines.findIndex((line, index) => {
        const endTime = line.hasExplicitEnd ? line.endTime : lines[index + 1]?.time;
        return time >= line.time && (!endTime || time < endTime);
    });
}

function parseGenerationParams(value: unknown): any {
    if (!value || typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

const updateMetaTags = (song: Song) => {
    const baseUrl = window.location.origin;
    const songUrl = `${baseUrl}/song/${song.id}`;
    const title = `${song.title} by ${song.creator || 'Unknown Artist'} | APEXFlow`;
    const description = `Listen to "${song.title}" - ${song.style}. ${song.viewCount || 0} plays, ${song.likeCount || 0} favorites. Create your own AI music with APEXFlow.`;

    document.title = title;

    const updateOrCreateMeta = (selector: string, attribute: string, value: string) => {
        let element = document.querySelector(selector) as HTMLMetaElement;
        if (!element) {
            element = document.createElement('meta');
            const [attr, attrValue] = selector.replace(/[\[\]'"]/g, '').split('=');
            if (attr === 'property') element.setAttribute('property', attrValue);
            else if (attr === 'name') element.setAttribute('name', attrValue);
            document.head.appendChild(element);
        }
        element.setAttribute(attribute, value);
    };

    updateOrCreateMeta('meta[name="description"]', 'content', description);
    updateOrCreateMeta('meta[name="title"]', 'content', title);

    updateOrCreateMeta('meta[property="og:type"]', 'content', 'music.song');
    updateOrCreateMeta('meta[property="og:url"]', 'content', songUrl);
    updateOrCreateMeta('meta[property="og:title"]', 'content', title);
    updateOrCreateMeta('meta[property="og:description"]', 'content', description);
    updateOrCreateMeta('meta[property="og:image"]', 'content', song.coverUrl);
    updateOrCreateMeta('meta[property="og:image:width"]', 'content', '400');
    updateOrCreateMeta('meta[property="og:image:height"]', 'content', '400');
    updateOrCreateMeta('meta[property="og:audio"]', 'content', song.audioUrl || '');
    updateOrCreateMeta('meta[property="og:audio:type"]', 'content', 'audio/mpeg');

    updateOrCreateMeta('meta[name="twitter:card"]', 'content', 'summary_large_image');
    updateOrCreateMeta('meta[name="twitter:url"]', 'content', songUrl);
    updateOrCreateMeta('meta[name="twitter:title"]', 'content', title);
    updateOrCreateMeta('meta[name="twitter:description"]', 'content', description);
    updateOrCreateMeta('meta[name="twitter:image"]', 'content', song.coverUrl);

    updateOrCreateMeta('meta[property="music:duration"]', 'content', String(song.duration || 0));
    updateOrCreateMeta('meta[property="music:musician"]', 'content', song.creator || 'Unknown Artist');
};

const resetMetaTags = () => {
    document.title = 'APEXFlow - Local AI Music Generator';
    const defaultDescription = 'Create original music with AI locally. Generate songs in any style with custom lyrics and professional quality using APEXFlow.';
    const defaultImage = '/og-image.png';

    const updateMeta = (selector: string, content: string) => {
        const element = document.querySelector(selector) as HTMLMetaElement;
        if (element) element.setAttribute('content', content);
    };

    updateMeta('meta[name="description"]', defaultDescription);
    updateMeta('meta[property="og:title"]', 'APEXFlow - Local AI Music Generator for ACE-Step 1.5');
    updateMeta('meta[property="og:description"]', defaultDescription);
    updateMeta('meta[property="og:image"]', defaultImage);
    updateMeta('meta[property="og:type"]', 'website');
    updateMeta('meta[name="twitter:title"]', 'APEXFlow - Local AI Music Generator for ACE-Step 1.5');
    updateMeta('meta[name="twitter:description"]', defaultDescription);
    updateMeta('meta[name="twitter:image"]', defaultImage);
};

export const SongProfile: React.FC<SongProfileProps> = ({ songId, initialSong = null, onBack, onPlay, onNavigateToProfile, currentSong, isPlaying, currentTime = 0, onPlayAtTime, likedSongIds = new Set(), onToggleLike, onDelete }) => {
    const { user, token } = useAuth();
    const { t } = useI18n();
    const [song, setSong] = useState<Song | null>(initialSong);
    const [loading, setLoading] = useState(!initialSong);
    const [showDropdown, setShowDropdown] = useState(false);
    const [lyricsPanelRequested, setLyricsPanelRequested] = useState(() => {
        return localStorage.getItem('acestep_song_profile_lyrics_open') === 'true';
    });
    const [syncedLyrics, setSyncedLyrics] = useState<SyncedLyricLine[]>([]);
    const [syncedLyricsLoading, setSyncedLyricsLoading] = useState(false);
    const lyricLineRefs = useRef<Record<number, HTMLDivElement | null>>({});

    const isCurrentSong = song && currentSong?.id === song.id;
    const isCurrentlyPlaying = isCurrentSong && isPlaying;
    const isLiked = song ? likedSongIds.has(song.id) : false;
    const playbackTime = isCurrentSong ? currentTime : 0;
    const shouldLoadSyncedLyrics = Boolean(song?.audioUrl);
    const staticLyricsText = useMemo(() => {
        return song?.lyrics ? formatDisplayLyricText(cleanLyricText(song.lyrics)) : '';
    }, [song?.lyrics]);
    const hasRenderableLyrics = Boolean(staticLyricsText.trim()) || syncedLyrics.length > 0;
    const showLyricsPanel = lyricsPanelRequested && hasRenderableLyrics;
    const activeLyricIndex = useMemo(() => {
        if (!syncedLyrics.length) return -1;
        return getActiveSyncedLyricIndex(syncedLyrics, playbackTime);
    }, [playbackTime, syncedLyrics]);

    useEffect(() => {
        let cancelled = false;
        if (initialSong?.id === songId) {
            setSong(initialSong);
        }
        loadSongData(songId, () => cancelled);
        return () => {
            cancelled = true;
            resetMetaTags();
        };
    }, [songId, initialSong]);

    useEffect(() => {
        localStorage.setItem('acestep_song_profile_lyrics_open', lyricsPanelRequested ? 'true' : 'false');
    }, [lyricsPanelRequested]);

    useEffect(() => {
        if (song) {
            updateMetaTags(song);
        }
    }, [song]);

    const loadSongData = async (targetSongId = songId, isCancelled: () => boolean = () => false) => {
        setLoading(true);
        try {
            const response = await songsApi.getFullSong(targetSongId, token);
            if (isCancelled()) return;

            const transformedSong: Song = {
                id: response.song.id,
                title: response.song.title,
                lyrics: response.song.lyrics,
                style: response.song.style,
                coverUrl: getCoverUrl(response.song.cover_url || response.song.coverUrl, response.song.id),
                duration: response.song.duration
                    ? `${Math.floor(response.song.duration / 60)}:${String(Math.floor(response.song.duration % 60)).padStart(2, '0')}`
                    : '0:00',
                createdAt: new Date(response.song.created_at),
                tags: response.song.tags || [],
                audioUrl: getAudioUrl(response.song.audio_url, response.song.id),
                isPublic: response.song.is_public,
                likeCount: response.song.like_count || 0,
                viewCount: response.song.view_count || 0,
                userId: response.song.user_id,
                creator: response.song.creator,
                creator_avatar: response.song.creator_avatar,
                generationParams: parseGenerationParams(response.song.generation_params),
            };

            setSong(transformedSong);
        } catch (error) {
            if (isCancelled()) return;
            console.error('Failed to load song:', error);
        } finally {
            if (!isCancelled()) setLoading(false);
        }
    };

    useEffect(() => {
        const lrcUrl = getSongLyricsUrl(song);
        if (!lrcUrl || !shouldLoadSyncedLyrics) {
            setSyncedLyrics([]);
            setSyncedLyricsLoading(false);
            return;
        }

        let cancelled = false;
        setSyncedLyrics([]);
        setSyncedLyricsLoading(true);

        fetch(lrcUrl)
            .then(response => {
                if (!response.ok) throw new Error(`LRC not found: ${response.status}`);
                return response.text();
            })
            .then(text => {
                if (cancelled) return;
                setSyncedLyrics(parseSyncedLyrics(text));
            })
            .catch(() => {
                if (!cancelled) setSyncedLyrics([]);
            })
            .finally(() => {
                if (!cancelled) setSyncedLyricsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [song?.id, song?.audioUrl, song?.playbackUrl, shouldLoadSyncedLyrics]);

    useEffect(() => {
        if (activeLyricIndex < 0) return;
        lyricLineRefs.current[activeLyricIndex]?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }, [activeLyricIndex]);

    if (loading && !song) {
        return (
            <div className="flex items-center justify-center h-full bg-zinc-50 dark:bg-black">
                <div className="text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                    {t('loadingSong')}
                </div>
            </div>
        );
    }

    if (!song) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 bg-zinc-50 dark:bg-black">
                <div className="text-zinc-500 dark:text-zinc-400">{t('songNotFound')}</div>
                <button onClick={onBack} className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-lg text-zinc-900 dark:text-white transition-colors">
                    {t('goBack')}
                </button>
            </div>
        );
    }

    const songCaption = getSongCaption(song);
    const displayTags = getSongTags(song);

    return (
        <div className={`w-full h-full flex flex-col bg-zinc-50 dark:bg-black overflow-hidden transition-opacity duration-200 ${loading ? 'opacity-100' : 'opacity-100'}`}>
            {/* Header */}
            <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 md:px-6 py-4 flex-shrink-0">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white mb-4 transition-colors"
                >
                    <ArrowLeft size={20} />
                    <span>{t('back')}</span>
                </button>

                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1">
                        <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white mb-2">{song.title}</h1>
                        <div className="flex items-center gap-3 mb-3">
                            <div
                                onClick={() => song.creator && onNavigateToProfile(song.creator)}
                                className="flex items-center gap-2 cursor-pointer hover:underline"
                            >
                                <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-xs font-bold text-white overflow-hidden border border-zinc-200 dark:border-white/10">
                                    <img src={getAvatarUrl(song.creator_avatar, song.creator)} alt={song.creator || 'Creator'} className="w-full h-full object-cover" />
                                </div>
                                <span className="text-zinc-900 dark:text-white font-semibold">{song.creator || 'Anonymous'}</span>
                            </div>
                        </div>

                        {songCaption && (
                            <p className="mb-2 max-w-5xl truncate text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                                {songCaption}
                            </p>
                        )}

                        {displayTags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {displayTags.slice(0, 8).map(tag => (
                                    <span key={tag} className="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded text-xs text-zinc-600 dark:text-zinc-300">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="text-xs text-zinc-500">
                            {new Date(song.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at {new Date(song.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            {!song.isPublic && song.userId === user?.id && (
                                <span className="ml-2 px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded text-xs text-zinc-600 dark:text-zinc-400">Private</span>
                            )}
                        </div>
                    </div>

                    {/* Related Songs Tab - Hidden on mobile */}
                  
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <div className={`${showLyricsPanel ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-4 md:px-6 py-4 md:py-6 pb-24 lg:pb-32`}>

                    <div className={showLyricsPanel ? 'grid grid-cols-1 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] gap-5 md:gap-8 items-start' : 'flex flex-col items-center'}>
                        <div className="space-y-4 md:space-y-6">
                            {/* Cover Art */}
                            <div className="relative aspect-square max-w-xs md:max-w-sm mx-auto lg:mx-0 rounded-xl overflow-hidden shadow-2xl">
                                <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover" />
                            </div>
                            {/* Action Buttons */}
                            <div className="flex items-center justify-center lg:justify-start gap-2 md:gap-3 flex-wrap">
                                {hasRenderableLyrics && (
                                    <div className="flex justify-center lg:justify-start">
                                        <button
                                            onClick={() => setLyricsPanelRequested(prev => !prev)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold transition-colors ${
                                                showLyricsPanel
                                                    ? 'bg-white text-black dark:bg-white dark:text-black'
                                                    : 'bg-zinc-200 dark:bg-zinc-900 hover:bg-zinc-300 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white'
                                            }`}
                                            title="Show lyrics"
                                            aria-label="Show lyrics"
                                        >
                                            <Quote size={16} />
                                            <span className="hidden sm:inline">Lyrics</span>
                                        </button>
                                    </div>
                                )}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowDropdown(!showDropdown)}
                                        className="p-2 bg-zinc-200 dark:bg-zinc-900 hover:bg-zinc-300 dark:hover:bg-zinc-800 rounded-full transition-colors"
                                    >
                                        <MoreHorizontal size={16} className="text-zinc-700 dark:text-white" />
                                    </button>
                                    {song && (
                                        <SongDropdownMenu
                                            song={song}
                                            isOpen={showDropdown}
                                            onClose={() => setShowDropdown(false)}
                                            isOwner={user?.id === song.userId}
                                            onReusePrompt={() => {}}
                                            onAddToPlaylist={() => {}}
                                            onDelete={() => onDelete?.(song)}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {showLyricsPanel && (
                        <div className="song-lyrics-panel-enter bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 md:p-6 min-h-[22rem] lg:min-h-[28rem]">
                            {syncedLyrics.length > 0 ? (
                                <div className="max-h-[32rem] overflow-y-auto px-2 md:px-4 pr-5 md:pr-7">
                                    <div className="space-y-5 py-5">
                                        {syncedLyrics.map((line, index) => {
                                            const isActive = index === activeLyricIndex;
                                            const isPast = activeLyricIndex > index;
                                            return (
                                                <div
                                                    key={`${line.time}-${index}`}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => onPlayAtTime?.(song, line.time)}
                                                    onKeyDown={event => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            onPlayAtTime?.(song, line.time);
                                                        }
                                                    }}
                                                    ref={element => {
                                                        lyricLineRefs.current[index] = element;
                                                    }}
                                                    className={`max-w-full whitespace-normal break-words rounded-lg py-1 text-2xl md:text-[1.7rem] font-bold leading-snug transition-colors duration-300 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#8fb68f]/50 ${
                                                        isActive
                                                            ? 'text-zinc-950 dark:text-white'
                                                            : isPast
                                                                ? 'text-zinc-400/70 dark:text-zinc-500/70 hover:text-zinc-600 dark:hover:text-zinc-300'
                                                                : 'text-zinc-500 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300'
                                                    }`}
                                                >
                                                    {line.text}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : shouldLoadSyncedLyrics && syncedLyricsLoading ? (
                                <div className="h-64 flex flex-col items-center justify-center text-center text-zinc-400 dark:text-zinc-600">
                                    <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin mb-3" />
                                    <span className="text-sm">Loading synced lyrics...</span>
                                </div>
                            ) : song.lyrics ? (
                                <>
                                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4">Lyrics</h3>
                                <div className="text-sm md:text-base text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed max-h-[32rem] overflow-y-auto pr-2">
                                    {staticLyricsText}
                                </div>
                                </>
                            ) : (
                                <div className="h-64 flex flex-col items-center justify-center text-center text-zinc-400 dark:text-zinc-600 italic">
                                    <MusicIcon size={28} className="mb-3 opacity-60" />
                                    <span>Instrumental</span>
                                    <span className="text-xs not-italic mt-1">No lyrics generated</span>
                                </div>
                            )}
                        </div>
                        )}
                    </div>

                </div>
            </div>

        </div>
    );
};
