import fc from 'fast-check';
import {
  computeScore,
  isPeerRatingWindowOpen,
  PEER_RATING_WINDOW_MS,
  type ScoreInputs,
} from './scoreCalculator';

describe('PM score calculation', () => {
  // Feature: iamfriendof-volunteer-network, Property 19: PM_Score in [0,100] and self-assessment <= 25%
  it('Property 19: score always in [0, 100] and self-assessment contribution never exceeds 25%', () => {
    const inputsArb = fc.record({
      eventsOrganised: fc.integer({ min: 0, max: 50 }),
      completionRate: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: null }),
      avgPeerRating: fc.option(fc.float({ min: 1, max: 5, noNaN: true }), { nil: null }),
      selfAssessmentScore: fc.option(fc.float({ min: 0, max: 100, noNaN: true }), { nil: null }),
    });
    fc.assert(
      fc.property(inputsArb, (inputs: ScoreInputs) => {
        const { score, components } = computeScore(inputs);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
        // Self-assessment weight must never exceed 0.25 of the total.
        expect(components.selfAssessment.weight).toBeLessThanOrEqual(0.25 + 1e-9);
        // Effective weights sum to ~1 when any component is present, else 0.
        const sum =
          components.eventsOrganised.weight +
          components.completionRate.weight +
          components.peerRating.weight +
          components.selfAssessment.weight;
        expect(sum === 0 || Math.abs(sum - 1) < 1e-9).toBe(true);
      }),
    );
  });

  it('redistributes self-assessment weight when it is absent', () => {
    const withSelf = computeScore({
      eventsOrganised: 5,
      completionRate: 0.8,
      avgPeerRating: 4,
      selfAssessmentScore: 60,
    });
    const withoutSelf = computeScore({
      eventsOrganised: 5,
      completionRate: 0.8,
      avgPeerRating: 4,
      selfAssessmentScore: null,
    });
    expect(withSelf.components.selfAssessment.weight).toBeGreaterThan(0);
    expect(withoutSelf.components.selfAssessment.weight).toBe(0);
    // Other components' weights should be larger when self-assessment is absent.
    expect(withoutSelf.components.eventsOrganised.weight).toBeGreaterThan(
      withSelf.components.eventsOrganised.weight,
    );
  });

  it('gives a perfect score for maxed-out inputs', () => {
    const { score } = computeScore({
      eventsOrganised: 10,
      completionRate: 1,
      avgPeerRating: 5,
      selfAssessmentScore: 100,
    });
    expect(score).toBe(100);
  });

  it('peer-rating window closes 14 days after event end', () => {
    const end = 1_000_000_000;
    expect(isPeerRatingWindowOpen(end, end)).toBe(true);
    expect(isPeerRatingWindowOpen(end, end + PEER_RATING_WINDOW_MS)).toBe(true);
    expect(isPeerRatingWindowOpen(end, end + PEER_RATING_WINDOW_MS + 1)).toBe(false);
  });
});
