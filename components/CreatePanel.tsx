import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sparkles, ChevronDown, Settings2, Trash2, Music2, Sliders, Dices, Hash, RefreshCw, Plus, Upload, Play, Pause, Loader2, Mic, Square } from 'lucide-react';
import { GenerationParams, Song } from '../types';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { generateApi } from '../services/api';
import { MAIN_STYLES } from '../data/genres';
import { EditableSlider } from './EditableSlider';

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

interface CreatePanelProps {
  onGenerate: (params: GenerationParams) => void;
  isGenerating: boolean;
  initialData?: { song: Song, timestamp: number } | null;
  createdSongs?: Song[];
  pendingAudioSelection?: { target: 'reference' | 'source'; url: string; title?: string } | null;
  onAudioSelectionApplied?: () => void;
}

const KEY_SIGNATURES = [
  '',
  'C major', 'C minor',
  'C# major', 'C# minor',
  'Db major', 'Db minor',
  'D major', 'D minor',
  'D# major', 'D# minor',
  'Eb major', 'Eb minor',
  'E major', 'E minor',
  'F major', 'F minor',
  'F# major', 'F# minor',
  'Gb major', 'Gb minor',
  'G major', 'G minor',
  'G# major', 'G# minor',
  'Ab major', 'Ab minor',
  'A major', 'A minor',
  'A# major', 'A# minor',
  'Bb major', 'Bb minor',
  'B major', 'B minor'
];

const TIME_SIGNATURES = ['', '2', '3', '4', '6', 'N/A'];

const TRACK_NAMES = [
  'woodwinds', 'brass', 'fx', 'synth', 'strings', 'percussion',
  'keyboard', 'guitar', 'bass', 'drums', 'backing_vocals', 'vocals',
];

const RECORDING_INSTRUMENTS = [
  { value: 'grand piano', key: 'instrumentGrandPiano' },
  { value: 'electric piano', key: 'instrumentElectricPiano' },
  { value: 'organ', key: 'instrumentOrgan' },
  { value: 'harpsichord', key: 'instrumentHarpsichord' },
  { value: 'celesta', key: 'instrumentCelesta' },
  { value: 'acoustic guitar', key: 'instrumentAcousticGuitar' },
  { value: 'nylon-string guitar', key: 'instrumentNylonGuitar' },
  { value: 'electric guitar', key: 'instrumentElectricGuitar' },
  { value: 'distorted electric guitar', key: 'instrumentDistortedGuitar' },
  { value: 'electric bass guitar', key: 'instrumentElectricBass' },
  { value: 'upright bass', key: 'instrumentUprightBass' },
  { value: 'harp', key: 'instrumentHarp' },
  { value: 'violin', key: 'instrumentViolin' },
  { value: 'viola', key: 'instrumentViola' },
  { value: 'cello', key: 'instrumentCello' },
  { value: 'double bass', key: 'instrumentDoubleBass' },
  { value: 'string ensemble', key: 'instrumentStringEnsemble' },
  { value: 'pizzicato strings', key: 'instrumentPizzicatoStrings' },
  { value: 'flute', key: 'instrumentFlute' },
  { value: 'clarinet', key: 'instrumentClarinet' },
  { value: 'oboe', key: 'instrumentOboe' },
  { value: 'bassoon', key: 'instrumentBassoon' },
  { value: 'saxophone', key: 'instrumentSaxophone' },
  { value: 'English horn', key: 'instrumentEnglishHorn' },
  { value: 'trumpet', key: 'instrumentTrumpet' },
  { value: 'trombone', key: 'instrumentTrombone' },
  { value: 'French horn', key: 'instrumentFrenchHorn' },
  { value: 'tuba', key: 'instrumentTuba' },
  { value: 'brass ensemble', key: 'instrumentBrassEnsemble' },
  { value: 'acoustic drums', key: 'instrumentAcousticDrums' },
  { value: 'electronic drums', key: 'instrumentElectronicDrums' },
  { value: 'drum machine', key: 'instrumentDrumMachine' },
  { value: 'percussion', key: 'instrumentPercussion' },
  { value: 'timpani', key: 'instrumentTimpani' },
  { value: 'marimba', key: 'instrumentMarimba' },
  { value: 'vibraphone', key: 'instrumentVibraphone' },
  { value: 'xylophone', key: 'instrumentXylophone' },
  { value: 'synth lead', key: 'instrumentSynthLead' },
  { value: 'synth bass', key: 'instrumentSynthBass' },
  { value: 'synth pad', key: 'instrumentSynthPad' },
  { value: 'synth pluck', key: 'instrumentSynthPluck' },
] as const;

type AceTaskType = 'text2music' | 'cover' | 'repaint' | 'lego' | 'extract' | 'complete';

const BASE_ONLY_TASKS = new Set<AceTaskType>(['lego', 'extract', 'complete']);
const SOURCE_TASKS = new Set<AceTaskType>(['cover', 'repaint', 'lego', 'extract', 'complete']);
const DEFAULT_INSTRUCTION = 'Fill the audio semantic mask based on the given conditions:';

const normalizeTaskType = (task: string): AceTaskType => {
  if (task === 'audio2audio') return 'cover';
  if (SOURCE_TASKS.has(task as AceTaskType) || task === 'text2music') return task as AceTaskType;
  return 'text2music';
};

const isPureBaseModel = (modelId: string): boolean => {
  const normalized = modelId.toLowerCase();
  const isBase = normalized.includes('base') || normalized.endsWith('-b') || normalized.includes('xl-b');
  return isBase && !normalized.includes('turbo') && !normalized.includes('sft');
};

const taskInstruction = (task: AceTaskType, track: string, classes: string[]): string => {
  if (task === 'lego') return track ? `Generate the ${track} track based on the audio context:` : 'Generate the track based on the audio context:';
  if (task === 'extract') return track ? `Extract the ${track} track from the audio:` : 'Extract the track from the audio:';
  if (task === 'complete') return classes.length
    ? `Complete the input track with ${classes.join(', ')}:`
    : 'Complete the input track:';
  if (task === 'repaint') return 'Repaint the mask area based on the given conditions:';
  if (task === 'cover') return 'Generate audio semantic tokens based on the given conditions:';
  return DEFAULT_INSTRUCTION;
};

const looksLikeAutomaticInstruction = (value: string): boolean => {
  const normalized = value.trim();
  return normalized === DEFAULT_INSTRUCTION
    || normalized === 'Generate audio semantic tokens based on the given conditions:'
    || /^Generate the (.+ )?track based on the audio context:$/.test(normalized)
    || /^Extract the (.+ )?track from the audio:$/.test(normalized)
    || /^Complete the input track( with .+)?:$/.test(normalized)
    || normalized === 'Repaint the mask area based on the given conditions:';
};

const shouldDefaultDcwOff = (modelId: string): boolean => {
  const normalized = modelId.toLowerCase();
  return (
    normalized.includes('base') ||
    normalized.includes('sft') ||
    normalized.endsWith('-b') ||
    normalized.endsWith('-s') ||
    normalized.includes('xl-b') ||
    normalized.includes('xl-s')
  );
};

const VOCAL_LANGUAGE_KEYS = [
  { value: 'unknown', key: 'autoInstrumental' as const },
  { value: 'ar', key: 'vocalArabic' as const },
  { value: 'az', key: 'vocalAzerbaijani' as const },
  { value: 'bg', key: 'vocalBulgarian' as const },
  { value: 'bn', key: 'vocalBengali' as const },
  { value: 'ca', key: 'vocalCatalan' as const },
  { value: 'cs', key: 'vocalCzech' as const },
  { value: 'da', key: 'vocalDanish' as const },
  { value: 'de', key: 'vocalGerman' as const },
  { value: 'el', key: 'vocalGreek' as const },
  { value: 'en', key: 'vocalEnglish' as const },
  { value: 'es', key: 'vocalSpanish' as const },
  { value: 'fa', key: 'vocalPersian' as const },
  { value: 'fi', key: 'vocalFinnish' as const },
  { value: 'fr', key: 'vocalFrench' as const },
  { value: 'he', key: 'vocalHebrew' as const },
  { value: 'hi', key: 'vocalHindi' as const },
  { value: 'hr', key: 'vocalCroatian' as const },
  { value: 'ht', key: 'vocalHaitianCreole' as const },
  { value: 'hu', key: 'vocalHungarian' as const },
  { value: 'id', key: 'vocalIndonesian' as const },
  { value: 'is', key: 'vocalIcelandic' as const },
  { value: 'it', key: 'vocalItalian' as const },
  { value: 'ja', key: 'vocalJapanese' as const },
  { value: 'ko', key: 'vocalKorean' as const },
  { value: 'la', key: 'vocalLatin' as const },
  { value: 'lt', key: 'vocalLithuanian' as const },
  { value: 'ms', key: 'vocalMalay' as const },
  { value: 'ne', key: 'vocalNepali' as const },
  { value: 'nl', key: 'vocalDutch' as const },
  { value: 'no', key: 'vocalNorwegian' as const },
  { value: 'pa', key: 'vocalPunjabi' as const },
  { value: 'pl', key: 'vocalPolish' as const },
  { value: 'pt', key: 'vocalPortuguese' as const },
  { value: 'ro', key: 'vocalRomanian' as const },
  { value: 'ru', key: 'vocalRussian' as const },
  { value: 'sa', key: 'vocalSanskrit' as const },
  { value: 'sk', key: 'vocalSlovak' as const },
  { value: 'sr', key: 'vocalSerbian' as const },
  { value: 'sv', key: 'vocalSwedish' as const },
  { value: 'sw', key: 'vocalSwahili' as const },
  { value: 'ta', key: 'vocalTamil' as const },
  { value: 'te', key: 'vocalTelugu' as const },
  { value: 'th', key: 'vocalThai' as const },
  { value: 'tl', key: 'vocalTagalog' as const },
  { value: 'tr', key: 'vocalTurkish' as const },
  { value: 'uk', key: 'vocalUkrainian' as const },
  { value: 'ur', key: 'vocalUrdu' as const },
  { value: 'vi', key: 'vocalVietnamese' as const },
  { value: 'yue', key: 'vocalCantonese' as const },
  { value: 'zh', key: 'vocalChineseMandarin' as const },
];

const normalizeLyricsInput = (value: string): string => {
  let normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmed = normalized.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        normalized = parsed;
      }
    } catch {
      // Fall through to targeted escape cleanup below.
    }
  }

  return normalized
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
};

const encodePcmAsWav = (chunks: Float32Array[], sampleRate: number): Blob => {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, sampleCount * 2, true);

  let offset = 44;
  chunks.forEach((chunk) => {
    for (let index = 0; index < chunk.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, chunk[index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  });
  return new Blob([buffer], { type: 'audio/wav' });
};

const CREATE_DRAFT_STORAGE_KEY = 'acestep_create_panel_draft';

type CreatePanelDraft = {
  customMode?: boolean;
  songDescription?: string;
  lyrics?: string;
  style?: string;
  title?: string;
  instrumental?: boolean;
  vocalLanguage?: string;
  vocalGender?: 'male' | 'female' | '';
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;
  showAdvanced?: boolean;
  duration?: number;
  inferenceSteps?: number;
  thinking?: boolean;
  useAdg?: boolean;
  guidanceScale?: number;
  randomSeed?: boolean;
  seed?: number;
  enhance?: boolean;
  audioFormat?: 'mp3' | 'flac';
  inferMethod?: 'ode' | 'sde';
  shift?: number;
  dcwEnabled?: boolean;
};

type CustomExampleSnapshot = {
  lyrics: string;
  style: string;
};

type SimpleExampleSnapshot = {
  description: string;
  instrumental: boolean;
};

const selectClassName = "w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-[#8fb68f] dark:focus:border-[#8fb68f] transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white disabled:opacity-60 disabled:cursor-not-allowed";
const checkboxClassName = "h-4 w-4 shrink-0 self-start mt-0.5 rounded border-zinc-300 dark:border-white/20 bg-white dark:bg-black/20 text-[#8fb68f] accent-[#8fb68f] focus:ring-2 focus:ring-[#8fb68f]/35 focus:ring-offset-0 cursor-pointer";

let createPanelDraftMemory: CreatePanelDraft = {};

const readCreatePanelDraft = (): CreatePanelDraft => {
  localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
  return createPanelDraftMemory;
};

export const CreatePanel: React.FC<CreatePanelProps> = ({
  onGenerate,
  isGenerating,
  initialData,
  createdSongs = [],
  pendingAudioSelection,
  onAudioSelectionApplied,
}) => {
  const { isAuthenticated, token, user } = useAuth();
  const { t } = useI18n();

  // Randomly select 6 music tags from MAIN_STYLES
  const [musicTags, setMusicTags] = useState<string[]>(() => {
    const shuffled = [...MAIN_STYLES].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  });

  // Function to refresh music tags
  const refreshMusicTags = useCallback(() => {
    const shuffled = [...MAIN_STYLES].sort(() => Math.random() - 0.5);
    setMusicTags(shuffled.slice(0, 6));
  }, []);

  const initialDraftRef = useRef<CreatePanelDraft | null>(null);
  if (initialDraftRef.current === null) {
    initialDraftRef.current = readCreatePanelDraft();
  }
  const initialDraft = initialDraftRef.current;

  // Mode
  const [customMode, setCustomMode] = useState(() => initialDraft.customMode ?? true);

  // Simple Mode
  const [songDescription, setSongDescription] = useState(() => initialDraft.songDescription || '');

  // Custom Mode
  const [lyrics, setLyrics] = useState(() => normalizeLyricsInput(initialDraft.lyrics || ''));
  const [style, setStyle] = useState(() => initialDraft.style || '');
  const [title, setTitle] = useState(() => initialDraft.title || '');
  const [customExampleSnapshot, setCustomExampleSnapshot] = useState<CustomExampleSnapshot | null>(null);
  const [simpleExampleSnapshot, setSimpleExampleSnapshot] = useState<SimpleExampleSnapshot | null>(null);

  // Common
  const [instrumental, setInstrumental] = useState(() => initialDraft.instrumental ?? false);
  const [vocalLanguage, setVocalLanguage] = useState(() => initialDraft.vocalLanguage || 'en');
  const [vocalGender, setVocalGender] = useState<'male' | 'female' | ''>(() => initialDraft.vocalGender || '');

  // Music Parameters
  const [bpm, setBpm] = useState(() => initialDraft.bpm ?? 0);
  const [keyScale, setKeyScale] = useState(() => initialDraft.keyScale || '');
  const [timeSignature, setTimeSignature] = useState(() => initialDraft.timeSignature || '');

  // Advanced Settings
  const [showAdvanced, setShowAdvanced] = useState(() => initialDraft.showAdvanced ?? false);
  const [duration, setDuration] = useState(() => initialDraft.duration ?? -1);
  const [batchSize, setBatchSize] = useState(() => {
    const stored = localStorage.getItem('ace-batchSize');
    return stored ? Number(stored) : 1;
  });
  const [bulkCount, setBulkCount] = useState(() => {
    const stored = localStorage.getItem('ace-bulkCount');
    return stored ? Number(stored) : 1;
  });
  const [guidanceScale, setGuidanceScale] = useState(() => initialDraft.guidanceScale ?? 9.0);
  const [randomSeed, setRandomSeed] = useState(() => initialDraft.randomSeed ?? true);
  const [seed, setSeed] = useState(() => initialDraft.seed ?? -1);
  const [thinking, setThinking] = useState(() => initialDraft.thinking ?? false); // Default false for GPU compatibility
  const [enhance, setEnhance] = useState(() => initialDraft.enhance ?? false); // AI Enhance: uses LLM to enrich caption & generate metadata
  const [audioFormat, setAudioFormat] = useState<'mp3' | 'flac'>(() => initialDraft.audioFormat || 'mp3');
  const [inferenceSteps, setInferenceSteps] = useState(() => {
    if (initialDraft.inferenceSteps !== undefined) return initialDraft.inferenceSteps;
    const storedModel = localStorage.getItem('ace-model') || 'acestep-v15-turbo-shift3';
    if (storedModel.toLowerCase().includes('turbo')) return 8;
    return isPureBaseModel(storedModel) ? 32 : 50;
  });
  const [inferMethod, setInferMethod] = useState<'ode' | 'sde'>(() => initialDraft.inferMethod || 'ode');
  const [lmBackend, setLmBackend] = useState<'pt' | 'vllm'>('pt');
  const [lmModel, setLmModel] = useState(() => {
    return localStorage.getItem('ace-lmModel') || 'acestep-5Hz-lm-0.6B';
  });
  const [shift, setShift] = useState(() => initialDraft.shift ?? 3.0);

  // LM Parameters (under Expert)
  const [showLmParams, setShowLmParams] = useState(false);
  const [lmTemperature, setLmTemperature] = useState(0.8);
  const [lmCfgScale, setLmCfgScale] = useState(2.2);
  const [lmTopK, setLmTopK] = useState(0);
  const [lmTopP, setLmTopP] = useState(0.92);
  const [lmNegativePrompt, setLmNegativePrompt] = useState('NO USER INPUT');

  // Expert Parameters (now in Advanced section)
  const [referenceAudioUrl, setReferenceAudioUrl] = useState('');
  const [sourceAudioUrl, setSourceAudioUrl] = useState('');
  const [referenceAudioTitle, setReferenceAudioTitle] = useState('');
  const [sourceAudioTitle, setSourceAudioTitle] = useState('');
  const [recordingInstrument, setRecordingInstrument] = useState('');
  const [temporaryRecordingId, setTemporaryRecordingId] = useState<string | null>(null);
  const [audioCodes, setAudioCodes] = useState('');
  const [repaintingStart, setRepaintingStart] = useState(0);
  const [repaintingEnd, setRepaintingEnd] = useState(-1);
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [audioCoverStrength, setAudioCoverStrength] = useState(1.0);
  const [taskType, setTaskType] = useState<AceTaskType>('text2music');
  const [useAdg, setUseAdg] = useState(() => initialDraft.useAdg ?? false);
  const [cfgIntervalStart, setCfgIntervalStart] = useState(0.0);
  const [cfgIntervalEnd, setCfgIntervalEnd] = useState(1.0);
  const [customTimesteps, setCustomTimesteps] = useState('');
  const [useCotMetas, setUseCotMetas] = useState(true);
  const [useCotCaption, setUseCotCaption] = useState(true);
  const [useCotLanguage, setUseCotLanguage] = useState(true);
  const [autogen, setAutogen] = useState(false);
  const [constrainedDecodingDebug, setConstrainedDecodingDebug] = useState(false);
  const [allowLmBatch, setAllowLmBatch] = useState(true);
  const [getScores, setGetScores] = useState(false);
  const [getLrc, setGetLrc] = useState(false);
  const [isLoadingRandomExample, setIsLoadingRandomExample] = useState(false);
  const [scoreScale, setScoreScale] = useState(0.5);
  const [lmBatchChunkSize, setLmBatchChunkSize] = useState(8);
  const [trackName, setTrackName] = useState('');
  const [completeTrackClasses, setCompleteTrackClasses] = useState('');
  const [isFormatCaption, setIsFormatCaption] = useState(false);
  const [maxDurationWithLm, setMaxDurationWithLm] = useState(240);
  const [maxDurationWithoutLm, setMaxDurationWithoutLm] = useState(240);
  const [gpuMemoryGb, setGpuMemoryGb] = useState<number | null>(null);

   // DCW Parameters
  const [dcwEnabled, setDcwEnabled] = useState(() => {
    if (initialDraft.dcwEnabled !== undefined) return initialDraft.dcwEnabled;
    const storedModel = localStorage.getItem('ace-model') || 'acestep-v15-turbo-shift3';
    return !shouldDefaultDcwOff(storedModel);
  });
  const [dcwMode, setDcwMode] = useState('double');
  const [dcwScaler, setDcwScaler] = useState(0.05);
  const [dcwHighScaler, setDcwHighScaler] = useState(0.02);
  const [dcwWavelet, setDcwWavelet] = useState('haar');

  // LoRA Parameters
  const [showLoraPanel, setShowLoraPanel] = useState(false);
  const [loraPath, setLoraPath] = useState('./lora_output/final/adapter');
  const [loraLoaded, setLoraLoaded] = useState(false);
  const [loraEnabled, setLoraEnabled] = useState(true);
  const [loraScale, setLoraScale] = useState(1.0);
  const [loraError, setLoraError] = useState<string | null>(null);
  const [isLoraLoading, setIsLoraLoading] = useState(false);

  // Model selection
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('ace-model') || 'acestep-v15-turbo-shift3';
  });
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const previousModelRef = useRef<string>(selectedModel);
  const dcwDefaultModelRef = useRef<string>(selectedModel);
  
  // Available models fetched from backend
  const [fetchedModels, setFetchedModels] = useState<{ name: string; is_active: boolean; is_preloaded: boolean }[]>([]);

  // VAE selection
  const [selectedVae, setSelectedVae] = useState<string>(() => {
    return localStorage.getItem('ace-vae') || 'official';
  });
  const [fetchedVaeModels, setFetchedVaeModels] = useState<{ name: string; is_preloaded: boolean }[]>([]);
  const [showVaeMenu, setShowVaeMenu] = useState(false);
  const vaeMenuRef = useRef<HTMLDivElement>(null);


  // Fallback model list when backend is unavailable
  const availableModels = useMemo(() => {
    if (fetchedModels.length > 0) {
      return fetchedModels.map(m => ({ id: m.name, name: m.name }));
    }
    return [
      { id: 'acestep-v15-base', name: 'acestep-v15-base' },
      { id: 'acestep-v15-sft', name: 'acestep-v15-sft' },
      { id: 'acestep-v15-turbo', name: 'acestep-v15-turbo' },
      { id: 'acestep-v15-turbo-shift1', name: 'acestep-v15-turbo-shift1' },
      { id: 'acestep-v15-turbo-shift3', name: 'acestep-v15-turbo-shift3' },
      { id: 'acestep-v15-turbo-continuous', name: 'acestep-v15-turbo-continuous' },
      { id: 'acestep-v15-xl-turbo', name: 'acestep-v15-xl-turbo' },
      { id: 'acestep-v15-xl-base', name: 'acestep-v15-xl-base' },
      { id: 'acestep-v15-xl-sft', name: 'acestep-v15-xl-sft' },
    ];
  }, [fetchedModels]);

  const availableVaeModels = useMemo(() => {
    if (fetchedVaeModels.length > 0) {
      return fetchedVaeModels.map(v => ({ id: v.name, name: v.name, is_preloaded: v.is_preloaded }));
    }
    return [
      { id: 'official', name: 'official', is_preloaded: true },
      { id: 'scragvae', name: 'scragvae', is_preloaded: false },
    ];
  }, [fetchedVaeModels]);

  // Map model ID to short display name
  const getModelDisplayName = (modelId: string): string => {
    const mapping: Record<string, string> = {
      'acestep-v15-base': '1.5B',
      'acestep-v15-sft': '1.5S',
      'acestep-v15-turbo-shift1': '1.5TS1',
      'acestep-v15-turbo-shift3': '1.5TS3',
      'acestep-v15-turbo-continuous': '1.5TC',
      'acestep-v15-turbo': '1.5T',
      'acestep-v15-xl-turbo': '1.5XL-T',
      'acestep-v15-xl-base': '1.5XL-B',
      'acestep-v15-xl-sft': '1.5XL-S',
    };
    return mapping[modelId] || modelId;
  };

  const getLmModelOptionLabel = (modelId: string): string => {
    const gpu = gpuMemoryGb;
    if (modelId.includes('0.6B')) {
      if (gpu === null) return '0.6B - Low VRAM / safest';
      return `0.6B - Safe on your ${gpu}GB GPU`;
    }
    if (modelId.includes('1.7B')) {
      if (gpu === null) return '1.7B - Balanced';
      if (gpu < 8) return `1.7B - Risky on your ${gpu}GB GPU`;
      if (gpu < 16) return `1.7B - Balanced on your ${gpu}GB GPU`;
      return `1.7B - Safe on your ${gpu}GB GPU`;
    }
    if (modelId.includes('4B')) {
      if (gpu === null) return '4B - Best quality, high VRAM';
      if (gpu < 12) return `4B - High VRAM, risky on your ${gpu}GB GPU`;
      if (gpu < 20) return `4B - High VRAM, may need offload on your ${gpu}GB GPU`;
      return `4B - Best quality, suitable for your ${gpu}GB GPU`;
    }
    return modelId;
  };

  // Check if model is a turbo variant
  const isTurboModel = (modelId: string): boolean => {
    return modelId.includes('turbo');
  };

  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [isTranscribingReference, setIsTranscribingReference] = useState(false);
  const transcribeAbortRef = useRef<AbortController | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generationValidationError, setGenerationValidationError] = useState<string | null>(null);
  const [isFormattingStyle, setIsFormattingStyle] = useState(false);
  const [isFormattingLyrics, setIsFormattingLyrics] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dragKind, setDragKind] = useState<'file' | 'audio' | null>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [audioModalTarget, setAudioModalTarget] = useState<'reference' | 'source'>('reference');
  const [tempAudioUrl, setTempAudioUrl] = useState('');
  const [audioTab, setAudioTab] = useState<'reference' | 'source'>('reference');
  const referenceAudioRef = useRef<HTMLAudioElement>(null);
  const sourceAudioRef = useRef<HTMLAudioElement>(null);
  const [referencePlaying, setReferencePlaying] = useState(false);
  const [sourcePlaying, setSourcePlaying] = useState(false);
  const [referenceTime, setReferenceTime] = useState(0);
  const [sourceTime, setSourceTime] = useState(0);
  const [referenceDuration, setReferenceDuration] = useState(0);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [sourceAudioOrigin, setSourceAudioOrigin] = useState<'recording' | null>(null);
  const [recordingLyricsOverride, setRecordingLyricsOverride] = useState(false);
  const [isRequestingMicrophone, setIsRequestingMicrophone] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingRecording, setIsUploadingRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const recordingCanvasRef = useRef<HTMLCanvasElement>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const recordingPcmChunksRef = useRef<Float32Array[]>([]);
  const recordingSampleRateRef = useRef(44100);
  const recordingProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingAnimationRef = useRef<number | null>(null);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAnalyserRef = useRef<AnalyserNode | null>(null);

  const canRecordAudio = typeof window !== 'undefined'
    && window.location.protocol === 'https:'
    && typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof AudioContext !== 'undefined';
  const lyricsLockedForRecording = sourceAudioOrigin === 'recording'
    && SOURCE_TASKS.has(normalizeTaskType(taskType))
    && !recordingLyricsOverride;

  const normalizedTaskType = normalizeTaskType(taskType);
  const hasSourceConditioning = Boolean(sourceAudioUrl.trim() || audioCodes.trim());
  const shouldHideCotControls = hasSourceConditioning
    && (['cover', 'repaint', 'extract'] as AceTaskType[]).includes(normalizedTaskType);
  const baseTaskModel = isPureBaseModel(selectedModel);
  const availableSourceTasks = useMemo<AceTaskType[]>(
    () => baseTaskModel ? ['lego', 'repaint', 'extract', 'complete'] : ['repaint'],
    [baseTaskModel],
  );

  const getTaskLabel = (task: AceTaskType): string => {
    if (task === 'lego') return t('legoTask');
    if (task === 'repaint') return t('repaintTask');
    if (task === 'extract') return t('extractTask');
    if (task === 'complete') return t('completeTask');
    if (task === 'text2music') return t('textToMusic');
    return t('cover');
  };

  const getSourceHelp = (): string => {
    if (normalizedTaskType === 'lego') return t('legoAudioHelp');
    if (normalizedTaskType === 'repaint') return t('repaintAudioHelp');
    if (normalizedTaskType === 'extract') return t('extractAudioHelp');
    if (normalizedTaskType === 'complete') return t('completeAudioHelp');
    return t('coverAudioHelp');
  };

  const changeTaskType = (nextTask: AceTaskType) => {
    if (BASE_ONLY_TASKS.has(nextTask) && !baseTaskModel) return;
    const selectedClasses = completeTrackClasses.split(',').map(item => item.trim()).filter(Boolean);
    const nextInstruction = taskInstruction(nextTask, trackName, selectedClasses);
    setInstruction(current => looksLikeAutomaticInstruction(current) ? nextInstruction : current);
    setTaskType(nextTask);
    setGenerationValidationError(null);
    if (SOURCE_TASKS.has(nextTask)) setAudioTab('source');
  };

  const changeTrackName = (nextTrack: string) => {
    const selectedClasses = completeTrackClasses.split(',').map(item => item.trim()).filter(Boolean);
    setInstruction(current => looksLikeAutomaticInstruction(current)
      ? taskInstruction(normalizedTaskType, nextTrack, selectedClasses)
      : current);
    setTrackName(nextTrack);
    setGenerationValidationError(null);
  };

  // Reference tracks modal state
  const [referenceTracks, setReferenceTracks] = useState<ReferenceTrack[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [playingTrackSource, setPlayingTrackSource] = useState<'uploads' | 'created' | null>(null);
  const modalAudioRef = useRef<HTMLAudioElement>(null);
  const [modalTrackTime, setModalTrackTime] = useState(0);
  const [modalTrackDuration, setModalTrackDuration] = useState(0);
  const [libraryTab, setLibraryTab] = useState<'uploads' | 'created'>('uploads');

  const createdTrackOptions = useMemo(() => {
    return createdSongs
      .filter(song => !song.isGenerating)
      .filter(song => (user ? song.userId === user.id : true))
      .filter(song => Boolean(song.audioUrl))
      .map(song => ({
        id: song.id,
        title: song.title || 'Untitled',
        audio_url: song.audioUrl!,
        duration: song.duration,
      }));
  }, [createdSongs, user]);

  const getAudioLabel = (url: string) => {
    try {
      const parsed = new URL(url);
      const name = decodeURIComponent(parsed.pathname.split('/').pop() || parsed.hostname);
      return name.replace(/\.[^/.]+$/, '') || name;
    } catch {
      const parts = url.split('/');
      const name = decodeURIComponent(parts[parts.length - 1] || url);
      return name.replace(/\.[^/.]+$/, '') || name;
    }
  };

  // Resize Logic
  const [lyricsHeight, setLyricsHeight] = useState(() => {
    const saved = localStorage.getItem('acestep_lyrics_height');
    return saved ? parseInt(saved, 10) : 144; // Default h-36 is 144px (9rem * 16)
  });
  const [isResizing, setIsResizing] = useState(false);
  const lyricsRef = useRef<HTMLDivElement>(null);


  // Close model menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setShowModelMenu(false);
      }
    };

    if (showModelMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModelMenu]);

  // Close VAE menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (vaeMenuRef.current && !vaeMenuRef.current.contains(event.target as Node)) {
        setShowVaeMenu(false);
      }
    };
    if (showVaeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showVaeMenu]);

  // Auto-unload LoRA when model changes
  useEffect(() => {
    if (previousModelRef.current !== selectedModel && loraLoaded) {
      void handleLoraUnload();
    }
    previousModelRef.current = selectedModel;
  }, [selectedModel, loraLoaded]);

  // Base/SFT models are slower and tend to be less stable with DCW enabled.
  // Auto-adjust DCW on model selection, but keep the toggle available for manual experiments.
  useEffect(() => {
    if (dcwDefaultModelRef.current !== selectedModel) {
      setDcwEnabled(!shouldDefaultDcwOff(selectedModel));
    }
    dcwDefaultModelRef.current = selectedModel;
  }, [selectedModel]);

  // Auto-disable thinking and ADG when LoRA is loaded
  useEffect(() => {
    if (loraLoaded) {
      if (thinking) setThinking(false);
      if (useAdg) setUseAdg(false);
    }
  }, [loraLoaded]);

  // LoRA API handlers
  const handleLoraToggle = async () => {
    if (!token) {
      setLoraError('Please sign in to use LoRA');
      return;
    }
    if (!loraPath.trim()) {
      setLoraError('Please enter a LoRA path');
      return;
    }

    setIsLoraLoading(true);
    setLoraError(null);

    try {
      if (loraLoaded) {
        await handleLoraUnload();
      } else {
        const result = await generateApi.loadLora({ lora_path: loraPath }, token);
        setLoraLoaded(true);
        console.log('LoRA loaded:', result?.message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LoRA operation failed';
      setLoraError(message);
      console.error('LoRA error:', err);
    } finally {
      setIsLoraLoading(false);
    }
  };

  const handleLoraUnload = async () => {
    if (!token) return;
    
    setIsLoraLoading(true);
    setLoraError(null);

    try {
      const result = await generateApi.unloadLora(token);
      setLoraLoaded(false);
      console.log('LoRA unloaded:', result?.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unload LoRA';
      setLoraError(message);
      console.error('Unload error:', err);
    } finally {
      setIsLoraLoading(false);
    }
  };

  const handleLoraScaleChange = async (newScale: number) => {
    setLoraScale(newScale);

    if (!token || !loraLoaded) return;

    try {
      await generateApi.setLoraScale({ scale: newScale }, token);
    } catch (err) {
      console.error('Failed to set LoRA scale:', err);
    }
  };

  const handleLoraEnabledToggle = async () => {
    if (!token || !loraLoaded) return;
    const newEnabled = !loraEnabled;
    setLoraEnabled(newEnabled);
    try {
      await generateApi.toggleLora({ enabled: newEnabled }, token);
    } catch (err) {
      console.error('Failed to toggle LoRA:', err);
      setLoraEnabled(!newEnabled); // revert on error
    }
  };

  // Load generation parameters from JSON file
  const handleLoadParamsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        setCustomExampleSnapshot(null);
        if (data.lyrics !== undefined) setLyrics(normalizeLyricsInput(String(data.lyrics)));
        if (data.style !== undefined) setStyle(data.style);
        if (data.title !== undefined) setTitle(data.title);
        if (data.caption !== undefined) setStyle(data.caption);
        if (data.instrumental !== undefined) setInstrumental(data.instrumental);
        if (data.vocal_language !== undefined) setVocalLanguage(data.vocal_language);
        if (data.bpm !== undefined) setBpm(data.bpm);
        if (data.key_scale !== undefined) setKeyScale(data.key_scale);
        if (data.time_signature !== undefined) setTimeSignature(data.time_signature);
        if (data.duration !== undefined) setDuration(data.duration);
        if (data.inference_steps !== undefined) setInferenceSteps(data.inference_steps);
        if (data.guidance_scale !== undefined) setGuidanceScale(data.guidance_scale);
        if (data.audio_format !== undefined) setAudioFormat(data.audio_format);
        if (data.infer_method !== undefined) setInferMethod(data.infer_method);
        if (data.seed !== undefined) { setSeed(data.seed); setRandomSeed(false); }
        if (data.shift !== undefined) setShift(data.shift);
        if (data.lm_temperature !== undefined) setLmTemperature(data.lm_temperature);
        if (data.lm_cfg_scale !== undefined) setLmCfgScale(data.lm_cfg_scale);
        if (data.lm_top_k !== undefined) setLmTopK(data.lm_top_k);
        if (data.lm_top_p !== undefined) setLmTopP(data.lm_top_p);
        if (data.lm_negative_prompt !== undefined) setLmNegativePrompt(data.lm_negative_prompt);
        if (data.task_type !== undefined) setTaskType(normalizeTaskType(String(data.task_type)));
        if (data.audio_codes !== undefined) setAudioCodes(data.audio_codes);
        if (data.repainting_start !== undefined) setRepaintingStart(data.repainting_start);
        if (data.repainting_end !== undefined) setRepaintingEnd(data.repainting_end);
        if (data.instruction !== undefined) setInstruction(data.instruction);
        if (data.audio_cover_strength !== undefined) setAudioCoverStrength(data.audio_cover_strength);
      } catch {
        console.error('Failed to parse parameters JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be reloaded
  };

  // Reuse Effect - must be after all state declarations
  useEffect(() => {
    if (initialData) {
      const { song } = initialData;
      const params = (song.generationParams || {}) as Record<string, any>;
      const reusedModel = song.ditModel || params.ditModel || params.dit_model;
      const reusedTaskType = params.taskType || params.task_type;
      const reusedDuration =
        typeof song.durationSeconds === 'number'
          ? song.durationSeconds
          : typeof params.duration === 'number'
            ? params.duration
            : undefined;
      const reusedBpm =
        typeof song.bpm === 'number'
          ? song.bpm
          : typeof params.bpm === 'number'
            ? params.bpm
            : undefined;
      const reusedKeyScale =
        typeof song.key_scale === 'string' && song.key_scale
          ? song.key_scale
          : typeof params.keyScale === 'string' && params.keyScale
            ? params.keyScale
            : typeof params.key_scale === 'string' && params.key_scale
              ? params.key_scale
              : undefined;
      const reusedTimeSignature =
        typeof song.time_signature === 'string' && song.time_signature
          ? song.time_signature
          : typeof params.timeSignature === 'string' && params.timeSignature
            ? params.timeSignature
            : typeof params.time_signature === 'string' && params.time_signature
              ? params.time_signature
              : undefined;
      const nextLyrics = normalizeLyricsInput(song.lyrics);
      const nextStyle = song.style || params.style || params.caption || '';
      const reusedInstrumental =
        typeof params.instrumental === 'boolean'
          ? params.instrumental
          : song.lyrics.length === 0;

      setCustomMode(true);
      setLyrics(nextLyrics);
      setStyle(nextStyle);
      setTitle(song.title);
      setInstrumental(reusedInstrumental);
      setThinking(Boolean(params.thinking));
      setGetLrc(Boolean(params.getLrc ?? params.get_lrc));
      setEnhance(Boolean(params.enhance));

      if (typeof reusedDuration === 'number') setDuration(reusedDuration);
      if (typeof reusedBpm === 'number') setBpm(reusedBpm);
      if (typeof reusedKeyScale === 'string') setKeyScale(reusedKeyScale);
      if (typeof reusedTimeSignature === 'string') setTimeSignature(reusedTimeSignature);

      if (typeof params.guidanceScale === 'number') setGuidanceScale(params.guidanceScale);
      else if (typeof params.guidance_scale === 'number') setGuidanceScale(params.guidance_scale);
      if (typeof params.inferenceSteps === 'number') setInferenceSteps(params.inferenceSteps);
      else if (typeof params.inference_steps === 'number') setInferenceSteps(params.inference_steps);
      if (typeof params.useAdg === 'boolean') setUseAdg(params.useAdg);
      else if (typeof params.use_adg === 'boolean') setUseAdg(params.use_adg);
      if (typeof params.dcwEnabled === 'boolean') setDcwEnabled(params.dcwEnabled);
      else if (typeof params.dcw_enabled === 'boolean') setDcwEnabled(params.dcw_enabled);

      if (typeof params.audioFormat === 'string' && (params.audioFormat === 'mp3' || params.audioFormat === 'flac')) {
        setAudioFormat(params.audioFormat);
      } else if (typeof params.audio_format === 'string' && (params.audio_format === 'mp3' || params.audio_format === 'flac')) {
        setAudioFormat(params.audio_format);
      }

      if (typeof params.inferMethod === 'string' && (params.inferMethod === 'ode' || params.inferMethod === 'sde')) {
        setInferMethod(params.inferMethod);
      } else if (typeof params.infer_method === 'string' && (params.infer_method === 'ode' || params.infer_method === 'sde')) {
        setInferMethod(params.infer_method);
      }

      setReferenceAudioUrl(
        typeof params.referenceAudioUrl === 'string'
          ? params.referenceAudioUrl
          : typeof params.reference_audio_url === 'string'
            ? params.reference_audio_url
            : ''
      );
      setSourceAudioUrl(
        typeof params.sourceAudioUrl === 'string'
          ? params.sourceAudioUrl
          : typeof params.source_audio_url === 'string'
            ? params.source_audio_url
            : ''
      );
      setSourceAudioOrigin(null);
      setRecordingLyricsOverride(false);
      setReferenceAudioTitle(
        typeof params.referenceAudioTitle === 'string'
          ? params.referenceAudioTitle
          : typeof params.reference_audio_title === 'string'
            ? params.reference_audio_title
            : ''
      );
      setSourceAudioTitle(
        typeof params.sourceAudioTitle === 'string'
          ? params.sourceAudioTitle
          : typeof params.source_audio_title === 'string'
            ? params.source_audio_title
            : ''
      );
      setAudioCoverStrength(
        typeof params.audioCoverStrength === 'number'
          ? params.audioCoverStrength
          : typeof params.audio_cover_strength === 'number'
            ? params.audio_cover_strength
            : 1.0
      );

      setTaskType(typeof reusedTaskType === 'string' ? normalizeTaskType(reusedTaskType) : 'text2music');
      if (typeof reusedModel === 'string' && reusedModel.length > 0) {
        setSelectedModel(reusedModel);
        localStorage.setItem('ace-model', reusedModel);
      }
      if (typeof params.vaeModel === 'string') {
        setSelectedVae(params.vaeModel);
        localStorage.setItem('ace-vae', params.vaeModel);
      } else if (typeof params.vae_model === 'string') {
        setSelectedVae(params.vae_model);
        localStorage.setItem('ace-vae', params.vae_model);
      }

      setShowAdvanced(
        Boolean(
          reusedTaskType && reusedTaskType !== 'text2music'
          || params.referenceAudioUrl
          || params.reference_audio_url
          || params.sourceAudioUrl
          || params.source_audio_url
          || reusedBpm
          || reusedKeyScale
          || reusedTimeSignature
          || reusedDuration
        )
      );
      setCustomExampleSnapshot({ lyrics: nextLyrics, style: nextStyle });
    }
  }, [initialData]);

  useEffect(() => {
    createPanelDraftMemory = {
      customMode,
      songDescription,
      lyrics,
      style,
      title,
      instrumental,
      vocalLanguage,
      vocalGender,
      bpm,
      keyScale,
      timeSignature,
      showAdvanced,
      duration,
      inferenceSteps,
      thinking,
      useAdg,
      guidanceScale,
      randomSeed,
      seed,
      enhance,
      audioFormat,
      inferMethod,
      shift,
      dcwEnabled,
    };
  }, [
    customMode,
    songDescription,
    lyrics,
    style,
    title,
    instrumental,
    vocalLanguage,
    vocalGender,
    bpm,
    keyScale,
    timeSignature,
    showAdvanced,
    duration,
    inferenceSteps,
    thinking,
    useAdg,
    guidanceScale,
    randomSeed,
    seed,
    enhance,
    audioFormat,
    inferMethod,
    shift,
    dcwEnabled,
  ]);

  useEffect(() => {
    if (!pendingAudioSelection) return;
    applyAudioTargetUrl(
      pendingAudioSelection.target,
      pendingAudioSelection.url,
      pendingAudioSelection.title
    );
    onAudioSelectionApplied?.();
  }, [pendingAudioSelection, onAudioSelectionApplied]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // Calculate new height based on mouse position relative to the lyrics container top
      // We can't easily get the container top here without a ref to it, 
      // but we can use dy (delta y) from the previous position if we tracked it,
      // OR simpler: just update based on movement if we track the start.
      //
      // Better approach for absolute sizing: 
      // 1. Get the bounding rect of the textarea wrapper on mount/resize start? 
      //    We can just rely on the fact that we are dragging the bottom.
      //    So new height = currentMouseY - topOfElement.

      if (lyricsRef.current) {
        const rect = lyricsRef.current.getBoundingClientRect();
        const newHeight = e.clientY - rect.top;
        // detailed limits: min 96px (h-24), max 600px
        if (newHeight > 96 && newHeight < 600) {
          setLyricsHeight(newHeight);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      // Save height to localStorage
      localStorage.setItem('acestep_lyrics_height', String(lyricsHeight));
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none'; // Prevent text selection while dragging
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isResizing]);

  const refreshModels = useCallback(async () => {
    try {
      const modelsRes = await fetch('/api/generate/models');
      if (modelsRes.ok) {
        const data = await modelsRes.json();
        const models = data.models || [];
        if (models.length > 0) {
          setFetchedModels(models);
          // Always sync to the backend's active model
          const active = models.find((m: any) => m.is_active);
          if (active) {
            setSelectedModel(active.name);
            localStorage.setItem('ace-model', active.name);
          }
        }
        const vaes = data.vaeModels || [];
        if (vaes.length > 0) {
          setFetchedVaeModels(vaes);
        }
      }
    } catch {
      // ignore - will use fallback model list
    }
  }, []);

  useEffect(() => {
    const loadModelsAndLimits = async () => {
      await refreshModels();

      // Fetch limits
      try {
        const response = await fetch('/api/generate/limits');
        if (!response.ok) return;
        const data = await response.json();
        if (typeof data.max_duration_with_lm === 'number') {
          setMaxDurationWithLm(data.max_duration_with_lm);
        }
        if (typeof data.max_duration_without_lm === 'number') {
          setMaxDurationWithoutLm(data.max_duration_without_lm);
        }
        if (typeof data.gpu_memory_gb === 'number') {
          setGpuMemoryGb(Math.round(data.gpu_memory_gb));
        }
      } catch {
        // ignore limits fetch failures
      }
    };

    loadModelsAndLimits();
  }, []);

  // Re-fetch models after generation completes to update active model
  const prevIsGeneratingRef = useRef(isGenerating);
  useEffect(() => {
    if (prevIsGeneratingRef.current && !isGenerating) {
      void refreshModels();
    }
    prevIsGeneratingRef.current = isGenerating;
  }, [isGenerating, refreshModels]);

  const modelMaxDuration = thinking ? maxDurationWithLm : maxDurationWithoutLm;
  const activeMaxDuration = sourceAudioOrigin === 'recording'
    ? Math.min(90, modelMaxDuration)
    : modelMaxDuration;

  useEffect(() => {
    if (duration > activeMaxDuration) {
      setDuration(activeMaxDuration);
    }
  }, [duration, activeMaxDuration]);

  useEffect(() => {
    if (!hasSourceConditioning && SOURCE_TASKS.has(normalizedTaskType)) {
      changeTaskType('text2music');
    }
  }, [hasSourceConditioning, normalizedTaskType]);

  useEffect(() => {
    const getDragKind = (e: DragEvent): 'file' | 'audio' | null => {
      if (!e.dataTransfer) return null;
      const types = Array.from(e.dataTransfer.types);
      if (types.includes('Files')) return 'file';
      if (types.includes('application/x-ace-audio')) return 'audio';
      return null;
    };

    const handleDragEnter = (e: DragEvent) => {
      const kind = getDragKind(e);
      if (!kind) return;
      dragDepthRef.current += 1;
      setIsDraggingFile(true);
      setDragKind(kind);
      e.preventDefault();
    };

    const handleDragOver = (e: DragEvent) => {
      const kind = getDragKind(e);
      if (!kind) return;
      setDragKind(kind);
      e.preventDefault();
    };

    const handleDragLeave = (e: DragEvent) => {
      const kind = getDragKind(e);
      if (!kind) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDraggingFile(false);
        setDragKind(null);
      }
    };

    const handleDrop = (e: DragEvent) => {
      const kind = getDragKind(e);
      if (!kind) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFile(false);
      setDragKind(null);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: 'reference' | 'source') => {
    const file = e.target.files?.[0];
    if (file) {
      void uploadReferenceTrack(file, target);
    }
    e.target.value = '';
  };

  const handleLoadRandomExample = async (mode: 'simple' | 'custom') => {
    if (!token || isLoadingRandomExample) return;
    setIsLoadingRandomExample(true);
    try {
      const result = await generateApi.getRandomDescription(token, mode);

      if (mode === 'simple') {
        const nextDescription = result.description || result.caption || '';
        const nextInstrumental = Boolean(result.instrumental);
        setSongDescription(nextDescription);
        setInstrumental(nextInstrumental);
        setSimpleExampleSnapshot({ description: nextDescription, instrumental: nextInstrumental });
        setBpm(0);
        setDuration(-1);
        setKeyScale('');
        setTimeSignature('');
        setThinking(false);
        setCustomExampleSnapshot(null);
      } else {
        const nextStyle = result.caption || '';
        const nextLyrics = normalizeLyricsInput(result.lyrics || '');
        setStyle(nextStyle);
        setLyrics(nextLyrics);
        setInstrumental(!(result.lyrics || '').trim());
        setThinking(Boolean(result.think));
        setCustomExampleSnapshot({ lyrics: nextLyrics, style: nextStyle });
        setSimpleExampleSnapshot(null);
      }

      setVocalLanguage(result.vocalLanguage || 'unknown');
      if (typeof result.bpm === 'number') setBpm(result.bpm);
      if (typeof result.duration === 'number') setDuration(result.duration);
      if (result.keyScale !== undefined) setKeyScale(result.keyScale);
      if (result.timeSignature !== undefined) setTimeSignature(result.timeSignature);
      refreshMusicTags();
    } catch (err) {
      console.error('Failed to load random example:', err);
    } finally {
      setIsLoadingRandomExample(false);
    }
  };

  const resetCustomExampleParams = () => {
    setBpm(0);
    setDuration(-1);
    setKeyScale('');
    setTimeSignature('');
    setThinking(false);
    setGetLrc(false);
    setCustomExampleSnapshot(null);
  };

  const detachCustomExampleIfContentChanged = (nextLyrics: string, nextStyle: string) => {
    if (
      customExampleSnapshot &&
      (nextLyrics !== customExampleSnapshot.lyrics || nextStyle !== customExampleSnapshot.style)
    ) {
      resetCustomExampleParams();
    }
  };

  const handleLyricsChange = (value: string) => {
    const nextLyrics = normalizeLyricsInput(value);
    setLyrics(nextLyrics);
    detachCustomExampleIfContentChanged(nextLyrics, style);
  };

  const handleStyleChange = (value: string) => {
    setStyle(value);
    detachCustomExampleIfContentChanged(lyrics, value);
  };

  const handleSongDescriptionChange = (value: string) => {
    setSongDescription(value);

    if (simpleExampleSnapshot && value !== simpleExampleSnapshot.description) {
      // Random simple examples may intentionally mark a prompt as instrumental.
      // When the user starts writing their own brief prompt, default back to vocal mode.
      if (simpleExampleSnapshot.instrumental && instrumental) {
        setInstrumental(false);
      }
      setSimpleExampleSnapshot(null);
    }
  };

  const switchToSimpleMode = () => {
    setCustomMode(false);
    setShowAdvanced(false);
    setBpm(0);
    setDuration(-1);
    setKeyScale('');
    setTimeSignature('');
    setThinking(false);
    setTaskType('text2music');
    setInstruction(DEFAULT_INSTRUCTION);
    setGenerationValidationError(null);
    setCustomExampleSnapshot(null);
  };

  // Format handler - uses LLM to enhance style/lyrics and auto-fill parameters
  const handleFormat = async (target: 'style' | 'lyrics') => {
    if (!token || !style.trim()) return;
    if (target === 'style') {
      setIsFormattingStyle(true);
    } else {
      setIsFormattingLyrics(true);
    }
    try {
      const result = await generateApi.formatInput({
        caption: style,
        lyrics: normalizeLyricsInput(lyrics),
        bpm: bpm > 0 ? bpm : undefined,
        duration: duration > 0 ? duration : undefined,
        keyScale: keyScale || undefined,
        timeSignature: timeSignature || undefined,
        temperature: lmTemperature,
        topK: lmTopK > 0 ? lmTopK : undefined,
        topP: lmTopP,
        lmModel: lmModel || 'acestep-5Hz-lm-0.6B',
        lmBackend: lmBackend || 'pt',
      }, token);

      if (result.caption || result.lyrics || result.bpm || result.duration) {
        // Update fields with LLM-generated values
        setCustomExampleSnapshot(null);
        if (target === 'style' && result.caption) setStyle(result.caption);
        if (target === 'lyrics' && result.lyrics) setLyrics(normalizeLyricsInput(result.lyrics));
        if (result.bpm && result.bpm > 0) setBpm(result.bpm);
        if (result.duration && result.duration > 0) setDuration(result.duration);
        if (result.key_scale) setKeyScale(result.key_scale);
        if (result.time_signature) {
          const ts = String(result.time_signature);
          setTimeSignature(ts.includes('/') ? ts : `${ts}/4`);
        }
        if (result.vocal_language) setVocalLanguage(result.vocal_language);
        if (target === 'style') setIsFormatCaption(true);
      } else {
        console.error('Format failed:', result.error || result.status_message);
        alert(result.error || result.status_message || 'Format failed. Make sure the LLM is initialized.');
      }
    } catch (err) {
      console.error('Format error:', err);
      alert('Format failed. The LLM may not be available.');
    } finally {
      if (target === 'style') {
        setIsFormattingStyle(false);
      } else {
        setIsFormattingLyrics(false);
      }
    }
  };

  const openAudioModal = (target: 'reference' | 'source', tab: 'uploads' | 'created' = 'uploads') => {
    setAudioModalTarget(target);
    setTempAudioUrl('');
    setLibraryTab(tab);
    setShowAudioModal(true);
    void fetchReferenceTracks();
  };

  const fetchReferenceTracks = useCallback(async () => {
    if (!token) return;
    setIsLoadingTracks(true);
    try {
      const response = await fetch('/api/reference-tracks', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setReferenceTracks(data.tracks || []);
      }
    } catch (err) {
      console.error('Failed to fetch reference tracks:', err);
    } finally {
      setIsLoadingTracks(false);
    }
  }, [token]);

  const deleteTemporaryRecording = async (recordingId: string, clearCurrent = true) => {
    if (!token) return;
    try {
      await fetch(`/api/reference-tracks/recording/${encodeURIComponent(recordingId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      console.warn('[Recording] Temporary cleanup will be retried by the server:', error);
    } finally {
      if (clearCurrent) {
        setTemporaryRecordingId(current => current === recordingId ? null : current);
      }
    }
  };

  const uploadReferenceTrack = async (
    file: File,
    target?: 'reference' | 'source',
    options?: { transcribe?: boolean; origin?: 'recording' },
  ): Promise<boolean> => {
    if (!token) {
      if (options?.origin === 'recording') setRecordingError(t('recordingSignInRequired'));
      else setUploadError('Please sign in to upload audio.');
      return false;
    }
    setUploadError(null);
    setIsUploadingReference(true);
    try {
      const formData = new FormData();
      formData.append('audio', file);

      const isTemporaryRecording = options?.origin === 'recording';
      const response = await fetch(
        isTemporaryRecording ? '/api/reference-tracks/recording' : '/api/reference-tracks',
        {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
        },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.details || err.error || 'Upload failed');
      }

      const data = await response.json();
      if (isTemporaryRecording) {
        if (temporaryRecordingId && temporaryRecordingId !== data.recording_id && !isGenerating) {
          void deleteTemporaryRecording(temporaryRecordingId, false);
        }
        setTemporaryRecordingId(data.recording_id);
      } else {
        setReferenceTracks(prev => [data.track, ...prev]);
      }

      // Also set as current reference/source
      const selectedTarget = target ?? audioModalTarget;
      applyAudioTargetUrl(selectedTarget, data.track.audio_url, data.track.filename, options?.origin ?? null);
      if (options?.transcribe !== false && data.whisper_available && data.track?.id) {
        void transcribeReferenceTrack(data.track.id).then(() => undefined);
      } else {
        setShowAudioModal(false);
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      if (options?.origin === 'recording') setRecordingError(message);
      else setUploadError(message);
      return false;
    } finally {
      setIsUploadingReference(false);
    }
  };

  const transcribeReferenceTrack = async (trackId: string) => {
    if (!token) return;
    setIsTranscribingReference(true);
    const controller = new AbortController();
    transcribeAbortRef.current = controller;
    try {
      const response = await fetch(`/api/reference-tracks/${trackId}/transcribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error('Failed to transcribe');
      }
      const data = await response.json();
      if (data.lyrics && !lyrics) {
        setCustomExampleSnapshot(null);
        setLyrics(normalizeLyricsInput(data.lyrics));
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('Transcription failed:', err);
    } finally {
      if (transcribeAbortRef.current === controller) {
        transcribeAbortRef.current = null;
      }
      setIsTranscribingReference(false);
    }
  };

  const cancelTranscription = () => {
    if (transcribeAbortRef.current) {
      transcribeAbortRef.current.abort();
      transcribeAbortRef.current = null;
    }
    setIsTranscribingReference(false);
  };

  const deleteReferenceTrack = async (trackId: string) => {
    if (!token) return;
    try {
      const response = await fetch(`/api/reference-tracks/${trackId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        setReferenceTracks(prev => prev.filter(t => t.id !== trackId));
        if (playingTrackId === trackId && playingTrackSource === 'uploads') {
          setPlayingTrackId(null);
          setPlayingTrackSource(null);
          if (modalAudioRef.current) {
            modalAudioRef.current.pause();
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete track:', err);
    }
  };

  const useReferenceTrack = (track: { audio_url: string; title?: string }) => {
    applyAudioTargetUrl(audioModalTarget, track.audio_url, track.title);
    setShowAudioModal(false);
    setPlayingTrackId(null);
    setPlayingTrackSource(null);
  };

  const toggleModalTrack = (track: { id: string; audio_url: string; source: 'uploads' | 'created' }) => {
    if (playingTrackId === track.id) {
      if (modalAudioRef.current) {
        modalAudioRef.current.pause();
      }
      setPlayingTrackId(null);
      setPlayingTrackSource(null);
    } else {
      setPlayingTrackId(track.id);
      setPlayingTrackSource(track.source);
      if (modalAudioRef.current) {
        modalAudioRef.current.src = track.audio_url;
        modalAudioRef.current.play().catch(() => undefined);
      }
    }
  };

  const applyAudioUrl = () => {
    if (!tempAudioUrl.trim()) return;
    applyAudioTargetUrl(audioModalTarget, tempAudioUrl.trim());
    setShowAudioModal(false);
    setTempAudioUrl('');
  };

  const applyAudioTargetUrl = (
    target: 'reference' | 'source',
    url: string,
    title?: string,
    origin: 'recording' | null = null,
  ) => {
    const derivedTitle = title ? title.replace(/\.[^/.]+$/, '') : getAudioLabel(url);
    if (target === 'reference') {
      setReferenceAudioUrl(url);
      setReferenceAudioTitle(derivedTitle);
      setReferenceTime(0);
      setReferenceDuration(0);
    } else {
      if (origin !== 'recording' && temporaryRecordingId) {
        if (!isGenerating) void deleteTemporaryRecording(temporaryRecordingId);
        setTemporaryRecordingId(null);
      }
      setSourceAudioUrl(url);
      setSourceAudioTitle(derivedTitle);
      setSourceAudioOrigin(origin);
      setRecordingLyricsOverride(false);
      setRecordingError(null);
      setSourceTime(0);
      setSourceDuration(0);
      if (origin === 'recording') {
        changeTaskType('cover');
      } else {
        setRecordingInstrument('');
      }
      if (origin !== 'recording' && taskType === 'text2music') {
        changeTaskType('cover');
      }
    }
  };

  const clearSourceAudio = () => {
    if (temporaryRecordingId) {
      if (!isGenerating) void deleteTemporaryRecording(temporaryRecordingId);
      setTemporaryRecordingId(null);
    }
    setSourceAudioUrl('');
    setSourceAudioTitle('');
    setSourceAudioOrigin(null);
    setRecordingInstrument('');
    setRecordingLyricsOverride(false);
    setSourcePlaying(false);
    setSourceTime(0);
    setSourceDuration(0);
    setGenerationValidationError(null);
    if (!audioCodes.trim()) changeTaskType('text2music');
  };

  const releaseMicrophone = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recordingAnimationRef.current !== null) {
      cancelAnimationFrame(recordingAnimationRef.current);
      recordingAnimationRef.current = null;
    }
    microphoneStreamRef.current?.getTracks().forEach(track => track.stop());
    microphoneStreamRef.current = null;
    if (recordingProcessorRef.current) {
      recordingProcessorRef.current.onaudioprocess = null;
      recordingProcessorRef.current.disconnect();
      recordingProcessorRef.current = null;
    }
    if (recordingAudioContextRef.current) {
      void recordingAudioContextRef.current.close().catch(() => undefined);
      recordingAudioContextRef.current = null;
    }
    recordingAnalyserRef.current = null;
  };

  const drawRecordingWaveform = (analyser: AnalyserNode) => {
    const canvas = recordingCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const samples = new Uint8Array(analyser.fftSize);

    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      analyser.getByteTimeDomainData(samples);
      context.clearRect(0, 0, width, height);
      context.lineWidth = Math.max(2, ratio * 1.5);
      context.strokeStyle = '#8fb68f';
      context.beginPath();
      const sliceWidth = width / samples.length;
      for (let index = 0; index < samples.length; index += 1) {
        const x = index * sliceWidth;
        const y = (samples[index] / 255) * height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      recordingAnimationRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  const startRecording = async () => {
    if (!canRecordAudio || isRequestingMicrophone || isRecording || isUploadingRecording) return;
    if (!token) {
      setRecordingError(t('recordingSignInRequired'));
      return;
    }
    setRecordingError(null);
    setIsRequestingMicrophone(true);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'OverconstrainedError') {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else {
          throw error;
        }
      }
      microphoneStreamRef.current = stream;

      const audioContext = new AudioContext();
      recordingAudioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      recordingAnalyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      recordingProcessorRef.current = processor;
      recordingPcmChunksRef.current = [];
      recordingSampleRateRef.current = audioContext.sampleRate;
      processor.onaudioprocess = (event) => {
        recordingPcmChunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      recordingStartedAtRef.current = Date.now();
      setRecordingElapsed(0);
      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => {
        setRecordingElapsed((Date.now() - recordingStartedAtRef.current) / 1000);
      }, 100);
    } catch (error) {
      const denied = error instanceof DOMException
        && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      const unavailable = error instanceof DOMException
        && (error.name === 'NotReadableError' || error.name === 'AbortError');
      console.error('[Recording] Failed to start:', error);
      setRecordingError(t(denied
        ? 'microphonePermissionDenied'
        : unavailable
          ? 'microphoneDeviceUnavailable'
          : 'microphoneUnavailable'));
      releaseMicrophone();
    } finally {
      setIsRequestingMicrophone(false);
    }
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    const elapsed = (Date.now() - recordingStartedAtRef.current) / 1000;
    const chunks = recordingPcmChunksRef.current;
    recordingPcmChunksRef.current = [];
    setIsRecording(false);
    releaseMicrophone();
    if (elapsed < 0.5 || chunks.length === 0) {
      setRecordingError(t('recordingTooShort'));
      return;
    }

    const blob = encodePcmAsWav(chunks, recordingSampleRateRef.current);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = new File([blob], `recording-${timestamp}.wav`, { type: 'audio/wav' });
    setIsUploadingRecording(true);
    try {
      const uploaded = await uploadReferenceTrack(file, 'source', { transcribe: false, origin: 'recording' });
      if (!uploaded) return;
    } catch (error) {
      console.error('[Recording] Failed to save:', error);
      setRecordingError(error instanceof Error ? error.message : t('recordingUploadFailed'));
    } finally {
      setIsUploadingRecording(false);
    }
  };

  useEffect(() => {
    if (!isRecording || !recordingAnalyserRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (recordingAnalyserRef.current) drawRecordingWaveform(recordingAnalyserRef.current);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (recordingAnimationRef.current !== null) {
        cancelAnimationFrame(recordingAnimationRef.current);
        recordingAnimationRef.current = null;
      }
    };
  }, [isRecording]);

  useEffect(() => () => {
    releaseMicrophone();
  }, []);

  const formatTime = (time: number) => {
    if (!Number.isFinite(time) || time <= 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const toggleAudio = (target: 'reference' | 'source') => {
    const audio = target === 'reference' ? referenceAudioRef.current : sourceAudioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, target: 'reference' | 'source') => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void uploadReferenceTrack(file, target);
      return;
    }
    const payload = e.dataTransfer.getData('application/x-ace-audio');
    if (payload) {
      try {
        const data = JSON.parse(payload);
        if (data?.url) {
          applyAudioTargetUrl(target, data.url, data.title);
        }
      } catch {
        // ignore
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleWorkspaceDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.files?.length || e.dataTransfer.types.includes('application/x-ace-audio')) {
      handleDrop(e, audioTab);
    }
  };

  const handleWorkspaceDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-ace-audio')) {
      e.preventDefault();
    }
  };

  const handleGenerate = () => {
    const normalizedLyrics = normalizeLyricsInput(lyrics);
    if (normalizedLyrics !== lyrics) {
      setLyrics(normalizedLyrics);
    }

    const styleWithGender = (() => {
      if (!vocalGender) return style;
      const genderHint = vocalGender === 'male' ? 'Male vocals' : 'Female vocals';
      const trimmed = style.trim();
      return trimmed ? `${trimmed}\n${genderHint}` : genderHint;
    })();
    const isRecordingSource = sourceAudioOrigin === 'recording';
    const recordingStyle = [recordingInstrument, style.trim()].filter(Boolean).join(', ');
    const submissionLyrics = customMode && !lyricsLockedForRecording ? normalizedLyrics : '';
    const submissionStyle = customMode ? (isRecordingSource ? recordingStyle : styleWithGender) : '';
    const submissionInstrumental = isRecordingSource ? true : instrumental;
    const effectiveTaskType: AceTaskType = isRecordingSource
      ? 'cover'
      : (customMode ? normalizedTaskType : 'text2music');
    const selectedCompleteClasses = completeTrackClasses.split(',').map(item => item.trim()).filter(Boolean);

    setGenerationValidationError(null);
    if (SOURCE_TASKS.has(effectiveTaskType) && !sourceAudioUrl.trim() && !audioCodes.trim()) {
      setGenerationValidationError(t('sourceAudioRequired'));
      return;
    }
    if (isRecordingSource && !recordingInstrument) {
      setGenerationValidationError(t('recordingInstrumentRequired'));
      return;
    }
    if (isRecordingSource && duration > 90) {
      setGenerationValidationError(t('recordingDurationLimit'));
      return;
    }
    if (BASE_ONLY_TASKS.has(effectiveTaskType) && !baseTaskModel) {
      setGenerationValidationError(t('baseModelRequired'));
      return;
    }
    if ((effectiveTaskType === 'lego' || effectiveTaskType === 'extract') && !trackName) {
      setGenerationValidationError(t('trackSelectionRequired'));
      return;
    }
    if (effectiveTaskType === 'complete' && selectedCompleteClasses.length === 0) {
      setGenerationValidationError(t('completeTracksRequired'));
      return;
    }

    const effectiveInstruction = looksLikeAutomaticInstruction(instruction)
      ? taskInstruction(effectiveTaskType, trackName, selectedCompleteClasses)
      : instruction;

    // Bulk generation: loop bulkCount times
    for (let i = 0; i < bulkCount; i++) {
      // Seed handling: first job uses user's seed, rest get random seeds
      let jobSeed = -1;
      if (!randomSeed && i === 0) {
        jobSeed = seed;
      } else if (!randomSeed && i > 0) {
        // Subsequent jobs get random seeds for variety
        jobSeed = Math.floor(Math.random() * 4294967295);
      }

      onGenerate({
        customMode,
        songDescription: customMode ? undefined : songDescription,
        prompt: submissionLyrics,
        lyrics: submissionLyrics,
        style: submissionStyle,
        title: bulkCount > 1 ? `${title} (${i + 1})` : title,
        ditModel: selectedModel,
        instrumental: submissionInstrumental,
        vocalLanguage,
        bpm,
        keyScale,
        timeSignature,
        duration,
        inferenceSteps,
        guidanceScale,
        batchSize,
        randomSeed: randomSeed || i > 0, // Force random for subsequent bulk jobs
        seed: jobSeed,
        thinking,
        enhance,
        audioFormat,
        inferMethod,
        lmBackend,
        lmModel,
        shift,
        lmTemperature,
        lmCfgScale,
        lmTopK,
        lmTopP,
        lmNegativePrompt,
        referenceAudioUrl: referenceAudioUrl.trim() || undefined,
        sourceAudioUrl: SOURCE_TASKS.has(effectiveTaskType) ? sourceAudioUrl.trim() || undefined : undefined,
        referenceAudioTitle: referenceAudioTitle.trim() || undefined,
        sourceAudioTitle: sourceAudioTitle.trim() || undefined,
        recordingInstrument: isRecordingSource ? recordingInstrument : undefined,
        audioCodes: audioCodes.trim() || undefined,
        repaintingStart: effectiveTaskType === 'repaint' || effectiveTaskType === 'lego' ? repaintingStart : undefined,
        repaintingEnd: effectiveTaskType === 'repaint' || effectiveTaskType === 'lego' ? repaintingEnd : undefined,
        instruction: effectiveInstruction,
        audioCoverStrength: effectiveTaskType === 'cover' || effectiveTaskType === 'complete' ? audioCoverStrength : undefined,
        taskType: effectiveTaskType,
        useAdg: isTurboModel(selectedModel) ? false : useAdg,
        cfgIntervalStart,
        cfgIntervalEnd,
        customTimesteps: customTimesteps.trim() || undefined,
        useCotMetas,
        useCotCaption,
        useCotLanguage,
        autogen,
        constrainedDecodingDebug,
        allowLmBatch,
        getScores,
        getLrc,
        scoreScale,
        lmBatchChunkSize,
        trackName: effectiveTaskType === 'lego' || effectiveTaskType === 'extract' ? trackName.trim() || undefined : undefined,
        completeTrackClasses: effectiveTaskType === 'complete' ? selectedCompleteClasses : undefined,
        isFormatCaption,
        loraLoaded,
        dcwEnabled,
        dcwMode,
        dcwScaler,
        dcwHighScaler,
        dcwWavelet,
        vaeModel: selectedVae,
      });
    }

    // Reset bulk count after generation
    if (bulkCount > 1) {
      setBulkCount(1);
    }
  };

  return (
    <div
      className="relative flex flex-col h-full bg-zinc-50 dark:bg-suno-panel w-full overflow-y-auto custom-scrollbar transition-colors duration-300"
      onDrop={handleWorkspaceDrop}
      onDragOver={handleWorkspaceDragOver}
    >
      {isDraggingFile && (
        <div className="absolute inset-0 z-[90] pointer-events-none">
          <div className="absolute inset-0 bg-white/70 dark:bg-black/50 backdrop-blur-sm" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/90 dark:bg-zinc-900/90 px-6 py-5 shadow-xl">
              {dragKind !== 'audio' && (
                <div className="w-12 h-12 rounded-full apex-accent-fill flex items-center justify-center shadow-lg">
                  <Upload size={22} />
                </div>
              )}
              <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                {dragKind === 'audio' ? t('dropToUseAudio') : t('dropToUpload')}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {dragKind === 'audio'
                  ? (audioTab === 'reference' ? t('usingAsReference') : t('usingAsCover'))
                  : (audioTab === 'reference' ? t('uploadingAsReference') : t('uploadingAsCover'))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="p-4 pt-14 md:pt-4 pb-24 lg:pb-32 space-y-5">
        <input
          ref={referenceInputRef}
          type="file"
          accept="audio/*"
          onChange={(e) => handleFileSelect(e, 'reference')}
          className="hidden"
        />
        <input
          ref={sourceInputRef}
          type="file"
          accept="audio/*"
          onChange={(e) => handleFileSelect(e, 'source')}
          className="hidden"
        />
        <audio
          ref={referenceAudioRef}
          src={referenceAudioUrl || undefined}
          onPlay={() => setReferencePlaying(true)}
          onPause={() => setReferencePlaying(false)}
          onEnded={() => setReferencePlaying(false)}
          onTimeUpdate={(e) => setReferenceTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setReferenceDuration(e.currentTarget.duration || 0)}
        />
        <audio
          ref={sourceAudioRef}
          src={sourceAudioUrl || undefined}
          onPlay={() => setSourcePlaying(true)}
          onPause={() => setSourcePlaying(false)}
          onEnded={() => setSourcePlaying(false)}
          onTimeUpdate={(e) => setSourceTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setSourceDuration(e.currentTarget.duration || 0)}
        />

        {/* Header - Mode Toggle & Model Selection */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
           
            <span className="hidden sm:inline text-xs font-semilight tracking-wide">{t('createcenter')}</span>
          </div>

          <div className="justify-self-center">
            {/* Mode Toggle */}
            <div className="flex items-center bg-zinc-200 dark:bg-black/40 rounded-lg p-1 border border-zinc-300 dark:border-white/5">
              <button
                onClick={switchToSimpleMode}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${!customMode ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}
              >
                {t('simple')}
              </button>
              <button
                onClick={() => setCustomMode(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${customMode ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}
              >
                {t('custom')}
              </button>
            </div>

            {/* Model Selection */}
          </div>

          <div className="justify-self-end">
            <div className="relative" ref={modelMenuRef}>
              <button
                onClick={() => setShowModelMenu(!showModelMenu)}
                className="bg-zinc-200 dark:bg-black/40 border border-zinc-300 dark:border-white/5 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-900 dark:text-white hover:bg-zinc-300 dark:hover:bg-black/50 transition-colors flex items-center gap-1"
                disabled={availableModels.length === 0}
              >
                {availableModels.length === 0 ? '...' : getModelDisplayName(selectedModel)}
                <ChevronDown size={10} className="text-zinc-600 dark:text-zinc-400" />
              </button>
              
              {/* Floating Model Menu */}
              {showModelMenu && availableModels.length > 0 && (
                <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="max-h-96 overflow-y-auto custom-scrollbar">
                    {availableModels.map(model => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedModel(model.id);
                          localStorage.setItem('ace-model', model.id);
                          // Keep the visible step control aligned with the selected model family.
                          if (isTurboModel(model.id)) {
                            setInferenceSteps(8);
                            setUseAdg(false);
                          } else if (isPureBaseModel(model.id)) {
                            setInferenceSteps(32);
                            setUseAdg(true);
                          } else {
                            setInferenceSteps(50);
                            setUseAdg(true);
                          }
                          if (!isPureBaseModel(model.id) && BASE_ONLY_TASKS.has(normalizedTaskType)) {
                            changeTaskType('cover');
                          }
                          setDcwEnabled(!shouldDefaultDcwOff(model.id));
                          setShowModelMenu(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 ${
                          selectedModel === model.id ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                              {getModelDisplayName(model.id)}
                            </span>
                            {fetchedModels.find(m => m.name === model.id)?.is_preloaded && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                {fetchedModels.find(m => m.name === model.id)?.is_active ? '● Active' : '● Ready'}
                              </span>
                            )}
                          </div>
                          {selectedModel === model.id && (
                            <div className="w-4 h-4 rounded-full bg-[#8fb68f] flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{model.id}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

           
            
          </div>
          
        </div>
        {/* VAE Selection*/}
        <div className='flex item-center justify-between'>
          <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">VAE Select</label>
          <div className="relative" ref={vaeMenuRef}>
            <button
              type="button"
              onClick={() => setShowVaeMenu(!showVaeMenu)}
              className="bg-zinc-200 dark:bg-black/40 border border-zinc-300 dark:border-white/5 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-900 dark:text-white hover:bg-zinc-300 dark:hover:bg-black/50 transition-colors flex items-center gap-1"
              disabled={availableVaeModels.length === 0}
            >
              {availableVaeModels.length === 0 ? '...' : (selectedVae === 'official' ? 'official' : selectedVae)}
              <ChevronDown size={10} className="text-zinc-600 dark:text-zinc-400" />
            </button>
            {/* Floating VAE Menu */}
            {showVaeMenu && availableVaeModels.length > 0 && (
              <div className="absolute top-full right-0 mt-1 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {availableVaeModels.map(vae => (
                    <button
                      key={vae.id}
                      type="button"
                      onClick={() => {
                        setSelectedVae(vae.id);
                        localStorage.setItem('ace-vae', vae.id);
                        setShowVaeMenu(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 ${
                        selectedVae === vae.id ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                          {vae.id === 'official' ? 'official' : vae.name}
                        </span>
                        {vae.is_preloaded ? (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            Ready
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            Download
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* SIMPLE MODE */}
        {!customMode && (
          <div className="space-y-5">
            {/* Song Description */}
            <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden">
              <div className="px-3 py-2.5 flex items-center justify-between border-b border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/5">
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {t('describeYourSong')}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleLoadRandomExample('simple')}
                    disabled={isLoadingRandomExample}
                    title={t('loadRandomDescription')}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
                  >
                    {isLoadingRandomExample ? <Loader2 size={14} className="animate-spin" /> : <Dices size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSongDescription('')}
                    title={t('clearDescription')}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <textarea
                value={songDescription}
                onChange={(e) => handleSongDescriptionChange(e.target.value)}
                placeholder={t('songDescriptionPlaceholder')}
                className="w-full h-32 bg-transparent p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none resize-none"
              />
            </div>

            {/* Vocal Language (Simple) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">
                  {t('vocalLanguage')}
                </label>
                <select
                  value={vocalLanguage}
                  onChange={(e) => setVocalLanguage(e.target.value)}
                  className="w-full bg-white dark:bg-suno-card border border-zinc-200 dark:border-white/5 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-[#8fb68f] dark:focus:border-[#8fb68f] transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                >
                  {VOCAL_LANGUAGE_KEYS.map(lang => (
                    <option key={lang.value} value={lang.value}>{t(lang.key)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">
                  {t('vocalGender')}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVocalGender(vocalGender === 'male' ? '' : 'male')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${vocalGender === 'male' ? 'bg-[#8fb68f] text-[#132018] border-[#8fb68f]' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'}`}
                  >
                    {t('male')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVocalGender(vocalGender === 'female' ? '' : 'female')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${vocalGender === 'female' ? 'bg-[#8fb68f] text-[#132018] border-[#8fb68f]' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'}`}
                  >
                    {t('female')}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Settings (Simple Mode) */}
            <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide flex items-center gap-2">
                <Sliders size={14} />
                {t('quickSettings')}
              </h3>

              {/* Duration */}
              <EditableSlider
                label={t('duration')}
                value={duration}
                min={-1}
                max={activeMaxDuration}
                step={5}
                onChange={setDuration}
                formatDisplay={(val) => val === -1 ? t('auto') : `${val}${t('seconds')}`}
                title={''}
                autoLabel={t('auto')}
                helpText={sourceAudioOrigin === 'recording' ? t('recordingDurationHelp') : undefined}
              />

              {/* BPM */}
              <EditableSlider
                label={t('bpm')}
                value={bpm}
                min={0}
                max={300}
                step={5}
                onChange={setBpm}
                formatDisplay={(val) => val === 0 ? t('auto') : val.toString()}
                autoLabel={t('auto')}
              />

              {/* Key & Time Signature */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('key')}</label>
                  <select
                    value={keyScale}
                    onChange={(e) => setKeyScale(e.target.value)}
                    className={selectClassName}
                  >
                    <option value="">{t('auto')}</option>
                    {KEY_SIGNATURES.filter(k => k).map(key => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('time')}</label>
                  <select
                    value={timeSignature}
                    onChange={(e) => setTimeSignature(e.target.value)}
                    className={selectClassName}
                  >
                    <option value="">{t('auto')}</option>
                    {TIME_SIGNATURES.filter(t => t).map(time => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Variations */}
              <EditableSlider
                label={t('variations')}
                value={batchSize}
                min={1}
                max={4}
                step={1}
                onChange={setBatchSize}
              />
              <div style={{display: 'none'}}>
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="1"
                  value={batchSize}
                  onChange={setBatchSize}
                  className="create-panel-slider w-full h-2 cursor-pointer"
                  style={{ ['--slider-percent' as string]: `${((batchSize - 1) / 3) * 100}%` }}
                />
                <p className="text-[10px] text-zinc-500">{t('numberOfVariations')}</p>
              </div>
            </div>
          </div>
        )}

        {/* CUSTOM MODE */}
        {customMode && (
          <div className="space-y-5">
            {/* Audio Section */}
            <div
              onDrop={(e) => handleDrop(e, audioTab)}
              onDragOver={handleDragOver}
              className="bg-white dark:bg-[#1a1a1f] rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden"
            >
              {/* Header with Audio label and tabs */}
              <div className="px-3 py-2.5 border-b border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t('audio')}</span>
                  <div className="flex items-center gap-1 bg-zinc-200/50 dark:bg-black/30 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAudioTab('reference');
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        audioTab === 'reference'
                          ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                      }`}
                    >
                      {t('reference')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAudioTab('source');
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        audioTab === 'source'
                          ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                      }`}
                    >
                      {normalizedTaskType === 'text2music' ? t('cover') : getTaskLabel(normalizedTaskType)}
                    </button>
                  </div>
                </div>
              </div>

              {/* Audio Content */}
              <div className="p-3 space-y-2">
                {/* Reference Audio Player */}
                {audioTab === 'reference' && referenceAudioUrl && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-white/[0.03] border border-zinc-100 dark:border-white/5">
                      <button
                        type="button"
                        onClick={() => toggleAudio('reference')}
                        className="relative flex-shrink-0 w-10 h-10 rounded-full apex-accent-fill flex items-center justify-center shadow-lg shadow-[#8fb68f]/20 hover:scale-105 transition-all"
                      >
                        {referencePlaying ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                        ) : (
                          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        )}
                        <span className="absolute -bottom-1 -right-1 text-[8px] font-bold bg-zinc-900 text-white px-1 py-0.5 rounded">
                          {formatTime(referenceDuration)}
                        </span>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate mb-1.5">
                          {referenceAudioTitle || getAudioLabel(referenceAudioUrl)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(referenceTime)}</span>
                          <div
                            className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 cursor-pointer group/seek"
                            onClick={(e) => {
                              if (referenceAudioRef.current && referenceDuration > 0) {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const percent = (e.clientX - rect.left) / rect.width;
                                referenceAudioRef.current.currentTime = percent * referenceDuration;
                              }
                            }}
                          >
                            <div
                              className="h-full apex-accent-fill rounded-full transition-all relative"
                              style={{ width: referenceDuration ? `${Math.min(100, (referenceTime / referenceDuration) * 100)}%` : '0%' }}
                            >
                              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
                            </div>
                          </div>
                          <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(referenceDuration)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setReferenceAudioUrl(''); setReferenceAudioTitle(''); setReferencePlaying(false); setReferenceTime(0); setReferenceDuration(0); }}
                        className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                    <p className="px-1 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                      {t('referenceAudioHelp')}
                    </p>
                  </div>
                )}

                {/* Source/Cover Audio Player */}
                {audioTab === 'source' && sourceAudioUrl && (
                  <div className="space-y-1.5">
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-white/[0.03] border border-zinc-100 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => toggleAudio('source')}
                      className="relative flex-shrink-0 w-10 h-10 rounded-full apex-accent-fill-strong flex items-center justify-center shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all"
                    >
                      {sourcePlaying ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                      ) : (
                        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      )}
                      <span className="absolute -bottom-1 -right-1 text-[8px] font-bold bg-zinc-900 text-white px-1 py-0.5 rounded">
                        {formatTime(sourceDuration)}
                      </span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate mb-1.5">
                        {sourceAudioTitle || getAudioLabel(sourceAudioUrl)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(sourceTime)}</span>
                        <div
                          className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 cursor-pointer group/seek"
                          onClick={(e) => {
                            if (sourceAudioRef.current && sourceDuration > 0) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const percent = (e.clientX - rect.left) / rect.width;
                              sourceAudioRef.current.currentTime = percent * sourceDuration;
                            }
                          }}
                        >
                          <div
                            className="h-full apex-accent-fill-strong rounded-full transition-all relative"
                            style={{ width: sourceDuration ? `${Math.min(100, (sourceTime / sourceDuration) * 100)}%` : '0%' }}
                          >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(sourceDuration)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearSourceAudio}
                      className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                    {sourceAudioOrigin === 'recording' ? (
                      <div className="px-1 pt-1 space-y-1.5">
                        <label className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                          {t('targetInstrument')}
                        </label>
                        <select
                          value={recordingInstrument}
                          onChange={(event) => {
                            setRecordingInstrument(event.target.value);
                            setGenerationValidationError(null);
                          }}
                          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:outline-none dark:border-white/10 dark:bg-black/20 dark:text-white"
                        >
                          <option value="">{t('selectInstrument')}</option>
                          {RECORDING_INSTRUMENTS.map((instrument) => (
                            <option key={instrument.value} value={instrument.value}>
                              {t(instrument.key)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="px-1 pt-1 space-y-1.5">
                        <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">{t('useSourceAs')}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {availableSourceTasks.map((sourceTask) => {
                            const isActive = normalizedTaskType === sourceTask;
                            return (
                              <button
                                key={sourceTask}
                                type="button"
                                onClick={() => changeTaskType(isActive ? 'cover' : sourceTask)}
                                className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
                                  isActive
                                    ? 'border-[#8fb68f] bg-[#8fb68f]/20 text-zinc-900 dark:text-[#b9d4b9]'
                                    : 'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] text-zinc-500 dark:text-zinc-400 hover:border-[#8fb68f]/60'
                                }`}
                              >
                                {getTaskLabel(sourceTask)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <p className="px-1 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                      {sourceAudioOrigin === 'recording' ? t('recordingInstrumentHelp') : getSourceHelp()}
                    </p>
                  </div>
                )}

                {audioTab === 'source' && (isRequestingMicrophone || isRecording || isUploadingRecording || recordingError) && (
                  <div className={`rounded-lg border px-3 py-2.5 ${
                    recordingError
                      ? 'border-amber-300/60 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/5'
                      : 'border-[#8fb68f]/40 bg-[#8fb68f]/10'
                  }`}>
                    {isRecording && (
                      <div className="flex items-center gap-3">
                        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-500" />
                        <canvas ref={recordingCanvasRef} className="h-10 min-w-0 flex-1" />
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
                          {formatTime(recordingElapsed)}
                        </span>
                      </div>
                    )}
                    {isRequestingMicrophone && (
                      <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                        <Loader2 size={14} className="animate-spin" />
                        <span>{t('preparingMicrophone')}</span>
                      </div>
                    )}
                    {isUploadingRecording && (
                      <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                        <Loader2 size={14} className="animate-spin" />
                        <span>{t('uploadingRecording')}</span>
                      </div>
                    )}
                    {recordingError && (
                      <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">{recordingError}</p>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openAudioModal(audioTab, 'uploads')}
                    disabled={isRecording || isRequestingMicrophone || isUploadingRecording}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 px-3 py-2 text-xs font-medium transition-colors border border-zinc-200 dark:border-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
                    </svg>
                    {t('fromLibrary')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const input = audioTab === 'reference' ? referenceInputRef.current : sourceInputRef.current;
                      input?.click();
                    }}
                    disabled={isRecording || isRequestingMicrophone || isUploadingRecording}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 px-3 py-2 text-xs font-medium transition-colors border border-zinc-200 dark:border-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                    </svg>
                    {t('upload')}
                  </button>
                  {audioTab === 'source' && canRecordAudio && (
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : () => void startRecording()}
                      disabled={isRequestingMicrophone || isUploadingRecording}
                      className={`shrink-0 flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        isRecording
                          ? 'border-rose-400/50 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-300'
                          : 'border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:border-white/5 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10'
                      }`}
                    >
                      {isRecording ? <Square size={13} fill="currentColor" /> : <Mic size={14} />}
                      <span>{isRecording ? t('stopRecording') : t('record')}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Lyrics Input */}
            <div
              ref={lyricsRef}
              className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden transition-colors group focus-within:border-zinc-400 dark:focus-within:border-white/20 relative flex flex-col"
              style={{ height: 'auto' }}
            >
              <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-50 dark:bg-white/5 border-b border-zinc-100 dark:border-white/5 flex-shrink-0">
                <div>
                  <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t('lyrics')}</span>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                    {lyricsLockedForRecording ? t('recordingLyricsLockedTitle') : t('leaveLyricsEmpty')}
                  </p>
                </div>
                {!lyricsLockedForRecording && <div className="flex items-center gap-2">
                  <button
                    className={`p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded transition-colors ${isLoadingRandomExample ? 'text-[#8fb68f]' : 'text-zinc-500 hover:text-black dark:hover:text-white'}`}
                    title={t('loadRandomTextToMusicExample')}
                    onClick={() => handleLoadRandomExample('custom')}
                    disabled={isLoadingRandomExample || isFormattingLyrics}
                  >
                    {isLoadingRandomExample ? <Loader2 size={14} className="animate-spin" /> : <Dices size={14} />}
                  </button>
                  <button
                    onClick={() => setInstrumental(!instrumental)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
                      instrumental
                        ? 'bg-[#8fb68f] text-[#132018] border-[#8fb68f] whitespace-nowrap shrink-0 inline-flex'
                        : 'bg-white dark:bg-suno-card border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 whitespace-nowrap shrink-0 inline-flex'
                    }`}
                  >
                    {instrumental ? t('instrumental') : t('vocal')}
                  </button>
                  <button
                    className={`p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded transition-colors ${isFormattingLyrics ? 'text-[#8fb68f]' : 'text-zinc-500 hover:text-black dark:hover:text-white'}`}
                    title={t('aiFormatEnhanceTooltip')}
                    onClick={() => handleFormat('lyrics')}
                    disabled={isFormattingLyrics || !style.trim()}
                  >
                    {isFormattingLyrics ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  </button>
                  <button
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
                    onClick={() => handleLyricsChange('')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>}
              </div>
              {lyricsLockedForRecording ? (
                <div className="flex flex-col items-start gap-3 px-3 py-4">
                  <div className="flex items-start gap-2.5 text-zinc-600 dark:text-zinc-300">
                    <Mic size={16} className="mt-0.5 shrink-0 text-[#8fb68f]" />
                    <p className="text-xs leading-relaxed">{t('recordingLyricsLockedHelp')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRecordingLyricsOverride(true)}
                    className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:bg-white/[0.07]"
                  >
                    {t('useLyricsAnyway')}
                  </button>
                </div>
              ) : (
                <>
                  <textarea
                    disabled={instrumental || isFormattingLyrics}
                    value={lyrics}
                    onChange={(e) => handleLyricsChange(e.target.value)}
                    placeholder={instrumental ? t('instrumentalModePlaceholder') : t('lyricsPlaceholder')}
                    className={`w-full bg-transparent p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none resize-none font-mono leading-relaxed ${instrumental ? 'opacity-30 cursor-not-allowed' : ''} ${isFormattingLyrics ? 'cursor-not-allowed' : ''}`}
                    style={{ height: `${lyricsHeight}px` }}
                  />
                  <div
                    onMouseDown={startResizing}
                    className="h-3 w-full cursor-ns-resize flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors absolute bottom-0 left-0 z-10"
                  >
                    <div className="w-8 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>
                  </div>
                </>
              )}
              {!lyricsLockedForRecording && isFormattingLyrics && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/65 dark:bg-black/55 backdrop-blur-[2px]">
                  <div className="flex items-center gap-2 rounded-full border border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 px-4 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-200 shadow-lg">
                    <Loader2 size={14} className="animate-spin text-[#8fb68f]" />
                    <span>Thinking...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Style Input */}
            <div className="relative bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden transition-colors group focus-within:border-zinc-400 dark:focus-within:border-white/20">
              <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-50 dark:bg-white/5 border-b border-zinc-100 dark:border-white/5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t('styleOfMusic')}</span>
                    <button
                      onClick={() => setEnhance(!enhance)}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${enhance ? 'bg-[#9bb89d]/20 text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                      title={t('enhanceTooltip')}
                    >
                      <Sparkles size={9} />
                      <span>{enhance ? t('on') : t('off')}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{t('genreMoodInstruments')}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded transition-colors text-zinc-500 hover:text-black dark:hover:text-white"
                    title={t('refreshGenres')}
                    onClick={refreshMusicTags}
                    disabled={isLoadingRandomExample || isFormattingStyle}
                  >
                    <Dices size={14} />
                  </button>
                  <button
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
                    onClick={() => handleStyleChange('')}
                    disabled={isFormattingStyle}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    className={`p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded transition-colors ${isFormattingStyle ? 'text-[#8fb68f]' : 'text-zinc-500 hover:text-black dark:hover:text-white'}`}
                    title={t('aiFormatEnhanceTooltip')}
                    onClick={() => handleFormat('style')}
                    disabled={isFormattingStyle || !style.trim()}
                  >
                    {isFormattingStyle ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  </button>
                </div>
              </div>
              <textarea
                value={style}
                onChange={(e) => handleStyleChange(e.target.value)}
                disabled={isFormattingStyle}
                placeholder={t('stylePlaceholder')}
                className={`w-full h-20 bg-transparent p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none resize-none ${isFormattingStyle ? 'cursor-not-allowed' : ''}`}
              />
              <div className="px-3 pb-3 space-y-3">
                {/* Quick Tags */}
                <div className="flex flex-wrap gap-2">
                  {musicTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => handleStyleChange(style ? `${style}, ${tag}` : tag)}
                      disabled={isFormattingStyle}
                      className="text-[10px] font-medium bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white px-2.5 py-1 rounded-full transition-colors border border-zinc-200 dark:border-white/5"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
              {isFormattingStyle && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/65 dark:bg-black/55 backdrop-blur-[2px]">
                  <div className="flex items-center gap-2 rounded-full border border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 px-4 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-200 shadow-lg">
                    <Loader2 size={14} className="animate-spin text-[#8fb68f]" />
                    <span>Thinking...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Title Input */}
            <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden">
              <div className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/5">
                {t('title')}
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('nameSong')}
                className="w-full bg-transparent p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* COMMON SETTINGS */}
        <div className="space-y-4">
          {/* Instrumental Toggle (Simple Mode) */}
          {!customMode && (
            <div className="flex items-center justify-between px-1 py-2">
              <div className="flex items-center gap-2">
                <Music2 size={14} className="text-zinc-500" />
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('instrumental')}</span>
              </div>
              <button
                onClick={() => setInstrumental(!instrumental)}
                className={`w-11 h-6 rounded-full flex items-center transition-colors duration-200 px-1 border border-zinc-200 dark:border-white/5 ${instrumental ? 'bg-[#8fb68f]' : 'bg-zinc-300 dark:bg-black/40'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transform transition-transform duration-200 shadow-sm ${instrumental ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          )}

          {/* Vocal Language (Custom mode) */}
          {customMode && !instrumental && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">
                  {t('vocalLanguage')}
                </label>
                <select
                  value={vocalLanguage}
                  onChange={(e) => setVocalLanguage(e.target.value)}
                  className="w-full bg-white dark:bg-suno-card border border-zinc-200 dark:border-white/5 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-[#8fb68f] dark:focus:border-[#8fb68f] transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                >
                  {VOCAL_LANGUAGE_KEYS.map(lang => (
                    <option key={lang.value} value={lang.value}>{t(lang.key)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">
                  {t('vocalGender')}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVocalGender(vocalGender === 'male' ? '' : 'male')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${vocalGender === 'male' ? 'bg-[#8fb68f] text-[#132018] border-[#8fb68f]' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'}`}
                  >
                    {t('male')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVocalGender(vocalGender === 'female' ? '' : 'female')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${vocalGender === 'female' ? 'bg-[#8fb68f] text-[#132018] border-[#8fb68f]' : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'}`}
                  >
                    {t('female')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* LORA CONTROL PANEL */}
        {customMode && (
          <>
            <button
              onClick={() => setShowLoraPanel(!showLoraPanel)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-zinc-500" />
                <span>LoRA</span>
              </div>
              <ChevronDown size={16} className={`text-zinc-500 transition-transform ${showLoraPanel ? 'rotate-180' : ''}`} />
            </button>

            {showLoraPanel && (
              <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">
                {/* LoRA Path Input */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('loraPath')}</label>
                  <input
                    type="text"
                    value={loraPath}
                    onChange={(e) => setLoraPath(e.target.value)}
                    placeholder={t('loraPathPlaceholder')}
                    className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-[#8fb68f] dark:focus:border-[#8fb68f] transition-colors"
                  />
                </div>

                {/* LoRA Load/Unload Toggle */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 border-t border-zinc-100 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        loraLoaded ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                      }`}></div>
                      <span className={`text-xs font-medium ${
                        loraLoaded ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {loraLoaded ? t('loraLoaded') : t('loraUnloaded')}
                      </span>
                    </div>
                    <button
                      onClick={handleLoraToggle}
                      disabled={!loraPath.trim() || isLoraLoading}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        loraLoaded
                        ? 'apex-accent-fill-strong shadow-lg shadow-green-500/20'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {isLoraLoading ? '...' : (loraLoaded ? t('loraUnload') : t('loraLoad'))}
                    </button>
                  </div>
                  {loraError && (
                    <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                      {loraError}
                    </div>
                  )}
                </div>

                {/* Use LoRA Checkbox (enable/disable without unloading) */}
                <div className={`flex items-center justify-between py-2 border-t border-zinc-100 dark:border-white/5 ${!loraLoaded ? 'opacity-40 pointer-events-none' : ''}`}>
                  <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={loraEnabled}
                      onChange={handleLoraEnabledToggle}
                      disabled={!loraLoaded}
                      className={checkboxClassName}
                    />
                    Use LoRA
                  </label>
                </div>

                {/* LoRA Scale Slider */}
                <div className={!loraLoaded || !loraEnabled ? 'opacity-40 pointer-events-none' : ''}>
                  <EditableSlider
                    label={t('loraScale')}
                    value={loraScale}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={handleLoraScaleChange}
                    formatDisplay={(val) => val.toFixed(2)}
                    helpText={t('loraScaleDescription')}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* MUSIC PARAMETERS */}
        <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">
          <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide flex items-center gap-2">
            <Sliders size={14} />
            {t('musicParameters')}
          </h3>

          {/* BPM */}
          <EditableSlider
            label={t('bpm')}
            value={bpm}
            min={0}
            max={300}
            step={5}
            onChange={setBpm}
            formatDisplay={(val) => val === 0 ? t('auto') : val.toString()}
            autoLabel={t('auto')}
          />

          {/* Key & Time Signature */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Key</label>
              <select
                value={keyScale}
                onChange={(e) => setKeyScale(e.target.value)}
                className={selectClassName}
              >
                <option value="">Auto</option>
                {KEY_SIGNATURES.filter(k => k).map(key => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Time</label>
              <select
                value={timeSignature}
                onChange={(e) => setTimeSignature(e.target.value)}
                className={selectClassName}
              >
                <option value="">Auto</option>
                {TIME_SIGNATURES.filter(t => t).map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ADVANCED SETTINGS */}
        {customMode && (
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings2 size={16} className="text-zinc-500" />
              <span>{t('advancedSettings')}</span>
            </div>
            <ChevronDown size={16} className={`text-zinc-500 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>
        )}

        {customMode && showAdvanced && (
          <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">
            {/* Load Parameters from JSON */}
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-zinc-300 dark:border-white/15 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer transition-colors">
              <Upload size={14} />
              Load Parameters (JSON)
              <input
                type="file"
                accept=".json"
                onChange={handleLoadParamsFile}
                className="hidden"
              />
            </label>

            {/* Duration */}
            <EditableSlider
              label={t('duration')}
              value={duration}
              min={-1}
              max={activeMaxDuration}
              step={5}
              onChange={setDuration}
              formatDisplay={(val) => val === -1 ? t('auto') : `${val}${t('seconds')}`}
              autoLabel={t('auto')}
              helpText={sourceAudioOrigin === 'recording'
                ? t('recordingDurationHelp')
                : `${t('auto')} - 10 ${t('min')}`}
            />

            {/* Batch Size */}
            <EditableSlider
              label={t('batchSize')}
              value={batchSize}
              min={1}
              max={4}
              step={1}
              onChange={setBatchSize}
              helpText={t('numberOfVariations')}
              title={t('multipleVariationsTooltip')}
            />

            {/* Bulk Generate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('bulkGenerate')}</label>
                <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">
                  {bulkCount} {t(bulkCount === 1 ? 'job' : 'jobs')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 5, 10].map((count) => (
                  <button
                    key={count}
                    onClick={() => { setBulkCount(count); localStorage.setItem('ace-bulkCount', String(count)); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                      bulkCount === count
                        ? 'apex-accent-fill shadow-md'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500">{t('queueMultipleJobs')}</p>
            </div>

            {/* Inference Steps */}
            <EditableSlider
              label={t('inferenceSteps')}
              value={inferenceSteps}
              min={1}
              max={isTurboModel(selectedModel) ? 20 : 200}
              step={1}
              onChange={setInferenceSteps}
              helpText={t('moreStepsBetterQuality')}
              title={t('inferenceStepsTooltip')}
            />

            {/* Turbo variants do not use CFG guidance controls. */}
            {!isTurboModel(selectedModel) && (
              <EditableSlider
                label={t('guidanceScale')}
                value={guidanceScale}
                min={1}
                max={15}
                step={0.1}
                onChange={setGuidanceScale}
                formatDisplay={(val) => val.toFixed(1)}
                helpText={t('howCloselyFollowPrompt')}
                title={t('guidanceScaleTooltip')}
              />
            )}
            {/* DCW Settings Section */}
            <div className="grid space-y-1.5">
              {/* <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
               
              </h4> */}
              <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title={t('enableDcwTooltip')}>
                    {t('dcwSettings')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDcwEnabled(!dcwEnabled)}
                    className={`w-10 h-5 rounded-full flex items-center transition-colors duration-200 px-0.5 border border-zinc-200 dark:border-white/5 ${dcwEnabled ? 'bg-[#8fb68f]' : 'bg-zinc-300 dark:bg-black/40'} cursor-pointer`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transform transition-transform duration-200 shadow-sm ${dcwEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
              </div>
              {!dcwEnabled && shouldDefaultDcwOff(selectedModel) && (
                <p className="text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-500">
                  {t('dcwDefaultOffHint')}
                </p>
              )}
              
              {dcwEnabled && (
                <div className="space-y-3">
                  <div className='grid grid-cols-2 gap-3'>
                    <div className="space-y-1.5">
                      <div className="space-y-1">
                        <label
                          className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400"
                          title={t('dcwWaveletTooltip')}
                        >
                          {t('dcwWaveletBase')}
                        </label>
                        <select
                          value={dcwWavelet}
                          onChange={(e) => setDcwWavelet(e.target.value)}
                          className={selectClassName}
                        >
                          <option value="haar">Haar</option>
                          <option value="db2">DB2</option>
                          <option value="db4">DB4</option>
                          <option value="sym4">Sym4</option>
                          <option value="sym8">Sym8</option>
                          <option value="coif2">Coif2</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="space-y-1">
                          <label
                            className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 "
                            title={t('dcwModeTooltip')}
                          >
                            {t('dcwMode')}
                          </label>
                          <select
                            value={dcwMode}
                            onChange={(e) => setDcwMode(e.target.value)}
                            className={selectClassName}
                          >
                            <option value="low">{t('dcwModeLow')}</option>
                            <option value="double">{t('dcwModeDouble')}</option>
                            <option value="high">{t('dcwModeHigh')}</option>
                            <option value="pix">{t('dcwModePix')}</option>
                            <option value="none">{t('none')}</option>
                          </select>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                      <span
                        className=""
                        title={t('dcwScalerTooltip')}
                      >
                        {t('dcwScaler')}
                      </span>
                      <span>{dcwScaler}</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.01"
                      value={dcwScaler}
                      onChange={(e) => setDcwScaler(parseFloat(e.target.value))}
                      className="create-panel-slider-thin w-full h-1 cursor-pointer"
                      style={{ ['--slider-percent' as string]: `${dcwScaler * 100}%` }}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                      <span
                        className=""
                        title={t('dcwHighScalerTooltip')}
                      >
                        {t('dcwHighScaler')}
                      </span>
                      <span>{dcwHighScaler}</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.01"
                      value={dcwHighScaler}
                      onChange={(e) => setDcwHighScaler(parseFloat(e.target.value))}
                      className="create-panel-slider-thin w-full h-1 cursor-pointer"
                      style={{ ['--slider-percent' as string]: `${dcwHighScaler * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            {/* Audio Format & Inference Method */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('audioFormat')}</label>
                <select
                  value={audioFormat}
                  onChange={(e) => setAudioFormat(e.target.value as 'mp3' | 'flac')}
                  className={selectClassName}
                >
                  <option value="mp3">{t('mp3Smaller')}</option>
                  <option value="flac">{t('flacLossless')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title={t('inferMethodTooltip')}>{t('inferMethod')}</label>
                <select
                  value={inferMethod}
                  onChange={(e) => setInferMethod(e.target.value as 'ode' | 'sde')}
                  className={selectClassName}
                >
                  <option value="ode">{t('odeDeterministic')}</option>
                  <option value="sde">{t('sdeStochastic')}</option>
                </select>
              </div>
            </div>

            {/* LM Backend */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('lmBackendLabel')}</label>
              <select
                value={lmBackend}
                onChange={(e) => setLmBackend(e.target.value as 'pt' | 'vllm')}
                className={selectClassName}
              >
                <option value="pt">{t('lmBackendPt')}</option>
                <option value="vllm">{t('lmBackendVllm')}</option>
              </select>
              <p className="text-[10px] text-zinc-500">{t('lmBackendHint')}</p>
            </div>

            {/* LM Model */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('lmModelLabel')}</label>
              <select
                value={lmModel}
                onChange={(e) => { const v = e.target.value; setLmModel(v); localStorage.setItem('ace-lmModel', v); }}
                className={selectClassName}
              >
                <option value="acestep-5Hz-lm-0.6B">{getLmModelOptionLabel('acestep-5Hz-lm-0.6B')}</option>
                <option value="acestep-5Hz-lm-1.7B">{getLmModelOptionLabel('acestep-5Hz-lm-1.7B')}</option>
                <option value="acestep-5Hz-lm-4B">{getLmModelOptionLabel('acestep-5Hz-lm-4B')}</option>
              </select>
              <p className="text-[10px] text-zinc-500">
                {gpuMemoryGb === null
                  ? 'Choose smaller models for lower VRAM GPUs. Risk hints appear when GPU memory is detected.'
                  : `Detected GPU memory: ${gpuMemoryGb}GB. Risk hints are advisory; you can still choose any model.`}
              </p>
            </div>

            {/* Seed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Dices size={14} className="text-zinc-500" />
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title={t('seedTooltip')}>{t('seed')}</span>
                </div>
                <button
                  onClick={() => setRandomSeed(!randomSeed)}
                  className={`w-10 h-5 rounded-full flex items-center transition-colors duration-200 px-0.5 border border-zinc-200 dark:border-white/5 ${randomSeed ? 'bg-[#8fb68f]' : 'bg-zinc-300 dark:bg-black/40'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transform transition-transform duration-200 shadow-sm ${randomSeed ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Hash size={14} className="text-zinc-500" />
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                  placeholder={t('enterFixedSeed')}
                  disabled={randomSeed}
                  className={`flex-1 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none ${randomSeed ? 'opacity-40 cursor-not-allowed' : ''}`}
                />
              </div>
              <p className="text-[10px] text-zinc-500">{randomSeed ? t('randomSeedRecommended') : t('fixedSeedReproducible')}</p>
            </div>

            {/* Thinking Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-zinc-100 dark:border-white/5">
              <span className={`text-xs font-medium ${loraLoaded ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-600 dark:text-zinc-400'}`} title={t('thinkingCotTooltip')}>{t('thinkingCot')}</span>
              <button
                onClick={() => !loraLoaded && setThinking(!thinking)}
                disabled={loraLoaded}
                className={`w-10 h-5 rounded-full flex items-center transition-colors duration-200 px-0.5 border border-zinc-200 dark:border-white/5 ${thinking ? 'bg-[#8fb68f]' : 'bg-zinc-300 dark:bg-black/40'} ${loraLoaded ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transform transition-transform duration-200 shadow-sm ${thinking ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Shift */}
            <EditableSlider
              label={t('shift')}
              value={shift}
              min={1}
              max={5}
              step={0.1}
              onChange={setShift}
              formatDisplay={(val) => val.toFixed(1)}
              helpText={t('timestepShiftForBase')}
              title="Adjusts the diffusion schedule. Only affects base model."
            />

            {/* Divider */}
            <div className="border-t border-zinc-200 dark:border-white/10 pt-4">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-bold mb-3">{t('expertControls')}</p>
            </div>

            {uploadError && (
              <div className="text-[11px] text-rose-500">{uploadError}</div>
            )}

            {/* LM Parameters */}
            <button
              onClick={() => setShowLmParams(!showLmParams)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/60 dark:bg-black/20 rounded-xl border border-zinc-200/70 dark:border-white/10 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Music2 size={16} className="text-zinc-500" />
                <div className="flex flex-col items-start">
                  <span title={t('lmParametersTooltip')}>{t('lmParameters')}</span>
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-normal">{t('controlLyricGeneration')}</span>
                </div>
              </div>
              <ChevronDown size={16} className={`text-zinc-500 transition-transform ${showLmParams ? 'rotate-180' : ''}`} />
            </button>

            {showLmParams && (
              <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">
                {/* LM Temperature */}
                <EditableSlider
                  label={t('lmTemperature')}
                  value={lmTemperature}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={setLmTemperature}
                  formatDisplay={(val) => val.toFixed(2)}
                  helpText={t('higherMoreRandom')}
                  title="Higher temperature = more random word choices."
                />

                {/* LM CFG Scale */}
                <EditableSlider
                  label={t('lmCfgScale')}
                  value={lmCfgScale}
                  min={1}
                  max={3}
                  step={0.1}
                  onChange={setLmCfgScale}
                  formatDisplay={(val) => val.toFixed(1)}
                  helpText={t('noCfgScale')}
                  title="How strongly the lyric model follows the prompt."
                />

                {/* LM Top-K & Top-P */}
                <div className="grid grid-cols-2 gap-3">
                  <EditableSlider
                    label={t('topK')}
                    value={lmTopK}
                    min={0}
                    max={100}
                    step={1}
                    onChange={setLmTopK}
                    title="Restricts choices to the K most likely tokens. 0 disables."
                  />
                  <EditableSlider
                    label={t('topP')}
                    value={lmTopP}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={setLmTopP}
                    formatDisplay={(val) => val.toFixed(2)}
                    title="Samples from the smallest set whose total probability is P."
                  />
                </div>

                {/* LM Negative Prompt */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title={t('lmNegativePromptTooltip')}>{t('lmNegativePrompt')}</label>
                  <textarea
                    value={lmNegativePrompt}
                    onChange={(e) => setLmNegativePrompt(e.target.value)}
                    placeholder={t('thingsToAvoid')}
                    className="w-full h-16 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg p-2 text-xs text-zinc-900 dark:text-white focus:outline-none resize-none"
                  />
                  <p className="text-[10px] text-zinc-500">{t('useWhenCfgScaleGreater')}</p>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide" title={t('transformTooltip')}>{t('transform')}</h4>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{t('controlSourceAudio')}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title={t('audioCodesTooltip')}>{t('audioCodes')}</label>
              <textarea
                value={audioCodes}
                onChange={(e) => setAudioCodes(e.target.value)}
                placeholder={t('optionalAudioCodes')}
                className="w-full h-16 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg p-2 text-xs text-zinc-900 dark:text-white focus:outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // Convert source audio to LM codes — requires Gradio lambda (not exposed as API)
                    // This is a placeholder: Gradio's convert_src_audio_to_codes_wrapper is not a named endpoint
                    console.log('Convert to Codes: requires source audio upload. Use Gradio UI for this feature.');
                  }}
                  disabled={!sourceAudioUrl}
                  title="Convert source audio to LM codes (requires source audio)"
                  className="px-2 py-1 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Convert to Codes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Transcribe audio codes to metadata — requires Gradio lambda (not exposed as API)
                    console.log('Transcribe: requires audio codes. Use Gradio UI for this feature.');
                  }}
                  disabled={!audioCodes.trim()}
                  title="Transcribe audio codes to metadata (requires audio codes)"
                  className="px-2 py-1 rounded text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Transcribe
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title={t('taskTypeTooltip')}>{t('taskType')}</label>
                <select
                  value={normalizedTaskType}
                  onChange={(e) => changeTaskType(normalizeTaskType(e.target.value))}
                  disabled={sourceAudioOrigin === 'recording'}
                  className={selectClassName}
                >
                  <option value="text2music">{t('textToMusic')}</option>
                  <option value="cover">{t('coverTask')}</option>
                  <option value="repaint">{t('repaintTask')}</option>
                  {baseTaskModel && <option value="lego">{t('legoTask')}</option>}
                  {baseTaskModel && <option value="extract">{t('extractTask')}</option>}
                  {baseTaskModel && <option value="complete">{t('completeTask')}</option>}
                  {!baseTaskModel && BASE_ONLY_TASKS.has(normalizedTaskType) && (
                    <option value={normalizedTaskType} disabled>{getTaskLabel(normalizedTaskType)} — {t('baseOnly')}</option>
                  )}
                </select>
              </div>
              {(normalizedTaskType === 'cover' || normalizedTaskType === 'complete') && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title={t('audioCoverStrengthTooltip')}>{t('audioCoverStrength')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={audioCoverStrength}
                    onChange={(e) => setAudioCoverStrength(Number(e.target.value))}
                    className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                  />
                </div>
              )}
            </div>

            {(normalizedTaskType === 'repaint' || normalizedTaskType === 'lego') && <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title={t('repaintingStartTooltip')}>
                  {normalizedTaskType === 'lego' ? t('stemStart') : t('repaintingStart')}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={repaintingStart}
                  onChange={(e) => setRepaintingStart(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title={t('repaintingEndTooltip')}>
                  {normalizedTaskType === 'lego' ? t('stemEnd') : t('repaintingEnd')}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={repaintingEnd}
                  onChange={(e) => setRepaintingEnd(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title={t('instructionTooltip')}>{t('instruction')}</label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                className="w-full h-16 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg p-2 text-xs text-zinc-900 dark:text-white focus:outline-none resize-none"
              />
            </div>

            {!isTurboModel(selectedModel) && <>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t('guidance')}</h4>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{t('advancedCfgScheduling')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title={t('cfgIntervalStartTooltip')}>{t('cfgIntervalStart')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={cfgIntervalStart}
                  onChange={(e) => setCfgIntervalStart(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Fraction of the diffusion process to stop applying guidance.">{t('cfgIntervalEnd')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={cfgIntervalEnd}
                  onChange={(e) => setCfgIntervalEnd(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
              </div>
            </>}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title={t('customTimestepsTooltip')}>{t('customTimesteps')}</label>
              <input
                type="text"
                value={customTimesteps}
                onChange={(e) => setCustomTimesteps(e.target.value)}
                placeholder={t('timestepsPlaceholder')}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Scales score-based guidance (advanced).">{t('scoreScale')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1"
                  value={scoreScale}
                  onChange={(e) => setScoreScale(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" title={t('lmBatchChunkSizeTooltip')}>{t('lmBatchChunkSize')}</label>
                <input
                  type="number"
                  min="1"
                  max="32"
                  step="1"
                  value={lmBatchChunkSize}
                  onChange={(e) => setLmBatchChunkSize(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            {(normalizedTaskType === 'lego' || normalizedTaskType === 'extract') && <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {normalizedTaskType === 'lego' ? t('trackToAdd') : t('trackToExtract')}
              </label>
              <select
                value={trackName}
                onChange={(e) => changeTrackName(e.target.value)}
                className={selectClassName}
              >
                <option value="">{t('none')}</option>
                {TRACK_NAMES.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>}

            {normalizedTaskType === 'complete' && <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('completeTrackClasses')}</label>
              <div className="flex flex-wrap gap-2">
                {TRACK_NAMES.map(name => {
                  const selected = completeTrackClasses.split(',').map(s => s.trim()).filter(Boolean);
                  const isChecked = selected.includes(name);
                  return (
                    <label key={name} className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const next = isChecked
                            ? selected.filter(s => s !== name)
                            : [...selected, name];
                          setInstruction(current => looksLikeAutomaticInstruction(current)
                            ? taskInstruction('complete', trackName, next)
                            : current);
                          setCompleteTrackClasses(next.join(','));
                          setGenerationValidationError(null);
                        }}
                        className={checkboxClassName}
                      />
                      {name}
                    </label>
                  );
                })}
              </div>
            </div>}

            <div className="grid grid-cols-2 gap-3">
              {!isTurboModel(selectedModel) && (
                <label
                  className="flex items-top gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400"
                  title="Adaptive Dual Guidance: dynamically adjusts CFG for quality. Base model only; slower."
                >
                  <input type="checkbox" checked={useAdg} onChange={() => setUseAdg(!useAdg)} className={checkboxClassName} />
                  {t('useAdg')}
                </label>
              )}
              <label className="flex items-top gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Allow the LM to run in larger batches for speed (more VRAM).">
                <input type="checkbox" checked={allowLmBatch} onChange={() => setAllowLmBatch(!allowLmBatch)} className={checkboxClassName} />
                {t('allowLmBatch')}
              </label>
              {!shouldHideCotControls && <>
                <label className="flex items-top gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Let the LM reason about metadata like BPM, key, duration.">
                  <input type="checkbox" checked={useCotMetas} onChange={() => setUseCotMetas(!useCotMetas)} className={checkboxClassName} />
                  {t('useCotMetas')}
                </label>
                <label className="flex items-top gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Let the LM reason about the caption/style text.">
                  <input type="checkbox" checked={useCotCaption} onChange={() => setUseCotCaption(!useCotCaption)} className={checkboxClassName} />
                  {t('useCotCaption')}
                </label>
                <label className="flex items-top gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Let the LM reason about language selection.">
                  <input type="checkbox" checked={useCotLanguage} onChange={() => setUseCotLanguage(!useCotLanguage)} className={checkboxClassName} />
                  {t('useCotLanguage')}
                </label>
              </>}
              <label className="flex items-top gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Auto-generate missing fields when possible.">
                <input type="checkbox" checked={autogen} onChange={() => setAutogen(!autogen)} className={checkboxClassName} />
                {t('autogen')}
              </label>
              <label className="flex items-top gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Include debug info for constrained decoding.">
                <input type="checkbox" checked={constrainedDecodingDebug} onChange={() => setConstrainedDecodingDebug(!constrainedDecodingDebug)} className={checkboxClassName} />
                {t('constrainedDecodingDebug')}
              </label>
              <label className="flex items-top gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Use the formatted caption produced by the AI formatter.">
                <input type="checkbox" checked={isFormatCaption} onChange={() => setIsFormatCaption(!isFormatCaption)} className={checkboxClassName} />
                {t('formatCaption')}
              </label>
              <label className="flex items-top gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Return scorer outputs for diagnostics.">
                <input type="checkbox" checked={getScores} onChange={() => setGetScores(!getScores)} className={checkboxClassName} />
                {t('getScores')}
              </label>
              <label className="flex items-top gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400" title="Return synced lyric (LRC) output when available.">
                <input type="checkbox" checked={getLrc} onChange={() => setGetLrc(!getLrc)} className={checkboxClassName} />
                {t('getLrcLyrics')}
              </label>
            </div>
          
          </div>
        )}
      </div>

      {showAudioModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowAudioModal(false); setPlayingTrackId(null); setPlayingTrackSource(null); }}
          />
          <div className="relative w-[92%] max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">
                    {audioModalTarget === 'reference' ? t('referenceModalTitle') : t('coverModalTitle')}
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    {audioModalTarget === 'reference'
                      ? t('referenceModalDescription')
                      : t('coverModalDescription')}
                  </p>
                </div>
                <button
                  onClick={() => { setShowAudioModal(false); setPlayingTrackId(null); setPlayingTrackSource(null); }}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              {/* Upload Button */}
              <button
                type="button"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.mp3,.wav,.flac,.m4a,.mp4,audio/*';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) void uploadReferenceTrack(file);
                  };
                  input.click();
                }}
                disabled={isUploadingReference || isTranscribingReference}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-white/20 bg-zinc-50 dark:bg-white/5 px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 hover:border-zinc-400 dark:hover:border-white/30 transition-all"
              >
                {isUploadingReference ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    {t('uploadingAudio')}
                  </>
                ) : isTranscribingReference ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    {t('transcribing')}
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    {t('uploadAudio')}
                    <span className="text-xs text-zinc-400 ml-1">{t('audioFormats')}</span>
                  </>
                )}
              </button>

              {uploadError && (
                <div className="mt-2 text-xs text-rose-500">{uploadError}</div>
              )}
              {isTranscribingReference && (
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
                  <span>{t('transcribingWithWhisper')}</span>
                  <button
                    type="button"
                    onClick={cancelTranscription}
                    className="text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                  >
                    {t('cancel')}
                  </button>
                </div>
              )}
            </div>

            {/* Library Section */}
            <div className="border-t border-zinc-100 dark:border-white/5">
              <div className="px-5 py-3 flex items-center gap-2">
                <div className="flex items-center gap-1 bg-zinc-200/60 dark:bg-white/10 rounded-full p-0.5">
                  <button
                    type="button"
                    onClick={() => setLibraryTab('uploads')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      libraryTab === 'uploads'
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                    }`}
                  >
                    {t('uploaded')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLibraryTab('created')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      libraryTab === 'created'
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                    }`}
                  >
                    {t('createdTab')}
                  </button>
                </div>
              </div>

              {/* Track List */}
              <div className="max-h-[280px] overflow-y-auto">
                {libraryTab === 'uploads' ? (
                  isLoadingTracks ? (
                    <div className="px-5 py-8 text-center">
                      <RefreshCw size={20} className="animate-spin mx-auto text-zinc-400" />
                      <p className="text-xs text-zinc-400 mt-2">{t('loadingTracks')}</p>
                    </div>
                  ) : referenceTracks.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <Music2 size={24} className="mx-auto text-zinc-300 dark:text-zinc-600" />
                      <p className="text-sm text-zinc-400 mt-2">{t('noTracksYet')}</p>
                      <p className="text-xs text-zinc-400 mt-1">{t('uploadAudioFilesAsReferences')}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100 dark:divide-white/5">
                      {referenceTracks.map((track) => (
                        <div
                          key={track.id}
                          className="px-5 py-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group"
                        >
                          {/* Play Button */}
                          <button
                            type="button"
                            onClick={() => toggleModalTrack({ id: track.id, audio_url: track.audio_url, source: 'uploads' })}
                            className="flex-shrink-0 w-9 h-9 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-white/20 transition-colors"
                          >
                            {playingTrackId === track.id && playingTrackSource === 'uploads' ? (
                              <Pause size={14} fill="currentColor" />
                            ) : (
                              <Play size={14} fill="currentColor" className="ml-0.5" />
                            )}
                          </button>

                          {/* Track Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                                {track.filename.replace(/\.[^/.]+$/, '')}
                              </span>
                              {track.tags && track.tags.length > 0 && (
                                <div className="flex gap-1">
                                  {track.tags.slice(0, 2).map((tag, i) => (
                                    <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Progress bar with seek - show when this track is playing */}
                            {playingTrackId === track.id && playingTrackSource === 'uploads' ? (
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[10px] text-zinc-400 tabular-nums w-8">
                                  {formatTime(modalTrackTime)}
                                </span>
                                <div
                                  className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 cursor-pointer group/seek"
                                  onClick={(e) => {
                                    if (modalAudioRef.current && modalTrackDuration > 0) {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const percent = (e.clientX - rect.left) / rect.width;
                                      modalAudioRef.current.currentTime = percent * modalTrackDuration;
                                    }
                                  }}
                                >
                                  <div
                                    className="h-full apex-accent-fill rounded-full relative"
                                    style={{ width: modalTrackDuration > 0 ? `${(modalTrackTime / modalTrackDuration) * 100}%` : '0%' }}
                                  >
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
                                  </div>
                                </div>
                                <span className="text-[10px] text-zinc-400 tabular-nums w-8 text-right">
                                  {formatTime(modalTrackDuration)}
                                </span>
                              </div>
                            ) : (
                              <div className="text-xs text-zinc-400 mt-0.5">
                                {track.duration ? formatTime(track.duration) : '--:--'}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => useReferenceTrack({ audio_url: track.audio_url, title: track.filename })}
                              className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
                            >
                              {t('useTrack')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteReferenceTrack(track.id)}
                              className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : createdTrackOptions.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <Music2 size={24} className="mx-auto text-zinc-300 dark:text-zinc-600" />
                    <p className="text-sm text-zinc-400 mt-2">{t('noCreatedSongsYet')}</p>
                    <p className="text-xs text-zinc-400 mt-1">{t('generateSongsToReuse')}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-white/5">
                    {createdTrackOptions.map((track) => (
                      <div
                        key={track.id}
                        className="px-5 py-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group"
                      >
                        <button
                          type="button"
                          onClick={() => toggleModalTrack({ id: track.id, audio_url: track.audio_url, source: 'created' })}
                          className="flex-shrink-0 w-9 h-9 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-white/20 transition-colors"
                        >
                          {playingTrackId === track.id && playingTrackSource === 'created' ? (
                            <Pause size={14} fill="currentColor" />
                          ) : (
                            <Play size={14} fill="currentColor" className="ml-0.5" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                            {track.title}
                          </div>
                          {playingTrackId === track.id && playingTrackSource === 'created' ? (
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-zinc-400 tabular-nums w-8">
                                {formatTime(modalTrackTime)}
                              </span>
                              <div
                                className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 cursor-pointer group/seek"
                                onClick={(e) => {
                                  if (modalAudioRef.current && modalTrackDuration > 0) {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const percent = (e.clientX - rect.left) / rect.width;
                                    modalAudioRef.current.currentTime = percent * modalTrackDuration;
                                  }
                                }}
                              >
                                <div
                                  className="h-full apex-accent-fill rounded-full relative"
                                  style={{ width: modalTrackDuration > 0 ? `${(modalTrackTime / modalTrackDuration) * 100}%` : '0%' }}
                                >
                                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
                                </div>
                              </div>
                              <span className="text-[10px] text-zinc-400 tabular-nums w-8 text-right">
                                {formatTime(modalTrackDuration)}
                              </span>
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-400 mt-0.5">
                              {track.duration || '--:--'}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => useReferenceTrack({ audio_url: track.audio_url, title: track.title })}
                            className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
                          >
                            {t('useTrack')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Hidden audio element for modal playback */}
            <audio
              ref={modalAudioRef}
              onTimeUpdate={() => {
                if (modalAudioRef.current) {
                  setModalTrackTime(modalAudioRef.current.currentTime);
                }
              }}
              onLoadedMetadata={() => {
                if (modalAudioRef.current) {
                  setModalTrackDuration(modalAudioRef.current.duration);
                  // Update track duration in database if not set
                  const track = referenceTracks.find(t => t.id === playingTrackId);
                  if (playingTrackSource === 'uploads' && track && !track.duration && token) {
                    fetch(`/api/reference-tracks/${track.id}`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                      },
                      body: JSON.stringify({ duration: Math.round(modalAudioRef.current.duration) })
                    }).then(() => {
                      setReferenceTracks(prev => prev.map(t =>
                        t.id === track.id ? { ...t, duration: Math.round(modalAudioRef.current?.duration || 0) } : t
                      ));
                    }).catch(() => undefined);
                  }
                }
              }}
              onEnded={() => setPlayingTrackId(null)}
            />
          </div>
        </div>
      )}

      {/* Footer Create Button */}
      <div className="p-4 mt-auto sticky bottom-0 bg-zinc-50/95 dark:bg-suno-panel/95 backdrop-blur-sm z-10 border-t border-zinc-200 dark:border-white/5 space-y-3">
        {generationValidationError && (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {generationValidationError}
          </div>
        )}
        <button
          onClick={handleGenerate}
          className="w-full h-12 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all transform active:scale-[0.98] apex-accent-fill shadow-lg"
          disabled={isGenerating || !isAuthenticated}
        >
          <Sparkles size={18} />
          <span>
            {isGenerating 
              ? t('generating')
              : bulkCount > 1
                ? `${t('createButton')} ${bulkCount} ${t('jobs')} (${bulkCount * batchSize} ${t('variations')})`
                : `${t('createButton')}${batchSize > 1 ? ` (${batchSize} ${t('variations')})` : ''}`
            }
          </span>
        </button>
      </div>
    </div>
  );
};
