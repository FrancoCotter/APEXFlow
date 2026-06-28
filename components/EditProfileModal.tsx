import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usersApi, UserProfile, SubjectDetection } from '../services/api';
import { useI18n } from '../context/I18nContext';
import { getAvatarUrl } from '../utils/avatar';
import { deriveFocusSafeBox, getSafeCoverObjectPosition, normalizedBoxFromValues } from '../utils/coverPosition';

interface EditProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose, onSaved }) => {
    const { t } = useI18n();
    const { user, token, refreshUser, updateUsername } = useAuth();
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<UserProfile | null>(null);

    const [editUsername, setEditUsername] = useState('');
    const [editBio, setEditBio] = useState('');
    const [editAvatarUrl, setEditAvatarUrl] = useState('');
    const [editBannerUrl, setEditBannerUrl] = useState('');
    const [usernameError, setUsernameError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [bannerPreview, setBannerPreview] = useState<string | null>(null);
    const [avatarSubject, setAvatarSubject] = useState<SubjectDetection | null>(null);
    const [bannerSubject, setBannerSubject] = useState<SubjectDetection | null>(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [uploadingBanner, setUploadingBanner] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);
    const bannerPreviewFrameRef = useRef<HTMLDivElement>(null);
    const [assetVersion, setAssetVersion] = useState(0);
    const [bannerPreviewLayout, setBannerPreviewLayout] = useState({
        imageWidth: 0,
        imageHeight: 0,
        containerWidth: 0,
        containerHeight: 0,
    });

    useEffect(() => {
        if (isOpen && user && token) {
            loadProfile();
        }
    }, [isOpen, user, token]);

    useEffect(() => {
        const frame = bannerPreviewFrameRef.current;
        if (!frame || typeof ResizeObserver === 'undefined') return;

        const syncLayout = () => {
            setBannerPreviewLayout(prev => {
                const nextWidth = frame.clientWidth;
                const nextHeight = frame.clientHeight;
                if (prev.containerWidth === nextWidth && prev.containerHeight === nextHeight) return prev;
                return {
                    ...prev,
                    containerWidth: nextWidth,
                    containerHeight: nextHeight,
                };
            });
        };

        syncLayout();
        const observer = new ResizeObserver(syncLayout);
        observer.observe(frame);
        return () => observer.disconnect();
    }, []);

    const loadProfile = async () => {
        if (!user || !token) return;
        setLoading(true);
        try {
            const res = await usersApi.getProfile(user.username, token);
            setProfile(res.user);
            setEditUsername(res.user.username || '');
            setEditBio(res.user.bio || '');
            setEditAvatarUrl(res.user.avatar_url || '');
            setEditBannerUrl(res.user.banner_url || '');
            setAvatarFile(null);
            setBannerFile(null);
            setAvatarPreview(null);
            setBannerPreview(null);
            setAvatarSubject(null);
            setBannerSubject(null);
            setUsernameError('');
        } catch (error) {
            console.error('Failed to load profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAvatarFile(file);
            setAvatarSubject(null);
            const reader = new FileReader();
            reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
            if (token) {
                try {
                    const { subject } = await usersApi.detectImageFocus(file, token);
                    setAvatarSubject(subject);
                    console.info('[face-detection] avatar preview', subject);
                } catch (error) {
                    console.warn('[face-detection] avatar preview failed', error);
                }
            }
        }
    };

    const handleBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setBannerFile(file);
            setBannerSubject(null);
            const reader = new FileReader();
            reader.onload = (ev) => setBannerPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
            if (token) {
                try {
                    const { subject } = await usersApi.detectImageFocus(file, token);
                    setBannerSubject(subject);
                    console.info('[face-detection] banner preview', subject);
                } catch (error) {
                    console.warn('[face-detection] banner preview failed', error);
                }
            }
        }
    };

    const handleSaveProfile = async () => {
        if (!token || !profile) return;
        setIsSaving(true);
        setUsernameError('');

        try {
            let nextUsername = profile.username;

            // Update username if changed
            if (editUsername && editUsername !== profile.username) {
                const sanitized = editUsername.trim().replace(/[^a-zA-Z0-9_-]/g, '');
                if (sanitized.length < 2) {
                    setUsernameError(t('usernameMinLengthError'));
                    setIsSaving(false);
                    return;
                }
                try {
                    await updateUsername(sanitized);
                } catch (err: unknown) {
                    const error = err as Error & { message?: string };
                    if (error.message?.includes('taken')) {
                        setUsernameError(t('usernameTakenError'));
                    } else {
                        setUsernameError(t('usernameUpdateFailedError'));
                    }
                    setIsSaving(false);
                    return;
                }
                nextUsername = sanitized;
            }

            let nextAvatarUrl = editAvatarUrl;
            let nextBannerUrl = editBannerUrl;
            let nextAvatarFocusX = profile.avatar_focus_x ?? 0.5;
            let nextAvatarFocusY = profile.avatar_focus_y ?? 0.5;
            let nextBannerFocusX = profile.banner_focus_x ?? 0.5;
            let nextBannerFocusY = profile.banner_focus_y ?? 0.5;
            let nextBannerBoxX = profile.banner_box_x;
            let nextBannerBoxY = profile.banner_box_y;
            let nextBannerBoxWidth = profile.banner_box_width;
            let nextBannerBoxHeight = profile.banner_box_height;

            if (avatarFile) {
                setUploadingAvatar(true);
                const avatarRes = await usersApi.uploadAvatar(avatarFile, token, avatarSubject);
                nextAvatarUrl = avatarRes.url;
                nextAvatarFocusX = avatarRes.subject.focus.x;
                nextAvatarFocusY = avatarRes.subject.focus.y;
                console.info('[face-detection] avatar', avatarRes.subject);
                setEditAvatarUrl(nextAvatarUrl);
                setUploadingAvatar(false);
            }

            if (bannerFile) {
                setUploadingBanner(true);
                const bannerRes = await usersApi.uploadBanner(
                    bannerFile,
                    token,
                    bannerSubject,
                    bannerPreviewLayout.imageWidth > 0 && bannerPreviewLayout.imageHeight > 0
                        ? { width: bannerPreviewLayout.imageWidth, height: bannerPreviewLayout.imageHeight }
                        : null,
                );
                nextBannerUrl = bannerRes.url;
                nextBannerFocusX = bannerRes.subject.focus.x;
                nextBannerFocusY = bannerRes.subject.focus.y;
                nextBannerBoxX = bannerRes.subject.box.x;
                nextBannerBoxY = bannerRes.subject.box.y;
                nextBannerBoxWidth = bannerRes.subject.box.width;
                nextBannerBoxHeight = bannerRes.subject.box.height;
                console.info('[face-detection] banner', bannerRes.subject);
                setEditBannerUrl(nextBannerUrl);
                setUploadingBanner(false);
            }

            const updates: Record<string, string> = { bio: editBio };
            if (!avatarFile && nextAvatarUrl !== profile.avatar_url) {
                updates.avatarUrl = nextAvatarUrl;
            }
            if (!bannerFile && nextBannerUrl !== profile.banner_url) {
                updates.bannerUrl = nextBannerUrl;
            }

            let updatedProfile: UserProfile = {
                ...profile,
                username: nextUsername,
                bio: editBio,
                avatar_url: nextAvatarUrl,
                banner_url: nextBannerUrl,
                avatar_focus_x: nextAvatarFocusX,
                avatar_focus_y: nextAvatarFocusY,
                banner_focus_x: nextBannerFocusX,
                banner_focus_y: nextBannerFocusY,
                banner_box_x: nextBannerBoxX,
                banner_box_y: nextBannerBoxY,
                banner_box_width: nextBannerBoxWidth,
                banner_box_height: nextBannerBoxHeight,
            };

            if (Object.keys(updates).length > 0) {
                const updateRes = await usersApi.updateProfile(updates, token);
                updatedProfile = {
                    ...updatedProfile,
                    ...updateRes.user,
                    username: updateRes.user.username || nextUsername,
                    bio: editBio,
                    avatar_url: nextAvatarUrl,
                    banner_url: nextBannerUrl,
                };
            }

            setProfile(updatedProfile);
            setEditUsername(updatedProfile.username || '');
            setEditBio(updatedProfile.bio || '');
            setEditAvatarUrl(updatedProfile.avatar_url || '');
            setEditBannerUrl(updatedProfile.banner_url || '');
            setAvatarFile(null);
            setBannerFile(null);
            setAvatarPreview(null);
            setBannerPreview(null);
            const nextVersion = Date.now();
            setAssetVersion(nextVersion);
            await refreshUser();
            window.dispatchEvent(new CustomEvent('profile-updated', {
                detail: {
                    username: updatedProfile.username,
                    avatarUrl: updatedProfile.avatar_url,
                    bannerUrl: updatedProfile.banner_url,
                    version: nextVersion,
                    profile: updatedProfile,
                },
            }));
            handleClose();
            onSaved?.();
        } catch (error) {
            console.error('Failed to update profile:', error);
            alert('Failed to update profile');
        } finally {
            setIsSaving(false);
            setUploadingAvatar(false);
            setUploadingBanner(false);
        }
    };

    const handleClose = () => {
        setAvatarFile(null);
        setBannerFile(null);
        setAvatarPreview(null);
        setBannerPreview(null);
        setUsernameError('');
        onClose();
    };

    const withVersion = (url: string | undefined, version: number) => {
        if (!url || !version || url.startsWith('data:') || url.startsWith('blob:')) return url || '';
        return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
    };

    const avatarDisplayUrl = avatarPreview
        || withVersion(getAvatarUrl(editAvatarUrl, editUsername || profile?.username), assetVersion);
    const bannerDisplayUrl = bannerPreview || withVersion(editBannerUrl, assetVersion);
    const avatarFocus = `${(profile?.avatar_focus_x ?? 0.5) * 100}% ${(profile?.avatar_focus_y ?? 0.5) * 100}%`;
    const avatarPreviewFocus = avatarSubject ? `${avatarSubject.focus.x * 100}% ${avatarSubject.focus.y * 100}%` : 'center';
    const previewBannerX = bannerSubject?.focus.x ?? profile?.banner_focus_x ?? 0.5;
    const previewBannerY = bannerSubject?.focus.y ?? profile?.banner_focus_y ?? 0.5;
    const persistedBannerBox = normalizedBoxFromValues(
        profile?.banner_box_x,
        profile?.banner_box_y,
        profile?.banner_box_width,
        profile?.banner_box_height
    );
    const previewSafeBox = deriveFocusSafeBox(
        { x: previewBannerX, y: previewBannerY },
        bannerSubject?.box ?? persistedBannerBox,
        { widthScale: 0.32, heightScale: 0.26, minSize: 0.14 }
    );
    const bannerEditorFocus = getSafeCoverObjectPosition({
        ...bannerPreviewLayout,
        focus: { x: previewBannerX, y: previewBannerY },
        box: previewSafeBox ?? bannerSubject?.box ?? persistedBannerBox,
        biasY: previewSafeBox ? -0.18 : -0.1,
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t('editProfile')}</h2>
                    <button onClick={handleClose} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {loading ? (
                    <div className="p-12 flex items-center justify-center">
                        <Loader2 size={32} className="animate-spin text-zinc-400 dark:text-zinc-400" />
                    </div>
                ) : (
                    <>
                        <div className="p-6 space-y-6">
                            {/* Username Input */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('usernameLabel')}</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-zinc-500 dark:text-zinc-500">@</span>
                                    <input
                                        type="text"
                                        value={editUsername}
                                        onChange={(e) => {
                                            setEditUsername(e.target.value);
                                            setUsernameError('');
                                        }}
                                        placeholder={t('usernamePlaceholder')}
                                        maxLength={50}
                                        className="flex-1 bg-zinc-50 dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>
                                {usernameError && (
                                    <p className="text-sm text-red-500">{usernameError}</p>
                                )}
                                <p className="text-xs text-zinc-500 dark:text-zinc-500">{t('usernameRequirements')}</p>
                            </div>

                            {/* Avatar Upload */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('avatarImage')}</label>
                                <div className="flex gap-4 items-center">
                                    <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-300 dark:border-zinc-700 border-dashed overflow-hidden flex-shrink-0 relative">
                                        {avatarDisplayUrl ? (
                                            <img
                                                src={avatarDisplayUrl}
                                                className="w-full h-full object-cover"
                                                style={{ objectPosition: avatarPreview ? avatarPreviewFocus : avatarFocus }}
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
                                        <p className="text-xs text-zinc-500 dark:text-zinc-500">{t('avatarFormats')}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Banner Upload */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('bannerImage')}</label>
                                <div
                                    ref={bannerPreviewFrameRef}
                                    onClick={() => bannerInputRef.current?.click()}
                                    className="relative w-full h-32 rounded-lg bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-300 dark:border-zinc-700 border-dashed overflow-hidden cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                                >
                                    {bannerDisplayUrl ? (
                                        <img
                                            src={bannerDisplayUrl}
                                            className="w-full h-full object-cover"
                                            style={{ objectPosition: bannerEditorFocus }}
                                            onLoad={(e) => {
                                                const { naturalWidth, naturalHeight } = e.currentTarget;
                                                setBannerPreviewLayout(prev => ({
                                                    ...prev,
                                                    imageWidth: naturalWidth,
                                                    imageHeight: naturalHeight,
                                                }));
                                            }}
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
                                <p className="text-xs text-zinc-500 dark:text-zinc-500">{t('bannerFormats')}</p>
                            </div>

                            {/* Bio Input */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('bio')}</label>
                                <textarea
                                    value={editBio}
                                    onChange={(e) => setEditBio(e.target.value)}
                                    placeholder={t('bioPlaceholder')}
                                    rows={4}
                                    className="w-full bg-zinc-50 dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-zinc-50 dark:bg-black/20 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
                            <button
                                onClick={handleClose}
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
                    </>
                )}
            </div>
        </div>
    );
};
