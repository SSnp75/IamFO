/**
 * PM score calculation (Requirement 9.1, Property 19).
 *
 * Four components, each normalised to a 0–100 sub-score, combined with weights:
 *   - eventsOrganised    (base weight 0.35, within the 30–40% band)
 *   - completionRate     (base weight 0.25, within 20–30%)
 *   - peerRating         (base weight 0.25, within 20–30%)
 *   - selfAssessment     (base weight 0.15, capped at <= 25%)
 *
 * When the self-assessment is absent, its weight is redistributed
 * proportionally across the other three components (Requirement 9.7). The
 * result is always within [0, 100], and the self-assessment contribution never
 * exceeds 25% of the total (Property 19).
 */

export interface ScoreInputs {
  /** Number of completed events organised. */
  eventsOrganised: number;
  /** On-time completion rate in [0, 1], or null if unknown. */
  completionRate: number | null;
  /** Average peer rating in [1, 5], or null if none. */
  avgPeerRating: number | null;
  /** Self-assessment sub-score in [0, 100], or null if not completed. */
  selfAssessmentScore: number | null;
}

export interface ScoreBreakdown {
  score: number; // 0..100
  components: {
    eventsOrganised: { subScore: number; weight: number };
    completionRate: { subScore: number; weight: number };
    peerRating: { subScore: number; weight: number };
    selfAssessment: { subScore: number; weight: number };
  };
}

const BASE_WEIGHTS = {
  eventsOrganised: 0.35,
  completionRate: 0.25,
  peerRating: 0.25,
  selfAssessment: 0.15,
} as const;

/** Cap the events-organised sub-score: 10+ completed events => full marks. */
const EVENTS_FOR_FULL = 10;

/** Self-assessment may contribute at most 25% of the total (Requirement 9.6). */
const SELF_ASSESSMENT_CAP = 0.25;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Map raw inputs to 0–100 sub-scores. Missing inputs map to 0 (and get weight 0). */
function subScores(inputs: ScoreInputs) {
  return {
    eventsOrganised: clamp((inputs.eventsOrganised / EVENTS_FOR_FULL) * 100, 0, 100),
    completionRate: inputs.completionRate === null ? 0 : clamp(inputs.completionRate * 100, 0, 100),
    peerRating: inputs.avgPeerRating === null ? 0 : clamp(((inputs.avgPeerRating - 1) / 4) * 100, 0, 100),
    selfAssessment: inputs.selfAssessmentScore === null ? 0 : clamp(inputs.selfAssessmentScore, 0, 100),
  };
}

/**
 * Compute the weighted PM score. Weights of absent components are redistributed
 * proportionally across the present components so the effective weights always
 * sum to 1 (when at least one component is present). If nothing is present,
 * the score is 0.
 */
export function computeScore(inputs: ScoreInputs): ScoreBreakdown {
  const subs = subScores(inputs);

  const present = {
    eventsOrganised: true, // always present (0 events => sub-score 0, still counts)
    completionRate: inputs.completionRate !== null,
    peerRating: inputs.avgPeerRating !== null,
    selfAssessment: inputs.selfAssessmentScore !== null,
  };

  // Effective weights: start from base, zero out absent, renormalise to sum 1.
  const raw = {
    eventsOrganised: present.eventsOrganised ? BASE_WEIGHTS.eventsOrganised : 0,
    completionRate: present.completionRate ? BASE_WEIGHTS.completionRate : 0,
    peerRating: present.peerRating ? BASE_WEIGHTS.peerRating : 0,
    selfAssessment: present.selfAssessment ? BASE_WEIGHTS.selfAssessment : 0,
  };
  const total = raw.eventsOrganised + raw.completionRate + raw.peerRating + raw.selfAssessment;

  let weights =
    total === 0
      ? { eventsOrganised: 0, completionRate: 0, peerRating: 0, selfAssessment: 0 }
      : {
          eventsOrganised: raw.eventsOrganised / total,
          completionRate: raw.completionRate / total,
          peerRating: raw.peerRating / total,
          selfAssessment: raw.selfAssessment / total,
        };

  // Cap the self-assessment contribution at 25% of the total (Requirement 9.6).
  // If renormalisation pushed it above the cap, clamp it and redistribute the
  // excess proportionally across the other present components.
  if (weights.selfAssessment > SELF_ASSESSMENT_CAP) {
    const excess = weights.selfAssessment - SELF_ASSESSMENT_CAP;
    weights.selfAssessment = SELF_ASSESSMENT_CAP;
    const otherTotal = weights.eventsOrganised + weights.completionRate + weights.peerRating;
    if (otherTotal > 0) {
      weights = {
        eventsOrganised: weights.eventsOrganised + (excess * weights.eventsOrganised) / otherTotal,
        completionRate: weights.completionRate + (excess * weights.completionRate) / otherTotal,
        peerRating: weights.peerRating + (excess * weights.peerRating) / otherTotal,
        selfAssessment: weights.selfAssessment,
      };
    }
  }

  const score =
    subs.eventsOrganised * weights.eventsOrganised +
    subs.completionRate * weights.completionRate +
    subs.peerRating * weights.peerRating +
    subs.selfAssessment * weights.selfAssessment;

  return {
    score: clamp(Math.round(score * 100) / 100, 0, 100),
    components: {
      eventsOrganised: { subScore: subs.eventsOrganised, weight: weights.eventsOrganised },
      completionRate: { subScore: subs.completionRate, weight: weights.completionRate },
      peerRating: { subScore: subs.peerRating, weight: weights.peerRating },
      selfAssessment: { subScore: subs.selfAssessment, weight: weights.selfAssessment },
    },
  };
}

/** Peer ratings are only accepted within 14 days of the event end (Req 9.3). */
export const PEER_RATING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function isPeerRatingWindowOpen(eventEndMs: number, nowMs: number): boolean {
  return nowMs <= eventEndMs + PEER_RATING_WINDOW_MS;
}

/** Minimum completed events before a numeric score is shown (Req 9.9). */
export const MIN_EVENTS_FOR_SCORE = 3;
