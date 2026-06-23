import React, { useState, useEffect } from 'react';
import { Song } from '../types';
import { Play, Pause, MoreHorizontal, X, Copy, Wand2, MoreVertical, Download, Repeat, Video, Music, Link as LinkIcon, Sparkles, Globe, Lock, Trash2, Edit3, Layers, SlidersHorizontal } from 'lucide-react';
import { songsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { SongDropdownMenu } from './SongDropdownMenu';
import { AlbumCover } from './AlbumCover';
import { GeneratingIndicator } from './GeneratingIndicator';
import { getAvatarUrl } from '../utils/avatar';
import { getGeneratingSongTitle, getGenerationStageText, getModelDisplayName } from '../utils/generationDisplay';
import { getSongCaption, getSongTags } from '../utils/songMetadata';
import { hasRenderableSyncedLyrics } from '../utils/syncedLyrics';
import { getSongLyricsUrl, getSongPlaybackUrl } from '../utils/songPlayback';

interface RightSidebarProps {
    song: Song | null;
    onClose?: () => void;
    onOpenVideo?: () => void;
    onReuse?: (song: Song) => void;
    onSongUpdate?: (song: Song) => void;
    onNavigateToProfile?: (username: string) => void;
    onNavigateToSong?: (songId: string) => void;
    isLiked?: boolean;
    onToggleLike?: (songId: string) => void;
    onDelete?: (song: Song) => void;
    onAddToPlaylist?: (song: Song) => void;
    onPlay?: (song: Song) => void;
    isPlaying?: boolean;
    currentSong?: Song | null;
}

const RetryingCoverImage: React.FC<{ url: string; alt: string; className: string; seed: string }> = ({ url, alt, className, seed }) => {
    const [attempt, setAttempt] = useState(0);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setAttempt(0);
        setFailed(false);
    }, [url]);

    useEffect(() => {
        if (!failed) return;
        const delay = Math.min(30_000, 1_500 * (2 ** Math.min(attempt, 5)));
        const timer = window.setTimeout(() => {
            setAttempt(value => value + 1);
            setFailed(false);
        }, delay);
        return () => window.clearTimeout(timer);
    }, [failed, attempt]);

    const retryUrl = `${url}${url.includes('?') ? '&' : '?'}cover_retry=${attempt}`;
    if (failed) return <AlbumCover seed={seed} size="full" className={className} />;

    return (
        <img
            key={retryUrl}
            src={retryUrl}
            alt={alt}
            className={className}
            onError={() => {
                console.warn(`[cover-cache] load failed; retry ${attempt + 1} scheduled`, retryUrl);
                setFailed(true);
            }}
        />
    );
};

export const RightSidebar: React.FC<RightSidebarProps> = ({ song, onClose, onOpenVideo, onReuse, onSongUpdate, onNavigateToProfile, onNavigateToSong, isLiked, onToggleLike, onDelete, onAddToPlaylist, onPlay, isPlaying, currentSong }) => {
    const { token, user } = useAuth();
    const { t } = useI18n();
    const [showMenu, setShowMenu] = useState(false);
    const [isOwner, setIsOwner] = useState(false);
    const [tagsExpanded, setTagsExpanded] = useState(false);
    const [captionExpanded, setCaptionExpanded] = useState(false);
    const [copiedStyle, setCopiedStyle] = useState(false);
    const [copiedLyrics, setCopiedLyrics] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');
    const [titleError, setTitleError] = useState<string | null>(null);
    const [isSavingTitle, setIsSavingTitle] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [hasVerifiedDynamicLyrics, setHasVerifiedDynamicLyrics] = useState(false);
    const supportsClipboardWrite = typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function';
    const displayViewCount = song
        ? song.viewCount ?? (song as Song & { view_count?: number }).view_count ?? 0
        : 0;
    const songCaption = song ? getSongCaption(song) : '';
    const displayTags = song ? getSongTags(song) : [];
    const canExpandCaption = songCaption.length > 140;
    const generationParams = ((song?.generationParams ?? {}) as Record<string, any>);
    const generationModel = song?.ditModel || generationParams.ditModel || generationParams.dit_model;
    const generationDuration = song?.durationSeconds ?? generationParams.duration;
    const generationBpm = song?.bpm ?? generationParams.bpm;
    const generationKeyScale = song?.key_scale || generationParams.keyScale || generationParams.key_scale;
    const generationTimeSignature = song?.time_signature || generationParams.timeSignature || generationParams.time_signature;
    const generationTaskType = generationParams.taskType || generationParams.task_type || 'text2music';
    const generationHasReference = Boolean(generationParams.referenceAudioUrl || generationParams.reference_audio_url);
    const generationHasSource = Boolean(generationParams.sourceAudioUrl || generationParams.source_audio_url);
    const generationHasSyncedLyrics = Boolean(
        generationParams.getLrc
        ?? generationParams.get_lrc
        ?? generationParams.hasSyncedLyrics
        ?? generationParams.has_synced_lyrics
    );
    const generationThinking = Boolean(generationParams.thinking);
    const generationInstrumental =
        typeof generationParams.instrumental === 'boolean'
            ? generationParams.instrumental
            : !(song?.lyrics || '').trim();
    const generationMode =
        generationHasSource
            ? t('coverTask')
            : generationTaskType === 'repaint'
                ? t('repaintTask')
                : generationHasReference
                    ? t('reference')
                    : generationTaskType === 'text2music'
                        ? t('textToMusic')
                        : generationTaskType;

    const generationFacts = song ? [
        generationModel ? { label: t('modelLabel'), value: getModelDisplayName(generationModel) } : null,
        { label: t('modeLabel'), value: generationMode },
        generationInstrumental ? { label: t('vocalsLabel'), value: t('instrumental') } : { label: t('vocalsLabel'), value: t('vocal') },
        generationThinking ? { label: t('thinkLabel'), value: t('on') } : null,
        hasVerifiedDynamicLyrics ? { label: t('lyricsLabel'), value: t('syncedLrc') } : null,
        typeof generationDuration === 'number' && generationDuration > 0 ? { label: t('duration'), value: `${generationDuration}s` } : null,
        typeof generationBpm === 'number' && generationBpm > 0 ? { label: 'BPM', value: String(generationBpm) } : null,
        typeof generationKeyScale === 'string' && generationKeyScale ? { label: t('key'), value: generationKeyScale } : null,
        typeof generationTimeSignature === 'string' && generationTimeSignature ? { label: t('signatureLabel'), value: generationTimeSignature } : null,
        typeof generationParams.vaeModel === 'string' && generationParams.vaeModel ? { label: 'VAE', value: generationParams.vaeModel } : null,
        typeof generationParams.dcwEnabled === 'boolean' ? { label: 'DCW', value: generationParams.dcwEnabled ? t('on') : t('off') } : null,
    ].filter(Boolean) as Array<{ label: string; value: string }> : [];
    const hasGenerationSources = Boolean(song?.generationParams?.referenceAudioUrl || song?.generationParams?.sourceAudioUrl);

    useEffect(() => {
        if (song) {
            setIsOwner(user?.id === song.userId);
        }
    }, [song, user]);

    useEffect(() => {
        if (song) {
            setTitleDraft(song.title || '');
            setIsEditingTitle(false);
            setTitleError(null);
            setIsSavingTitle(false);
            setCaptionExpanded(false);
            setTagsExpanded(false);
        }
    }, [song?.id]);

    useEffect(() => {
        if (!song?.isGenerating) return;
        setNow(Date.now());
        const interval = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(interval);
    }, [song?.id, song?.isGenerating]);

    useEffect(() => {
        const lrcUrl = getSongLyricsUrl(song);
        if (!lrcUrl || !generationHasSyncedLyrics) {
            setHasVerifiedDynamicLyrics(false);
            return;
        }
        const controller = new AbortController();
        setHasVerifiedDynamicLyrics(false);

        fetch(lrcUrl, { cache: 'force-cache', signal: controller.signal })
            .then(async response => {
                if (!response.ok) return false;
                const text = await response.text();
                return hasRenderableSyncedLyrics(text);
            })
            .then(hasLyrics => {
                if (!controller.signal.aborted) {
                    setHasVerifiedDynamicLyrics(hasLyrics);
                }
            })
            .catch(() => {
                if (!controller.signal.aborted) {
                    setHasVerifiedDynamicLyrics(false);
                }
            });

        return () => controller.abort();
    }, [song?.id, song?.audioUrl, song?.playbackUrl, generationHasSyncedLyrics]);

    const formatElapsedTime = (start: Date): string => {
        const startMs = start.getTime();
        if (!Number.isFinite(startMs)) return '0:00';
        const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));
        const minutes = Math.floor(elapsedSec / 60);
        const seconds = elapsedSec % 60;
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    };

    const getGenerationStatusText = (): string => {
        if (!song) return '';
        if (song.queuePosition) return t('queuedStatus').replace('{position}', String(song.queuePosition));
        const stage = getGenerationStageText(song, t);
        return `${stage} - ${formatElapsedTime(song.createdAt)}`;
    };

    const measuredGenerationProgress = song && typeof song.progress === 'number'
        ? Math.min(1, Math.max(0, song.progress))
        : null;

    const startTitleEdit = () => {
        if (!song || !isOwner) return;
        setTitleDraft(song.title || '');
        setTitleError(null);
        setIsEditingTitle(true);
    };

    const cancelTitleEdit = () => {
        if (!song) return;
        setTitleDraft(song.title || '');
        setTitleError(null);
        setIsEditingTitle(false);
    };

    const saveTitleEdit = async () => {
        if (!song) return;
        if (!token) {
            setTitleError(t('renameSignIn'));
            return;
        }
        const trimmed = titleDraft.trim();
        if (!trimmed) {
            setTitleError(t('titleCannotBeEmpty'));
            return;
        }
        if (trimmed === song.title) {
            setIsEditingTitle(false);
            return;
        }
        setIsSavingTitle(true);
        setTitleError(null);
        try {
            await songsApi.updateSong(song.id, { title: trimmed }, token);
            onSongUpdate?.({ ...song, title: trimmed });
            setIsEditingTitle(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : t('renameFailed');
            setTitleError(message);
        } finally {
            setIsSavingTitle(false);
        }
    };

    const getSourceLabel = (url?: string) => {
        if (!url) return t('none');
        try {
            const parsed = new URL(url, window.location.origin);
            const name = decodeURIComponent(parsed.pathname.split('/').pop() || url);
            return name.replace(/\.[^/.]+$/, '') || name;
        } catch {
            const parts = url.split('/');
            const name = decodeURIComponent(parts[parts.length - 1] || url);
            return name.replace(/\.[^/.]+$/, '') || name;
        }
    };

    const openSource = (url?: string) => {
        if (!url) return;
        const resolved = url.startsWith('http') ? url : `${window.location.origin}${url}`;
        window.open(resolved, '_blank');
    };

    if (!song) return (
        <div className="w-full h-full bg-zinc-50 dark:bg-suno-panel border-l border-zinc-200 dark:border-white/5 flex items-center justify-center text-zinc-400 dark:text-zinc-500 text-sm transition-colors duration-300">
            <div className="flex flex-col items-center gap-2">
                <Music size={40} className="text-zinc-300 dark:text-zinc-700" />
                <p>{t('selectSongToView')}</p>
            </div>
        </div>
    );

    if (song.isGenerating) {
        return (
            <div className="w-full h-full bg-zinc-50 dark:bg-suno-panel flex flex-col border-l border-zinc-200 dark:border-white/5 relative transition-colors duration-300">
                <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-white/5 flex-shrink-0 bg-zinc-50/50 dark:bg-suno-panel/50 backdrop-blur-md z-10">
                    <span className="font-semibold text-sm text-zinc-900 dark:text-white">{t('songDetails')}</span>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-full text-zinc-500 dark:text-zinc-400 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="p-5 pb-24 lg:pb-32 space-y-6">
                        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-zinc-200 dark:bg-zinc-800 shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
                            {song.coverUrl ? (
                                <RetryingCoverImage url={song.coverUrl} alt={song.title} seed={song.id || song.title} className="h-full w-full object-cover opacity-45 blur-md scale-110" />
                            ) : (
                                <AlbumCover seed={song.id || song.title} size="full" className="h-full w-full opacity-45 blur-md scale-110" />
                            )}
                           <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/25" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <GeneratingIndicator size="lg" />
                                
                            </div>
                            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-end">
                                <span className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-black backdrop-blur-sm">
                                    {song.queuePosition
                                        ? `#${song.queuePosition}`
                                        : measuredGenerationProgress === null
                                            ? formatElapsedTime(song.createdAt)
                                            : `${Math.round(measuredGenerationProgress * 100)}%`}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white leading-tight tracking-tight">
                                    {getGeneratingSongTitle(song, t)}
                                </h2>
                                {song.style && (
                                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                                        {song.style}
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-xs font-bold text-white shadow-sm ring-2 ring-white dark:ring-black overflow-hidden">
                                    <img src={getAvatarUrl(song.creator_avatar, song.creator)} alt={song.creator || t('anonymous')} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                                        {song.creator || t('anonymous')}
                                    </span>
                                    <p className="text-xs text-zinc-500">{t('created')} {new Date(song.createdAt).toLocaleDateString()}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div key={song.id} className="w-full h-full bg-zinc-50 dark:bg-suno-panel flex flex-col border-l border-zinc-200 dark:border-white/5 relative transition-all duration-300 animate-in fade-in zoom-in-95">

            {/* Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-white/5 flex-shrink-0 bg-zinc-50/50 dark:bg-suno-panel/50 backdrop-blur-md z-10">
                <span className="font-semibold text-sm text-zinc-900 dark:text-white">{t('songDetails')}</span>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-full text-zinc-500 dark:text-zinc-400 transition-colors"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-5 pb-24 lg:pb-32 space-y-6">

                    {/* Cover Art */}
                    <div
                        className="group relative aspect-square w-full rounded-xl overflow-hidden shadow-2xl bg-zinc-200 dark:bg-zinc-800 ring-1 ring-black/5 dark:ring-white/10 cursor-pointer"
                        onClick={() => onPlay?.(song)}
                    >
                        {song.coverUrl ? (
                            <RetryingCoverImage url={song.coverUrl} alt={song.title} seed={song.id || song.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                        ) : null}
                        {!song.coverUrl && <AlbumCover seed={song.id || song.title} size="full" className="w-full h-full" />}

                        {/* Overlay Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60"></div>

                        {/* Play Button Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPlay?.(song);
                                }}
                                className="w-16 h-16 rounded-full bg-white/95 dark:bg-white text-black flex items-center justify-center shadow-2xl hover:scale-110 transition-transform"
                            >
                                {isPlaying && currentSong?.id === song.id ? (
                                    <Pause size={28} fill="currentColor" />
                                ) : (
                                    <Play size={28} fill="currentColor" className="ml-1" />
                                )}
                            </button>
                        </div>

                        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-end">
                            <span className="text-[10px] font-bold text-black bg-white/90 px-1.5 py-0.5 rounded backdrop-blur-sm">
                                {song.duration}
                            </span>
                        </div>
                    </div>

                    {/* Title & Artist Block */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-start gap-2">
                            <div className="flex items-center gap-2 flex-1">
                                {!isEditingTitle ? (
                                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white leading-tight tracking-tight">
                                        {song.title}
                                    </h2>
                                ) : (
                                    <div className="w-full">
                                        <input
                                            value={titleDraft}
                                            onChange={(e) => setTitleDraft(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    void saveTitleEdit();
                                                }
                                                if (e.key === 'Escape') {
                                                    e.preventDefault();
                                                    cancelTitleEdit();
                                                }
                                            }}
                                            className="w-full text-xl font-bold text-zinc-900 dark:text-white bg-white dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8fb68f]/40"
                                            maxLength={120}
                                            autoFocus
                                        />
                                        <div className="flex items-center gap-2 mt-2">
                                            <button
                                                onClick={() => void saveTitleEdit()}
                                                disabled={isSavingTitle}
                                                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#8fb68f] text-[#132018] hover:brightness-110 disabled:opacity-60"
                                            >
                                                {isSavingTitle ? t('saving') : t('save')}
                                            </button>
                                            <button
                                                onClick={cancelTitleEdit}
                                                disabled={isSavingTitle}
                                                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/20 disabled:opacity-60"
                                            >
                                                {t('cancel')}
                                            </button>
                                            {titleError && (
                                                <span className="text-xs text-red-500">{titleError}</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="relative">
                                {isOwner && !isEditingTitle && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            startTitleEdit();
                                        }}
                                        className="text-zinc-400 hover:text-black dark:hover:text-white p-1 mr-1"
                                        title={t('edit')}
                                    >
                                        <Edit3 size={18} />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowMenu(!showMenu);
                                    }}
                                    className="text-zinc-400 hover:text-black dark:hover:text-white p-1"
                                >
                                    <MoreVertical size={20} />
                                </button>
                                <SongDropdownMenu
                                    song={song}
                                    isOpen={showMenu}
                                    onClose={() => setShowMenu(false)}
                                    isOwner={isOwner}
                                    onCreateVideo={onOpenVideo}
                                    onReusePrompt={() => onReuse?.(song)}
                                    onDelete={() => onDelete?.(song)}
                                    onAddToPlaylist={() => onAddToPlaylist?.(song)}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-xs font-bold text-white shadow-sm ring-2 ring-white dark:ring-black overflow-hidden">
                                <img src={getAvatarUrl(song.creator_avatar, song.creator)} alt={song.creator || t('anonymous')} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex flex-col">
                                <span
                                    onClick={() => song.creator && onNavigateToProfile?.(song.creator)}
                                    className="text-sm font-semibold text-zinc-900 dark:text-white hover:underline cursor-pointer"
                                >
                                    {song.creator || t('anonymous')}
                                </span>
                                <p className="text-xs text-zinc-500">
                                    {t('created')} {new Date(song.createdAt).toLocaleDateString()}
                                    <span className="mx-1.5 text-zinc-400">·</span>
                                    <span>{displayViewCount} plays</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Main Actions */}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-200/80 dark:bg-black/40 backdrop-blur-sm rounded-2xl border border-zinc-300/50 dark:border-white/5">
                        <button
                            onClick={onOpenVideo}
                            title={t('createVideo')}
                            className="p-3 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-300/50 dark:hover:bg-white/10 rounded-xl transition-all duration-200"
                        >
                            <Video size={18} strokeWidth={1.5} />
                        </button>
                        <button
                            onClick={() => {
                                if (!song?.audioUrl) return;
                                const audioUrl = song.audioUrl.startsWith('http') ? song.audioUrl : `${window.location.origin}${song.audioUrl}`;
                                window.open(`/editor?audioUrl=${encodeURIComponent(audioUrl)}`, '_blank');
                            }}
                            title={t('openInEditor')}
                            className="p-3 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-300/50 dark:hover:bg-white/10 rounded-xl transition-all duration-200"
                        >
                            <SlidersHorizontal size={18} strokeWidth={1.5} />
                        </button>
                        <button
                            onClick={() => onReuse && onReuse(song)}
                            title={t('reusePrompt')}
                            className="p-3 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-300/50 dark:hover:bg-white/10 rounded-xl transition-all duration-200"
                        >
                            <Repeat size={18} strokeWidth={1.5} />
                        </button>
                        <button
                            title={t('downloadAudio')}
                            onClick={async () => {
                                const playbackUrl = getSongPlaybackUrl(song);
                                if (!playbackUrl) return;
                                try {
                                    const response = await fetch(playbackUrl);
                                    const blob = await response.blob();
                                    const url = URL.createObjectURL(blob);
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.download = `${song.title || 'song'}.mp3`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    URL.revokeObjectURL(url);
                                } catch (error) {
                                    console.error('Download failed:', error);
                                }
                            }}
                            className="p-3 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-300/50 dark:hover:bg-white/10 rounded-xl transition-all duration-200"
                        >
                            <Download size={18} strokeWidth={1.5} />
                        </button>
                    </div>

                    {generationFacts.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.18em]">
                                <Sparkles size={13} />
                                {t('generationLabel')}
                            </div>
                            <div className="space-y-0.5">
                                {generationFacts.map((fact, index) => (
                                    <div
                                        key={`${fact.label}-${fact.value}`}
                                        className={`grid grid-cols-[88px_minmax(0,1fr)] items-baseline gap-x-4 py-1.5 ${
                                            index !== generationFacts.length - 1
                                                ? 'border-b border-zinc-200/40 dark:border-white/5'
                                                : ''
                                        }`}
                                    >
                                        <div className="text-[10px] leading-5 font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-500">
                                            {fact.label}
                                        </div>
                                        <div className="min-w-0 text-sm leading-5 text-zinc-800 dark:text-zinc-200 break-words">
                                            {fact.value}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {hasGenerationSources && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                                <LinkIcon size={14} />
                                {t('sourcesLabel')}
                            </div>
                            <div className="space-y-2">
                                {song.generationParams?.referenceAudioUrl && (
                                    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/40 px-3 py-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Music size={14} className="text-zinc-400" />
                                            <div className="min-w-0">
                                                <div className="text-xs text-zinc-500">{t('reference')}</div>
                                                <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                                                    {song.generationParams?.referenceAudioTitle || getSourceLabel(song.generationParams?.referenceAudioUrl)}
                                                </div>
                                            </div>
                                        </div>
                                            <button
                                                className="text-xs px-2 py-1 rounded-full border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                                                onClick={() => {
                                                    if (!song.generationParams?.referenceAudioUrl || !onPlay) return;
                                                    const previewSong = {
                                                        id: `ref_${song.id}`,
                                                        title: song.generationParams?.referenceAudioTitle || getSourceLabel(song.generationParams?.referenceAudioUrl),
                                                        lyrics: '',
                                                        style: t('reference'),
                                                        coverUrl: song.coverUrl,
                                                        duration: '0:00',
                                                        createdAt: new Date(),
                                                        tags: [],
                                                        audioUrl: song.generationParams?.referenceAudioUrl,
                                                        isPublic: false,
                                                        userId: song.userId,
                                                        creator: song.creator,
                                                    };
                                                    onPlay(previewSong);
                                                }}
                                            >
                                                {t('play')}
                                            </button>
                                    </div>
                                )}
                                {song.generationParams?.sourceAudioUrl && (
                                    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/40 px-3 py-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Layers size={14} className="text-zinc-400" />
                                            <div className="min-w-0">
                                                <div className="text-xs text-zinc-500">{t('cover')}</div>
                                                <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                                                    {song.generationParams?.sourceAudioTitle || getSourceLabel(song.generationParams?.sourceAudioUrl)}
                                                </div>
                                            </div>
                                        </div>
                                            <button
                                                className="text-xs px-2 py-1 rounded-full border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                                                onClick={() => {
                                                    if (!song.generationParams?.sourceAudioUrl || !onPlay) return;
                                                    const previewSong = {
                                                        id: `cover_${song.id}`,
                                                        title: song.generationParams?.sourceAudioTitle || getSourceLabel(song.generationParams?.sourceAudioUrl),
                                                        lyrics: '',
                                                        style: t('cover'),
                                                        coverUrl: song.coverUrl,
                                                        duration: '0:00',
                                                        createdAt: new Date(),
                                                        tags: [],
                                                        audioUrl: song.generationParams?.sourceAudioUrl,
                                                        isPublic: false,
                                                        userId: song.userId,
                                                        creator: song.creator,
                                                    };
                                                    onPlay(previewSong);
                                                }}
                                            >
                                                {t('play')}
                                            </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {hasGenerationSources ? (
                        <div className="h-px bg-zinc-200 dark:bg-white/5 w-full"></div>
                    ) : (
                        <div className="pt-1"></div>
                    )}

                    {/* Caption / Tags */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wide">{t('songDetails')}</h2>
                            
                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                        const copyText = songCaption || displayTags.join(', ');
                                        if (!copyText || !supportsClipboardWrite) return;
                                        await navigator.clipboard.writeText(copyText);
                                        setCopiedStyle(true);
                                        setTimeout(() => setCopiedStyle(false), 2000);
                                    } catch (error) {
                                        console.error('Failed to copy song caption:', error);
                                    }
                                }}
                                className={`relative z-10 flex items-center gap-1 text-[10px] font-medium transition-colors cursor-pointer ${copiedStyle ? 'text-green-500' : 'text-zinc-500 hover:text-black dark:hover:text-white'}`}
                                title={t('copySongDetails')}
                            >
                                <Copy size={12} /> {copiedStyle ? t('copied') : t('copy')}
                            </button>
                        </div>
                         {!supportsClipboardWrite && (
                                <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                                    （*{t('clipboardUnavailableHint')}）
                                </p>
                            )}
                        {songCaption && (
                            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                                <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{t('styleTags')}</h3>
                                <p
                                    className={`text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 ${captionExpanded ? '' : 'caption-clamp'}`}
                                    style={{ '--caption-lines': 3 } as React.CSSProperties}
                                >
                                    {songCaption}
                                </p>
                                {canExpandCaption && (
                                    <button
                                        type="button"
                                        onClick={() => setCaptionExpanded(prev => !prev)}
                                        className="mt-2 inline-flex items-center rounded-md bg-zinc-200 px-2 py-0.5 text-[11px] font-bold text-zinc-600 transition-colors hover:bg-zinc-300 hover:text-zinc-900 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 dark:hover:text-white"
                                    >
                                        {captionExpanded ? t('less') : `+${t('more')}`}
                                    </button>
                                )}
                            </div>
                        )}
                        {!songCaption && displayTags.length > 0 && (
                            <div className="space-y-1.5">
                                <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{t('styleTags')}</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {(tagsExpanded ? displayTags : displayTags.slice(0, 7)).map(tag => (
                                        <span key={tag} className="px-2 py-0.5 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/10 rounded text-[11px] font-medium text-zinc-600 dark:text-zinc-300 transition-colors">
                                            {tag}
                                        </span>
                                    ))}
                                    {!tagsExpanded && displayTags.length > 7 && (
                                        <button
                                            type="button"
                                            onClick={() => setTagsExpanded(true)}
                                            className="px-2 py-0.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded text-[11px] font-bold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors"
                                        >
                                            +{t('more')}
                                        </button>
                                    )}
                                    {tagsExpanded && displayTags.length > 7 && (
                                        <button
                                            type="button"
                                            onClick={() => setTagsExpanded(false)}
                                            className="px-2 py-0.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded text-[11px] font-bold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors"
                                        >
                                            {t('less')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        {!songCaption && displayTags.length === 0 && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                {t('noSongDetailsAvailable')}
                            </p>
                        )}
                       
                    </div>

                    {/* Lyrics Section */}
                    <div className="bg-white dark:bg-black/20 rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden">
                        <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between bg-zinc-50 dark:bg-white/5">
                            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center justify-between">{t('lyricsSection')}</h3>
                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                        if (song.lyrics && supportsClipboardWrite) {
                                            await navigator.clipboard.writeText(song.lyrics);
                                            setCopiedLyrics(true);
                                            setTimeout(() => setCopiedLyrics(false), 2000);
                                        }
                                    } catch (error) {
                                        console.error('Failed to copy lyrics:', error);
                                    }
                                }}
                                className={`flex items-center gap-1 text-[10px] font-medium transition-colors cursor-pointer ${copiedLyrics ? 'text-green-500' : 'text-zinc-500 hover:text-black dark:hover:text-white'}`}
                            >
                                <Copy size={12} /> {copiedLyrics ? t('copied') : t('copy')}
                            </button>
                        </div>
                        <div className="p-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                            <div className="text-sm text-zinc-700 dark:text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed opacity-90">
                                {song.lyrics || <div className="text-zinc-400 dark:text-zinc-600 italic text-center py-8">{t('instrumental')}<br /><span className="text-xs not-italic">{t('noLyricsGenerated')}</span></div>}
                            </div>
                           
                        </div>
                    </div>      
                </div>
            </div>

        </div>
    );
};

const ActionButton: React.FC<{ icon: React.ReactNode; label?: string; active?: boolean; onClick?: () => void }> = ({ icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-1.5 ${active ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-400'} hover:text-black dark:hover:text-white transition-colors`}
    >
        {icon}
        {label && <span className="text-xs font-semibold">{label}</span>}
    </button>
);
