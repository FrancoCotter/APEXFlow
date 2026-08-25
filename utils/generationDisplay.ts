import { Song } from '../types';
import { TranslationKey } from '../i18n/translations';

type Translate = (key: TranslationKey) => string;

const STAGE_KEY_BY_TEXT: Record<string, TranslationKey> = {
  queued: 'queuedStage',
  'generation job submitted...': 'generationJobSubmitted',
  'queueing generation job...': 'queueingGenerationJob',
  'creating lyrics sample...': 'creatingLyricsSample',
  'creating arrangement sample...': 'creatingArrangementSample',
  'refining lyrics and metadata...': 'refiningLyricsAndMetadata',
  'refining arrangement and metadata...': 'refiningArrangementAndMetadata',
  'starting generation...': 'startingGeneration',
  'waiting for python generator...': 'waitingForPythonGenerator',
  'starting python generator...': 'startingPythonGenerator',
  'loading generation environment...': 'loadingGenerationEnvironment',
  'loading dit model...': 'loadingDitModel',
  'initializing language model...': 'initializingLanguageModel',
  'preparing thinking pipeline...': 'preparingThinkingPipeline',
  'thinking about metadata...': 'thinkingAboutMetadata',
  'using provided metadata...': 'usingProvidedMetadata',
  'generating audio codes...': 'generatingAudioCodes',
  'audio codes ready...': 'audioCodesReady',
  'starting audio generation...': 'startingAudioGeneration',
  'preparing model inputs...': 'preparingModelInputs',
  'encoding prompt...': 'encodingPrompt',
  'encoding lyrics...': 'encodingLyrics',
  'running diffusion...': 'runningDiffusion',
  'diffusion complete...': 'diffusionComplete',
  'decoding audio...': 'decodingAudio',
  'preparing final audio...': 'preparingFinalAudio',
  'generating synced lyrics...': 'generatingSyncedLyrics',
  'synced lyrics failed to save...': 'syncedLyricsFailedToSave',
  'synced lyrics failed to save (cuda oom)...': 'syncedLyricsFailedToSaveOom',
  'calculating scores...': 'calculatingScores',
  'saving output files...': 'savingOutputFiles',
  'generating music via gradio...': 'generatingMusicViaGradio',
  'converting recording to instrument...': 'convertingRecordingToInstrument',
};

export const getModelDisplayName = (modelId?: string): string => {
  if (!modelId) return 'ACE';

  const mapping: Record<string, string> = {
    'acestep-v15-base': '1.5B',
    'acestep-v15-sft': '1.5S',
    'acestep-v15-turbo-shift1': '1.5TS1',
    'acestep-v15-turbo-shift3': '1.5TS3',
    'acestep-v15-turbo-continuous': '1.5TC',
    'acestep-v15-turbo': '1.5T',
    'acestep-v15-xl-base': '1.5XL-B',
    'acestep-v15-xl-turbo': '1.5XL-T',
    'acestep-v15-xl-sft': '1.5XL-S',
  };

  return mapping[modelId] || modelId.replace(/^acestep-/, '').replace(/^v/, '').toUpperCase();
};

export const getSongModelId = (song: Song): string | undefined => {
  return song.ditModel || song.generationParams?.ditModel || song.generationParams?.dit_model;
};

export const getGenerationStageKey = (stage?: string): TranslationKey | null => {
  const normalizedStage = stage?.trim().toLowerCase();
  if (!normalizedStage) return null;
  return STAGE_KEY_BY_TEXT[normalizedStage] || null;
};

export const getGenerationStageText = (
  song: Pick<Song, 'stage' | 'stageKey'>,
  t: Translate,
  fallbackKey: TranslationKey = 'startingGeneration',
): string => {
  const loadingModelMatch = song.stage?.trim().match(/^Loading model (.+)\.\.\.$/i);
  if (loadingModelMatch) {
    return t('loadingSelectedModel').replace('{model}', getModelDisplayName(loadingModelMatch[1]));
  }

  const extendingInstrumentMatch = song.stage?.trim().match(/^Extending instrument clip (\d+)\/(\d+)\.\.\.$/i);
  if (extendingInstrumentMatch) {
    return t('extendingInstrumentClip')
      .replace('{current}', extendingInstrumentMatch[1])
      .replace('{total}', extendingInstrumentMatch[2]);
  }

  const key = song.stageKey || getGenerationStageKey(song.stage);
  if (key) return t(key);
  return song.stage?.trim() || t(fallbackKey);
};

export const getGeneratingSongTitle = (song: Pick<Song, 'isGenerating' | 'title'>, t: Translate): string => {
  if (song.isGenerating) return t('generating');
  return song.title?.trim() || 'Untitled';
};
