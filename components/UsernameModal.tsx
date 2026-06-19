import React, { useState } from 'react';
import { X, User } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { BrandMark } from './BrandMark';

interface UsernameModalProps {
  isOpen: boolean;
  onSubmit: (username: string) => Promise<void>;
}

export const UsernameModal: React.FC<UsernameModalProps> = ({ isOpen, onSubmit }) => {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = username.trim();
    if (trimmed.length < 2) {
      setError(t('usernameMinLength'));
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError(t('usernameInvalidChars'));
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSetUsername'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-zinc-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        <div className="h-2 apex-accent-fill" />

        <div className="p-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-xl apex-accent-fill flex items-center justify-center shadow-lg">
              <BrandMark className="w-8 h-8" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-center text-white mb-2">
            {t('welcomeTitle')}
          </h2>
          <p className="text-zinc-400 text-center mb-8">
            {t('welcomeSubtitle')}
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-zinc-300 mb-2">
                {t('yourName')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="w-5 h-5 text-zinc-500" />
                </div>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('enterYourName')}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#8fb68f] focus:border-transparent transition-all"
                  autoFocus
                  disabled={isLoading}
                />
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-400">{error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !username.trim()}
              className="w-full py-3 apex-accent-fill font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('gettingStarted')}
                </span>
              ) : (
                t('getStarted')
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-xs text-zinc-500 text-center">
            {t('yourMusicYourWay')}
          </p>
        </div>
      </div>
    </div>
  );
};
