import fc from 'fast-check';
import {
  isValidImageFormat,
  isValidAltText,
  computeResizedDimensions,
  BOUNDARY,
  ALT_MAX,
} from './imageProcessor';

describe('Media image processing', () => {
  // Feature: iamfriendof-volunteer-network, Property 10: Profile picture format gate
  it('Property 10: accepts an image iff MIME is jpeg/png/webp', () => {
    const accepted = ['image/jpeg', 'image/png', 'image/webp'];
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom(...accepted),
          fc.constantFrom('image/gif', 'image/svg+xml', 'application/pdf', 'text/plain', 'image/bmp'),
        ),
        (mime) => {
          expect(isValidImageFormat(mime)).toBe(accepted.includes(mime));
        },
      ),
    );
  });

  // Feature: iamfriendof-volunteer-network, Property 11: Image resize preserves aspect ratio within 400x400
  it('Property 11: images with a dimension > 400 fit within 400x400 preserving ratio', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8000 }),
        fc.integer({ min: 1, max: 8000 }),
        (w, h) => {
          fc.pre(Math.max(w, h) > BOUNDARY); // only the resize branch
          const out = computeResizedDimensions(w, h);
          expect(out.width).toBeLessThanOrEqual(BOUNDARY);
          expect(out.height).toBeLessThanOrEqual(BOUNDARY);
          // The larger side should be at (or one px within) the boundary.
          expect(Math.max(out.width, out.height)).toBeGreaterThanOrEqual(BOUNDARY - 1);
          // Aspect ratio preserved: each output dimension must be within 1px of
          // the ideal (unrounded) scaled value. A relative-to-pixel tolerance is
          // the correct invariant, since exact ratios are unrepresentable at
          // integer pixels (e.g. 401x1 cannot keep a 401:1 ratio at height 1).
          const scale = BOUNDARY / Math.max(w, h);
          expect(Math.abs(out.width - w * scale)).toBeLessThanOrEqual(1);
          expect(Math.abs(out.height - h * scale)).toBeLessThanOrEqual(1);
        },
      ),
    );
  });

  // Feature: iamfriendof-volunteer-network, Property 12: Images within boundary stored without resizing
  it('Property 12: images with both dimensions <= 400 are unchanged (no upscale)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: BOUNDARY }),
        fc.integer({ min: 1, max: BOUNDARY }),
        (w, h) => {
          const out = computeResizedDimensions(w, h);
          expect(out).toEqual({ width: w, height: h });
        },
      ),
    );
  });

  // Feature: iamfriendof-volunteer-network, Property 22: Alt text length controls acceptance
  it('Property 22: accepts alt text iff length in [1, 200]', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 260 }), (alt) => {
        expect(isValidAltText(alt)).toBe(alt.length >= 1 && alt.length <= ALT_MAX);
      }),
    );
  });
});
