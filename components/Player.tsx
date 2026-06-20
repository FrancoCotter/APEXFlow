import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Song } from '../types';
import { Play, Pause, SkipBack, SkipForward, Repeat, Shuffle, Download, Star, MoreVertical, Volume2, VolumeX, Maximize2, Repeat1, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useResponsive } from '../context/ResponsiveContext';
import { useI18n } from '../context/I18nContext';
import { SongDropdownMenu } from './SongDropdownMenu';
import { AlbumCover } from './AlbumCover';
import { getSongLyricsUrl, getSongPlaybackUrl } from '../utils/songPlayback';

type CoverPalette = {
    average: string;
    background: string;
    primary: string;
    secondary: string;
    tertiary: string;
    highlight: string;
};

interface SyncedLyricLine {
    time: number;
    endTime?: number;
    hasExplicitEnd?: boolean;
    text: string;
    syllables?: SyncedLyricSyllable[];
}

interface SyncedLyricSyllable {
    time: number;
    endTime?: number;
    text: string;
}

interface PlayerProps {
    currentSong: Song | null;
    isPlaying: boolean;
    onTogglePlay: () => void;
    currentTime: number;
    duration: number;
    isPlaybackLoading?: boolean;
    onSeek: (time: number) => void;
    onNext: () => void;
    onPrevious: () => void;
    volume: number;
    onVolumeChange: (val: number) => void;
    playbackRate: number;
    onPlaybackRateChange: (rate: number) => void;
    audioRef: React.RefObject<HTMLAudioElement>;
    isShuffle: boolean;
    onToggleShuffle: () => void;
    repeatMode: 'none' | 'all' | 'one';
    onToggleRepeat: () => void;
    isLiked: boolean;
    onToggleLike: () => void;
    onNavigateToSong?: (songId: string) => void;
    onNavigateToProfile?: (username: string) => void;
    onOpenVideo?: () => void;
    onReusePrompt?: () => void;
    onAddToPlaylist?: () => void;
    onDelete?: () => void;
    onPlayFirst?: () => void;
    preloadCoverUrls?: string[];
}

const loadedFullscreenCoverUrls = new Set<string>();
const fullscreenCoverPaletteCache = new Map<string, CoverPalette>();
const MAX_FULLSCREEN_COVER_CACHE = 18;
const DEFAULT_COVER_PALETTE: CoverPalette = {
    average: '18 18 20',
    background: '14 14 18',
    primary: '62 74 92',
    secondary: '119 88 132',
    tertiary: '69 122 119',
    highlight: '172 190 213',
};

function trimFullscreenCoverCache() {
    while (loadedFullscreenCoverUrls.size > MAX_FULLSCREEN_COVER_CACHE) {
        const oldest = loadedFullscreenCoverUrls.values().next().value;
        if (!oldest) break;
        loadedFullscreenCoverUrls.delete(oldest);
        fullscreenCoverPaletteCache.delete(oldest);
    }

    while (fullscreenCoverPaletteCache.size > MAX_FULLSCREEN_COVER_CACHE) {
        const oldest = fullscreenCoverPaletteCache.keys().next().value;
        if (!oldest) break;
        fullscreenCoverPaletteCache.delete(oldest);
        loadedFullscreenCoverUrls.delete(oldest);
    }
}

function clampChannel(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function formatRgb(channels: [number, number, number]): string {
    return `${clampChannel(channels[0])} ${clampChannel(channels[1])} ${clampChannel(channels[2])}`;
}

function mixRgb(source: [number, number, number], target: [number, number, number], amount: number): [number, number, number] {
    return [
        source[0] + (target[0] - source[0]) * amount,
        source[1] + (target[1] - source[1]) * amount,
        source[2] + (target[2] - source[2]) * amount,
    ];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function extractCoverPalette(image: HTMLImageElement): CoverPalette | null {
    try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return null;
        canvas.width = 36;
        canvas.height = 36;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        const buckets = new Map<string, { count: number; r: number; g: number; b: number; score: number }>();

        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha < 128) continue;
            const red = data[i];
            const green = data[i + 1];
            const blue = data[i + 2];
            const brightness = (red + green + blue) / 3;
            if (brightness < 16 || brightness > 242) continue;

            r += red;
            g += green;
            b += blue;
            count += 1;

            const max = Math.max(red, green, blue);
            const min = Math.min(red, green, blue);
            const saturation = max === 0 ? 0 : (max - min) / max;
            const quantized: [number, number, number] = [
                Math.round(red / 32) * 32,
                Math.round(green / 32) * 32,
                Math.round(blue / 32) * 32,
            ];
            const key = quantized.join(',');
            const entry = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0, score: 0 };
            entry.count += 1;
            entry.r += red;
            entry.g += green;
            entry.b += blue;
            entry.score += 1 + saturation * 1.8;
            buckets.set(key, entry);
        }
        if (count === 0) return DEFAULT_COVER_PALETTE;

        const average: [number, number, number] = [r / count, g / count, b / count];
        const sortedBuckets = Array.from(buckets.values())
            .map(bucket => ({
                color: [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count] as [number, number, number],
                score: bucket.score,
            }))
            .sort((a, bEntry) => bEntry.score - a.score);

        const paletteColors: [number, number, number][] = [];
        for (const bucket of sortedBuckets) {
            if (paletteColors.every(color => colorDistance(color, bucket.color) > 52)) {
                paletteColors.push(bucket.color);
            }
            if (paletteColors.length === 4) break;
        }

        while (paletteColors.length < 4) {
            const fallback = paletteColors.length === 0
                ? average
                : mixRgb(average, paletteColors[paletteColors.length - 1], 0.35 - paletteColors.length * 0.06);
            paletteColors.push(fallback as [number, number, number]);
        }

        const background = mixRgb(average, [8, 8, 12], 0.72);
        const primary = mixRgb(paletteColors[0], average, 0.2);
        const secondary = mixRgb(paletteColors[1], [255, 255, 255], 0.08);
        const tertiary = mixRgb(paletteColors[2], [18, 24, 28], 0.12);
        const highlight = mixRgb(paletteColors[3], [255, 255, 255], 0.24);

        return {
            average: formatRgb(average),
            background: formatRgb(background),
            primary: formatRgb(primary),
            secondary: formatRgb(secondary),
            tertiary: formatRgb(tertiary),
            highlight: formatRgb(highlight),
        };
    } catch {
        return null;
    }
}

function preloadFullscreenCover(url: string): Promise<CoverPalette | null> {
    return new Promise(resolve => {
        if (loadedFullscreenCoverUrls.has(url) && fullscreenCoverPaletteCache.has(url)) {
            resolve(fullscreenCoverPaletteCache.get(url)!);
            return;
        }

        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            loadedFullscreenCoverUrls.add(url);
            const palette = extractCoverPalette(image);
            if (palette) fullscreenCoverPaletteCache.set(url, palette);
            trimFullscreenCoverCache();
            resolve(palette);
        };
        image.onerror = () => resolve(null);
        image.src = url;
    });
}

function normalizeRgb(rgb: string): [number, number, number] {
    const [r = 0, g = 0, b = 0] = rgb.split(/\s+/).map(value => Number.parseInt(value, 10) || 0);
    return [r / 255, g / 255, b / 255];
}

function hashStringToUnitInterval(input: string): number {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
}

function createLiquidSeed(seedKey: string): [number, number, number, number] {
    return [
        hashStringToUnitInterval(`${seedKey}:a`),
        hashStringToUnitInterval(`${seedKey}:b`),
        hashStringToUnitInterval(`${seedKey}:c`),
        hashStringToUnitInterval(`${seedKey}:d`),
    ];
}

const liquidBackgroundVertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const liquidBackgroundFragmentShader = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_base;
uniform vec3 u_color_a;
uniform vec3 u_color_b;
uniform vec3 u_color_c;
uniform vec3 u_color_d;
uniform float u_motion;
uniform vec4 u_seed;

varying vec2 v_uv;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p);
        p = p * 1.92 + vec2(11.4, 7.9);
        amplitude *= 0.55;
    }
    return value;
}

vec2 flowField(vec2 uv, float t, vec4 seed) {
    float scaleA = mix(0.78, 1.18, seed.x);
    float scaleB = mix(1.0, 1.48, seed.y);
    vec2 driftA = vec2(mix(0.022, 0.044, seed.z), -mix(0.016, 0.034, seed.w));
    vec2 driftB = vec2(-mix(0.018, 0.038, seed.y), mix(0.02, 0.04, seed.x));
    float n1 = fbm(uv * scaleA + vec2(t * driftA.x, t * driftA.y) + seed.xy * 5.0);
    float n2 = fbm(uv * scaleB + vec2(t * driftB.x, t * driftB.y) + n1 + seed.zw * 7.0);
    float angle = 6.2831853 * (n1 * mix(0.52, 0.74, seed.z) + n2 * mix(0.28, 0.48, seed.w));
    return vec2(cos(angle), sin(angle));
}

void main() {
    vec2 uv = v_uv;
    vec2 centered = uv - 0.5;
    centered.x *= u_resolution.x / max(u_resolution.y, 1.0);

    float t = u_time * (0.58 + u_motion * 0.74);
    vec2 warp1Anchor = vec2(mix(-0.22, 0.22, u_seed.x), mix(-0.18, 0.18, u_seed.y));
    vec2 warp2Anchor = vec2(mix(-0.2, 0.2, u_seed.z), mix(-0.16, 0.16, u_seed.w));
    vec2 warp3Anchor = vec2(mix(-0.14, 0.14, u_seed.y), mix(-0.2, 0.2, u_seed.x));
    vec2 warp1 = flowField(centered * mix(0.76, 1.04, u_seed.x) + warp1Anchor, t, u_seed);
    vec2 warp2 = flowField(centered * mix(0.94, 1.28, u_seed.y) + warp2Anchor, t + mix(8.0, 16.0, u_seed.z), u_seed);
    vec2 warp3 = flowField(centered * mix(1.12, 1.5, u_seed.z) + warp3Anchor, t + mix(20.0, 34.0, u_seed.w), u_seed);

    vec2 liquidUv = centered;
    liquidUv += warp1 * mix(0.18, 0.3, u_seed.x);
    liquidUv += warp2 * mix(0.11, 0.2, u_seed.y);
    liquidUv += warp3 * mix(0.06, 0.12, u_seed.z);

    float pressure = fbm(liquidUv * 1.7 + vec2(t * 0.055, -t * 0.032) + u_seed.zw * 9.0);
    float pressureX = fbm(liquidUv * 1.7 + vec2(1.8, 0.0) + vec2(t * 0.052, -t * 0.03) + u_seed.zw * 9.0);
    float pressureY = fbm(liquidUv * 1.7 + vec2(0.0, 1.8) + vec2(t * 0.052, -t * 0.03) + u_seed.zw * 9.0);
    float bounce = 0.62 + 0.38 * sin(t * mix(0.85, 1.25, u_seed.x) + pressure * 6.2831853);
    vec2 pressurePush = normalize(vec2(pressure - pressureX, pressure - pressureY) + 0.0001);
    liquidUv += pressurePush * mix(0.035, 0.075, bounce);

    float fieldA = fbm(liquidUv * mix(0.98, 1.28, u_seed.x) + vec2(t * mix(0.024, 0.042, u_seed.z), -t * mix(0.018, 0.034, u_seed.w)) + u_seed.xy * 3.0);
    float fieldB = fbm(liquidUv.yx * mix(1.08, 1.42, u_seed.y) + vec2(-t * mix(0.02, 0.036, u_seed.x), t * mix(0.024, 0.042, u_seed.z)) + 7.3 + u_seed.zw * 4.0);
    float fieldC = fbm((liquidUv + warp2 * mix(0.3, 0.5, u_seed.w)) * mix(0.92, 1.18, u_seed.z) + vec2(t * 0.02, t * 0.016) + 14.1 + u_seed.xy * 2.0);
    float fieldD = fbm((liquidUv - warp1 * mix(0.24, 0.42, u_seed.y)) * mix(1.18, 1.62, u_seed.w) - vec2(t * 0.016, -t * 0.026) + 3.7 + u_seed.zw * 3.0);

    float softA = smoothstep(0.16, 0.92, fieldA);
    float softB = smoothstep(0.12, 0.88, fieldB);
    float softC = smoothstep(0.18, 0.86, fieldC);
    float softD = smoothstep(0.24, 0.94, fieldD);

    float maskA = smoothstep(0.2, 0.82, mix(softA, softC, 0.38));
    float maskB = smoothstep(0.16, 0.8, mix(softB, softD, 0.34));
    float maskC = smoothstep(0.18, 0.78, mix(softC, softA, 0.28));
    float maskD = smoothstep(0.3, 0.9, mix(softD, softB, 0.22));
    float squeeze = smoothstep(0.24, 0.86, abs(maskA - maskB) + abs(maskC - maskD));

    vec3 color = u_base;
    color = mix(color, u_color_a, maskA * 0.5);
    color = mix(color, u_color_b, maskB * 0.36);
    color = mix(color, u_color_c, maskC * 0.3);
    color = mix(color, u_color_d, maskD * 0.18);

    float bloomA = smoothstep(0.28, 0.92, fbm(liquidUv * mix(0.62, 0.9, u_seed.x) + vec2(t * 0.014, -t * 0.012) + 5.0 + u_seed.xy * 6.0));
    float bloomB = smoothstep(0.24, 0.9, fbm(liquidUv * mix(0.56, 0.82, u_seed.y) - vec2(t * 0.012, t * 0.01) + 11.0 + u_seed.zw * 6.0));
    color += u_color_b * bloomA * 0.08;
    color += u_color_d * bloomB * 0.06;
    color += vec3(0.035, 0.03, 0.024) * squeeze * bounce;

    color = mix(color, vec3(dot(color, vec3(0.299, 0.587, 0.114))), 0.12);

    float vignette = smoothstep(1.18, 0.12, length(centered));
    color *= mix(0.9, 1.02, vignette);

    float mist = smoothstep(0.18, 0.96, fbm(centered * mix(0.46, 0.68, u_seed.w) + vec2(0.0, t * 0.008) + 19.0 + u_seed.xy * 8.0));
    color = mix(color, color + vec3(0.04, 0.035, 0.03), mist * 0.12);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

const LiquidCoverBackground: React.FC<{
    palette: CoverPalette;
    isPlaying: boolean;
    seedKey: string;
}> = ({ palette, isPlaying, seedKey }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const elapsedTimeRef = useRef(0);
    const lastFrameTimeRef = useRef<number | null>(null);
    const liquidSeed = useMemo(() => createLiquidSeed(seedKey), [seedKey]);
    const gradientStyle = useMemo(() => ({
        background: `
            radial-gradient(145% 135% at 18% 16%, rgb(${palette.primary}) 0%, transparent 50%),
            radial-gradient(120% 115% at 76% 18%, rgb(${palette.secondary}) 0%, transparent 46%),
            radial-gradient(130% 130% at 62% 78%, rgb(${palette.tertiary}) 0%, transparent 48%),
            linear-gradient(160deg, rgb(${palette.background}) 0%, rgb(${palette.average}) 54%, rgb(${palette.background}) 100%)
        `,
    }), [palette]);

    useEffect(() => {
        elapsedTimeRef.current = 0;
        lastFrameTimeRef.current = null;
    }, [seedKey]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const gl = canvas.getContext('webgl', {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            powerPreference: 'high-performance',
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
        });

        if (!gl) return;

        const compileShader = (type: number, source: string) => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vertexShader = compileShader(gl.VERTEX_SHADER, liquidBackgroundVertexShader);
        const fragmentShader = compileShader(gl.FRAGMENT_SHADER, liquidBackgroundFragmentShader);
        if (!vertexShader || !fragmentShader) {
            if (vertexShader) gl.deleteShader(vertexShader);
            if (fragmentShader) gl.deleteShader(fragmentShader);
            return;
        }

        const program = gl.createProgram();
        if (!program) {
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            return;
        }

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.deleteProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            return;
        }

        const positionBuffer = gl.createBuffer();
        if (!positionBuffer) {
            gl.deleteProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            return;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([
                -1, -1,
                1, -1,
                -1, 1,
                -1, 1,
                1, -1,
                1, 1,
            ]),
            gl.STATIC_DRAW,
        );

        const positionLocation = gl.getAttribLocation(program, 'a_position');
        const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
        const timeLocation = gl.getUniformLocation(program, 'u_time');
        const baseLocation = gl.getUniformLocation(program, 'u_base');
        const colorALocation = gl.getUniformLocation(program, 'u_color_a');
        const colorBLocation = gl.getUniformLocation(program, 'u_color_b');
        const colorCLocation = gl.getUniformLocation(program, 'u_color_c');
        const colorDLocation = gl.getUniformLocation(program, 'u_color_d');
        const motionLocation = gl.getUniformLocation(program, 'u_motion');
        const seedLocation = gl.getUniformLocation(program, 'u_seed');

        const base = normalizeRgb(palette.background);
        const colorA = normalizeRgb(palette.primary);
        const colorB = normalizeRgb(palette.secondary);
        const colorC = normalizeRgb(palette.tertiary);
        const colorD = normalizeRgb(palette.highlight);

        let animationFrameId = 0;
        let disposed = false;

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
            const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
            const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            gl.viewport(0, 0, canvas.width, canvas.height);
        };

        const draw = (timeMs: number) => {
            if (disposed) return;
            resize();

            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

            gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
            gl.uniform1f(timeLocation, timeMs * 0.001);
            gl.uniform3f(baseLocation, base[0], base[1], base[2]);
            gl.uniform3f(colorALocation, colorA[0], colorA[1], colorA[2]);
            gl.uniform3f(colorBLocation, colorB[0], colorB[1], colorB[2]);
            gl.uniform3f(colorCLocation, colorC[0], colorC[1], colorC[2]);
            gl.uniform3f(colorDLocation, colorD[0], colorD[1], colorD[2]);
            gl.uniform1f(motionLocation, reduceMotion ? 0.0 : 1.0);
            gl.uniform4f(seedLocation, liquidSeed[0], liquidSeed[1], liquidSeed[2], liquidSeed[3]);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
        };

        const tick = (frameTimeMs: number) => {
            if (disposed) return;
            if (lastFrameTimeRef.current !== null) {
                const deltaMs = frameTimeMs - lastFrameTimeRef.current;
                elapsedTimeRef.current += deltaMs / 1000;
            }
            lastFrameTimeRef.current = frameTimeMs;
            draw(elapsedTimeRef.current * 1000);
            if (!reduceMotion && isPlaying) {
                animationFrameId = window.requestAnimationFrame(tick);
            }
        };

        draw(elapsedTimeRef.current * 1000);
        if (!reduceMotion && isPlaying) {
            lastFrameTimeRef.current = performance.now();
            animationFrameId = window.requestAnimationFrame(tick);
        } else {
            lastFrameTimeRef.current = null;
        }

        const handleResize = () => draw(elapsedTimeRef.current * 1000);
        window.addEventListener('resize', handleResize);

        return () => {
            disposed = true;
            window.removeEventListener('resize', handleResize);
            window.cancelAnimationFrame(animationFrameId);
            lastFrameTimeRef.current = null;
            gl.deleteBuffer(positionBuffer);
            gl.deleteProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
        };
    }, [isPlaying, liquidSeed, palette]);

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 scale-[1.06] blur-[30px] opacity-80" style={gradientStyle} />
            <canvas ref={canvasRef} className="absolute inset-[-3%] h-[106%] w-[106%] opacity-[0.84] blur-[10px]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0%,transparent_36%,rgba(0,0,0,0.14)_74%,rgba(0,0,0,0.24)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_26%,rgba(0,0,0,0.06)_70%,rgba(0,0,0,0.18))]" />
        </div>
    );
};

function cleanLyricText(text: string): string {
    return text
        .split('\n')
        .map(line => line
            .replace(/\[(?:intro|verse|pre[-\s]?chorus|chorus|bridge|outro|hook|refrain|interlude|guitar|breakdown|drop|build|solo|spoken|fade|final(?:\s+chorus)?|post[-\s]?chorus|prelude|ending|song\s+ends?)[^\]]*\]/gi, '')
            .replace(/\[[^\]]+\]/g, '')
            .trim()
        )
        .filter(Boolean)
        .join('\n');
}

function capitalizeLatinLineStart(text: string): string {
    return text.replace(/^(\s*["'([{¿¡]*)([a-z])/, (_match, prefix: string, letter: string) =>
        `${prefix}${letter.toUpperCase()}`
    );
}

function formatDisplayLyricText(text: string): string {
    return text
        .split('\n')
        .map(line => capitalizeLatinLineStart(line))
        .join('\n');
}

function parseTimestamp(timestamp: string): number {
    const [minutes, ...rest] = timestamp.split(':');
    const seconds = rest.join(':').replace(':', '.');
    return (parseInt(minutes, 10) || 0) * 60 + (parseFloat(seconds) || 0);
}

function stripInlineLyricTimestamps(text: string): string {
    return text.replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '');
}

function parseInlineLyricSyllables(text: string): SyncedLyricSyllable[] {
    const markers = [...text.matchAll(/<(\d{1,3}:\d{2}(?:[.:]\d{1,3})?)>/g)];
    if (markers.length < 2) return [];

    return markers
        .map((marker, index) => {
            const markerEnd = (marker.index ?? 0) + marker[0].length;
            const nextMarker = markers[index + 1];
            const rawText = text.slice(markerEnd, nextMarker?.index ?? text.length);
            const syllableText = formatDisplayLyricText(cleanLyricText(stripInlineLyricTimestamps(rawText)));
            if (!syllableText) return null;
            return {
                time: parseTimestamp(marker[1]),
                endTime: nextMarker ? parseTimestamp(nextMarker[1]) : undefined,
                text: syllableText,
            };
        })
        .filter((syllable): syllable is SyncedLyricSyllable => Boolean(syllable));
}

function vttTimeToSeconds(time: string): number {
    const parts = time.trim().split(':');
    if (parts.length === 3) {
        return (parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60 + (parseFloat(parts[2]) || 0);
    }
    if (parts.length === 2) {
        return (parseInt(parts[0], 10) || 0) * 60 + (parseFloat(parts[1]) || 0);
    }
    return parseFloat(time) || 0;
}

function parseSyncedLyrics(raw: string): SyncedLyricLine[] {
    if (!raw.trim()) return [];
    if (!raw.trim().startsWith('WEBVTT') && !raw.includes('-->')) {
        const lines: SyncedLyricLine[] = [];
        raw.split('\n').forEach(rawLine => {
            const matches = [...rawLine.matchAll(/\[(\d{1,3}:\d{2}(?:[.:]\d{1,3})?)\]/g)];
            if (matches.length === 0) return;
            const content = rawLine.replace(/\[(\d{1,3}:\d{2}(?:[.:]\d{1,3})?)\]/g, '');
            const lyricText = formatDisplayLyricText(cleanLyricText(stripInlineLyricTimestamps(content)));
            if (!lyricText) return;
            const syllables = parseInlineLyricSyllables(content);
            matches.forEach(match => lines.push({
                time: parseTimestamp(match[1]),
                text: lyricText,
                syllables: syllables.length ? syllables : undefined,
            }));
        });
        return lines.sort((a, b) => a.time - b.time);
    }

    const lines: SyncedLyricLine[] = [];
    raw.replace(/\r/g, '').split(/\n\s*\n/).forEach(block => {
        const blockLines = block.split('\n').map(line => line.trim()).filter(Boolean);
        const timingLineIndex = blockLines.findIndex(line => line.includes('-->'));
        if (timingLineIndex === -1) return;
        const [start, end] = blockLines[timingLineIndex].split('-->').map(value => value.trim().split(/\s+/)[0]);
        const text = formatDisplayLyricText(cleanLyricText(blockLines.slice(timingLineIndex + 1).join('\n')));
        if (!text) return;
        lines.push({ time: vttTimeToSeconds(start), endTime: end ? vttTimeToSeconds(end) : undefined, hasExplicitEnd: Boolean(end), text });
    });
    return lines.sort((a, b) => a.time - b.time);
}

function getActiveSyncedLyricIndex(lines: SyncedLyricLine[], time: number): number {
    return lines.findIndex((line, index) => {
        const endTime = line.hasExplicitEnd ? line.endTime : lines[index + 1]?.time;
        return time >= line.time && (!endTime || time < endTime);
    });
}

export const Player: React.FC<PlayerProps> = ({
    currentSong,
    isPlaying,
    onTogglePlay,
    currentTime,
    duration,
    isPlaybackLoading = false,
    onSeek,
    onNext,
    onPrevious,
    volume,
    onVolumeChange,
    playbackRate,
    onPlaybackRateChange,
    audioRef,
    isShuffle,
    onToggleShuffle,
    repeatMode,
    onToggleRepeat,
    isLiked,
    onToggleLike,
    onNavigateToSong,
    onNavigateToProfile,
    onOpenVideo,
    onReusePrompt,
    onAddToPlaylist,
    onDelete,
    onPlayFirst,
    preloadCoverUrls = []
}) => {
    const { user } = useAuth();
    const { isMobile } = useResponsive();
    const { t } = useI18n();
    const progressBarRef = useRef<HTMLDivElement>(null);
    const fullscreenProgressRef = useRef<HTMLDivElement>(null);
    const fullscreenLyricsRef = useRef<HTMLDivElement>(null);
    const lyricsBrowseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTouchY = useRef<number | null>(null);
    const [isHoveringVolume, setIsHoveringVolume] = useState(false);
    const volumeHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const speedMenuRef = useRef<HTMLDivElement>(null);
    const [syncedLyrics, setSyncedLyrics] = useState<SyncedLyricLine[]>([]);
    const [syncedLyricsLoading, setSyncedLyricsLoading] = useState(false);
    const [coverPalette, setCoverPalette] = useState<CoverPalette>(DEFAULT_COVER_PALETTE);
    const [fullscreenSlideDirection, setFullscreenSlideDirection] = useState<'next' | 'previous'>('next');
    const [fullscreenCoverFailed, setFullscreenCoverFailed] = useState(false);
    const [isBrowsingFullscreenLyrics, setIsBrowsingFullscreenLyrics] = useState(false);

    const shouldLoadSyncedLyrics = Boolean(getSongLyricsUrl(currentSong));
    const activeLyricIndex = useMemo(() => {
        if (!syncedLyrics.length) return -1;
        return getActiveSyncedLyricIndex(syncedLyrics, currentTime);
    }, [currentTime, syncedLyrics]);

    useEffect(() => {
        if (!currentSong?.coverUrl) {
            setCoverPalette(DEFAULT_COVER_PALETTE);
            return;
        }

        let cancelled = false;
        const cachedPalette = fullscreenCoverPaletteCache.get(currentSong.coverUrl);
        if (cachedPalette) setCoverPalette(cachedPalette);

        preloadFullscreenCover(currentSong.coverUrl).then(palette => {
            if (cancelled) return;
            if (palette) {
                setCoverPalette(palette);
            } else if (!cachedPalette) {
                setCoverPalette(DEFAULT_COVER_PALETTE);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [currentSong?.coverUrl]);

    useEffect(() => {
        setFullscreenCoverFailed(false);
    }, [currentSong?.coverUrl]);

    useEffect(() => {
        preloadCoverUrls.forEach((url) => {
            if (!url) return;
            preloadFullscreenCover(url);
        });
    }, [preloadCoverUrls]);

    useEffect(() => {
        const lrcUrl = getSongLyricsUrl(currentSong);
        if (!lrcUrl) {
            setSyncedLyrics([]);
            setSyncedLyricsLoading(false);
            return;
        }

        let cancelled = false;
        setSyncedLyrics([]);
        setSyncedLyricsLoading(true);

        fetch(lrcUrl)
            .then(response => {
                if (!response.ok) throw new Error(`LRC not found: ${response.status}`);
                return response.text();
            })
            .then(text => {
                if (!cancelled) setSyncedLyrics(parseSyncedLyrics(text));
            })
            .catch(() => {
                if (!cancelled) setSyncedLyrics([]);
            })
            .finally(() => {
                if (!cancelled) setSyncedLyricsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [currentSong?.id, currentSong?.audioUrl, currentSong?.playbackUrl]);

    useEffect(() => {
        if (!isFullscreen || isBrowsingFullscreenLyrics || activeLyricIndex < 0) return;
        const container = fullscreenLyricsRef.current;
        const activeLine = container?.querySelector<HTMLElement>(`[data-lyric-index="${activeLyricIndex}"]`);
        if (!container || !activeLine) return;

        const targetTop = activeLine.offsetTop - container.clientHeight / 2 + activeLine.clientHeight / 2;
        container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    }, [activeLyricIndex, isBrowsingFullscreenLyrics, isFullscreen, syncedLyrics.length]);

    useEffect(() => {
        setIsBrowsingFullscreenLyrics(false);
        if (lyricsBrowseTimer.current) {
            clearTimeout(lyricsBrowseTimer.current);
            lyricsBrowseTimer.current = null;
        }
    }, [currentSong?.id]);

    useEffect(() => {
        return () => {
            if (lyricsBrowseTimer.current) clearTimeout(lyricsBrowseTimer.current);
        };
    }, []);

    // Close fullscreen on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) {
                setIsFullscreen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullscreen]);

    // Close speed menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (speedMenuRef.current && !speedMenuRef.current.contains(event.target as Node)) {
                setShowSpeedMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Show minimal player when no song is playing
    if (!currentSong) {
        return (
            <div className="h-20 lg:h-24 bg-white dark:bg-black/95 backdrop-blur border-t border-zinc-200 dark:border-white/10 flex items-center justify-center z-50 transition-colors duration-300 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] dark:shadow-none">
                <button
                    onClick={() => onPlayFirst?.()}
                    className="flex items-center gap-3 text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 cursor-pointer transition-colors"
                >
                    <div className="w-10 h-10 lg:w-12 lg:h-12 rounded bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
                        <Play size={20} />
                    </div>
                    <span className="text-sm font-medium">{t('selectSongToPlay')}</span>
                </button>
            </div>
        );
    }

    const formatTime = (time: number) => {
        if (isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleSeekInteraction = (e: React.MouseEvent<HTMLDivElement>, ref: React.RefObject<HTMLDivElement>) => {
        if (!ref.current || !duration) return;
        const rect = ref.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const percentage = Math.max(0, Math.min(1, x / width));
        onSeek(percentage * duration);
    };

    const beginFullscreenLyricsBrowse = () => {
        setIsBrowsingFullscreenLyrics(true);
        if (lyricsBrowseTimer.current) clearTimeout(lyricsBrowseTimer.current);
        lyricsBrowseTimer.current = setTimeout(() => {
            setIsBrowsingFullscreenLyrics(false);
        }, 1400);
    };

    const scrollFullscreenLyricsBy = (deltaY: number) => {
        const container = fullscreenLyricsRef.current;
        if (!container) return;
        beginFullscreenLyricsBrowse();
        const resistedDelta = Math.sign(deltaY) * Math.min(Math.abs(deltaY), 72) * 0.22;
        container.scrollTop += resistedDelta;
    };

    const getWheelDeltaY = (event: React.WheelEvent<HTMLDivElement>): number => {
        const deltaUnit = event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
                ? fullscreenLyricsRef.current?.clientHeight ?? 280
                : 1;
        return event.deltaY * deltaUnit;
    };

    const getFullscreenLyricStyle = (index: number, isActive: boolean): React.CSSProperties => {
        if (isBrowsingFullscreenLyrics || isActive || activeLyricIndex < 0) {
            return {
                color: isActive ? 'var(--lyrics-color-active)' : 'var(--lyrics-color-inactive)',
                filter: 'blur(0px)',
                opacity: isActive ? 1 : 0.76,
                transform: 'scale(1)',
            };
        }

        const distance = Math.min(Math.abs(index - activeLyricIndex), 5);
        const blurByDistance = [0, 0.7, 2.1, 4.2, 6.5, 8.5];
        const opacityByDistance = [1, 0.74, 0.58, 0.42, 0.3, 0.22];
        const scaleByDistance = [1, 0.985, 0.97, 0.955, 0.94, 0.925];

        return {
            color: 'var(--lyrics-color-inactive)',
            filter: `blur(${blurByDistance[distance]}px)`,
            opacity: opacityByDistance[distance],
            transform: `scale(${scaleByDistance[distance]})`,
        };
    };

    const renderFullscreenLyricText = (line: SyncedLyricLine, isActive: boolean) => {
        if (!isActive || !line.syllables?.length) return line.text;

        return line.syllables.map((syllable, index) => {
            const nextTime = line.syllables?.[index + 1]?.time;
            const syllableEnd = syllable.endTime ?? nextTime ?? line.endTime ?? line.time + 0.45;
            const progress = Math.max(0, Math.min(1, (currentTime - syllable.time) / Math.max(syllableEnd - syllable.time, 0.08)));
            const isCurrent = currentTime >= syllable.time && currentTime < syllableEnd;
            const isPlayed = currentTime >= syllableEnd;
            const opacity = isPlayed ? 1 : isCurrent ? 0.9 + progress * 0.1 : 0.48;
            const scale = isCurrent ? 1 + Math.sin(progress * Math.PI) * 0.055 : 1;

            return (
                <span
                    key={`${syllable.time}-${index}-${syllable.text}`}
                    className="inline-block transition-[color,opacity,filter,transform,text-shadow] duration-200"
                    style={{
                        color: isPlayed || isCurrent ? 'var(--lyrics-color-active)' : 'var(--lyrics-color-inactive)',
                        opacity,
                        transform: `translateY(${isCurrent ? -2 * Math.sin(progress * Math.PI) : 0}px) scale(${scale})`,
                        filter: isCurrent ? 'brightness(1.16)' : 'none',
                        textShadow: isCurrent ? '0 0 22px rgba(255,255,255,0.34)' : 'none',
                    }}
                >
                    {syllable.text}
                </span>
            );
        });
    };

    const progressPercent = duration ? (currentTime / duration) * 100 : 0;
    const playbackTimeLabel = isPlaybackLoading ? '--:--' : formatTime(currentTime);
    const playbackDurationLabel = isPlaybackLoading ? '--:--' : formatTime(duration || 0);
    const playbackButtonClassName = isPlaybackLoading
        ? 'cursor-wait bg-zinc-300 text-zinc-500 shadow-none dark:bg-zinc-700 dark:text-zinc-300'
        : 'bg-zinc-900 text-white dark:bg-white dark:text-black shadow-lg';
    const renderPlaybackGlyph = (playSize: number, pauseSize: number, playClassName = '') => {
        if (isPlaybackLoading) {
            return <Loader2 size={pauseSize} className="animate-spin" />;
        }
        return isPlaying
            ? <Pause size={pauseSize} fill="currentColor" />
            : <Play size={playSize} fill="currentColor" className={playClassName} />;
    };

    const handleDownload = async () => {
        const playbackUrl = getSongPlaybackUrl(currentSong);
        if (!playbackUrl) return;
        try {
            const response = await fetch(playbackUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${currentSong.title || 'song'}.mp3`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
        }
    };

    if (isMobile) {
        if (isFullscreen) {
            return (
                <div className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-100 to-zinc-50 dark:from-zinc-900 dark:to-black flex flex-col safe-area-inset-top safe-area-inset-bottom transition-colors duration-300">
                    {/* Header with close button */}
                    <div className="flex items-center justify-between px-4 py-3">
                        <button
                            onClick={() => setIsFullscreen(false)}
                            className="p-2 text-zinc-600 dark:text-white/70 tap-highlight-none"
                        >
                            <ChevronDown size={28} />
                        </button>
                        <span className="text-xs text-zinc-500 dark:text-white/50 uppercase tracking-wider">{t('nowPlaying')}</span>
                        <div className="w-11" />
                    </div>

                    {/* Album Art */}
                    <div className="flex-1 flex items-center justify-center px-8 py-4">
                        <div className="w-full max-w-[280px] aspect-square rounded-lg overflow-hidden shadow-2xl">
                            {currentSong.coverUrl ? (
                                <img
                                    src={currentSong.coverUrl}
                                    className="w-full h-full object-cover"
                                    alt="cover"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
                                />
                            ) : null}
                            <AlbumCover seed={currentSong.id || currentSong.title} size="full" className={`w-full h-full ${currentSong.coverUrl ? 'hidden' : ''}`} />
                        </div>
                    </div>

                    {/* Song Info */}
                    <div className="px-6 mb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0 mr-4">
                                <h2
                                    onClick={() => {
                                        setIsFullscreen(false);
                                        onNavigateToSong?.(currentSong.id);
                                    }}
                                    className="text-xl font-bold text-zinc-900 dark:text-white truncate"
                                >
                                    {currentSong.title}
                                </h2>
                                <p
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (currentSong.creator) {
                                            setIsFullscreen(false);
                                            onNavigateToProfile?.(currentSong.creator);
                                        }
                                    }}
                                    className={`text-sm text-zinc-500 dark:text-white/60 truncate mt-1 ${currentSong.creator ? 'cursor-pointer hover:underline' : ''}`}
                                >
                                    {currentSong.creator || 'Unknown Artist'}
                                </p>
                            </div>
                            <button
                                onClick={onToggleLike}
                                className={`p-2 tap-highlight-none ${isLiked ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-400 dark:text-white/50'}`}
                            >
                                <Star size={24} fill={isLiked ? "currentColor" : "none"} />
                            </button>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="px-6 mb-2">
                        <div
                            ref={fullscreenProgressRef}
                            className="w-full h-1.5 bg-zinc-300 dark:bg-white/20 rounded-full cursor-pointer relative"
                            onClick={(e) => handleSeekInteraction(e, fullscreenProgressRef)}
                        >
                            <div
                                className="h-full bg-zinc-900 dark:bg-white rounded-full relative"
                                style={{ width: `${progressPercent}%` }}
                            >
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-zinc-900 dark:bg-white rounded-full shadow-lg -mr-2" />
                            </div>
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-zinc-500 dark:text-white/50 font-mono">
                            <span>{playbackTimeLabel}</span>
                            <span>{playbackDurationLabel}</span>
                        </div>
                    </div>

                    {/* Main Controls */}
                    <div className="flex items-center justify-center gap-8 py-4">
                        <button
                            onClick={onToggleShuffle}
                            className={`p-2 tap-highlight-none ${isShuffle ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-400 dark:text-white/50'}`}
                        >
                            <Shuffle size={22} />
                        </button>
                        <button
                            onClick={onPrevious}
                            className="p-2 text-zinc-800 dark:text-white tap-highlight-none"
                        >
                            <SkipBack size={32} fill="currentColor" />
                        </button>
                        <button
                            onClick={onTogglePlay}
                            disabled={isPlaybackLoading}
                            className={`w-16 h-16 rounded-full flex items-center justify-center tap-highlight-none ${playbackButtonClassName}`}
                        >
                            {renderPlaybackGlyph(32, 32, 'ml-1')}
                        </button>
                        <button
                            onClick={onNext}
                            className="p-2 text-zinc-800 dark:text-white tap-highlight-none"
                        >
                            <SkipForward size={32} fill="currentColor" />
                        </button>
                        <button
                            onClick={onToggleRepeat}
                            className={`p-2 tap-highlight-none relative ${repeatMode !== 'none' ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-400 dark:text-white/50'}`}
                        >
                            {repeatMode === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
                        </button>
                    </div>

                    {/* Volume Control - Vertical */}
                    <div className="flex flex-col items-center gap-3 px-6 py-4">
                        <div className="relative h-32 w-8 flex items-center justify-center">
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={volume}
                                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                className="w-32 h-8 -rotate-90 origin-center appearance-none bg-transparent cursor-pointer"
                                style={{
                                    WebkitAppearance: 'none',
                                    background: `linear-gradient(to right, rgb(143 182 143) 0%, rgb(143 182 143) ${volume * 100}%, rgb(228 228 231) ${volume * 100}%, rgb(228 228 231) 100%)`
                                }}
                            />
                        </div>
                        <button
                            onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)}
                            className="text-zinc-400 dark:text-white/50 tap-highlight-none"
                        >
                            {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                        </button>
                    </div>

                    {/* Extra Actions */}
                    <div className="flex items-center justify-center gap-6 px-6 pb-6 text-zinc-400 dark:text-white/50">
                        {onOpenVideo && (
                            <button onClick={onOpenVideo} className="p-3 tap-highlight-none">
                                <Maximize2 size={20} />
                            </button>
                        )}
                        <button
                            onClick={handleDownload}
                            className="p-3 tap-highlight-none"
                            title={t('downloadAudio')}
                        >
                            <Download size={20} />
                        </button>
                        <button
                            onClick={() => setShowDropdown(!showDropdown)}
                            className="p-3 tap-highlight-none relative"
                        >
                            <MoreVertical size={20} />
                        </button>
                    </div>

                    {showDropdown && (
                        <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
                            <SongDropdownMenu
                                song={currentSong}
                                isOpen={showDropdown}
                                onClose={() => setShowDropdown(false)}
                                isOwner={user?.id === currentSong.userId}
                                position="center"
                                direction="up"
                                onCreateVideo={onOpenVideo}
                                onReusePrompt={onReusePrompt}
                                onAddToPlaylist={onAddToPlaylist}
                                onDelete={onDelete}
                            />
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="bg-white dark:bg-black/95 backdrop-blur border-t border-zinc-200 dark:border-white/10 flex flex-col z-50 transition-colors duration-300 safe-area-inset-bottom">
                {/* Progress Bar - taller for touch */}
                <div
                    ref={progressBarRef}
                    className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 cursor-pointer relative"
                    onClick={(e) => handleSeekInteraction(e, progressBarRef)}
                >
                    <div
                        className="h-full bg-[#8fb68f]"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>

                {/* Main content: Song info left, controls right */}
                <div className="flex items-center px-3 py-2 gap-3">
                    {/* Song Info - takes available space, tap to expand */}
                    <div
                        className="flex items-center gap-3 flex-1 min-w-0"
                        onClick={() => setIsFullscreen(true)}
                    >
                        <div className="w-11 h-11 rounded bg-zinc-200 dark:bg-zinc-800 overflow-hidden shadow-sm flex-shrink-0 relative">
                            {currentSong.coverUrl ? (
                                <img src={currentSong.coverUrl} className="w-full h-full object-cover" alt="cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            ) : null}
                            {!currentSong.coverUrl && <AlbumCover seed={currentSong.id || currentSong.title} size="full" className="w-full h-full" />}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 active:opacity-100 transition-opacity">
                                <ChevronUp size={20} className="text-white" />
                            </div>
                        </div>
                        <div className="overflow-hidden flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                                {currentSong.title}
                            </h4>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                {currentSong.creator || 'Unknown Artist'}
                            </p>
                        </div>
                    </div>

                    {/* Mobile Controls - compact */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            onClick={onToggleLike}
                            className={`p-2 tap-highlight-none ${isLiked ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-400'}`}
                        >
                            <Star size={20} fill={isLiked ? "currentColor" : "none"} />
                        </button>
                        <button
                            onClick={onPrevious}
                            className="p-2 text-zinc-700 dark:text-zinc-300 tap-highlight-none"
                        >
                            <SkipBack size={22} fill="currentColor" />
                        </button>
                        <button
                            onClick={onTogglePlay}
                            disabled={isPlaybackLoading}
                            className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg tap-highlight-none ${playbackButtonClassName}`}
                        >
                            {renderPlaybackGlyph(22, 22, 'ml-0.5')}
                        </button>
                        <button
                            onClick={onNext}
                            className="p-2 text-zinc-700 dark:text-zinc-300 tap-highlight-none"
                        >
                            <SkipForward size={22} fill="currentColor" />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Desktop fullscreen mode
    if (isFullscreen) {
        const hasDynamicLyrics = syncedLyrics.length > 0;
        const isResolvingDynamicLyrics = shouldLoadSyncedLyrics && syncedLyricsLoading;
        const fullscreenStyle = {
            '--lyrics-color-background': `rgb(${coverPalette.background})`,
            '--lyrics-color-base': coverPalette.average,
            '--lyrics-flow-color-1': coverPalette.primary,
            '--lyrics-flow-color-2': coverPalette.secondary,
            '--lyrics-flow-color-3': coverPalette.tertiary,
            '--lyrics-flow-color-4': coverPalette.highlight,
            '--lyrics-color-inactive': 'color-mix(in srgb, var(--lyrics-color-background) 30%, white 70%)',
            '--lyrics-color-active': 'rgba(255, 255, 255, 1)',
        } as React.CSSProperties;

        return (
            <div
                className="fixed inset-0 z-50 flex flex-col overflow-hidden text-white transition-colors duration-700"
                style={{
                    ...fullscreenStyle,
                    backgroundColor: 'var(--lyrics-color-background)',
                }}
            >
                <LiquidCoverBackground
                    palette={coverPalette}
                    isPlaying={isPlaying}
                    seedKey={`${currentSong.id}:${currentSong.coverUrl || ''}:${currentSong.title}`}
                />

                {/* Header with close button */}
                <div className="relative z-10 flex items-center justify-between px-6 py-4">
                    <button
                        onClick={() => setIsFullscreen(false)}
                        className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                    >
                        <ChevronDown size={28} />
                    </button>
                    <span className="text-sm text-white/50 uppercase tracking-wider font-medium">{t('nowPlaying')}</span>
                    <div className="w-11" />
                </div>

                {/* Main content area */}
                <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center px-8 pb-4 overflow-hidden">
                    <div
                        key={currentSong.id}
                        className={`w-full ${fullscreenSlideDirection === 'previous' ? 'now-playing-slide-previous' : 'now-playing-slide-next'}`}
                    >
                        {isResolvingDynamicLyrics ? (
                            <div className="mx-auto flex h-[58vh] max-w-6xl items-center justify-center overflow-hidden py-10">
                                <div className="flex flex-col items-center gap-4 text-zinc-500 dark:text-white/45">
                                    <div className="flex items-end gap-1.5">
                                        <span className="h-5 w-1.5 rounded-full bg-[#8fb68f] animate-pulse" style={{ animationDelay: '0ms' }} />
                                        <span className="h-8 w-1.5 rounded-full bg-[#8fb68f] animate-pulse" style={{ animationDelay: '120ms' }} />
                                        <span className="h-4 w-1.5 rounded-full bg-[#8fb68f] animate-pulse" style={{ animationDelay: '240ms' }} />
                                        <span className="h-7 w-1.5 rounded-full bg-[#8fb68f] animate-pulse" style={{ animationDelay: '360ms' }} />
                                    </div>
                                    <span className="text-xs uppercase tracking-[0.24em]">Syncing lyrics</span>
                                </div>
                            </div>
                        ) : hasDynamicLyrics ? (
                            <div className={`mx-auto flex max-w-6xl items-center justify-center overflow-hidden transition-[height,padding] duration-500 ${
                                isBrowsingFullscreenLyrics ? 'h-[68vh] py-4' : 'h-[58vh] py-10'
                            }`}>
                                <div
                                    ref={fullscreenLyricsRef}
                                    onWheel={(event) => {
                                        event.preventDefault();
                                        scrollFullscreenLyricsBy(getWheelDeltaY(event));
                                    }}
                                    onTouchStart={(event) => {
                                        lastTouchY.current = event.touches[0]?.clientY ?? null;
                                        beginFullscreenLyricsBrowse();
                                    }}
                                    onTouchMove={(event) => {
                                        const touchY = event.touches[0]?.clientY;
                                        if (touchY === undefined || lastTouchY.current === null) return;
                                        event.preventDefault();
                                        scrollFullscreenLyricsBy(lastTouchY.current - touchY);
                                        lastTouchY.current = touchY;
                                    }}
                                    onTouchEnd={() => {
                                        lastTouchY.current = null;
                                    }}
                                    className={`w-full max-h-full text-center custom-scrollbar transition-[overflow] ${
                                        isBrowsingFullscreenLyrics ? 'overflow-y-auto' : 'overflow-hidden'
                                    }`}
                                >
                                    <div className={`flex flex-col items-center justify-center transition-[gap,padding] duration-500 ${
                                        isBrowsingFullscreenLyrics ? 'gap-4 py-[30vh]' : 'gap-6 py-[24vh]'
                                    }`}>
                                        {syncedLyrics.map((line, index) => {
                                            const isActive = index === activeLyricIndex;
                                            const lyricStyle = getFullscreenLyricStyle(index, isActive);
                                            return (
                                                <button
                                                    key={`${line.time}-${line.text}`}
                                                    type="button"
                                                    data-lyric-index={index}
                                                    onClick={() => {
                                                        onSeek(line.time);
                                                    }}
                                                    title={`Jump to ${formatTime(line.time)}`}
                                                    style={lyricStyle}
                                                    className={`mx-auto block w-full max-w-5xl break-words rounded-xl px-8 py-1 text-center text-3xl xl:text-5xl font-bold leading-[1.16] tracking-normal transition-[color,opacity,filter,transform] duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                                                        isActive
                                                            ? ''
                                                            : 'hover:!text-white'
                                                    }`}
                                                >
                                                    {renderFullscreenLyricText(line, isActive)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="mx-auto flex h-[58vh] max-w-6xl items-center justify-center overflow-hidden py-10">
                                <div className="relative">
                                    <div className="relative w-[min(52vh,440px)] aspect-square overflow-hidden rounded-2xl">
                                        {currentSong.coverUrl && !fullscreenCoverFailed ? (
                                            <img
                                                key={`cover-${currentSong.coverUrl}`}
                                                src={currentSong.coverUrl}
                                                className="absolute inset-0 h-full w-full object-cover"
                                                alt="cover"
                                                onLoad={() => {
                                                    loadedFullscreenCoverUrls.add(currentSong.coverUrl!);
                                                }}
                                                onError={() => setFullscreenCoverFailed(true)}
                                            />
                                        ) : (
                                            <AlbumCover seed={currentSong.id || currentSong.title} size="full" className="absolute inset-0 h-full w-full" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="relative z-10 h-20 lg:h-24 shrink-0 border-t border-black/10 bg-white/62 backdrop-blur-xl dark:border-white/10 dark:bg-black/45">
                    <div
                        ref={fullscreenProgressRef}
                        className="group relative h-1 lg:h-1.5 w-full cursor-pointer bg-black/10 dark:bg-white/15"
                        onClick={(e) => handleSeekInteraction(e, fullscreenProgressRef)}
                    >
                        <div
                            className="h-full bg-zinc-950 group-hover:bg-[#8fb68f] transition-colors dark:bg-white"
                            style={{ width: `${progressPercent}%` }}
                        >
                            <div className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-zinc-950 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-white" style={{ left: `clamp(0px, calc(${progressPercent}% - 6px), calc(100% - 12px))` }} />
                        </div>
                    </div>

                    <div className="flex h-[calc(100%-0.25rem)] w-full items-center justify-between gap-2 px-2 sm:px-4 lg:px-6 lg:h-[calc(100%-0.375rem)]">
                        <div className="flex min-w-0 flex-1 max-w-[30%] lg:max-w-[33%] items-center gap-2 sm:gap-3">
                            <div className="h-10 w-10 lg:h-12 lg:w-12 overflow-hidden rounded bg-black/10 flex-shrink-0 shadow-sm dark:bg-white/10">
                                {currentSong.coverUrl ? (
                                    <img src={currentSong.coverUrl} className="h-full w-full object-cover" alt="cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : null}
                                {!currentSong.coverUrl && <AlbumCover seed={currentSong.id || currentSong.title} size="full" className="h-full w-full" />}
                            </div>
                            <div className="min-w-0">
                                <h2
                                    onClick={() => {
                                        setIsFullscreen(false);
                                        onNavigateToSong?.(currentSong.id);
                                    }}
                                    className="truncate text-xs sm:text-sm font-bold text-zinc-950 hover:underline cursor-pointer dark:text-white"
                                >
                                    {currentSong.title}
                                </h2>
                                <p
                                    onClick={() => {
                                        if (currentSong.creator) {
                                            setIsFullscreen(false);
                                            onNavigateToProfile?.(currentSong.creator);
                                        }
                                    }}
                                    className={`truncate text-[10px] sm:text-xs text-zinc-600 dark:text-zinc-400 ${currentSong.creator ? 'cursor-pointer hover:underline' : ''}`}
                                >
                                    {currentSong.creator || 'Unknown Artist'}
                                </p>
                            </div>
                            <button
                                onClick={onToggleLike}
                                className={`ml-1 sm:ml-2 hidden flex-shrink-0 transition-colors sm:block ${isLiked ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'}`}
                            >
                                <Star size={18} fill={isLiked ? "currentColor" : "none"} />
                            </button>
                        </div>

                        <div className="flex flex-shrink-0 flex-col items-center justify-center">
                            <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
                                <button
                                    onClick={onToggleShuffle}
                                    className={`hidden transition-colors sm:block ${isShuffle ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'}`}
                                >
                                    <Shuffle size={16} />
                                </button>
                                <button
                                    onClick={() => {
                                        setFullscreenSlideDirection('previous');
                                        onPrevious();
                                    }}
                                    className="text-zinc-700 hover:text-zinc-950 transition-colors dark:text-white/85 dark:hover:text-white"
                                >
                                    <SkipBack size={18} className="sm:h-[22px] sm:w-[22px]" fill="currentColor" />
                                </button>
                        <button
                            onClick={onTogglePlay}
                            disabled={isPlaybackLoading}
                            className={`h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center transition-transform ${isPlaybackLoading ? '' : 'hover:scale-105'} ${playbackButtonClassName} shadow-black/20 dark:shadow-black/30`}
                        >
                            {renderPlaybackGlyph(18, 18, 'ml-0.5 sm:h-5 sm:w-5')}
                                </button>
                                <button
                                    onClick={() => {
                                        setFullscreenSlideDirection('next');
                                        onNext();
                                    }}
                                    className="text-zinc-700 hover:text-zinc-950 transition-colors dark:text-white/85 dark:hover:text-white"
                                >
                                    <SkipForward size={18} className="sm:h-[22px] sm:w-[22px]" fill="currentColor" />
                                </button>
                                <button
                                    onClick={onToggleRepeat}
                                    className={`hidden transition-colors relative sm:block ${repeatMode !== 'none' ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'}`}
                                >
                                    {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
                                    {repeatMode !== 'none' && <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full" />}
                                </button>
                            </div>
                        </div>

                        <div className="flex min-w-0 flex-1 max-w-[30%] lg:max-w-[33%] items-center justify-end gap-1 sm:gap-2 lg:gap-3 text-zinc-500 dark:text-zinc-400">
                            <span className="hidden text-right font-mono text-[10px] text-zinc-600 dark:text-zinc-400 md:block sm:text-xs">
                                {playbackTimeLabel} / {playbackDurationLabel}
                            </span>
                            <div className="relative hidden lg:block" ref={speedMenuRef}>
                                <button
                                    className="px-2 py-1 text-[11px] font-mono font-bold hover:bg-black/5 rounded transition-colors min-w-[42px] text-center dark:hover:bg-white/10"
                                    onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                                >
                                    {playbackRate}x
                                </button>
                                {showSpeedMenu && (
                                    <div className="absolute bottom-full right-0 mb-2 bg-white rounded-lg shadow-xl border border-zinc-200 py-1 min-w-[80px] z-50 dark:bg-zinc-900 dark:border-white/10">
                                        {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((rate) => (
                                            <button
                                                key={rate}
                                                onClick={() => {
                                                    onPlaybackRateChange(rate);
                                                    setShowSpeedMenu(false);
                                                }}
                                                className={`w-full px-3 py-1.5 text-left text-xs font-mono hover:bg-zinc-100 transition-colors dark:hover:bg-white/10 ${
                                                    playbackRate === rate ? 'text-[#6f8f72] dark:text-[#a8c9a4] font-bold' : 'text-zinc-600 dark:text-zinc-300'
                                                }`}
                                            >
                                                {rate === 1.0 ? t('normalSpeed') : `${rate}x`}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div
                                className="relative hidden md:block"
                                onMouseEnter={() => {
                                    if (volumeHideTimer.current) clearTimeout(volumeHideTimer.current);
                                    setIsHoveringVolume(true);
                                }}
                                onMouseLeave={() => {
                                    volumeHideTimer.current = setTimeout(() => setIsHoveringVolume(false), 400);
                                }}
                            >
                                <button
                                    onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)}
                                    className="p-1.5 lg:p-2 hover:bg-black/5 rounded-full transition-colors dark:hover:bg-white/10"
                                >
                                    {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                                </button>

                                {isHoveringVolume && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pb-2">
                                        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-white/10 p-2">
                                            <div className="relative h-24 w-8 flex items-center justify-center">
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1"
                                                    step="0.01"
                                                    value={volume}
                                                    onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                                    className="w-24 h-8 -rotate-90 origin-center appearance-none bg-transparent cursor-pointer"
                                                    style={{
                                                        WebkitAppearance: 'none',
                                                        background: `linear-gradient(to right, rgb(143 182 143) 0%, rgb(143 182 143) ${volume * 100}%, rgb(228 228 231) ${volume * 100}%, rgb(228 228 231) 100%)`
                                                    }}
                                                />
                                            </div>
                                            <div className="text-[10px] text-center font-mono text-zinc-600 dark:text-zinc-400 mt-1">
                                                {Math.round(volume * 100)}%
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={handleDownload}
                                className="hidden p-1.5 lg:block lg:p-2 hover:bg-black/5 rounded-full transition-colors dark:hover:bg-white/10"
                                title={t('downloadAudio')}
                            >
                                <Download size={18} />
                            </button>
                            <div className="relative hidden sm:block">
                                <button
                                    onClick={() => setShowDropdown(!showDropdown)}
                                    className="p-1.5 lg:p-2 hover:bg-black/5 rounded-full transition-colors dark:hover:bg-white/10"
                                >
                                    <MoreVertical size={18} />
                                </button>
                                {showDropdown && (
                                    <SongDropdownMenu
                                        song={currentSong}
                                        isOpen={showDropdown}
                                        onClose={() => setShowDropdown(false)}
                                        isOwner={user?.id === currentSong.userId}
                                        position="right"
                                        direction="up"
                                        onCreateVideo={onOpenVideo}
                                        onReusePrompt={onReusePrompt}
                                        onAddToPlaylist={onAddToPlaylist}
                                        onDelete={onDelete}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-20 lg:h-24 bg-white dark:bg-black/95 backdrop-blur border-t border-zinc-200 dark:border-white/10 flex flex-col z-50 transition-colors duration-300 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] dark:shadow-none">

            {/* Progress Bar */}
            <div
                ref={progressBarRef}
                className="w-full h-1 lg:h-1.5 bg-zinc-200 dark:bg-zinc-800 cursor-pointer group relative"
                onClick={(e) => handleSeekInteraction(e, progressBarRef)}
            >
                <div
                    className="h-full bg-zinc-900 dark:bg-white relative group-hover:bg-[#8fb68f] transition-colors"
                    style={{ width: `${progressPercent}%` }}
                >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-zinc-900 dark:bg-white group-hover:bg-[#8fb68f] rounded-full shadow-lg -mr-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                {/* Hit area for easier clicking */}
                <div className="absolute top-1/2 -translate-y-1/2 w-full h-4 -z-10"></div>
            </div>

            <div className="flex-1 flex items-center justify-between px-2 sm:px-4 lg:px-6 gap-2 sm:gap-4">

                {/* Song Info */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 max-w-[30%] lg:max-w-[33%]">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 rounded bg-zinc-200 dark:bg-zinc-800 overflow-hidden shadow-sm flex-shrink-0">
                        {currentSong.coverUrl ? (
                            <img src={currentSong.coverUrl} className="w-full h-full object-cover" alt="cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        ) : null}
                        {!currentSong.coverUrl && <AlbumCover seed={currentSong.id || currentSong.title} size="full" className="w-full h-full" />}
                    </div>
                    <div className="overflow-hidden min-w-0">
                        <h4
                            onClick={() => onNavigateToSong?.(currentSong.id)}
                            className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate cursor-pointer hover:underline"
                        >
                            {currentSong.title}
                        </h4>
                        <p
                            onClick={() => currentSong.creator && onNavigateToProfile?.(currentSong.creator)}
                            className={`text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 truncate ${currentSong.creator ? 'hover:underline cursor-pointer' : ''}`}
                        >
                            {currentSong.creator || 'Unknown Artist'}
                        </p>
                    </div>
                    <button
                        onClick={onToggleLike}
                        className={`ml-1 sm:ml-2 transition-colors flex-shrink-0 hidden sm:block ${isLiked ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}
                    >
                        <Star size={18} fill={isLiked ? "currentColor" : "none"} />
                    </button>
                </div>

                {/* Controls */}
                <div className="flex flex-col items-center justify-center flex-shrink-0">
                    <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
                        <button
                            onClick={onToggleShuffle}
                            className={`transition-colors hidden sm:block ${isShuffle ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}
                        >
                            <Shuffle size={16} />
                        </button>
                        <button
                            onClick={onPrevious}
                            className="text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors"
                        >
                            <SkipBack size={18} className="sm:w-[22px] sm:h-[22px]" fill="currentColor" />
                        </button>
                        <button
                            onClick={onTogglePlay}
                            disabled={isPlaybackLoading}
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-transform shadow-lg ${isPlaybackLoading ? '' : 'hover:scale-105'} ${playbackButtonClassName}`}
                        >
                            {renderPlaybackGlyph(18, 18, 'sm:w-5 sm:h-5 ml-0.5')}
                        </button>
                        <button
                            onClick={onNext}
                            className="text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors"
                        >
                            <SkipForward size={18} className="sm:w-[22px] sm:h-[22px]" fill="currentColor" />
                        </button>
                        <button
                            onClick={onToggleRepeat}
                            className={`transition-colors hidden sm:block ${repeatMode !== 'none' ? 'text-[#6f8f72] dark:text-[#a8c9a4]' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'} relative`}
                        >
                            {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
                            {repeatMode !== 'none' && <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full"></div>}
                        </button>
                    </div>
                </div>

                {/* Volume & Extras */}
                <div className="flex items-center justify-end gap-1 sm:gap-2 lg:gap-3 min-w-0 flex-1 max-w-[30%] lg:max-w-[33%] text-zinc-500 dark:text-zinc-400">
                    <span className="text-[10px] sm:text-xs font-mono text-right text-zinc-600 dark:text-zinc-400 hidden md:block">
                        {playbackTimeLabel} / {playbackDurationLabel}
                    </span>

                    {/* Playback Speed */}
                    <div className="relative group hidden lg:block" ref={speedMenuRef}>
                        <button
                            className="px-2 py-1 text-[11px] font-mono font-bold hover:bg-zinc-200 dark:hover:bg-white/10 rounded transition-colors min-w-[42px] text-center"
                            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                        >
                            {playbackRate}x
                        </button>
                        {showSpeedMenu && (
                            <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-white/10 py-1 min-w-[80px] z-50">
                                {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((rate) => (
                                    <button
                                        key={rate}
                                        onClick={() => {
                                            onPlaybackRateChange(rate);
                                            setShowSpeedMenu(false);
                                        }}
                                        className={`w-full px-3 py-1.5 text-left text-xs font-mono hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors ${
                                            playbackRate === rate ? 'text-[#6f8f72] dark:text-[#a8c9a4] font-bold' : 'text-zinc-700 dark:text-zinc-300'
                                        }`}
                                    >
                                        {rate === 1.0 ? t('normalSpeed') : `${rate}x`}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Volume Control with Vertical Slider */}
                    <div
                        className="relative group hidden md:block"
                        onMouseEnter={() => {
                            if (volumeHideTimer.current) clearTimeout(volumeHideTimer.current);
                            setIsHoveringVolume(true);
                        }}
                        onMouseLeave={() => {
                            volumeHideTimer.current = setTimeout(() => setIsHoveringVolume(false), 400);
                        }}
                    >
                        <button
                            onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)}
                            className="p-1.5 lg:p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors"
                        >
                            {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>

                        {/* Vertical Volume Slider */}
                        {isHoveringVolume && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pb-2">
                                <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-white/10 p-2">
                                    <div className="relative h-24 w-8 flex items-center justify-center">
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.01"
                                            value={volume}
                                            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                            className="w-24 h-8 -rotate-90 origin-center appearance-none bg-transparent cursor-pointer"
                                            style={{
                                                WebkitAppearance: 'none',
                                                background: `linear-gradient(to right, rgb(143 182 143) 0%, rgb(143 182 143) ${volume * 100}%, rgb(228 228 231) ${volume * 100}%, rgb(228 228 231) 100%)`
                                            }}
                                        />
                                    </div>
                                    <div className="text-[10px] text-center font-mono text-zinc-600 dark:text-zinc-400 mt-1">
                                        {Math.round(volume * 100)}%
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleDownload}
                        className="p-1.5 lg:p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors hidden lg:block"
                        title={t('downloadAudio')}
                    >
                        <Download size={18} />
                    </button>
                    <button
                        onClick={() => setIsFullscreen(true)}
                        className="p-1.5 lg:p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors"
                    >
                        <Maximize2 size={16} />
                    </button>
                    <div className="relative hidden sm:block">
                        <button
                            onClick={() => setShowDropdown(!showDropdown)}
                            className="p-1.5 lg:p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors"
                        >
                            <MoreVertical size={18} />
                        </button>
                        <SongDropdownMenu
                            song={currentSong}
                            isOpen={showDropdown}
                            onClose={() => setShowDropdown(false)}
                            isOwner={user?.id === currentSong.userId}
                            position="right"
                            direction="up"
                            onCreateVideo={onOpenVideo}
                            onReusePrompt={onReusePrompt}
                            onAddToPlaylist={onAddToPlaylist}
                            onDelete={onDelete}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
