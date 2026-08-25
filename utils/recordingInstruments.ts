import { Song } from '../types';

export const RECORDING_INSTRUMENTS = [
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

type Translate = (key: string) => string;

const getRecordingInstrument = (song: Song): string => {
  const params = (song.generationParams || {}) as Record<string, unknown>;
  const value = params.recordingInstrument ?? params.recording_instrument;
  return typeof value === 'string' ? value.trim() : '';
};

/**
 * Localize only the canonical recording instrument at the start of a saved
 * prompt. The user's Style caption remains untouched, and the canonical
 * English prompt stored for ACE-Step is never mutated.
 */
export const localizeRecordingPrompt = (song: Song, value: string, t: Translate): string => {
  if (!value) return value;
  const recordingInstrument = getRecordingInstrument(song);
  if (!recordingInstrument) return value;

  const instrument = RECORDING_INSTRUMENTS.find(
    item => item.value.toLowerCase() === recordingInstrument.toLowerCase(),
  );
  if (!instrument) return value;

  const trimmed = value.trim();
  const canonical = instrument.value;
  const normalized = trimmed.toLowerCase();
  const normalizedCanonical = canonical.toLowerCase();
  if (normalized === normalizedCanonical) return t(instrument.key);
  if (normalized.startsWith(`${normalizedCanonical},`)) {
    return `${t(instrument.key)}${trimmed.slice(canonical.length)}`;
  }
  return value;
};
