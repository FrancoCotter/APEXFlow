import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { CreatePanel } from './components/CreatePanel';
import { SongList } from './components/SongList';
import { RightSidebar } from './components/RightSidebar';
import { Player } from './components/Player';
import { LibraryView } from './components/LibraryView';
import { CreatePlaylistModal, AddToPlaylistModal } from './components/PlaylistModals';
import { UsernameModal } from './components/UsernameModal';
import { UserProfile } from './components/UserProfile';
import { SettingsModal } from './components/SettingsModal';
import { SongProfile } from './components/SongProfile';
import { Song, GenerationParams, View, Playlist } from './types';
import { generateApi, songsApi, playlistsApi, getAudioUrl, getCoverUrl, UserProfile as UserProfileType } from './services/api';
import { useAuth } from './context/AuthContext';
import { useResponsive } from './context/ResponsiveContext';
import { I18nProvider, useI18n } from './context/I18nContext';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';
import { PlaylistDetail } from './components/PlaylistDetail';
import { Toast, ToastType } from './components/Toast';
import { SearchPage } from './components/SearchPage';
import { TrainingPanel } from './components/TrainingPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { getSongPlaybackUrl, hasSongPlaybackSource } from './utils/songPlayback';
import { getGenerationStageKey } from './utils/generationDisplay';

const VideoGeneratorModal = React.lazy(() =>
  import('./components/VideoGeneratorModal').then(module => ({ default: module.VideoGeneratorModal }))
);

const SONGS_PAGE_SIZE = 80;
const EAGER_SONG_LOAD_THRESHOLD = 120;
const MAX_RESUMABLE_JOB_AGE_MS = 3 * 60 * 60 * 1000;
const GENERATION_TIMEOUT_MS = Number(process.env.GENERATION_TIMEOUT_MS || 1800000);

const StartupLoading: React.FC<{ progress: number }> = ({ progress }) => (
  <div className="flex h-screen w-screen items-center justify-center bg-suno-DEFAULT text-white">
    <div
      className="select-none text-5xl md:text-7xl font-black tracking-tight text-transparent transition-all duration-500"
      style={{
        backgroundImage: `linear-gradient(0deg, rgba(255,255,255,0.98) ${progress}%, rgba(255,255,255,0.18) ${progress}%)`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
      }}
    >
      APEXFlow
    </div>
  </div>
);

const parseGenerationCreatedAt = (value?: string): Date | null => {
  if (!value) return null;
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const isFreshGenerationCreatedAt = (createdAt: Date): boolean => {
  const ageMs = Date.now() - createdAt.getTime();
  return ageMs >= -60_000 && ageMs <= MAX_RESUMABLE_JOB_AGE_MS;
};

const getResumableGenerationCreatedAt = (createdAtValue?: string, serverNowValue?: string): Date | null => {
  const createdAt = parseGenerationCreatedAt(createdAtValue);
  if (!createdAt) return null;

  const serverNow = parseGenerationCreatedAt(serverNowValue);
  if (serverNow) {
    const serverAgeMs = serverNow.getTime() - createdAt.getTime();
    if (serverAgeMs >= -60_000 && serverAgeMs <= MAX_RESUMABLE_JOB_AGE_MS) {
      return new Date(Date.now() - Math.max(0, serverAgeMs));
    }
    return null;
  }

  return isFreshGenerationCreatedAt(createdAt) ? createdAt : null;
};

function AppContent() {
  // i18n
  const { t } = useI18n();

  // Responsive
  const { isMobile, isDesktop } = useResponsive();

  // Auth
  const { user, token, isAuthenticated, isLoading: authLoading, setupUser, logout } = useAuth();
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [startupProgress, setStartupProgress] = useState(8);
  // Track multiple concurrent generation jobs
  const activeJobsRef = useRef<Map<string, { tempId: string; pollInterval: ReturnType<typeof setInterval> }>>(new Map());
  const [activeJobCount, setActiveJobCount] = useState(0);

  // Theme State - local studio defaults to dark mode only.
  const [theme] = useState<'dark'>('dark');

  // Navigation State - default to create view
  const [currentView, setCurrentView] = useState<View>('create');

  // Content State
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likedSongIds, setLikedSongIds] = useState<Set<string>>(new Set());
  const [referenceTracks, setReferenceTracks] = useState<ReferenceTrack[]>([]);
  const [isSongsLoading, setIsSongsLoading] = useState(false);
  const [hasLoadedInitialSongs, setHasLoadedInitialSongs] = useState(false);
  const [isLoadingMoreSongs, setIsLoadingMoreSongs] = useState(false);
  const [hasMoreSongs, setHasMoreSongs] = useState(false);
  const [songsNextOffset, setSongsNextOffset] = useState(0);
  const [totalSongCount, setTotalSongCount] = useState<number | null>(null);
  const [playQueue, setPlayQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);

  // Selection State
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

  // Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaybackBootstrapping, setIsPlaybackBootstrapping] = useState(false);
  const [hasPlaybackPrimed, setHasPlaybackPrimed] = useState(false);
  const [volume, setVolume] = useState(() => {
    const stored = localStorage.getItem('volume');
    return stored ? parseFloat(stored) : 0.8;
  });
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'all' | 'one'>('all');

  // UI State
  const [isGenerating, setIsGenerating] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [isRightSidebarVisible, setIsRightSidebarVisible] = useState(false);
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [pendingAudioSelection, setPendingAudioSelection] = useState<{ target: 'reference' | 'source'; url: string; title?: string } | null>(null);

  // Mobile UI Toggle
  const [mobileShowList, setMobileShowList] = useState(false);

  // Modals
  const [isCreatePlaylistModalOpen, setIsCreatePlaylistModalOpen] = useState(false);
  const [isAddToPlaylistModalOpen, setIsAddToPlaylistModalOpen] = useState(false);
  const [songToAddToPlaylist, setSongToAddToPlaylist] = useState<Song | null>(null);

  // Video Modal
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [songForVideo, setSongForVideo] = useState<Song | null>(null);

  // Settings Modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Profile View
  const [viewingUsername, setViewingUsername] = useState<string | null>(null);
  const [viewingProfilePreview, setViewingProfilePreview] = useState<UserProfileType | null>(null);
  const [profileReturnView, setProfileReturnView] = useState<View>('create');

  // Song View
  const [viewingSongId, setViewingSongId] = useState<string | null>(null);
  const [viewingSongPreview, setViewingSongPreview] = useState<Song | null>(null);

  // Playlist View
  const [viewingPlaylistId, setViewingPlaylistId] = useState<string | null>(null);

  // Reuse State
  const [reuseData, setReuseData] = useState<{ song: Song, timestamp: number } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selectedSongRef = useRef<Song | null>(null);
  const currentSongIdRef = useRef<string | null>(null);
  const preloadedSongIdRef = useRef<string | null>(null);
  const audioWarmupCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioWarmupQueueRef = useRef<Song[]>([]);
  const audioWarmupQueuedIdsRef = useRef<Set<string>>(new Set());
  const audioWarmupActiveRef = useRef(0);
  const audioWarmupScheduleRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const playNextRef = useRef<() => void>(() => {});
  const rightSidebarCloseTimerRef = useRef<number | null>(null);
  const rightSidebarFrameRef = useRef<number | null>(null);
  const isLoadingMoreSongsRef = useRef(false);
  const playbackPrimedRef = useRef(false);

  // Mobile Details Modal State
  const [showMobileDetails, setShowMobileDetails] = useState(false);

  // Toast State
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false,
  });

  // Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

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

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    setToast({ message, type, isVisible: true });
  }, []);

  const closeToast = useCallback(() => {
    setToast(prev => ({ ...prev, isVisible: false }));
  }, []);

  // Show username modal if not authenticated and not loading
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setShowUsernameModal(true);
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    const target = authLoading ? 35 : isSongsLoading && songs.length === 0 ? 82 : 100;
    setStartupProgress(prev => Math.max(prev, Math.min(target, prev + 8)));
    const interval = window.setInterval(() => {
      setStartupProgress(prev => {
        if (prev >= target) return prev;
        return Math.min(target, prev + (target - prev > 20 ? 7 : 3));
      });
    }, 180);
    return () => window.clearInterval(interval);
  }, [authLoading, isSongsLoading, songs.length]);

  // Load Playlists
  useEffect(() => {
    if (token) {
      playlistsApi.getMyPlaylists(token)
        .then(res => setPlaylists(res.playlists))
        .catch(err => console.error('Failed to load playlists', err));
    } else {
      setPlaylists([]);
    }
  }, [token]);

  // Keep selectedSongRef in sync for use in callbacks without stale closures
  useEffect(() => { selectedSongRef.current = selectedSong; }, [selectedSong]);

  // Cleanup active jobs on unmount
  useEffect(() => {
    return () => {
      // Clear all polling intervals when component unmounts
      activeJobsRef.current.forEach(({ pollInterval }) => {
        clearInterval(pollInterval);
      });
      activeJobsRef.current.clear();
      if (rightSidebarCloseTimerRef.current) {
        window.clearTimeout(rightSidebarCloseTimerRef.current);
      }
      if (rightSidebarFrameRef.current) {
        window.cancelAnimationFrame(rightSidebarFrameRef.current);
      }
    };
  }, []);

  const handleShowDetails = (song: Song) => {
    setSelectedSong(song);
    setShowMobileDetails(true);
  };

  const openRightSidebar = useCallback(() => {
    if (rightSidebarCloseTimerRef.current) {
      window.clearTimeout(rightSidebarCloseTimerRef.current);
      rightSidebarCloseTimerRef.current = null;
    }
    if (rightSidebarFrameRef.current) {
      window.cancelAnimationFrame(rightSidebarFrameRef.current);
      rightSidebarFrameRef.current = null;
    }
    setShowRightSidebar(true);
    rightSidebarFrameRef.current = window.requestAnimationFrame(() => {
      setIsRightSidebarVisible(true);
      rightSidebarFrameRef.current = null;
    });
  }, []);

  const closeRightSidebar = useCallback(() => {
    if (!showRightSidebar) return;
    if (rightSidebarCloseTimerRef.current) {
      window.clearTimeout(rightSidebarCloseTimerRef.current);
    }
    if (rightSidebarFrameRef.current) {
      window.cancelAnimationFrame(rightSidebarFrameRef.current);
      rightSidebarFrameRef.current = null;
    }
    setIsRightSidebarVisible(false);
    rightSidebarCloseTimerRef.current = window.setTimeout(() => {
      setShowRightSidebar(false);
      rightSidebarCloseTimerRef.current = null;
    }, 300);
  }, [showRightSidebar]);

  // Reuse Handler
  const handleReuse = (song: Song) => {
    setReuseData({ song, timestamp: Date.now() });
    setCurrentView('create');
    setMobileShowList(false);
  };

  const mapApiSong = useCallback((s: any, hasDetails = false): Song => ({
    id: s.id,
    title: s.title,
    lyrics: s.lyrics || '',
    style: s.style || '',
    caption: s.caption,
    bpm: s.bpm,
    key_scale: s.key_scale || s.keyScale,
    time_signature: s.time_signature || s.timeSignature,
    durationSeconds: typeof s.duration === 'number' ? s.duration : undefined,
    coverUrl: getCoverUrl(s.cover_url || s.coverUrl, s.id) || '',
    duration: s.duration && s.duration > 0 ? `${Math.floor(s.duration / 60)}:${String(Math.floor(s.duration % 60)).padStart(2, '0')}` : '0:00',
    createdAt: new Date(s.created_at || s.createdAt),
    tags: s.tags || [],
    audioUrl: getAudioUrl(s.audio_url || s.audioUrl, s.id),
    playbackUrl: s.id && (s.audio_url || s.audioUrl) ? `/api/songs/${encodeURIComponent(s.id)}/audio` : undefined,
    isPublic: s.is_public ?? s.isPublic,
    likeCount: s.like_count ?? s.likeCount ?? 0,
    like_count: s.like_count ?? s.likeCount ?? 0,
    viewCount: s.view_count ?? s.viewCount ?? 0,
    view_count: s.view_count ?? s.viewCount ?? 0,
    userId: s.user_id || s.userId,
    creator: s.creator,
    creator_avatar: s.creator_avatar,
    ditModel: s.dit_model || s.ditModel,
    isGenerating: s.isGenerating,
    queuePosition: s.queuePosition,
    progress: s.progress,
    stage: s.stage,
    stageKey: s.stageKey || getGenerationStageKey(s.stage) || undefined,
    generationParams: (() => {
      try {
        if (!s.generation_params && !s.generationParams) return undefined;
        const params = s.generation_params ?? s.generationParams;
        return typeof params === 'string' ? JSON.parse(params) : params;
      } catch {
        return undefined;
      }
    })(),
    hasDetails,
    isLiked: Boolean(s.is_liked ?? s.isLiked),
  }), []);

  // Song Update Handler
  const handleSongUpdate = useCallback((updatedSong: Song) => {
    const mergeSong = (existing: Song | null | undefined) =>
      existing && existing.id === updatedSong.id ? { ...existing, ...updatedSong } : existing;
    setSongs(prev => prev.map(s => s.id === updatedSong.id ? { ...s, ...updatedSong } : s));
    setPlayQueue(prev => prev.map(s => s.id === updatedSong.id ? { ...s, ...updatedSong } : s));
    setCurrentSong(prev => mergeSong(prev) ?? null);
    setSelectedSong(prev => mergeSong(prev) ?? null);
  }, []);

  useEffect(() => {
    const withVersion = (url: string | undefined, version: number | undefined) => {
      if (!url || !version || url.startsWith('data:') || url.startsWith('blob:')) return url;
      return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
    };

    const handleProfileUpdated = (event: Event) => {
      const { username, avatarUrl, bannerUrl, version, profile } = (event as CustomEvent<{
        username?: string;
        avatarUrl?: string;
        bannerUrl?: string;
        version?: number;
        profile?: UserProfileType;
      }>).detail || {};
      if (!username) return;

      const nextAvatarUrl = withVersion(avatarUrl, version);
      const patchSong = (song: Song | null): Song | null => {
        if (!song || song.creator !== username || !nextAvatarUrl) return song;
        return { ...song, creator_avatar: nextAvatarUrl };
      };

      setSongs(prev => prev.map(song => patchSong(song) as Song));
      setPlayQueue(prev => prev.map(song => patchSong(song) as Song));
      setCurrentSong(prev => patchSong(prev));
      setSelectedSong(prev => patchSong(prev));
      setViewingSongPreview(prev => patchSong(prev));
      setViewingProfilePreview(prev => (
        prev?.username === username
          ? {
              ...prev,
              ...profile,
              avatar_url: nextAvatarUrl ?? prev.avatar_url,
              banner_url: withVersion(bannerUrl, version) ?? prev.banner_url,
            }
          : prev
      ));
    };

    window.addEventListener('profile-updated', handleProfileUpdated);
    return () => window.removeEventListener('profile-updated', handleProfileUpdated);
  }, []);

  const handleSelectSong = useCallback((song: Song) => {
    setSelectedSong(song);
    openRightSidebar();
  }, [openRightSidebar]);

  const hasPreviewBannerLayout = (profile: Partial<UserProfileType> | null | undefined) => (
    Boolean(
      profile?.banner_url
      && typeof profile.banner_focus_x === 'number'
      && typeof profile.banner_focus_y === 'number'
      && typeof profile.banner_image_width === 'number'
      && typeof profile.banner_image_height === 'number'
    )
  );

  const canRenderProfilePreview = (profile: UserProfileType | null | undefined) => (
    Boolean(profile && hasPreviewBannerLayout(profile))
  );

  // Navigate to Profile Handler
  const handleNavigateToProfile = (username: string) => {
    const previewSource =
      currentSong?.creator === username ? currentSong :
      selectedSong?.creator === username ? selectedSong :
      songs.find(song => song.creator === username) || null;
    const fallbackId = user?.username === username ? user.id : previewSource?.userId || username;
    const previewBannerUrl = user?.username === username && hasPreviewBannerLayout(user)
      ? user.banner_url
      : undefined;
    setViewingProfilePreview({
      id: fallbackId,
      username,
      avatar_url: user?.username === username ? user.avatar_url : previewSource?.creator_avatar,
      banner_url: previewBannerUrl,
      banner_focus_x: previewBannerUrl ? user?.banner_focus_x : undefined,
      banner_focus_y: previewBannerUrl ? user?.banner_focus_y : undefined,
      banner_box_x: previewBannerUrl ? user?.banner_box_x : undefined,
      banner_box_y: previewBannerUrl ? user?.banner_box_y : undefined,
      banner_box_width: previewBannerUrl ? user?.banner_box_width : undefined,
      banner_box_height: previewBannerUrl ? user?.banner_box_height : undefined,
      banner_image_width: previewBannerUrl ? user?.banner_image_width : undefined,
      banner_image_height: previewBannerUrl ? user?.banner_image_height : undefined,
      bio: user?.username === username ? user.bio : undefined,
      created_at: user?.createdAt || new Date().toISOString(),
    });
    if (currentView !== 'profile') {
      setProfileReturnView(currentView);
    }
    setViewingUsername(username);
    setCurrentView('profile');
    window.history.pushState({}, '', `/@${username}`);
  };

  // Back from Profile Handler
  const handleBackFromProfile = () => {
    setViewingUsername(null);
    setViewingProfilePreview(null);
    setCurrentView(profileReturnView);
    const returnPath =
      profileReturnView === 'search' ? '/library' :
      profileReturnView === 'library' ? '/library' :
      profileReturnView === 'song' && viewingSongId ? `/song/${viewingSongId}` :
      profileReturnView === 'playlist' && viewingPlaylistId ? `/playlist/${viewingPlaylistId}` :
      profileReturnView === 'training' ? '/training' :
      '/';
    window.history.pushState({}, '', returnPath);
  };

  // Navigate to Song Handler
  const handleNavigateToSong = (songId: string) => {
    const previewSong =
      currentSong?.id === songId ? currentSong :
      selectedSong?.id === songId ? selectedSong :
      songs.find(song => song.id === songId) || null;
    setViewingSongPreview(previewSong);
    setViewingSongId(songId);
    setCurrentView('song');
    window.history.pushState({}, '', `/song/${songId}`);
  };

  // Back from Song Handler
  const handleBackFromSong = () => {
    setViewingSongId(null);
    setViewingSongPreview(null);
    setCurrentView('create');
    window.history.pushState({}, '', '/');
  };

  // Theme Effect
  useEffect(() => {
    localStorage.removeItem('theme');
    document.documentElement.classList.add('dark');
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.add('dark');
  };

  // URL Routing Effect
  useEffect(() => {
    const handleUrlChange = () => {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);

      // Handle ?song= query parameter
      const songParam = params.get('song');
      if (songParam) {
        setViewingSongId(songParam);
        setCurrentView('song');
        window.history.replaceState({}, '', `/song/${songParam}`);
        return;
      }

      if (path === '/create' || path === '/') {
        setCurrentView('create');
        setMobileShowList(false);
      } else if (path === '/library') {
        setCurrentView('library');
      } else if (path.startsWith('/@')) {
        const username = path.substring(2);
        if (username) {
          setViewingUsername(username);
          setCurrentView('profile');
        }
      } else if (path.startsWith('/song/')) {
        const songId = path.substring(6);
        if (songId) {
          setViewingSongId(songId);
          setCurrentView('song');
        }
      } else if (path.startsWith('/playlist/')) {
        const playlistId = path.substring(10);
        if (playlistId) {
          setViewingPlaylistId(playlistId);
          setCurrentView('playlist');
        }
      } else if (path === '/search') {
        window.history.replaceState({}, '', '/library');
        setCurrentView('library');
      }
    };

    handleUrlChange();

    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  // Load Songs Effect
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setSongs([]);
      setLikedSongIds(new Set());
      setIsSongsLoading(false);
      setHasMoreSongs(false);
      setSongsNextOffset(0);
      setTotalSongCount(null);
      setHasLoadedInitialSongs(true);
      return;
    }

    setHasLoadedInitialSongs(false);

    const loadSongs = async () => {
      setIsSongsLoading(true);
      try {
        let mySongsRes;
        mySongsRes = await songsApi.getMySongs(token, {
          limit: SONGS_PAGE_SIZE,
          offset: 0,
        });

        let allSongs = [...mySongsRes.songs];
        let nextOffset = mySongsRes.nextOffset ?? allSongs.length;
        const totalSongs = mySongsRes.total ?? allSongs.length;

        if (mySongsRes.hasMore && totalSongs <= EAGER_SONG_LOAD_THRESHOLD) {
          while (allSongs.length < totalSongs) {
            const nextPage = await songsApi.getMySongs(token, {
              limit: SONGS_PAGE_SIZE,
              offset: nextOffset,
            });
            if (!nextPage.songs.length) break;
            allSongs = [...allSongs, ...nextPage.songs];
            nextOffset = nextPage.nextOffset ?? (nextOffset + nextPage.songs.length);
            if (!nextPage.hasMore) break;
          }
        }

        const loadedSongs = allSongs.map(s => mapApiSong(s, true));

        // Preserve any generating songs (temp songs)
        setSongs(prev => {
          const generatingSongs = prev.filter(s => s.isGenerating);
          return [...generatingSongs, ...loadedSongs];
        });
        setLikedSongIds(new Set(loadedSongs.filter(s => s.isLiked).map(s => s.id)));
        setHasMoreSongs(loadedSongs.length < totalSongs);
        setSongsNextOffset(loadedSongs.length);
        setTotalSongCount(totalSongs);

      } catch (error) {
        console.error('Failed to load songs:', error);
      } finally {
        setIsSongsLoading(false);
        setHasLoadedInitialSongs(true);
      }
    };

    loadSongs();
  }, [isAuthenticated, token, mapApiSong]);

  const loadMoreSongs = useCallback(async () => {
    if (!token || isSongsLoading || isLoadingMoreSongsRef.current || !hasMoreSongs) return;
    isLoadingMoreSongsRef.current = true;
    setIsLoadingMoreSongs(true);
    try {
      const response = await songsApi.getMySongs(token, {
        limit: SONGS_PAGE_SIZE,
        offset: songsNextOffset,
      });
      const loadedSongs = response.songs.map(s => mapApiSong(s, true));
      setSongs(prev => {
        const existingIds = new Set(prev.map(song => song.id));
        return [...prev, ...loadedSongs.filter(song => !existingIds.has(song.id))];
      });
      setLikedSongIds(prev => {
        const next = new Set(prev);
        loadedSongs.forEach(song => {
          if (song.isLiked) next.add(song.id);
        });
        return next;
      });
      setHasMoreSongs(Boolean(response.hasMore));
      setSongsNextOffset(response.nextOffset ?? songsNextOffset + loadedSongs.length);
      setTotalSongCount(response.total ?? totalSongCount);
    } catch (error) {
      console.error('Failed to load more songs:', error);
    } finally {
      isLoadingMoreSongsRef.current = false;
      setIsLoadingMoreSongs(false);
    }
  }, [token, isSongsLoading, hasMoreSongs, songsNextOffset, totalSongCount, mapApiSong]);

  const loadReferenceTracks = useCallback(async () => {
    if (!isAuthenticated || !token) return;
    try {
      const response = await fetch('/api/reference-tracks', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) return;
      const data = await response.json();
      setReferenceTracks(data.tracks || []);
    } catch (error) {
      console.error('Failed to load reference tracks:', error);
    }
  }, [isAuthenticated, token]);

  // Load reference tracks for Library
  useEffect(() => {
    loadReferenceTracks();
  }, [loadReferenceTracks]);

  useEffect(() => {
    if (currentView === 'library') {
      loadReferenceTracks();
    }
  }, [currentView, loadReferenceTracks]);

  useEffect(() => {
    if (currentView !== 'song' || !currentSong?.id) return;
    if (viewingSongId === currentSong.id) return;
    setViewingSongPreview(currentSong);
    setViewingSongId(currentSong.id);
  }, [currentView, currentSong?.id, viewingSongId]);

  // Player Logic
  const getActiveQueue = (song?: Song) => {
    if (playQueue.length > 0) return playQueue;
    if (song && songs.some(s => s.id === song.id)) return songs;
    return songs;
  };

  const playNext = useCallback(() => {
    if (!currentSong) return;
    const queue = getActiveQueue(currentSong);
    if (queue.length === 0) return;

    const currentIndex = queueIndex >= 0 && queue[queueIndex]?.id === currentSong.id
      ? queueIndex
      : queue.findIndex(s => s.id === currentSong.id);
    if (currentIndex === -1) return;

    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      return;
    }

    // Find next playable song
    const queueLen = queue.length;
    for (let i = 1; i <= queueLen; i++) {
      let nextIndex;
      if (isShuffle) {
        nextIndex = Math.floor(Math.random() * queueLen);
        if (queueLen > 1 && nextIndex === currentIndex) continue;
      } else {
        nextIndex = currentIndex + i;
        // In 'none' repeat mode, stop at end of queue
        if (repeatMode === 'none' && nextIndex >= queueLen) {
          setIsPlaying(false);
          return;
        }
        nextIndex = nextIndex % queueLen;
      }

      const candidate = queue[nextIndex];
      if (hasSongPlaybackSource(candidate) && !candidate.isGenerating) {
        setQueueIndex(nextIndex);
        setCurrentSong(candidate);
        setSelectedSong(candidate);
        setIsPlaying(true);
        return;
      }
    }

    // No playable songs found
    setIsPlaying(false);
  }, [currentSong, queueIndex, isShuffle, repeatMode, playQueue, songs]);

  const playPrevious = useCallback(() => {
    if (!currentSong) return;
    const queue = getActiveQueue(currentSong);
    if (queue.length === 0) return;

    const currentIndex = queueIndex >= 0 && queue[queueIndex]?.id === currentSong.id
      ? queueIndex
      : queue.findIndex(s => s.id === currentSong.id);
    if (currentIndex === -1) return;

    if (currentTime > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }

    // Find previous playable song
    const queueLen = queue.length;
    for (let i = 1; i <= queueLen; i++) {
      let prevIndex;
      if (isShuffle) {
        prevIndex = Math.floor(Math.random() * queueLen);
        if (queueLen > 1 && prevIndex === currentIndex) continue;
      } else {
        prevIndex = currentIndex - i;
        // In 'none' repeat mode, stop at beginning of queue
        if (repeatMode === 'none' && prevIndex < 0) {
          if (audioRef.current) audioRef.current.currentTime = 0;
          return;
        }
        prevIndex = (prevIndex + queueLen) % queueLen;
      }

      const candidate = queue[prevIndex];
      if (hasSongPlaybackSource(candidate) && !candidate.isGenerating) {
        setQueueIndex(prevIndex);
        setCurrentSong(candidate);
        setSelectedSong(candidate);
        setIsPlaying(true);
        return;
      }
    }

    // No playable songs found
    setIsPlaying(false);
  }, [currentSong, queueIndex, currentTime, isShuffle, repeatMode, playQueue, songs]);

  const adjacentCoverUrls = useMemo(() => {
    if (!currentSong) return [];
    const queue = getActiveQueue(currentSong);
    if (queue.length <= 1) return [];

    const currentIndex = queueIndex >= 0 && queue[queueIndex]?.id === currentSong.id
      ? queueIndex
      : queue.findIndex(s => s.id === currentSong.id);
    if (currentIndex === -1) return [];

    const urls = new Set<string>();
    const collectPlayableCover = (direction: 1 | -1) => {
      for (let offset = 1; offset <= queue.length; offset++) {
        const rawIndex = currentIndex + offset * direction;
        if (repeatMode === 'none' && (rawIndex < 0 || rawIndex >= queue.length)) return;
        const candidate = queue[(rawIndex + queue.length) % queue.length];
        if (candidate && hasSongPlaybackSource(candidate) && !candidate.isGenerating && candidate.coverUrl) {
          urls.add(candidate.coverUrl);
          return;
        }
      }
    };

    collectPlayableCover(-1);
    collectPlayableCover(1);
    return Array.from(urls);
  }, [currentSong, queueIndex, playQueue, songs, repeatMode]);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const processAudioWarmupQueue = useCallback(() => {
    const maxWarmAudio = 12;
    const maxConcurrentWarmAudio = 2;
    const cache = audioWarmupCacheRef.current;
    const queue = audioWarmupQueueRef.current;
    const queuedIds = audioWarmupQueuedIdsRef.current;

    const trimCache = () => {
      while (cache.size > maxWarmAudio) {
        const oldestId = cache.keys().next().value;
        if (!oldestId) break;
        const warmAudio = cache.get(oldestId);
        warmAudio?.pause();
        warmAudio?.removeAttribute('src');
        warmAudio?.load();
        cache.delete(oldestId);
      }
    };

    while (audioWarmupActiveRef.current < maxConcurrentWarmAudio && queue.length > 0) {
      const song = queue.shift();
      const playbackUrl = getSongPlaybackUrl(song);
      if (!playbackUrl || song?.isGenerating || cache.has(song.id)) {
        if (song?.id) queuedIds.delete(song.id);
        continue;
      }

      queuedIds.delete(song.id);
      audioWarmupActiveRef.current += 1;

      const warmAudio = new Audio();
      warmAudio.crossOrigin = 'anonymous';
      warmAudio.preload = 'metadata';
      warmAudio.src = playbackUrl;
      cache.set(song.id, warmAudio);
      trimCache();

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        audioWarmupActiveRef.current = Math.max(0, audioWarmupActiveRef.current - 1);
        window.setTimeout(() => processAudioWarmupQueue(), 0);
      };

      warmAudio.addEventListener('loadedmetadata', finish, { once: true });
      warmAudio.addEventListener('canplay', finish, { once: true });
      warmAudio.addEventListener('error', finish, { once: true });
      window.setTimeout(finish, 5000);
      warmAudio.load();
    }
  }, []);

  const scheduleAudioWarmup = useCallback(() => {
    if (audioWarmupScheduleRef.current !== null) return;

    const runWarmup = () => {
      audioWarmupScheduleRef.current = null;
      processAudioWarmupQueue();
    };

    const requestIdle = (window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    }).requestIdleCallback;

    audioWarmupScheduleRef.current = requestIdle
      ? requestIdle(runWarmup, { timeout: 1600 })
      : window.setTimeout(runWarmup, 450);
  }, [processAudioWarmupQueue]);

  const warmupVisibleSongAudio = useCallback((song: Song) => {
    if (!hasSongPlaybackSource(song) || song.isGenerating) return;
    if (preloadedSongIdRef.current === song.id) return;
    if (audioWarmupCacheRef.current.has(song.id)) return;
    if (audioWarmupQueuedIdsRef.current.has(song.id)) return;

    audioWarmupQueuedIdsRef.current.add(song.id);
    audioWarmupQueueRef.current.push(song);
    scheduleAudioWarmup();
  }, [scheduleAudioWarmup]);

  // Audio Setup
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.crossOrigin = "anonymous";
    const audio = audioRef.current;
    audio.preload = 'auto';
    audio.volume = volume;

    const markPlaybackPrimed = () => {
      if (!playbackPrimedRef.current) {
        playbackPrimedRef.current = true;
        setHasPlaybackPrimed(true);
      }
      setIsPlaybackBootstrapping(false);
    };

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const applyPendingSeek = () => {
      if (pendingSeekRef.current === null) return;
      if (audio.seekable.length === 0) return;
      const target = pendingSeekRef.current;
      const safeTarget = Number.isFinite(audio.duration)
        ? Math.min(Math.max(target, 0), audio.duration)
        : Math.max(target, 0);
      audio.currentTime = safeTarget;
      setCurrentTime(safeTarget);
      pendingSeekRef.current = null;
    };

    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      applyPendingSeek();
    };

    const onCanPlay = () => {
      markPlaybackPrimed();
      applyPendingSeek();
    };

    const onProgress = () => {
      applyPendingSeek();
    };

    const onEnded = () => {
      playNextRef.current();
    };

    const onError = (e: Event) => {
      if (audio.error && audio.error.code !== 1) {
        console.error("Audio playback error:", audio.error);
        if (audio.error.code === 4) {
          showToast(t('songNotAvailable'), 'error');
        } else {
          showToast(t('unableToPlay'), 'error');
        }
      }
      setIsPlaybackBootstrapping(false);
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('progress', onProgress);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audioWarmupCacheRef.current.forEach(warmAudio => {
        warmAudio.pause();
        warmAudio.removeAttribute('src');
        warmAudio.load();
      });
      audioWarmupCacheRef.current.clear();
      audioWarmupQueueRef.current = [];
      audioWarmupQueuedIdsRef.current.clear();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('progress', onProgress);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  // Prime the audio element with the first playable song so the first user play
  // does not pay the full network/decode cold-start cost.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || currentSong || isPlaying) return;

    const firstPlayableSong = songs.find(song => hasSongPlaybackSource(song) && !song.isGenerating);
    const playbackUrl = getSongPlaybackUrl(firstPlayableSong);
    if (!firstPlayableSong || !playbackUrl) return;
    if (preloadedSongIdRef.current === firstPlayableSong.id) return;

    preloadedSongIdRef.current = firstPlayableSong.id;
    currentSongIdRef.current = firstPlayableSong.id;
    audio.src = playbackUrl;
    audio.load();
  }, [songs, currentSong, isPlaying]);

  // Handle Playback State
  useEffect(() => {
    const audio = audioRef.current;
    const playbackUrl = getSongPlaybackUrl(currentSong);
    if (!audio || !playbackUrl) return;

    const playAudio = async () => {
      try {
        await audio.play();
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error("Playback failed:", err);
          if (err.name === 'NotSupportedError') {
            showToast(t('songNotAvailable'), 'error');
          }
          setIsPlaying(false);
        }
      }
    };

    if (currentSongIdRef.current !== currentSong.id) {
      currentSongIdRef.current = currentSong.id;
      audio.src = playbackUrl;
      audio.load();
      if (isPlaying) playAudio();
    } else {
      if (isPlaying) playAudio();
      else {
        audio.pause();
      }
    }
  }, [currentSong, isPlaying]);

  // Handle Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    localStorage.setItem('volume', String(volume));
  }, [volume]);

  // Handle Playback Rate
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Spacebar play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      if (currentSong) {
        if (hasSongPlaybackSource(currentSong) && !(isPlaybackBootstrapping && !hasPlaybackPrimed)) {
          setIsPlaying(prev => !prev);
        }
      } else {
        // No song selected — play first available
        const available = songs.filter(s => hasSongPlaybackSource(s) && !s.isGenerating);
        if (available.length > 0) {
          playSong(available[0], available);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSong, songs, isPlaybackBootstrapping, hasPlaybackPrimed]);

  // Helper to cleanup a job and check if all jobs are done
  const cleanupJob = useCallback((jobId: string, tempId: string) => {
    const jobData = activeJobsRef.current.get(jobId);
    if (jobData) {
      clearInterval(jobData.pollInterval);
      activeJobsRef.current.delete(jobId);
    }

    // Remove temp song
    setSongs(prev => prev.filter(s => s.id !== tempId));

    // Update active job count
    setActiveJobCount(activeJobsRef.current.size);

    // If no more active jobs, set isGenerating to false
    if (activeJobsRef.current.size === 0) {
      setIsGenerating(false);
    }
  }, []);

  // Refresh songs list (called when any job completes successfully)
  const refreshSongsList = useCallback(async () => {
    if (!token) return;
    try {
      const response = await songsApi.getMySongs(token, {
        limit: Math.max(SONGS_PAGE_SIZE, songsNextOffset || SONGS_PAGE_SIZE),
        offset: 0,
      });
      let allSongs = [...response.songs];
      let nextOffset = response.nextOffset ?? allSongs.length;
      const totalSongs = response.total ?? allSongs.length;

      if (response.hasMore && totalSongs <= EAGER_SONG_LOAD_THRESHOLD) {
        while (allSongs.length < totalSongs) {
          const nextPage = await songsApi.getMySongs(token, {
            limit: SONGS_PAGE_SIZE,
            offset: nextOffset,
          });
          if (!nextPage.songs.length) break;
          allSongs = [...allSongs, ...nextPage.songs];
          nextOffset = nextPage.nextOffset ?? (nextOffset + nextPage.songs.length);
          if (!nextPage.hasMore) break;
        }
      }

      const loadedSongs: Song[] = allSongs.map(s => mapApiSong(s, true));

      // Preserve any generating songs that aren't in the loaded list
      setSongs(prev => {
        const generatingSongs = prev.filter(s => s.isGenerating);
        const mergedSongs = [...generatingSongs];
        for (const song of loadedSongs) {
          if (!mergedSongs.some(s => s.id === song.id)) {
            mergedSongs.push(song);
          }
        }
        // Sort by creation date, newest first
        return mergedSongs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });
      setLikedSongIds(new Set(loadedSongs.filter(s => s.isLiked).map(s => s.id)));
      setHasMoreSongs(loadedSongs.length < totalSongs);
      setSongsNextOffset(loadedSongs.length);
      setTotalSongCount(totalSongs);

      // If the current selection was a temp/generating song, replace it with newest real song
      const current = selectedSongRef.current;
      if (current?.isGenerating || (current && !loadedSongs.some(s => s.id === current.id))) {
        setSelectedSong(loadedSongs[0] ?? null);
      }
    } catch (error) {
      console.error('Failed to refresh songs:', error);
    }
  }, [token, songsNextOffset, mapApiSong]);

  const beginPollingJob = useCallback((jobId: string, tempId: string) => {
    if (!token) return;
    if (activeJobsRef.current.has(jobId)) return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await generateApi.getStatus(jobId, token);
        const normalizedProgress = Number.isFinite(Number(status.progress))
          ? (Number(status.progress) > 1 ? Number(status.progress) / 100 : Number(status.progress))
          : undefined;
        const newQueuePos = status.status === 'queued' ? status.queuePosition : undefined;

        setSongs(prev => {
          const song = prev.find(s => s.id === tempId);
          if (!song) return prev;
          const newProgress = normalizedProgress ?? song.progress;
          const newStage = status.stage ?? song.stage;
          const newStageKey = getGenerationStageKey(status.stage);
          // Skip update if nothing changed to avoid unnecessary re-renders
          if (
            newProgress === song.progress &&
            newStage === song.stage &&
            newStageKey === song.stageKey &&
            newQueuePos === song.queuePosition
          ) {
            return prev;
          }
          return prev.map(s => {
            if (s.id !== tempId) return s;
            return { ...s, queuePosition: newQueuePos, progress: newProgress, stage: newStage, stageKey: newStageKey ?? undefined };
          });
        });

        setSelectedSong(current => {
          if (current?.id !== tempId) return current;
          const newProgress = normalizedProgress ?? current.progress;
          const newStage = status.stage ?? current.stage;
          const newStageKey = getGenerationStageKey(status.stage);
          if (
            newProgress === current.progress &&
            newStage === current.stage &&
            newStageKey === current.stageKey &&
            newQueuePos === current.queuePosition
          ) {
            return current;
          }
          return { ...current, queuePosition: newQueuePos, progress: newProgress, stage: newStage, stageKey: newStageKey ?? undefined };
        });

        if (status.status === 'succeeded' && status.result) {
          cleanupJob(jobId, tempId);
          await refreshSongsList();

          if (window.innerWidth < 768) {
            setMobileShowList(true);
          }
        } else if (status.status === 'failed') {
          cleanupJob(jobId, tempId);
          console.error(`Job ${jobId} failed:`, status.error);
          showToast(`${t('generationFailed')}: ${status.error || t('unknownError')}`, 'error');
        }
      } catch (pollError) {
        console.error(`Polling error for job ${jobId}:`, pollError);
        cleanupJob(jobId, tempId);
      }
    }, 2000);

    activeJobsRef.current.set(jobId, { tempId, pollInterval });
    setActiveJobCount(activeJobsRef.current.size);

    setTimeout(() => {
      if (activeJobsRef.current.has(jobId)) {
        console.warn(`Job ${jobId} timed out`);
        cleanupJob(jobId, tempId);
        showToast(t('generationTimedOut'), 'error');
      }
    }, GENERATION_TIMEOUT_MS);
  }, [token, cleanupJob, refreshSongsList]);

  const buildTempSongFromParams = (
    params: GenerationParams,
    tempId: string,
    createdAt?: Date,
    generationState?: Partial<Pick<Song, 'progress' | 'stage' | 'stageKey' | 'queuePosition'>>,
  ): Song => ({
    id: tempId,
    title: '',
    lyrics: '',
    style: params.style || params.songDescription || '',
    coverUrl: getCoverUrl(undefined, 'generating'),
    duration: '--:--',
    createdAt: createdAt ?? new Date(),
    isGenerating: true,
    progress: generationState?.progress ?? 0.02,
    stage: generationState?.stage,
    stageKey: generationState?.stageKey ?? 'queuedStage',
    queuePosition: generationState?.queuePosition,
    tags: params.customMode ? ['custom'] : ['simple'],
    isPublic: true,
    userId: user?.id,
    creator: user?.username,
    creator_avatar: user?.avatar_url,
    ditModel: params.ditModel,
    generationParams: params,
  });

  // Handlers
  const handleGenerate = async (params: GenerationParams) => {
    if (!isAuthenticated || !token) {
      setShowUsernameModal(true);
      return;
    }

    setIsGenerating(true);
    setCurrentView('create');
    setMobileShowList(false);

    const usesSimpleLmPlanning = !params.customMode && !params.instrumental;
    const initialGenerationStageKey = usesSimpleLmPlanning
      ? 'creatingLyricsSample'
      : 'submittingJob';

    // Create unique temp ID for this job
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tempSong: Song = {
      id: tempId,
      title: '',
      lyrics: '',
      style: params.style,
      coverUrl: getCoverUrl(undefined, 'generating'),
      duration: '--:--',
      createdAt: new Date(),
      isGenerating: true,
      progress: 0.02,
      stageKey: initialGenerationStageKey,
      tags: params.customMode ? ['custom'] : ['simple'],
      isPublic: true,
      userId: user?.id,
      creator: user?.username,
      creator_avatar: user?.avatar_url,
      ditModel: params.ditModel,
      generationParams: params,
    };

    setSongs(prev => [tempSong, ...prev]);
    setSelectedSong(tempSong);
    openRightSidebar();

    const preflightStageTimers: ReturnType<typeof setTimeout>[] = [];
    if (usesSimpleLmPlanning) {
      preflightStageTimers.push(setTimeout(() => {
        setSongs(prev => prev.map(song =>
          song.id === tempId && song.isGenerating && !song.queuePosition
            ? {
                ...song,
                progress: Math.max(song.progress ?? 0, 0.05),
                stageKey: 'refiningLyricsAndMetadata',
              }
            : song
        ));
        setSelectedSong(current =>
          current?.id === tempId && current.isGenerating && !current.queuePosition
            ? {
                ...current,
                progress: Math.max(current.progress ?? 0, 0.05),
                stageKey: 'refiningLyricsAndMetadata',
              }
            : current
        );
      }, 1400));

      preflightStageTimers.push(setTimeout(() => {
        setSongs(prev => prev.map(song =>
          song.id === tempId && song.isGenerating && !song.queuePosition
            ? { ...song, progress: Math.max(song.progress ?? 0, 0.08), stageKey: 'queueingGenerationJob' }
            : song
        ));
        setSelectedSong(current =>
          current?.id === tempId && current.isGenerating && !current.queuePosition
            ? { ...current, progress: Math.max(current.progress ?? 0, 0.08), stageKey: 'queueingGenerationJob' }
            : current
        );
      }, 4200));
    }

    try {
      const job = await generateApi.startGeneration({
        customMode: params.customMode,
        songDescription: params.songDescription,
        lyrics: params.lyrics,
        style: params.style,
        title: params.title,
        instrumental: params.instrumental,
        vocalLanguage: params.vocalLanguage,
        duration: params.duration && params.duration > 0 ? params.duration : undefined,
        bpm: params.bpm,
        keyScale: params.keyScale,
        timeSignature: params.timeSignature,
        inferenceSteps: params.inferenceSteps,
        guidanceScale: params.guidanceScale,
        batchSize: params.batchSize,
        randomSeed: params.randomSeed,
        seed: params.seed,
        thinking: params.thinking,
        audioFormat: params.audioFormat,
        inferMethod: params.inferMethod,
        shift: params.shift,
        lmTemperature: params.lmTemperature,
        lmCfgScale: params.lmCfgScale,
        lmTopK: params.lmTopK,
        lmTopP: params.lmTopP,
        lmNegativePrompt: params.lmNegativePrompt,
        lmBackend: params.lmBackend,
        lmModel: params.lmModel,
        referenceAudioUrl: params.referenceAudioUrl,
        sourceAudioUrl: params.sourceAudioUrl,
        referenceAudioTitle: params.referenceAudioTitle,
        sourceAudioTitle: params.sourceAudioTitle,
        audioCodes: params.audioCodes,
        repaintingStart: params.repaintingStart,
        repaintingEnd: params.repaintingEnd,
        instruction: params.instruction,
        audioCoverStrength: params.audioCoverStrength,
        taskType: params.taskType,
        useAdg: params.useAdg,
        cfgIntervalStart: params.cfgIntervalStart,
        cfgIntervalEnd: params.cfgIntervalEnd,
        customTimesteps: params.customTimesteps,
        useCotMetas: params.useCotMetas,
        useCotCaption: params.useCotCaption,
        useCotLanguage: params.useCotLanguage,
        autogen: params.autogen,
        constrainedDecodingDebug: params.constrainedDecodingDebug,
        allowLmBatch: params.allowLmBatch,
        getScores: params.getScores,
        getLrc: params.getLrc,
        scoreScale: params.scoreScale,
        lmBatchChunkSize: params.lmBatchChunkSize,
        trackName: params.trackName,
        completeTrackClasses: params.completeTrackClasses,
        isFormatCaption: params.isFormatCaption,
        ditModel: params.ditModel,
        dcwEnabled: params.dcwEnabled,
        dcwMode: params.dcwMode,
        dcwScaler: params.dcwScaler,
        dcwHighScaler: params.dcwHighScaler,
        dcwWavelet: params.dcwWavelet,
        vaeModel: params.vaeModel,
      }, token);

      preflightStageTimers.forEach(clearTimeout);
      setSongs(prev => prev.map(song =>
        song.id === tempId
          ? { ...song, progress: Math.max(song.progress ?? 0, 0.1), stageKey: 'generationJobSubmitted' }
          : song
      ));
      setSelectedSong(current =>
        current?.id === tempId
          ? { ...current, progress: Math.max(current.progress ?? 0, 0.1), stageKey: 'generationJobSubmitted' }
          : current
      );

      beginPollingJob(job.jobId, tempId);

    } catch (e) {
      preflightStageTimers.forEach(clearTimeout);
      console.error('Generation error:', e);
      setSongs(prev => prev.filter(s => s.id !== tempId));

      // Only set isGenerating to false if no other jobs are running
      if (activeJobsRef.current.size === 0) {
        setIsGenerating(false);
      }
      showToast(t('generationFailed'), 'error');
    }
  };

  // Resume active jobs on refresh so progress keeps updating
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const resumeJobs = async () => {
      try {
        const history = await generateApi.getHistory(token);
        const jobs = Array.isArray(history.jobs) ? history.jobs : [];

        const activeStatuses = new Set(['pending', 'queued', 'running']);
        const jobsToResume = jobs
          .map((job: any) => ({
            ...job,
            createdAtDate: getResumableGenerationCreatedAt(job.created_at, history.serverNow),
          }))
          .filter((job: any) => {
            if (!activeStatuses.has(job.status)) return false;
            if (!job.createdAtDate || !isFreshGenerationCreatedAt(job.createdAtDate)) {
              console.warn('Skipping stale generation job during resume:', job.id || job.jobId);
              return false;
            }
            return true;
          });

        if (jobsToResume.length === 0) return;

        const jobsWithLiveState = await Promise.all(jobsToResume.map(async (job: any) => {
          const jobId = job.id || job.jobId;
          if (!jobId) return { ...job, liveStatus: null };
          try {
            const liveStatus = await generateApi.getStatus(jobId, token);
            return { ...job, liveStatus };
          } catch (error) {
            console.warn('Failed to fetch live generation status during resume:', jobId, error);
            return { ...job, liveStatus: null };
          }
        }));

        setSongs(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const next = [...prev];

          for (const job of jobsWithLiveState) {
            const jobId = job.id || job.jobId;
            if (!jobId) continue;
            const tempId = `job_${jobId}`;
            if (existingIds.has(tempId)) continue;

            const params = (() => {
              try {
                if (!job.params) return {};
                return typeof job.params === 'string' ? JSON.parse(job.params) : job.params;
              } catch {
                return {};
              }
            })();

            const liveStatus = job.liveStatus;
            const normalizedProgress = Number.isFinite(Number(liveStatus?.progress))
              ? (Number(liveStatus.progress) > 1 ? Number(liveStatus.progress) / 100 : Number(liveStatus.progress))
              : undefined;
            const queuePosition = liveStatus?.status === 'queued'
              ? liveStatus.queuePosition
              : undefined;
            const stage = liveStatus?.stage;
            const stageKey = liveStatus?.status === 'queued'
              ? 'queuedStage'
              : getGenerationStageKey(stage) ?? 'generationJobSubmitted';

            next.unshift(buildTempSongFromParams(params, tempId, job.createdAtDate, {
              progress: normalizedProgress,
              queuePosition,
              stage,
              stageKey,
            }));
            existingIds.add(tempId);
          }
          return next;
        });

        for (const job of jobsWithLiveState) {
          const jobId = job.id || job.jobId;
          if (!jobId) continue;
          const tempId = `job_${jobId}`;
          beginPollingJob(jobId, tempId);
        }
      } catch (error) {
        console.error('Failed to resume jobs:', error);
      }
    };

    resumeJobs();
  }, [isAuthenticated, token, beginPollingJob]);

  const togglePlay = () => {
    if (!currentSong) return;
    if (isPlaybackBootstrapping && !hasPlaybackPrimed) {
      return;
    }
    if (!hasSongPlaybackSource(currentSong)) {
      showToast(t('songNotAvailable'), 'error');
      return;
    }
    setIsPlaying(!isPlaying);
  };

  const playFirst = () => {
    const available = songs.filter(s => hasSongPlaybackSource(s) && !s.isGenerating);
    if (available.length > 0) {
      playSong(available[0], available);
    }
  };

  const syncSongViewCount = useCallback((songId: string, viewCount: number) => {
    setSongs(prev => prev.map(s => s.id === songId ? { ...s, viewCount, view_count: viewCount } : s));
    setPlayQueue(prev => prev.map(s => s.id === songId ? { ...s, viewCount, view_count: viewCount } : s));
    setCurrentSong(prev => prev?.id === songId ? { ...prev, viewCount, view_count: viewCount } : prev);
    setSelectedSong(prev => prev?.id === songId ? { ...prev, viewCount, view_count: viewCount } : prev);
  }, []);

  const beginImmediatePlayback = (song: Song) => {
    const audio = audioRef.current;
    const playbackUrl = getSongPlaybackUrl(song);
    if (!audio || !playbackUrl) return;
    const resolvedPlaybackUrl = new URL(playbackUrl, window.location.href).href;
    const isPreloadedMatch =
      currentSongIdRef.current === song.id &&
      audio.src === resolvedPlaybackUrl;

    setCurrentTime(0);
    setDuration(
      isPreloadedMatch && Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : 0
    );
    if (!playbackPrimedRef.current) {
      setIsPlaybackBootstrapping(true);
    }

    if (!isPreloadedMatch) {
      currentSongIdRef.current = song.id;
      audio.src = playbackUrl;
      audio.load();
    }

    audio.play().catch(err => {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error("Playback failed:", err);
        if (err.name === 'NotSupportedError') {
          showToast(t('songNotAvailable'), 'error');
        }
        setIsPlaying(false);
      }
    });
  };

  const playSong = (song: Song, list?: Song[]) => {
    if (!hasSongPlaybackSource(song)) {
      showToast(t('songNotAvailable'), 'error');
      return;
    }

    const nextQueue = list && list.length > 0
      ? list
      : (playQueue.length > 0 && playQueue.some(s => s.id === song.id))
          ? playQueue
          : (songs.some(s => s.id === song.id) ? songs : [song]);
    const nextIndex = nextQueue.findIndex(s => s.id === song.id);
    setPlayQueue(nextQueue);
    setQueueIndex(nextIndex);

    if (currentSong?.id !== song.id) {
      const currentViews = song.viewCount ?? (song as Song & { view_count?: number }).view_count ?? 0;
      const updatedSong = { ...song, viewCount: currentViews + 1, view_count: currentViews + 1 };
      beginImmediatePlayback(updatedSong);
      setCurrentSong(updatedSong);
      setSelectedSong(updatedSong);
      setIsPlaying(true);
      setSongs(prev => prev.map(s => s.id === song.id ? updatedSong : s));
      setPlayQueue(prev => prev.map(s => s.id === song.id ? updatedSong : s));
      songsApi.trackPlay(song.id, token)
        .then(result => {
          if (typeof result.viewCount === 'number') {
            syncSongViewCount(song.id, result.viewCount);
          }
        })
        .catch(err => console.error('Failed to track play:', err));
    } else {
      togglePlay();
    }
    if (currentSong?.id === song.id) {
      setSelectedSong(song);
    }
    openRightSidebar();
  };

  const playSongAtTime = (song: Song, time: number) => {
    if (!hasSongPlaybackSource(song)) {
      showToast(t('songNotAvailable'), 'error');
      return;
    }

    const safeTime = Math.max(0, time);
    if (currentSong?.id === song.id) {
      handleSeek(safeTime);
      setIsPlaying(true);
      setSelectedSong(song);
      openRightSidebar();
      return;
    }

    pendingSeekRef.current = safeTime;
    playSong(song);
    setIsPlaying(true);
  };

  const handleSeek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (Number.isNaN(audio.duration) || audio.readyState < 1 || audio.seekable.length === 0) {
      pendingSeekRef.current = time;
      return;
    }
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const toggleLike = async (songId: string) => {
    if (!token) return;

    const isLiked = likedSongIds.has(songId);

    // Optimistic update
    setLikedSongIds(prev => {
      const next = new Set(prev);
      if (isLiked) next.delete(songId);
      else next.add(songId);
      return next;
    });

    setSongs(prev => prev.map(s => {
      if (s.id === songId) {
        const newCount = (s.likeCount || 0) + (isLiked ? -1 : 1);
        return { ...s, likeCount: Math.max(0, newCount) };
      }
      return s;
    }));

    if (selectedSong?.id === songId) {
      setSelectedSong(prev => prev ? {
        ...prev,
        likeCount: Math.max(0, (prev.likeCount || 0) + (isLiked ? -1 : 1))
      } : null);
    }

    // Persist to database
    try {
      await songsApi.toggleLike(songId, token);
    } catch (error) {
      console.error('Failed to toggle like:', error);
      // Revert on error
      setLikedSongIds(prev => {
        const next = new Set(prev);
        if (isLiked) next.add(songId);
        else next.delete(songId);
        return next;
      });
    }
  };

  const handleDeleteSong = (song: Song) => {
    handleDeleteSongs([song]);
  };

  const handleDeleteSongs = (songsToDelete: Song[]) => {
    if (!token || songsToDelete.length === 0) return;

    const isSingle = songsToDelete.length === 1;
    const title = isSingle ? t('confirmDeleteTitle') : t('confirmDeleteManyTitle');
    const message = isSingle
      ? t('deleteSongConfirm').replace('{title}', songsToDelete[0].title)
      : t('deleteSongsConfirm').replace('{count}', String(songsToDelete.length));

    setConfirmDialog({
      title,
      message,
      onConfirm: async () => {
        setConfirmDialog(null);

        const idsToDelete = new Set(songsToDelete.map(song => song.id));
        const succeeded: string[] = [];
        const failed: string[] = [];

        for (const song of songsToDelete) {
          try {
            await songsApi.deleteSong(song.id, token!);
            succeeded.push(song.id);
          } catch (error) {
            console.error('Failed to delete song:', error);
            failed.push(song.id);
          }
        }

        if (succeeded.length > 0) {
          setSongs(prev => prev.filter(s => !idsToDelete.has(s.id) || failed.includes(s.id)));

          setLikedSongIds(prev => {
            const next = new Set(prev);
            succeeded.forEach(id => next.delete(id));
            return next;
          });

          if (selectedSong?.id && succeeded.includes(selectedSong.id)) {
            setSelectedSong(null);
          }

          if (currentSong?.id && succeeded.includes(currentSong.id)) {
            setCurrentSong(null);
            setIsPlaying(false);
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.src = '';
            }
          }

          setPlayQueue(prev => prev.filter(s => !idsToDelete.has(s.id) || failed.includes(s.id)));
        }

        if (failed.length > 0) {
          showToast(t('songsDeletedPartial').replace('{succeeded}', String(succeeded.length)).replace('{total}', String(songsToDelete.length)), 'error');
        } else if (isSingle) {
          showToast(t('songDeleted'));
        } else {
          showToast(t('songsDeletedSuccess'));
        }
      },
    });
  };

  const handleDeleteReferenceTrack = (trackId: string) => {
    if (!token) return;

    setConfirmDialog({
      title: t('delete'),
      message: t('deleteUploadConfirm'),
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const response = await fetch(`/api/reference-tracks/${trackId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token!}` }
          });
          if (!response.ok) {
            throw new Error('Failed to delete upload');
          }
          setReferenceTracks(prev => prev.filter(track => track.id !== trackId));
          showToast(t('songDeleted'));
        } catch (error) {
          console.error('Failed to delete upload:', error);
          showToast(t('failedToDeleteSong'), 'error');
        }
      },
    });
  };

  const createPlaylist = async (name: string, description: string) => {
    if (!token) return;
    try {
      const res = await playlistsApi.create(name, description, true, token);
      setPlaylists(prev => [res.playlist, ...prev]);

      if (songToAddToPlaylist) {
        await playlistsApi.addSong(res.playlist.id, songToAddToPlaylist.id, token);
        setSongToAddToPlaylist(null);
        playlistsApi.getMyPlaylists(token).then(r => setPlaylists(r.playlists)).catch(() => {});
      }
      showToast(t('playlistCreated'));
    } catch (error) {
      console.error('Create playlist error:', error);
      showToast(t('failedToCreatePlaylist'), 'error');
    }
  };

  const openAddToPlaylistModal = (song: Song) => {
    setSongToAddToPlaylist(song);
    setIsAddToPlaylistModalOpen(true);
  };

  const addSongToPlaylist = async (playlistId: string) => {
    if (!songToAddToPlaylist || !token) return;
    try {
      await playlistsApi.addSong(playlistId, songToAddToPlaylist.id, token);
      setSongToAddToPlaylist(null);
      showToast(t('songAddedToPlaylist'));
      playlistsApi.getMyPlaylists(token).then(r => setPlaylists(r.playlists)).catch(() => {});
    } catch (error) {
      console.error('Add song error:', error);
      showToast(t('failedToAddSong'), 'error');
    }
  };

  const handleNavigateToPlaylist = (playlistId: string) => {
    setViewingPlaylistId(playlistId);
    setCurrentView('playlist');
    window.history.pushState({}, '', `/playlist/${playlistId}`);
  };

  const handleUseAsReference = (song: Song) => {
    if (!song.audioUrl) return;
    setPendingAudioSelection({ target: 'reference', url: song.audioUrl, title: song.title });
    setCurrentView('create');
    setMobileShowList(false);
  };

  const handleCoverSong = (song: Song) => {
    if (!song.audioUrl) return;
    setPendingAudioSelection({ target: 'source', url: song.audioUrl, title: song.title });
    setCurrentView('create');
    setMobileShowList(false);
  };

  const handleUseUploadAsReference = (track: { audio_url: string; filename: string }) => {
    setPendingAudioSelection({
      target: 'reference',
      url: track.audio_url,
      title: track.filename.replace(/\.[^/.]+$/, ''),
    });
    setCurrentView('create');
    setMobileShowList(false);
  };

  const handleCoverUpload = (track: { audio_url: string; filename: string }) => {
    setPendingAudioSelection({
      target: 'source',
      url: track.audio_url,
      title: track.filename.replace(/\.[^/.]+$/, ''),
    });
    setCurrentView('create');
    setMobileShowList(false);
  };

  const handleBackFromPlaylist = () => {
    setViewingPlaylistId(null);
    setCurrentView('library');
    window.history.pushState({}, '', '/library');
  };

  const openVideoGenerator = (song: Song) => {
    if (isPlaying) {
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
    }
    setSongForVideo(song);
    setIsVideoModalOpen(true);
  };

  const pauseMainPlayback = useCallback(() => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  // Handle username setup
  const handleUsernameSubmit = async (username: string) => {
    await setupUser(username);
    setShowUsernameModal(false);
  };

  // Render Layout Logic
  const renderContent = () => {
    switch (currentView) {
      case 'library': {
        const allSongs = user ? songs.filter(s => s.userId === user.id) : [];
        return (
          <LibraryView
            allSongs={allSongs}
            likedSongs={songs.filter(s => likedSongIds.has(s.id))}
            playlists={playlists}
            referenceTracks={referenceTracks}
            onPlaySong={playSong}
            onPauseMainPlayback={pauseMainPlayback}
            onCreatePlaylist={() => {
              setSongToAddToPlaylist(null);
              setIsCreatePlaylistModalOpen(true);
            }}
            onSelectPlaylist={(p) => handleNavigateToPlaylist(p.id)}
            onAddToPlaylist={openAddToPlaylistModal}
            onOpenVideo={openVideoGenerator}
            onReusePrompt={handleReuse}
            onDeleteSong={handleDeleteSong}
            onDeleteReferenceTrack={handleDeleteReferenceTrack}
            currentSong={currentSong}
            isPlaying={isPlaying}
          />
        );
      }

      case 'profile':
        if (!viewingUsername) return null;
        return (
          <UserProfile
            username={viewingUsername}
            initialUser={canRenderProfilePreview(viewingProfilePreview) ? viewingProfilePreview : null}
            onBack={handleBackFromProfile}
            onPlaySong={playSong}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToPlaylist={handleNavigateToPlaylist}
            currentSong={currentSong}
            isPlaying={isPlaying}
            likedSongIds={likedSongIds}
            onToggleLike={toggleLike}
          />
        );

      case 'playlist':
        if (!viewingPlaylistId) return null;
        return (
          <PlaylistDetail
            playlistId={viewingPlaylistId}
            onBack={handleBackFromPlaylist}
            onPlaySong={playSong}
            onSelect={handleSelectSong}
            onNavigateToProfile={handleNavigateToProfile}
          />
        );

      case 'song':
        if (!viewingSongId) return null;
        return (
          <SongProfile
            songId={viewingSongId}
            initialSong={viewingSongPreview}
            onBack={handleBackFromSong}
            onPlay={playSong}
            onNavigateToProfile={handleNavigateToProfile}
            currentSong={currentSong}
            isPlaying={isPlaying}
            currentTime={currentTime}
            onPlayAtTime={playSongAtTime}
            likedSongIds={likedSongIds}
            onToggleLike={toggleLike}
          />
        );

      case 'search':
        return (
          <SearchPage
            onPlaySong={playSong}
            currentSong={currentSong}
            isPlaying={isPlaying}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToSong={handleNavigateToSong}
            onNavigateToPlaylist={handleNavigateToPlaylist}
          />
        );

      case 'training':
        return <TrainingPanel />;

      case 'create':
      default:
        return (
          <div className="flex h-full overflow-hidden relative w-full">
            {/* Create Panel */}
            <div className={`
              ${mobileShowList ? 'hidden md:block' : 'w-full'}
              md:w-[320px] lg:w-[360px] flex-shrink-0 h-full border-r border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-suno-panel relative z-10 transition-colors duration-300
            `}>
              <CreatePanel
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
                initialData={reuseData}
                createdSongs={songs}
                pendingAudioSelection={pendingAudioSelection}
                onAudioSelectionApplied={() => setPendingAudioSelection(null)}
              />
            </div>

            {/* Song List */}
            <div className={`
              ${!mobileShowList ? 'hidden md:flex' : 'flex'}
              flex-1 flex-col h-full overflow-hidden bg-white dark:bg-suno-DEFAULT transition-colors duration-300
            `}>
              <SongList
                songs={songs}
                currentSong={currentSong}
                selectedSong={selectedSong}
                likedSongIds={likedSongIds}
                isPlaying={isPlaying}
                isPlaybackLoading={isPlaybackBootstrapping && !hasPlaybackPrimed}
                referenceTracks={referenceTracks}
                onPlay={playSong}
                onSelect={handleSelectSong}
                onToggleLike={toggleLike}
                onAddToPlaylist={openAddToPlaylistModal}
                onOpenVideo={openVideoGenerator}
                onShowDetails={handleShowDetails}
                isLoading={isSongsLoading}
                isLoadingMore={isLoadingMoreSongs}
                hasMore={hasMoreSongs}
                totalSongs={totalSongCount}
                onLoadMore={loadMoreSongs}
                onNavigateToProfile={handleNavigateToProfile}
                onReusePrompt={handleReuse}
                onDelete={handleDeleteSong}
                onDeleteMany={handleDeleteSongs}
                onUseAsReference={handleUseAsReference}
                onCoverSong={handleCoverSong}
                onUseUploadAsReference={handleUseUploadAsReference}
                onCoverUpload={handleCoverUpload}
                onAudioWarmup={warmupVisibleSongAudio}
                onSongUpdate={handleSongUpdate}
              />
            </div>

            {/* Right Sidebar */}
            {showRightSidebar && (
              <div
                className={`hidden xl:block flex-shrink-0 h-full overflow-hidden bg-zinc-50 dark:bg-suno-panel transition-[width,background-color] duration-300 ease-out will-change-[width] ${
                  isRightSidebarVisible ? 'w-[360px]' : 'w-0'
                }`}
              >
                <div
                  className={`h-full w-[360px] bg-zinc-50 dark:bg-suno-panel border-l border-zinc-200 dark:border-white/5 transition-[transform,opacity,background-color] duration-300 ease-out will-change-transform ${
                    isRightSidebarVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
                  }`}
                >
                  <RightSidebar
                    song={selectedSong}
                    onClose={closeRightSidebar}
                    onOpenVideo={() => selectedSong && openVideoGenerator(selectedSong)}
                    onReuse={handleReuse}
                    onSongUpdate={handleSongUpdate}
                    onNavigateToProfile={handleNavigateToProfile}
                    onNavigateToSong={handleNavigateToSong}
                    isLiked={selectedSong ? likedSongIds.has(selectedSong.id) : false}
                    onToggleLike={toggleLike}
                    onDelete={handleDeleteSong}
                    onPlay={playSong}
                    isPlaying={isPlaying}
                    currentSong={currentSong}
                  />
                </div>
              </div>
            )}

            {/* Mobile Toggle Button */}
            <div className="md:hidden absolute top-4 right-4 z-50">
              <button
                onClick={() => setMobileShowList(!mobileShowList)}
                className="bg-zinc-800 text-white px-4 py-2 rounded-full shadow-lg border border-white/10 flex items-center gap-2 text-sm font-bold"
              >
                {mobileShowList ? t('createSong') : t('viewList')}
                <List size={16} />
              </button>
            </div>
          </div>
        );
    }
  };

  const showStartupLoading = authLoading || !hasLoadedInitialSongs;
  if (showStartupLoading) {
    return (
      <StartupLoading
        progress={startupProgress}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-suno-DEFAULT text-zinc-900 dark:text-white font-sans antialiased selection:bg-[#9bb89d]/30">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentView={currentView}
          onNavigate={(v) => {
            setCurrentView(v);
            if (v === 'create') {
              setMobileShowList(false);
              window.history.pushState({}, '', '/');
            } else if (v === 'library') {
              window.history.pushState({}, '', '/library');
            }
            if (isMobile) setShowLeftSidebar(false);
          }}
          theme={theme}
          onToggleTheme={toggleTheme}
          user={user}
          onLogin={() => setShowUsernameModal(true)}
          onLogout={logout}
          onOpenSettings={() => setShowSettingsModal(true)}
          isOpen={showLeftSidebar}
          onToggle={() => setShowLeftSidebar(!showLeftSidebar)}
        />

        <main className="flex-1 flex overflow-hidden relative">
        
          {renderContent()}
        </main>
      </div>

      <Player
        currentSong={currentSong}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        currentTime={currentTime}
        duration={duration}
        isPlaybackLoading={isPlaybackBootstrapping && !hasPlaybackPrimed}
        onSeek={handleSeek}
        onNext={playNext}
        onPrevious={playPrevious}
        volume={volume}
        onVolumeChange={setVolume}
        playbackRate={playbackRate}
        onPlaybackRateChange={setPlaybackRate}
        audioRef={audioRef}
        isShuffle={isShuffle}
        onToggleShuffle={() => setIsShuffle(!isShuffle)}
        repeatMode={repeatMode}
        onToggleRepeat={() => setRepeatMode(prev => prev === 'none' ? 'all' : prev === 'all' ? 'one' : 'none')}
        isLiked={currentSong ? likedSongIds.has(currentSong.id) : false}
        onToggleLike={() => currentSong && toggleLike(currentSong.id)}
        onNavigateToSong={handleNavigateToSong}
        onNavigateToProfile={handleNavigateToProfile}
        onOpenVideo={() => currentSong && openVideoGenerator(currentSong)}
        onReusePrompt={() => currentSong && handleReuse(currentSong)}
        onAddToPlaylist={() => currentSong && openAddToPlaylistModal(currentSong)}
        onDelete={() => currentSong && handleDeleteSong(currentSong)}
        onPlayFirst={playFirst}
        preloadCoverUrls={adjacentCoverUrls}
      />

      <CreatePlaylistModal
        isOpen={isCreatePlaylistModalOpen}
        onClose={() => setIsCreatePlaylistModalOpen(false)}
        onCreate={createPlaylist}
      />
      <AddToPlaylistModal
        isOpen={isAddToPlaylistModalOpen}
        onClose={() => setIsAddToPlaylistModalOpen(false)}
        playlists={playlists}
        onSelect={addSongToPlaylist}
        onCreateNew={() => {
          setIsAddToPlaylistModalOpen(false);
          setIsCreatePlaylistModalOpen(true);
        }}
      />
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={closeToast}
      />
      {isVideoModalOpen && (
        <React.Suspense fallback={null}>
          <VideoGeneratorModal
            isOpen={isVideoModalOpen}
            onClose={() => setIsVideoModalOpen(false)}
            song={songForVideo}
          />
        </React.Suspense>
      )}
      <UsernameModal
        isOpen={showUsernameModal}
        onSubmit={handleUsernameSubmit}
      />
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigateToProfile={handleNavigateToProfile}
      />

      {/* Mobile Details Modal */}
      {showMobileDetails && selectedSong && (
        <div className="fixed inset-0 z-[60] flex justify-end xl:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in"
            onClick={() => setShowMobileDetails(false)}
          />
          <div className="relative w-full max-w-md h-full bg-zinc-50 dark:bg-suno-panel shadow-2xl animate-in slide-in-from-right duration-300 border-l border-white/10">
            <RightSidebar
              song={selectedSong}
              onClose={() => setShowMobileDetails(false)}
              onOpenVideo={() => selectedSong && openVideoGenerator(selectedSong)}
              onReuse={handleReuse}
              onSongUpdate={handleSongUpdate}
              onNavigateToProfile={handleNavigateToProfile}
              onNavigateToSong={handleNavigateToSong}
              isLiked={selectedSong ? likedSongIds.has(selectedSong.id) : false}
              onToggleLike={toggleLike}
              onDelete={handleDeleteSong}
              onPlay={playSong}
              isPlaying={isPlaying}
              currentSong={currentSong}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog !== null}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
