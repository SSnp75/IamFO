import { AppError, ERROR_CODES } from '@iamfriendof/shared';

export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (Requirement 5.3)
export const BOUNDARY = 400; // 400x400 boundary (Requirement 5.4/5.5)
export const ALT_MIN = 1;
export const ALT_MAX = 200; // Requirement 13.5/13.6

export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AcceptedMime = (typeof ACCEPTED_MIME)[number];

/** Format gate (Requirement 5.1/5.2). */
export function isValidImageFormat(mime: string): mime is AcceptedMime {
  return (ACCEPTED_MIME as readonly string[]).includes(mime);
}

/** Alt text validity (Requirement 13.5/13.6): length in [1, 200]. */
export function isValidAltText(alt: string): boolean {
  return alt.length >= ALT_MIN && alt.length <= ALT_MAX;
}

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Compute the stored dimensions for an image, fitting within a 400x400 boundary
 * while preserving aspect ratio and never upscaling (Requirement 5.4/5.5).
 *
 * - If both dimensions are already <= 400, return them unchanged (no upscale).
 * - Otherwise scale down by the larger dimension's ratio so max(w,h) becomes 400,
 *   rounding to whole pixels.
 */
export function computeResizedDimensions(width: number, height: number): Dimensions {
  if (width <= 0 || height <= 0) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid image dimensions', 422);
  }
  if (width <= BOUNDARY && height <= BOUNDARY) {
    return { width, height };
  }
  const scale = BOUNDARY / Math.max(width, height);
  // Round but clamp to at least 1px and at most BOUNDARY.
  const w = Math.min(BOUNDARY, Math.max(1, Math.round(width * scale)));
  const h = Math.min(BOUNDARY, Math.max(1, Math.round(height * scale)));
  return { width: w, height: h };
}

/** Assert an upload's format, size, and alt text; throws AppError on failure. */
export function validateUpload(mime: string, byteSize: number, altText: string): void {
  if (!isValidImageFormat(mime)) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_IMAGE_FORMAT,
      `Unsupported image format. Accepted: ${ACCEPTED_MIME.join(', ')}`,
      415,
    );
  }
  if (byteSize > MAX_BYTES) {
    throw new AppError(ERROR_CODES.IMAGE_TOO_LARGE, 'Image exceeds the 5 MB maximum', 422);
  }
  if (!isValidAltText(altText)) {
    throw new AppError(
      ERROR_CODES.ALT_TEXT_INVALID,
      `Alt text is required and must be ${ALT_MIN}-${ALT_MAX} characters`,
      422,
    );
  }
}
