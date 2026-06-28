import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

export interface SubjectDetection {
  kind: 'face' | 'person' | 'center';
  confidence: number;
  detector: 'mediapipe' | 'opencv' | 'unavailable';
  box: { x: number; y: number; width: number; height: number };
  focus: { x: number; y: number };
}

const fallback: SubjectDetection = {
  kind: 'center', confidence: 0,
  detector: 'unavailable',
  box: { x: 0.25, y: 0.15, width: 0.5, height: 0.7 },
  focus: { x: 0.5, y: 0.5 },
};

type PythonCandidate = { command: string; args: string[] };
let preferredCandidate: PythonCandidate | null = null;
let detectionUnavailableUntil = 0;

export async function detectSubject(buffer: Buffer): Promise<SubjectDetection> {
  if (!preferredCandidate && Date.now() < detectionUnavailableUntil) return fallback;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const script = path.resolve(__dirname, '../../scripts/detect_subject.py');
  const aceStepRoot = path.resolve(process.env.ACESTEP_PATH || path.resolve(process.cwd(), '../ACE-Step-1.5'));
  const configuredCommands = [
    process.env.PYTHON_PATH,
    path.join(aceStepRoot, 'python_embeded/python.exe'),
    path.join(aceStepRoot, '.venv/Scripts/python.exe'),
    path.join(aceStepRoot, '.venv/bin/python'),
  ].filter((command): command is string => Boolean(command) && existsSync(command as string));
  const pythonCommands = [...new Set([...configuredCommands, 'python', 'python3', 'py'])];
  const discoveredCandidates: PythonCandidate[] = [
    ...pythonCommands.map(command => ({ command, args: [script] })),
    { command: 'uv', args: ['run', '--project', aceStepRoot, 'python', script] },
  ];
  const candidates = preferredCandidate
    ? [preferredCandidate, ...discoveredCandidates.filter(candidate => candidate.command !== preferredCandidate!.command)]
    : discoveredCandidates;

  for (const candidate of candidates) {
    try {
      const detection = await new Promise<SubjectDetection>((resolve, reject) => {
        const child = spawn(candidate.command, candidate.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
        let output = '';
        let errorOutput = '';
        let settled = false;
        const finish = (error?: unknown, value?: SubjectDetection) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(value || fallback);
        };
        const timer = setTimeout(() => {
          child.kill();
          finish(new Error('detector timed out'));
        }, 3_000);
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { errorOutput += chunk; });
        child.on('error', finish);
        // Missing/broken Python executables can close before the image is written.
        // Always consume EPIPE/EOF here; otherwise Node treats it as an unhandled event.
        child.stdin.on('error', finish);
        child.on('close', code => {
          if (code !== 0) {
            const details = errorOutput.trim();
            return finish(new Error(`detector exited ${code}${details ? `: ${details}` : ''}`));
          }
          if (errorOutput.trim()) {
            console.info(`[face-detection] python stderr (${candidate.command}): ${errorOutput.trim()}`);
          }
          try { finish(undefined, JSON.parse(output.trim()) as SubjectDetection); } catch (error) { finish(error); }
        });
        try {
          child.stdin.end(buffer);
        } catch (error) {
          finish(error);
        }
      });
      console.info(`[face-detection] python candidate ok: ${candidate.command} ${candidate.args.join(' ')}`);
      preferredCandidate = candidate;
      detectionUnavailableUntil = 0;
      return detection;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[face-detection] python candidate failed: ${candidate.command} ${candidate.args.join(' ')} :: ${message}`);
      // Try the next common Python executable.
    }
  }
  console.warn('[face-detection] all python candidates failed; using unavailable fallback for 60s');
  detectionUnavailableUntil = Date.now() + 60_000;
  return fallback;
}
