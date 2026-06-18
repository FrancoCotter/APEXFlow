import React, { useState, useEffect, useRef } from 'react';
import { Song, Playlist } from '../types';
import { usersApi, getAudioUrl, getCoverUrl, UserProfile as UserProfileType, songsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Play, Pause, Heart, Music as MusicIcon, ChevronRight, Edit3, X, Camera, Image as ImageIcon, Upload, Loader2, Info } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { getAvatarUrl } from '../utils/avatar';

interface UserProfileProps {
    username: string;
    initialUser?: UserProfileType | null;
    onBack: () => void;
    onPlaySong: (song: Song, list?: Song[]) => void;
    onNavigateToProfile: (username: string) => void;
    onNavigateToPlaylist?: (playlistId: string) => void;
    currentSong?: Song | null;
    isPlaying?: boolean;
    likedSongIds?: Set<string>;
    onToggleLike?: (songId: string) => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ username, initialUser = null, onBack, onPlaySong, onNavigateToProfile, onNavigateToPlaylist, currentSong, isPlaying, likedSongIds = new Set(), onToggleLike }) => {
    const { t, language } = useI18n();
    const { user: currentUser, token, refreshUser } = useAuth();
    const [profileUser, setProfileUser] = useState<UserProfileType | null>(initialUser);
    const [publicSongs, setPublicSongs] = useState<Song[]>([]);
    const [publicPlaylists, setPublicPlaylists] = useState<Playlist[]>([]);
    const [loading, setLoading] = useState(!initialUser);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [heroPalette, setHeroPalette] = useState({ base: '#0b0d0b', accent: '#1f261f' });
    const [infoPalette, setInfoPalette] = useState({ base: '#1f261f', accent: '#4d5a43' });
    const [profileAssetVersion, setProfileAssetVersion] = useState(0);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const songsSectionRef = useRef<HTMLElement | null>(null);
    const heroBlurLayerRef = useRef<HTMLDivElement | null>(null);
    const heroCoverLayerRef = useRef<HTMLDivElement | null>(null);
    const infoImageLayerRef = useRef<HTMLImageElement | null>(null);
    const infoBlurLayerRef = useRef<HTMLDivElement | null>(null);
    const infoSolidLayerRef = useRef<HTMLDivElement | null>(null);
    const profileScrollFrameRef = useRef<number | null>(null);
    const infoScrollFrameRef = useRef<number | null>(null);

    // Edit State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editBio, setEditBio] = useState('');
    const [editAvatarUrl, setEditAvatarUrl] = useState('');
    const [editBannerUrl, setEditBannerUrl] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [bannerPreview, setBannerPreview] = useState<string | null>(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [uploadingBanner, setUploadingBanner] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;
        if (initialUser?.username === username) {
            setProfileUser(initialUser);
        }
        loadUserProfile(() => cancelled);
        return () => {
            cancelled = true;
        };
    }, [username, initialUser]);

    useEffect(() => {
        if (!isEditModalOpen || !profileUser) return;
        setEditBio(profileUser.bio || '');
        setEditAvatarUrl(profileUser.avatar_url || '');
        setEditBannerUrl(profileUser.banner_url || '');
        setAvatarFile(null);
        setBannerFile(null);
        setAvatarPreview(null);
        setBannerPreview(null);
    }, [isEditModalOpen, profileUser?.avatar_url, profileUser?.banner_url, profileUser?.bio]);

    const applyHeroScrollState = (scrollTop: number) => {
        const progress = Math.max(0, Math.min(1, scrollTop / 360));
        const opacity = 1 - progress;
        if (heroBlurLayerRef.current) {
            heroBlurLayerRef.current.style.opacity = `${0.9 - progress * 0.15}`;
            heroBlurLayerRef.current.style.filter = `blur(${18 + progress * 20}px)`;
            heroBlurLayerRef.current.style.transform = `scale(${1.04 + progress * 0.025})`;
        }
        if (heroCoverLayerRef.current) {
            heroCoverLayerRef.current.style.opacity = `${Math.max(0, opacity * 0.58)}`;
            heroCoverLayerRef.current.style.filter = `blur(${progress * 8}px)`;
            heroCoverLayerRef.current.style.transform = `scale(${1.02 + progress * 0.012})`;
        }
    };

    const applyInfoScrollState = (scrollTop: number) => {
        const progress = Math.max(0, Math.min(1, scrollTop / 220));
        if (infoImageLayerRef.current) {
            infoImageLayerRef.current.style.opacity = `${0.96 - progress * 0.52}`;
            infoImageLayerRef.current.style.filter = `blur(${progress * 16}px)`;
            infoImageLayerRef.current.style.transform = `scale(${1 + progress * 0.028})`;
        }
        if (infoBlurLayerRef.current) {
            infoBlurLayerRef.current.style.opacity = `${1 - progress * 0.22}`;
            infoBlurLayerRef.current.style.backdropFilter = `blur(${26 + progress * 12}px)`;
            infoBlurLayerRef.current.style.WebkitBackdropFilter = `blur(${26 + progress * 12}px)`;
        }
        if (infoSolidLayerRef.current) {
            infoSolidLayerRef.current.style.opacity = `${0.08 + progress * 0.92}`;
        }
    };

    const handleProfileScroll = () => {
        const scrollTop = scrollContainerRef.current?.scrollTop || 0;
        if (profileScrollFrameRef.current !== null) {
            cancelAnimationFrame(profileScrollFrameRef.current);
        }
        profileScrollFrameRef.current = requestAnimationFrame(() => {
            applyHeroScrollState(scrollTop);
            profileScrollFrameRef.current = null;
        });
    };

    const handleInfoScroll = (event: React.UIEvent<HTMLDivElement>) => {
        const scrollTop = event.currentTarget.scrollTop;
        if (infoScrollFrameRef.current !== null) {
            cancelAnimationFrame(infoScrollFrameRef.current);
        }
        infoScrollFrameRef.current = requestAnimationFrame(() => {
            applyInfoScrollState(scrollTop);
            infoScrollFrameRef.current = null;
        });
    };

    const extractPaletteFromImage = (
        image: HTMLImageElement,
        fallback: { base: string; accent: string },
        scale: { base: number; accent: number; lift?: number }
    ) => {
        try {
            const canvas = document.createElement('canvas');
            const size = 32;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            ctx.drawImage(image, 0, 0, size, size);
            const pixels = ctx.getImageData(0, 0, size, size).data;
            let r = 0;
            let g = 0;
            let b = 0;
            let count = 0;
            for (let i = 0; i < pixels.length; i += 16) {
                const pr = pixels[i];
                const pg = pixels[i + 1];
                const pb = pixels[i + 2];
                const brightness = (pr + pg + pb) / 3;
                if (brightness < 24 || brightness > 236) continue;
                r += pr;
                g += pg;
                b += pb;
                count += 1;
            }
            if (!count) return;
            r = Math.round(r / count);
            g = Math.round(g / count);
            b = Math.round(b / count);
            const lift = scale.lift || 0;
            const base = `rgb(${Math.round(r * scale.base)}, ${Math.round(g * scale.base)}, ${Math.round(b * scale.base)})`;
            const accent = `rgb(${Math.min(255, Math.round(r * scale.accent + lift))}, ${Math.min(255, Math.round(g * scale.accent + lift))}, ${Math.min(255, Math.round(b * scale.accent + lift))})`;
            return { base, accent };
        } catch {
            return fallback;
        }
    };

    const handleHeroImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
        const palette = extractPaletteFromImage(
            event.currentTarget,
            { base: '#0b0d0b', accent: '#1f261f' },
            { base: 0.42, accent: 0.68, lift: 12 }
        );
        if (palette) {
            setHeroPalette(palette);
        }
    };

    const handleInfoImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
        const palette = extractPaletteFromImage(
            event.currentTarget,
            { base: '#1f261f', accent: '#4d5a43' },
            { base: 0.28, accent: 0.72, lift: 22 }
        );
        if (palette) {
            setInfoPalette(palette);
        }
    };

    useEffect(() => {
        return () => {
            if (profileScrollFrameRef.current !== null) {
                cancelAnimationFrame(profileScrollFrameRef.current);
            }
            if (infoScrollFrameRef.current !== null) {
                cancelAnimationFrame(infoScrollFrameRef.current);
            }
        };
    }, []);

    const loadUserProfile = async (isCancelled: () => boolean = () => false) => {
        setLoading(true);
        try {
            const [profileRes, songsRes, playlistsRes] = await Promise.all([
                usersApi.getProfile(username, token),
                usersApi.getPublicSongs(username),
                usersApi.getPublicPlaylists(username)
            ]);
            if (isCancelled()) return;

            setProfileUser(profileRes.user);
            setEditBio(profileRes.user.bio || '');
            setEditAvatarUrl(profileRes.user.avatar_url || '');
            setEditBannerUrl(profileRes.user.banner_url || '');

            const transformedSongs: Song[] = songsRes.songs.map(s => ({
                id: s.id,
                title: s.title,
                lyrics: s.lyrics,
                style: s.style,
                coverUrl: getCoverUrl(s.cover_url || s.coverUrl, s.id),
                duration: s.duration ? `${Math.floor(s.duration / 60)}:${String(Math.floor(s.duration % 60)).padStart(2, '0')}` : '0:00',
                createdAt: new Date(s.created_at),
                tags: s.tags || [],
                audioUrl: getAudioUrl(s.audio_url, s.id),
                isPublic: true,
                likeCount: s.like_count || 0,
                viewCount: s.view_count || 0,
                creator: s.creator,
                creator_avatar: s.creator_avatar || s.creatorAvatar,
                ditModel: s.dit_model || s.ditModel,
                generationParams: (() => {
                    try {
                        const params = s.generation_params ?? s.generationParams;
                        if (!params) return undefined;
                        return typeof params === 'string' ? JSON.parse(params) : params;
                    } catch {
                        return undefined;
                    }
                })(),
            }));
            setPublicSongs(transformedSongs);
            setPublicPlaylists(playlistsRes.playlists || []);
        } catch (error) {
            if (isCancelled()) return;
            console.error('Failed to load user profile:', error);
        } finally {
            if (!isCancelled()) setLoading(false);
        }
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAvatarFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setBannerFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setBannerPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSaveProfile = async () => {
        if (!token) return;
        setIsSaving(true);
        try {
            let nextAvatarUrl = editAvatarUrl;
            let nextBannerUrl = editBannerUrl;

            // Upload avatar if changed
            if (avatarFile) {
                setUploadingAvatar(true);
                const avatarRes = await usersApi.uploadAvatar(avatarFile, token);
                nextAvatarUrl = avatarRes.url;
                setEditAvatarUrl(nextAvatarUrl);
                setUploadingAvatar(false);
            }

            // Upload banner if changed
            if (bannerFile) {
                setUploadingBanner(true);
                const bannerRes = await usersApi.uploadBanner(bannerFile, token);
                nextBannerUrl = bannerRes.url;
                setEditBannerUrl(nextBannerUrl);
                setUploadingBanner(false);
            }

            // Update bio (and any URL-based avatar/banner if not using file upload)
            const updates: Record<string, string> = { bio: editBio };
            if (nextAvatarUrl !== profileUser.avatar_url) {
                updates.avatarUrl = nextAvatarUrl;
            }
            if (nextBannerUrl !== profileUser.banner_url) {
                updates.bannerUrl = nextBannerUrl;
            }

            let updatedUser = {
                ...profileUser,
                bio: editBio,
                avatar_url: nextAvatarUrl,
                banner_url: nextBannerUrl,
            };
            if (Object.keys(updates).length > 0) {
                const updateRes = await usersApi.updateProfile(updates, token);
                updatedUser = {
                    ...updatedUser,
                    ...updateRes.user,
                    bio: editBio,
                    avatar_url: nextAvatarUrl,
                    banner_url: nextBannerUrl,
                };
            }

            setProfileUser(updatedUser);
            const assetVersion = Date.now();
            setEditBio(updatedUser.bio || '');
            setEditAvatarUrl(nextAvatarUrl || '');
            setEditBannerUrl(nextBannerUrl || '');
            setAvatarFile(null);
            setBannerFile(null);
            setAvatarPreview(null);
            setBannerPreview(null);
            setProfileAssetVersion(assetVersion);
            await refreshUser();
            window.dispatchEvent(new CustomEvent('profile-updated', {
                detail: {
                    username: updatedUser.username,
                    avatarUrl: nextAvatarUrl,
                    bannerUrl: nextBannerUrl,
                    version: assetVersion,
                },
            }));
            setIsEditModalOpen(false);
        } catch (error) {
            console.error('Failed to update profile:', error);
            alert(t('profileUpdateFailed'));
        } finally {
            setIsSaving(false);
            setUploadingAvatar(false);
            setUploadingBanner(false);
        }
    };

    const totalLikes = publicSongs.reduce((sum, song) => sum + (song.likeCount || 0), 0);
    const totalPlays = publicSongs.reduce((sum, song) => sum + (song.viewCount || 0), 0);
    const isOwner = !!profileUser && currentUser?.id === profileUser.id;
    const isHeroCollectionsLoading = loading && publicSongs.length === 0;

    const primaryBadge = profileUser?.badges?.[0];
    const paidNameStyle = primaryBadge?.color === 'yellow'
        ? 'bg-gradient-to-r from-yellow-300 via-amber-300 to-orange-400 text-transparent bg-clip-text drop-shadow-[0_2px_12px_rgba(251,191,36,0.45)]'
        : primaryBadge?.color === 'purple'
        ? 'bg-gradient-to-r from-fuchsia-400 via-purple-500 to-indigo-400 text-transparent bg-clip-text drop-shadow-[0_2px_12px_rgba(168,85,247,0.45)]'
        : primaryBadge?.color === 'blue'
        ? 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-400 text-transparent bg-clip-text drop-shadow-[0_2px_12px_rgba(59,130,246,0.45)]'
        : primaryBadge?.color === 'teal'
        ? 'bg-gradient-to-r from-teal-300 via-emerald-400 to-cyan-400 text-transparent bg-clip-text drop-shadow-[0_2px_12px_rgba(45,212,191,0.45)]'
        : primaryBadge?.color === 'orange'
        ? 'bg-gradient-to-r from-orange-300 via-amber-400 to-yellow-300 text-transparent bg-clip-text drop-shadow-[0_2px_12px_rgba(251,146,60,0.4)]'
        : primaryBadge?.color === 'pink'
        ? 'bg-gradient-to-r from-pink-400 via-rose-500 to-fuchsia-500 text-transparent bg-clip-text drop-shadow-[0_2px_12px_rgba(244,114,182,0.45)]'
        : '';

    const scoreSong = (song: Song) => (song.viewCount || 0) + (song.likeCount || 0) * 3;
    const rankedSongs = [...publicSongs].sort((a, b) => scoreSong(b) - scoreSong(a));
    const latestSong = publicSongs[0];
    const topSongs = rankedSongs.slice(0, 6);
    const topSongIds = new Set(topSongs.map((song) => song.id));
    const displaySongs = rankedSongs.filter((song) => !topSongIds.has(song.id));
    const withAssetVersion = (url: string, version: number) => {
        if (!version || url.startsWith('data:') || url.startsWith('blob:')) return url;
        return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
    };
    const profileSeed = `${profileUser?.id || profileUser?.username || username}`;
    const generatedHeroCover = getCoverUrl(
        `https://picsum.photos/seed/${encodeURIComponent(`profile-cover-${profileSeed}`)}/2400/1200`
    );
    const heroCoverUrl = profileUser?.banner_url ? withAssetVersion(profileUser.banner_url, profileAssetVersion) : generatedHeroCover;
    const profileAvatarUrl = withAssetVersion(getAvatarUrl(profileUser?.avatar_url || '', profileUser?.username || username), profileAssetVersion);
    const editAvatarPreviewUrl = editAvatarUrl
        ? withAssetVersion(getAvatarUrl(editAvatarUrl, profileUser?.username || username), profileAssetVersion)
        : '';
    const editBannerPreviewUrl = editBannerUrl
        ? withAssetVersion(editBannerUrl, profileAssetVersion)
        : '';
    const formattedBio = ((profileUser?.bio) || '')
        .split(/\n{2,}/)
        .map(block => block.replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean);
    const getModelDisplayName = (modelId?: string): string => {
        if (!modelId) return '';
        const mapping: Record<string, string> = {
            'acestep-v15-base': '1.5B',
            'acestep-v1.5-base': '1.5B',
            'acestep-v15-sft': '1.5S',
            'acestep-v1.5-sft': '1.5S',
            'acestep-v15-turbo-shift1': '1.5TS1',
            'acestep-v1.5-turbo-shift1': '1.5TS1',
            'acestep-v15-turbo-shift3': '1.5TS3',
            'acestep-v1.5-turbo-shift3': '1.5TS3',
            'acestep-v15-turbo-s3': '1.5TS3',
            'acestep-v1.5-turbo-s3': '1.5TS3',
            'acestep-v15-turbo-continuous': '1.5TC',
            'acestep-v1.5-turbo-continuous': '1.5TC',
            'acestep-v15-turbo': '1.5T',
            'acestep-v1.5-turbo': '1.5T',
            'acestep-v15-xl-base': '1.5XL-B',
            'acestep-v1.5-xl-base': '1.5XL-B',
            'acestep-v15-xl-turbo': '1.5XL-T',
            'acestep-v1.5-xl-turbo': '1.5XL-T',
            'acestep-v15-xl-sft': '1.5XL-S',
            'acestep-v1.5-xl-sft': '1.5XL-S',
        };
        return mapping[modelId] || modelId.replace(/^acestep-/, '').replace(/^v/, '').toUpperCase();
    };
    const usedModelLabels = Array.from(new Set(publicSongs
        .map(song => getModelDisplayName(song.ditModel || song.generationParams?.ditModel || song.generationParams?.dit_model))
        .filter(Boolean)))
        .slice(0, 8);
    const heroStyle = heroCoverUrl
        ? { backgroundImage: `url(${heroCoverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : {};
    const seededValue = (seed: string, offset: number) => {
        let hash = 2166136261 + offset * 374761393;
        for (let i = 0; i < seed.length; i += 1) {
            hash ^= seed.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return ((hash >>> 0) % 1000) / 1000;
    };

    const renderEq = (song: Song, tall = false) => (
        <div className={`flex items-end justify-center gap-[2px] text-[#1ed760] ${tall ? 'h-8 w-8' : 'h-5 w-6'}`} aria-label="Now playing">
            {Array.from({ length: 5 }, (_, index) => {
                const seed = `${song.id}-${song.title}`;
                const height = (tall ? 1.05 : 0.72) + seededValue(seed, index) * (tall ? 0.72 : 0.55);
                const duration = 0.58 + seededValue(seed, index + 11) * 0.34;
                const delay = -seededValue(seed, index + 23) * duration;
                return (
                    <span
                        key={index}
                        className="w-[2px] bg-current music-bar-anim"
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
    const renderCoverControl = (song: Song, list: Song[], imageClassName: string, iconSize = 30) => {
        const isCurrentSong = currentSong?.id === song.id;
        const isCurrentlyPlaying = isCurrentSong && isPlaying;

        const buttonSizeClass = iconSize > 28 ? 'h-14 w-14' : 'h-10 w-10';

        return (
            <div className="group/cover relative h-full w-full overflow-hidden rounded-lg bg-white/10">
                <img src={song.coverUrl} alt={song.title} className={imageClassName} />
                <div className={`absolute inset-0 bg-black/40 transition-opacity ${isCurrentSong ? 'opacity-100' : 'opacity-0 group-hover/cover:opacity-100'}`} />
                {isCurrentlyPlaying && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-100 transition-opacity group-hover/cover:opacity-0">
                        {renderEq(song, iconSize > 24)}
                    </div>
                )}
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onPlaySong(song, list);
                    }}
                    className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-black shadow-xl opacity-0 transition hover:scale-105 group-hover/cover:opacity-100 ${buttonSizeClass}`}
                    aria-label={isCurrentlyPlaying ? 'Pause song' : 'Play song'}
                >
                    {isCurrentlyPlaying ? (
                        <Pause size={iconSize} className="fill-black" />
                    ) : (
                        <Play size={iconSize} className="ml-0.5 fill-black" />
                    )}
                </button>
            </div>
        );
    };

    const latestReleaseSkeleton = (
        <div className="grid w-full grid-cols-[180px_1fr] gap-5 rounded-xl p-2">
            <div className="aspect-square animate-pulse rounded-xl bg-white/10" />
            <div className="flex min-w-0 flex-col justify-center text-left">
                <div className="mb-3 h-4 w-28 animate-pulse rounded bg-white/10" />
                <div className="h-12 w-[82%] animate-pulse rounded bg-white/12" />
                <div className="mt-4 h-5 w-full animate-pulse rounded bg-white/10" />
                <div className="mt-2 h-5 w-[88%] animate-pulse rounded bg-white/10" />
                <div className="mt-2 h-5 w-[72%] animate-pulse rounded bg-white/10" />
            </div>
        </div>
    );

    const topSongsSkeleton = (
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            {Array.from({ length: 6 }, (_, index) => (
                <div
                    key={`top-skeleton-${index}`}
                    className="grid w-full grid-cols-[72px_1fr] items-center gap-4 rounded-xl p-2 text-left"
                >
                    <div className="h-[72px] w-[72px] animate-pulse rounded-lg bg-white/10" />
                    <div className="min-w-0">
                        <div className="h-5 w-[82%] animate-pulse rounded bg-white/12" />
                        <div className="mt-2 h-4 w-full animate-pulse rounded bg-white/10" />
                        <div className="mt-2 h-4 w-[72%] animate-pulse rounded bg-white/10" />
                    </div>
                </div>
            ))}
        </div>
    );

    useEffect(() => {
        applyHeroScrollState(scrollContainerRef.current?.scrollTop || 0);
    }, [heroCoverUrl]);

    useEffect(() => {
        if (!isInfoModalOpen) return;
        applyInfoScrollState(0);
        return () => {
            if (infoScrollFrameRef.current !== null) {
                cancelAnimationFrame(infoScrollFrameRef.current);
                infoScrollFrameRef.current = null;
            }
        };
    }, [isInfoModalOpen, profileAvatarUrl]);

    if (loading && !profileUser) {
        return (
            <div className="flex items-center justify-center h-full bg-zinc-50 dark:bg-black">
                <div className="text-zinc-500 dark:text-zinc-400 gap-2 flex items-center">
                    <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></div>
                    {t('loadingProfile')}
                </div>
            </div>
        );
    }

    if (!profileUser) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 bg-zinc-50 dark:bg-black">
                <div className="text-zinc-500 dark:text-zinc-400">{t('userNotFound')}</div>
                <button onClick={onBack} className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-lg text-zinc-900 dark:text-white">
                    {t('goBack')}
                </button>
            </div>
        );
    }

    return (
        <div
            ref={scrollContainerRef}
            onScroll={handleProfileScroll}
            className={`w-full h-full flex flex-col overflow-y-auto pb-24 lg:pb-32 relative transition-[opacity,background-color] duration-300 ${loading ? 'opacity-100' : 'opacity-100'}`}
            style={{ backgroundColor: heroPalette.base }}
        >
            <img
                src={heroCoverUrl}
                alt=""
                aria-hidden="true"
                className="hidden"
                referrerPolicy="no-referrer"
                onLoad={handleHeroImageLoad}
            />
            {/* Artist Hero */}
            <div
                className="relative min-h-[960px] overflow-hidden group/banner transition-[background-color] duration-300"
                style={{ backgroundColor: heroPalette.base }}
            >
                <div
                    className="absolute inset-0 transition-[background-color] duration-300"
                    style={{ backgroundColor: heroPalette.base }}
                />
                <div
                    ref={heroBlurLayerRef}
                    className="absolute inset-0 bg-cover bg-center transition-[opacity,filter,transform] duration-200 will-change-[opacity,filter,transform]"
                    style={{ ...heroStyle, opacity: 0.9, filter: 'blur(18px)', transform: 'scale(1.04)' }}
                />
                <div
                    ref={heroCoverLayerRef}
                    className="absolute inset-0 bg-cover bg-center transition-[opacity,filter,transform] duration-200 will-change-[opacity,filter,transform]"
                    style={{ ...heroStyle, opacity: 0.58, filter: 'blur(0px)', transform: 'scale(1.02)' }}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-black/5" />
                <div
                    className="absolute inset-0"
                    style={{
                        background: `linear-gradient(to top, ${heroPalette.base} 0%, rgba(0,0,0,0.28) 38%, rgba(0,0,0,0) 100%)`,
                    }}
                />

                <button
                    onClick={onBack}
                    className="absolute left-5 top-5 z-20 inline-flex items-center gap-2 rounded-full bg-black/35 px-4 py-2 text-sm font-semibold text-white/85 backdrop-blur-md transition hover:bg-black/55 hover:text-white"
                >
                    <ArrowLeft size={18} />
                    <span>{t('back')}</span>
                </button>

                <div className="relative z-10 mx-auto flex min-h-[960px] max-w-7xl flex-col justify-end px-6 pb-16 pt-24 md:px-10">
                    <div className="flex flex-col items-center text-center">
                        <h1 className={`max-w-5xl text-5xl font-black uppercase tracking-normal text-white drop-shadow-2xl md:text-7xl lg:text-8xl ${paidNameStyle}`}>
                            {profileUser.username}
                        </h1>

                        <div className="mt-8 grid grid-cols-[72px_96px_72px] items-center justify-center gap-4">
                            <div className="flex justify-end">
                                <button
                                    onClick={() => setIsInfoModalOpen(true)}
                                    className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white/85 backdrop-blur-md transition hover:bg-white/25 hover:text-white"
                                    title="Profile info"
                                >
                                    <Info size={25} />
                                </button>
                            </div>
                            <button
                                onClick={() => latestSong && onPlaySong(latestSong, publicSongs)}
                                disabled={!latestSong}
                                className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-black shadow-2xl transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {latestSong && currentSong?.id === latestSong.id && isPlaying ? (
                                    <Pause size={38} className="fill-black" />
                                ) : (
                                    <Play size={38} className="ml-1 fill-black" />
                                )}
                            </button>
                            <div />
                        </div>
                    </div>

                    <div className="mt-12 grid gap-10 md:grid-cols-2">
                        <div>
                            <h2 className="mb-4 text-lg font-bold text-white">Latest Release</h2>
                            <div className="min-h-[212px]">
                            {isHeroCollectionsLoading ? latestReleaseSkeleton : latestSong ? (
                                <div className="grid w-full grid-cols-[180px_1fr] gap-5 rounded-xl p-2 transition hover:bg-white/10">
                                    <div className="aspect-square">
                                        {renderCoverControl(latestSong, publicSongs, 'h-full w-full object-cover transition duration-500 group-hover/cover:scale-105', 34)}
                                    </div>
                                    <div className="flex min-w-0 flex-col justify-center text-left">
                                        <span className="mb-2 text-sm text-white/55">
                                            {latestSong.createdAt.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        </span>
                                        <span className="line-clamp-2 text-3xl font-bold leading-tight text-white">{latestSong.title}</span>
                                        <span className="mt-3 line-clamp-3 text-base leading-relaxed text-white/60">{latestSong.style}</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-white/50">{t('noPublicSongsYet')}</p>
                            )}
                            </div>
                        </div>

                        <div>
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-lg font-bold text-white">Top Songs</h2>
                                <button
                                    onClick={() => songsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                    className="inline-flex items-center gap-1 text-sm font-semibold text-white/65 transition hover:text-white"
                                    aria-label="View all songs"
                                >
                                    <ChevronRight size={22} />
                                </button>
                            </div>
                            <div className="min-h-[267px]">
                            {isHeroCollectionsLoading ? topSongsSkeleton : (
                            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                                {topSongs.length > 0 ? topSongs.map((song) => (
                                    <div
                                        key={song.id}
                                        className="grid w-full grid-cols-[72px_1fr] items-center gap-4 rounded-xl p-2 text-left transition hover:bg-white/10"
                                    >
                                        {renderCoverControl(song, publicSongs, 'h-[72px] w-[72px] object-cover', 24)}
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-white">{song.title}</p>
                                            <p className="mt-1 line-clamp-2 text-sm leading-snug text-white/55">{song.style}</p>
                                        </div>
                                    </div>
                                )) : (
                                    <p className="text-white/50">{t('noPublicSongsYet')}</p>
                                )}
                            </div>
                            )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* Content */}
            <div className="relative z-10 -mt-16 md:-mt-20">
                <div className="max-w-7xl mx-auto w-full px-4 pt-12 md:px-8 md:pt-16 pb-6 md:pb-8 space-y-8 md:space-y-12">
                {/* Songs Section */}
                <section ref={songsSectionRef}>
                    <div className="flex items-center justify-between mb-4 md:mb-6">
                        <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">{t('songs')}</h2>
                    </div>

                    {displaySongs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                            <MusicIcon size={64} className="mb-4 opacity-50" />
                            <p>{publicSongs.length > 0 ? 'All ranked songs are shown above.' : t('noPublicSongsYet')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
                            {displaySongs.map((song) => {
                                const isCurrentSong = currentSong?.id === song.id;
                                const isLiked = likedSongIds.has(song.id);
                                return (
                                    <div
                                        key={song.id}
                                        className={`group flex items-center gap-3 md:gap-4 p-2 md:p-3 rounded-lg transition-colors ${isCurrentSong ? 'bg-[#9bb89d]/15 dark:bg-[#9bb89d]/10' : 'hover:bg-white/10'}`}
                                    >
                                        <div className="w-14 h-14 md:w-16 md:h-16 flex-shrink-0">
                                            {renderCoverControl(song, displaySongs, 'w-full h-full object-cover', 22)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className={`font-semibold truncate text-sm md:text-base ${isCurrentSong ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-900 dark:text-white'}`}>{song.title}</h3>
                                            <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 truncate">{song.style}</p>
                                            <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                                                <span className="flex items-center gap-1"><Heart size={10} className={isLiked ? 'fill-[#8fb68f] text-[#6f8f72] dark:text-[#a8c9a4]' : ''} /> {song.likeCount || 0}</span>
                                                <span className="flex items-center gap-1"><Play size={10} /> {song.viewCount || 0}</span>
                                                <span>{song.duration}</span>
                                            </div>
                                        </div>
                                        {onToggleLike && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onToggleLike(song.id); }}
                                                className={`p-2 rounded-full transition-colors flex-shrink-0 ${isLiked ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-400 hover:text-[#6f8f72] dark:hover:text-[#a8c9a4]'}`}
                                            >
                                                <Heart size={18} className={isLiked ? 'fill-current' : ''} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Playlists Section */}
                {publicPlaylists.length > 0 && (
                    <section>
                        <div className="flex items-center justify-between mb-4 md:mb-6">
                            <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">{t('playlists')}</h2>
                            <button className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-sm">
                                {t('seeMore')} <ChevronRight size={18} />
                            </button>
                        </div>
                        <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent -mx-4 px-4 md:mx-0 md:px-0">
                            {publicPlaylists.map((playlist: any) => (
                                <div
                                    key={playlist.id}
                                    onClick={() => onNavigateToPlaylist?.(playlist.id)}
                                    className="group relative flex-shrink-0 w-36 md:w-48 cursor-pointer"
                                >
                                    <div className="aspect-square rounded-lg bg-gradient-to-br from-indigo-600 to-purple-700 mb-2 md:mb-3 flex items-center justify-center relative overflow-hidden">
                                        <MusicIcon size={48} className="text-white/30 md:w-16 md:h-16" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white flex items-center justify-center">
                                                <Play size={20} className="text-black fill-black ml-1 md:w-6 md:h-6" />
                                            </div>
                                        </div>
                                    </div>
                                    <h3 className="font-semibold text-zinc-900 dark:text-white truncate mb-1 text-sm md:text-base">{playlist.name}</h3>
                                    <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400">{playlist.song_count} {t('songs')}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
                </div>
            </div>

            {/* Profile Info Modal */}
            {isInfoModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
                    <div
                        className="relative h-[84vh] max-h-[860px] w-full max-w-lg overflow-hidden rounded-2xl border border-white/15 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                        style={{
                            background: infoPalette.base,
                        }}
                    >
                        <img
                            ref={infoImageLayerRef}
                            src={profileAvatarUrl}
                            alt={profileUser.username}
                            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_22%] transition-[opacity,filter,transform] duration-200 will-change-[opacity,filter,transform]"
                            style={{ opacity: 0.96, filter: 'blur(0px)', transform: 'scale(1)' }}
                            referrerPolicy="no-referrer"
                            onLoad={handleInfoImageLoad}
                        />
                        <div
                            ref={infoBlurLayerRef}
                            className="pointer-events-none absolute inset-x-0 top-[58%] bottom-0 transition-opacity duration-200"
                            style={{
                                backdropFilter: 'blur(26px)',
                                WebkitBackdropFilter: 'blur(26px)',
                                WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 54%, black 100%)',
                                maskImage: 'linear-gradient(to bottom, transparent, black 54%, black 100%)',
                                opacity: 1,
                            }}
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/8 via-black/18 to-black/96" />
                        <div
                            ref={infoSolidLayerRef}
                            className="pointer-events-none absolute inset-0 transition-opacity duration-200"
                            style={{ background: infoPalette.base, opacity: 0.08 }}
                        />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black via-black/78 to-transparent" />

                        <button
                            onClick={() => setIsInfoModalOpen(false)}
                            className="absolute left-5 top-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-black/25 text-white/90 backdrop-blur-md transition hover:bg-black/45 hover:text-white"
                            aria-label="Close profile info"
                        >
                            <X size={28} />
                        </button>

                        {isOwner && (
                            <button
                                onClick={() => {
                                    setIsEditModalOpen(true);
                                }}
                                className="absolute right-5 top-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-black/25 text-white/90 backdrop-blur-md transition hover:bg-black/45 hover:text-white"
                                aria-label={t('editProfile')}
                            >
                                <Edit3 size={24} />
                            </button>
                        )}

                        <div
                            onScroll={handleInfoScroll}
                            className="relative z-10 h-full overflow-y-auto text-white custom-scrollbar"
                        >
                            <div className="flex min-h-full flex-col justify-end px-7 pb-12 pt-[42vh] sm:px-9">
                                <h2 className="text-5xl font-black tracking-normal drop-shadow-lg sm:text-6xl">{profileUser.username}</h2>

                                <div className="mt-7">
                                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Joined</p>
                                    <p className="mt-2 text-xl font-semibold text-white/95">
                                        {new Date(profileUser.created_at).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', year: 'numeric' })}
                                    </p>
                                </div>

                                <div className="mt-7">
                                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Creative Summary</p>
                                    <div className="mt-3 flex flex-wrap items-center gap-x-7 gap-y-3 text-white/95">
                                        <span className="inline-flex items-center gap-2 text-lg font-semibold">
                                            <MusicIcon size={20} className="text-white/75" />
                                            <span>{publicSongs.length}</span>
                                            <span className="text-sm font-bold uppercase tracking-wide text-white/55">{t('songs')}</span>
                                        </span>
                                        <span className="inline-flex items-center gap-2 text-lg font-semibold">
                                            <Heart size={20} className="text-white/75" />
                                            <span>{totalLikes}</span>
                                            <span className="text-sm font-bold uppercase tracking-wide text-white/55">{t('likes')}</span>
                                        </span>
                                        <span className="inline-flex items-center gap-2 text-lg font-semibold">
                                            <Play size={20} className="text-white/75" />
                                            <span>{totalPlays}</span>
                                            <span className="text-sm font-bold uppercase tracking-wide text-white/55">{t('plays')}</span>
                                        </span>
                                    </div>
                                </div>

                                {usedModelLabels.length > 0 && (
                                    <div className="mt-7">
                                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Models Used</p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {usedModelLabels.map(label => (
                                                <span
                                                    key={label}
                                                    className="rounded-full border border-white/18 bg-white/10 px-3 py-1 text-sm font-bold text-white/88 backdrop-blur-md"
                                                >
                                                    {label}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {formattedBio.length > 0 && (
                                    <div className="mt-8">
                                        <h3 className="mb-3 text-2xl font-black tracking-normal text-white">About</h3>
                                        <div className="space-y-4 text-lg font-medium leading-relaxed text-white/86">
                                            {formattedBio.map((paragraph, index) => (
                                                <p key={index}>{paragraph}</p>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Profile Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="px-4 md:px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-white dark:bg-zinc-900 z-10">
                            <h2 className="text-lg md:text-xl font-bold text-zinc-900 dark:text-white">{t('editProfile')}</h2>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4 md:p-6 space-y-6">
                            {/* Avatar Upload */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('avatarImage')}</label>
                                <div className="flex gap-4 items-center">
                                    <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-300 dark:border-zinc-700 border-dashed overflow-hidden flex-shrink-0 relative">
                                        {(avatarPreview || editAvatarPreviewUrl) ? (
                                            <img
                                                src={avatarPreview || editAvatarPreviewUrl}
                                                className="w-full h-full object-cover"
                                                onError={(e) => (e.currentTarget.style.display = 'none')}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-zinc-400 dark:text-zinc-500">
                                                <Camera size={24} />
                                            </div>
                                        )}
                                        {uploadingAvatar && (
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                <Loader2 size={20} className="animate-spin text-white" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <input
                                            ref={avatarInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp,image/gif"
                                            onChange={handleAvatarChange}
                                            className="hidden"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => avatarInputRef.current?.click()}
                                            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
                                        >
                                            <Upload size={16} />
                                            {t('uploadAvatar')}
                                        </button>
                                        <p className="text-xs text-zinc-500">{t('avatarFormats')}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Banner Upload */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('bannerImage')}</label>
                                <div
                                    onClick={() => bannerInputRef.current?.click()}
                                    className="relative w-full h-32 rounded-lg bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-300 dark:border-zinc-700 border-dashed overflow-hidden cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                                >
                                    {(bannerPreview || editBannerPreviewUrl) ? (
                                        <img
                                            src={bannerPreview || editBannerPreviewUrl}
                                            className="w-full h-full object-cover"
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 gap-2">
                                            <ImageIcon size={32} />
                                            <span className="text-sm">{t('clickToUploadBanner')}</span>
                                        </div>
                                    )}
                                    {uploadingBanner && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <Loader2 size={24} className="animate-spin text-white" />
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={bannerInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    onChange={handleBannerChange}
                                    className="hidden"
                                />
                                <p className="text-xs text-zinc-500">{t('bannerFormats')}</p>
                            </div>

                            {/* Bio Input */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('bio')}</label>
                                <textarea
                                    value={editBio}
                                    onChange={(e) => setEditBio(e.target.value)}
                                    placeholder={t('bioPlaceholder')}
                                    rows={4}
                                    className="w-full bg-zinc-50 dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-indigo-500 transition-colors resize-none"
                                />
                            </div>
                        </div>

                        <div className="px-4 md:px-6 py-4 bg-zinc-50 dark:bg-black/20 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 sticky bottom-0">
                            <button
                                onClick={() => {
                                    setIsEditModalOpen(false);
                                    setAvatarFile(null);
                                    setBannerFile(null);
                                    setAvatarPreview(null);
                                    setBannerPreview(null);
                                }}
                                className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                                disabled={isSaving}
                            >
                                {t('cancel')}
                            </button>
                            <button
                                onClick={handleSaveProfile}
                                disabled={isSaving || uploadingAvatar || uploadingBanner}
                                className="px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-full text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSaving && <Loader2 size={16} className="animate-spin" />}
                                {uploadingAvatar ? t('uploadingAvatar') : uploadingBanner ? t('uploadingBanner') : isSaving ? t('saving') : t('saveChanges')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
