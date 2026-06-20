import React, { useEffect, useRef, useState } from 'react';
import { Song, Playlist } from '../types';
import { Plus, Music, Play, Pause, MoreHorizontal, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SongDropdownMenu } from './SongDropdownMenu';
import { AlbumCover } from './AlbumCover';
import { useI18n } from '../context/I18nContext';
import { hasSongPlaybackSource } from '../utils/songPlayback';

interface LibraryViewProps {
  allSongs: Song[];
  likedSongs: Song[];
  playlists: Playlist[];
  referenceTracks: ReferenceTrack[];
  onPlaySong: (song: Song, list?: Song[]) => void;
  onPauseMainPlayback?: () => void;
  onCreatePlaylist: () => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  onAddToPlaylist: (song: Song) => void;
  onOpenVideo?: (song: Song) => void;
  onReusePrompt?: (song: Song) => void;
  onDeleteSong?: (song: Song) => void;
  onDeleteReferenceTrack?: (trackId: string) => void;
  currentSong?: Song | null;
  isPlaying?: boolean;
}

interface ReferenceTrack {
  id: string;
  filename: string;
  storage_key: string;
  duration: number | null;
  file_size_bytes: number | null;
  tags: string[] | null;
  created_at: string;
  audio_url: string;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  allSongs,
  likedSongs,
  playlists,
  referenceTracks,
  onPlaySong,
  onPauseMainPlayback,
  onCreatePlaylist,
  onSelectPlaylist,
  onAddToPlaylist,
  onOpenVideo,
  onReusePrompt,
  onDeleteSong,
  onDeleteReferenceTrack,
  currentSong,
  isPlaying = false,
}) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'playlists' | 'liked' | 'uploads'>('liked');
  const [openMenuSong, setOpenMenuSong] = useState<Song | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);

  const completedLikedSongs = likedSongs.filter(song => !song.isGenerating && hasSongPlaybackSource(song));
  const isSongPlaying = (song: Song) => currentSong?.id === song.id && isPlaying;

  const stopUploadPreview = () => {
    const audio = previewAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    }
    setPreviewTrackId(null);
    setPreviewProgress(0);
  };

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    previewAudioRef.current = audio;

    const handleTimeUpdate = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        setPreviewProgress(0);
        return;
      }
      setPreviewProgress(Math.min(1, Math.max(0, audio.currentTime / audio.duration)));
    };

    const handleEnded = () => {
      stopUploadPreview();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
      previewAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'uploads' && previewTrackId) {
      stopUploadPreview();
    }
  }, [activeTab, previewTrackId]);

  useEffect(() => {
    if (previewTrackId && currentSong && isPlaying) {
      stopUploadPreview();
    }
  }, [currentSong?.id, isPlaying, previewTrackId]);

  const handleSongPlayback = (song: Song, list?: Song[]) => {
    if (previewTrackId) {
      stopUploadPreview();
    }
    onPlaySong(song, list);
  };

  const toggleUploadPreview = async (track: ReferenceTrack) => {
    const audio = previewAudioRef.current;
    if (!audio) return;

    if (previewTrackId === track.id) {
      stopUploadPreview();
      return;
    }

    onPauseMainPlayback?.();

    audio.pause();
    audio.currentTime = 0;
    audio.src = track.audio_url;
    audio.load();
    setPreviewTrackId(track.id);
    setPreviewProgress(0);

    try {
      await audio.play();
    } catch (error) {
      console.error('Upload preview playback failed:', error);
      stopUploadPreview();
    }
  };

  const playIconForSong = (song: Song, size = 14) => (
    isSongPlaying(song)
      ? <Pause size={size} fill="currentColor" />
      : <Play size={size} fill="currentColor" />
  );

  const seededValue = (seed: string, offset: number) => {
    let hash = 2166136261 + offset * 374761393;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 1000) / 1000;
  };

  const playingIndicator = (song: Song) => (
    <div className="flex h-5 w-6 items-end justify-center gap-[2px] text-[#1ed760] group-hover:hidden" aria-label="Now playing">
      {Array.from({ length: 5 }, (_, index) => {
        const seed = `${song.id}-${song.title}`;
        const height = 0.72 + seededValue(seed, index) * 0.55;
        const duration = 0.58 + seededValue(seed, index + 11) * 0.34;
        const delay = -seededValue(seed, index + 23) * duration;
        return (
          <span
            key={index}
            className="music-bar-anim w-[2px] bg-current"
            style={{
              '--music-bar-max': `${height.toFixed(2)}rem`,
              animationDuration: `${duration.toFixed(2)}s`,
              animationDelay: `${delay.toFixed(2)}s`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );

  const rowLeadingControl = (song: Song, index: number, list: Song[]) => (
    <>
      {isSongPlaying(song) ? (
        playingIndicator(song)
      ) : (
        <span className="w-6 text-center text-zinc-400 dark:text-zinc-500 group-hover:hidden">{index + 1}</span>
      )}
      <button
        type="button"
        aria-label={isSongPlaying(song) ? `Pause ${song.title}` : `Play ${song.title}`}
        className="hidden h-6 w-6 items-center justify-center rounded-full text-zinc-900 transition-colors hover:bg-zinc-200 dark:text-white dark:hover:bg-white/10 group-hover:flex"
        onClick={(e) => {
          e.stopPropagation();
          handleSongPlayback(song, list);
        }}
      >
        {playIconForSong(song)}
      </button>
    </>
  );

  const formatBytes = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  };

  return (
    <div className="custom-scrollbar flex-1 overflow-y-auto bg-white p-6 pb-32 transition-colors duration-300 dark:bg-black lg:p-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">{t('yourLibrary')}</h1>
        <button
          onClick={onCreatePlaylist}
          className="flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 font-medium text-white shadow-lg shadow-zinc-900/10 transition-colors hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:shadow-none"
        >
          <Plus size={18} />
          <span>{t('newPlaylist')}</span>
        </button>
      </div>

      <div className="mb-8 flex items-center gap-4 border-b border-zinc-200 pb-1 dark:border-white/10">
        <button
          onClick={() => setActiveTab('liked')}
          className={`relative pb-3 text-sm font-bold transition-colors ${activeTab === 'liked' ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
        >
          {t('likedSongs')}
          {activeTab === 'liked' && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-green-500"></div>}
        </button>
        <button
          onClick={() => setActiveTab('playlists')}
          className={`relative pb-3 text-sm font-bold transition-colors ${activeTab === 'playlists' ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
        >
          {t('playlists')}
          {activeTab === 'playlists' && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-green-500"></div>}
        </button>
        <button
          onClick={() => setActiveTab('uploads')}
          className={`relative pb-3 text-sm font-bold transition-colors ${activeTab === 'uploads' ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
        >
          Uploads
          {activeTab === 'uploads' && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-green-500"></div>}
        </button>
      </div>

      {activeTab === 'liked' && (
        <div className="space-y-1">
          {completedLikedSongs.length === 0 ? (
            <div className="text-sm text-zinc-500 dark:text-zinc-400">No favorites yet.</div>
          ) : (
            completedLikedSongs.map((song, idx) => (
              <div key={song.id} className="group flex items-center gap-4 rounded p-2 transition-colors hover:bg-zinc-100 dark:hover:bg-white/10">
                {rowLeadingControl(song, idx, completedLikedSongs)}

                {song.coverUrl ? (
                  <img src={song.coverUrl} className="h-10 w-10 rounded object-cover shadow-sm" alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                ) : (
                  <AlbumCover seed={song.id || song.title} size="sm" className="h-10 w-10" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-zinc-900 dark:text-white">{song.title}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{song.style}</div>
                </div>

                <div className="text-sm font-mono text-zinc-500 dark:text-zinc-400">{song.duration}</div>
                <div className="relative ml-2">
                  <button
                    className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-black dark:hover:bg-white/5 dark:hover:text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuSong(prev => prev?.id === song.id ? null : song);
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  <SongDropdownMenu
                    song={song}
                    isOpen={openMenuSong?.id === song.id}
                    onClose={() => setOpenMenuSong(null)}
                    isOwner={user ? song.userId === user.id : false}
                    onCreateVideo={() => onOpenVideo?.(song)}
                    onReusePrompt={() => onReusePrompt?.(song)}
                    onAddToPlaylist={() => onAddToPlaylist(song)}
                    onDelete={() => onDeleteSong?.(song)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'playlists' && (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {playlists.map((playlist) => (
            <div key={playlist.id} className="group cursor-pointer rounded-lg border border-zinc-200 bg-white p-4 transition-all hover:border-zinc-300 hover:shadow-lg dark:border-white/5 dark:bg-zinc-900/40 dark:hover:border-white/10 dark:hover:bg-zinc-900" onClick={() => onSelectPlaylist(playlist)}>
              <div className="relative mb-4 aspect-square overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                {playlist.coverUrl ? (
                  <img src={playlist.coverUrl} className="h-full w-full object-cover" alt={playlist.name} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                ) : (
                  <AlbumCover seed={playlist.id || playlist.name} size="full" className="h-full w-full" />
                )}
              </div>
              <h3 className="truncate font-bold text-zinc-900 dark:text-white">{playlist.name}</h3>
              <p className="line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">{playlist.description || t('byYou')}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'uploads' && (
        <div className="space-y-2">
          {referenceTracks.length === 0 ? (
            <div className="text-sm text-zinc-500 dark:text-zinc-400">No uploads yet.</div>
          ) : (
            referenceTracks.map((track) => {
              const isPreviewing = previewTrackId === track.id;
              const ringRadius = 15;
              const ringCircumference = 2 * Math.PI * ringRadius;
              const ringOffset = ringCircumference * (1 - previewProgress);

              return (
                <div
                  key={track.id}
                  className={`group flex items-center gap-4 rounded-lg border p-3 transition-colors ${
                    isPreviewing
                      ? 'border-[#8fb68f]/40 bg-[#8fb68f]/10 dark:border-[#8fb68f]/30 dark:bg-[#8fb68f]/10'
                      : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/5 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleUploadPreview(track)}
                    aria-label={isPreviewing ? `Stop preview ${track.filename}` : `Preview ${track.filename}`}
                    className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  >
                    {isPreviewing ? (
                      <svg className="h-10 w-10 -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
                        <circle
                          cx="20"
                          cy="20"
                          r={ringRadius}
                          fill="none"
                          stroke="currentColor"
                          strokeOpacity="0.18"
                          strokeWidth="3"
                        />
                        <circle
                          cx="20"
                          cy="20"
                          r={ringRadius}
                          fill="none"
                          stroke="#8fb68f"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={ringCircumference}
                          strokeDashoffset={ringOffset}
                        />
                      </svg>
                    ) : (
                      <>
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 transition-opacity group-hover:opacity-0 dark:bg-zinc-800">
                          <Music size={18} className="text-zinc-500 dark:text-zinc-400" />
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                          <Play size={16} fill="currentColor" />
                        </span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleUploadPreview(track)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className={`truncate text-sm font-medium transition-colors ${isPreviewing ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-900 dark:text-white'}`}>
                      {track.filename}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatBytes(track.file_size_bytes)} · {new Date(track.created_at).toLocaleDateString()}
                    </div>
                  </button>

                  <button
                    className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-red-600 dark:hover:bg-white/5"
                    onClick={() => {
                      if (previewTrackId === track.id) {
                        stopUploadPreview();
                      }
                      onDeleteReferenceTrack?.(track.id);
                    }}
                    title="Delete upload"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
