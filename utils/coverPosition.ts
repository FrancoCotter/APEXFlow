export type NormalizedPoint = { x: number; y: number };

export type NormalizedBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SafeCoverPositionOptions = {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  focus?: NormalizedPoint | null;
  box?: NormalizedBox | null;
  biasY?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const normalizePoint = (point?: NormalizedPoint | null): NormalizedPoint => ({
  x: isFiniteNumber(point?.x) ? clamp(point.x, 0, 1) : 0.5,
  y: isFiniteNumber(point?.y) ? clamp(point.y, 0, 1) : 0.5,
});

export const normalizedBoxFromValues = (
  x?: number | null,
  y?: number | null,
  width?: number | null,
  height?: number | null
): NormalizedBox | null => {
  if (![x, y, width, height].every(isFiniteNumber)) return null;
  if (width! <= 0 || height! <= 0) return null;

  return {
    x: clamp(x!, 0, 1),
    y: clamp(y!, 0, 1),
    width: clamp(width!, 0, 1),
    height: clamp(height!, 0, 1),
  };
};

export const deriveFocusSafeBox = (
  focus?: NormalizedPoint | null,
  box?: NormalizedBox | null,
  options: { widthScale?: number; heightScale?: number; minSize?: number; anchorY?: number } = {}
): NormalizedBox | null => {
  const sourceBox = box ? {
    x: clamp(box.x, 0, 1),
    y: clamp(box.y, 0, 1),
    width: clamp(box.width, 0, 1),
    height: clamp(box.height, 0, 1),
  } : null;
  const point = normalizePoint(focus);
  if (!sourceBox) return null;

  const widthScale = options.widthScale ?? 0.42;
  const heightScale = options.heightScale ?? 0.36;
  const minSize = options.minSize ?? 0.12;
  const anchorY = options.anchorY ?? 0.42;

  const safeWidth = clamp(Math.max(sourceBox.width * widthScale, minSize), 0.08, 0.42);
  const safeHeight = clamp(Math.max(sourceBox.height * heightScale, minSize), 0.1, 0.38);

  const left = clamp(point.x - safeWidth / 2, 0, 1 - safeWidth);
  const top = clamp(point.y - safeHeight * anchorY, 0, 1 - safeHeight);

  return {
    x: left,
    y: top,
    width: safeWidth,
    height: safeHeight,
  };
};

const resolveAxis = (
  desiredStart: number,
  visibleSize: number,
  imageSize: number,
  safeStart?: number,
  safeEnd?: number
) => {
  const maxStart = Math.max(0, imageSize - visibleSize);
  if (maxStart === 0) return 0.5;

  const clampedDesired = clamp(desiredStart, 0, maxStart);
  if (!isFiniteNumber(safeStart) || !isFiniteNumber(safeEnd)) {
    return clampedDesired / maxStart;
  }

  const safeSize = safeEnd - safeStart;
  if (safeSize >= visibleSize) {
    return clamp((safeStart + safeEnd - visibleSize) / 2, 0, maxStart) / maxStart;
  }

  const allowedMin = clamp(safeEnd - visibleSize, 0, maxStart);
  const allowedMax = clamp(safeStart, 0, maxStart);
  if (allowedMin <= allowedMax) {
    return clamp(clampedDesired, allowedMin, allowedMax) / maxStart;
  }

  return clamp((safeStart + safeEnd - visibleSize) / 2, 0, maxStart) / maxStart;
};

export const getSafeCoverObjectPosition = ({
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  focus,
  box,
  biasY = 0,
}: SafeCoverPositionOptions): string => {
  const fallbackFocus = normalizePoint(focus);
  if (
    imageWidth <= 0
    || imageHeight <= 0
    || containerWidth <= 0
    || containerHeight <= 0
  ) {
    return `${fallbackFocus.x * 100}% ${fallbackFocus.y * 100}%`;
  }

  const scale = Math.max(containerWidth / imageWidth, containerHeight / imageHeight);
  const visibleWidth = Math.min(imageWidth, containerWidth / scale);
  const visibleHeight = Math.min(imageHeight, containerHeight / scale);

  const desiredCenterX = fallbackFocus.x * imageWidth;
  const desiredCenterY = clamp(
    fallbackFocus.y * imageHeight + visibleHeight * biasY,
    0,
    imageHeight
  );

  let safeLeft: number | undefined;
  let safeRight: number | undefined;
  let safeTop: number | undefined;
  let safeBottom: number | undefined;

  if (box) {
    const boxLeft = clamp(box.x, 0, 1) * imageWidth;
    const boxTop = clamp(box.y, 0, 1) * imageHeight;
    const boxWidth = clamp(box.width, 0, 1) * imageWidth;
    const boxHeight = clamp(box.height, 0, 1) * imageHeight;
    const boxRight = clamp(boxLeft + boxWidth, 0, imageWidth);
    const boxBottom = clamp(boxTop + boxHeight, 0, imageHeight);

    const padX = Math.min(boxWidth * 0.18, Math.max(0, (visibleWidth - (boxRight - boxLeft)) / 2));
    const padY = Math.min(boxHeight * 0.24, Math.max(0, (visibleHeight - (boxBottom - boxTop)) / 2));

    safeLeft = clamp(boxLeft - padX, 0, imageWidth);
    safeRight = clamp(boxRight + padX, 0, imageWidth);
    safeTop = clamp(boxTop - padY, 0, imageHeight);
    safeBottom = clamp(boxBottom + padY, 0, imageHeight);
  }

  const x = resolveAxis(
    desiredCenterX - visibleWidth / 2,
    visibleWidth,
    imageWidth,
    safeLeft,
    safeRight
  );
  const y = resolveAxis(
    desiredCenterY - visibleHeight / 2,
    visibleHeight,
    imageHeight,
    safeTop,
    safeBottom
  );

  return `${(x * 100).toFixed(3)}% ${(y * 100).toFixed(3)}%`;
};
