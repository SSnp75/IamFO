/**
 * Automated content moderation filter (Requirement 12). Pluggable so a real
 * provider (e.g. Perspective API) can be swapped in later; Phase 0 ships a
 * simple deny-list stub that is deterministic and dependency-free.
 */
export interface ModerationVerdict {
  flagged: boolean;
  reason?: string;
}

export interface ModerationFilter {
  /** Inspect text; resolve within the caller's timeout budget. */
  check(text: string): Promise<ModerationVerdict>;
}

/**
 * Deny-list stub. Flags content containing any configured term (case-insensitive,
 * whole-word). The default list is intentionally small; production swaps this
 * for a real service behind the same interface.
 */
export class DenyListModerationFilter implements ModerationFilter {
  private readonly terms: string[];
  constructor(terms: string[] = DEFAULT_DENY_TERMS) {
    this.terms = terms.map((t) => t.toLowerCase());
  }

  async check(text: string): Promise<ModerationVerdict> {
    const lower = text.toLowerCase();
    for (const term of this.terms) {
      const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
      if (re.test(lower)) {
        return { flagged: true, reason: 'matched_denylist' };
      }
    }
    return { flagged: false };
  }
}

const DEFAULT_DENY_TERMS = ['spamword', 'bannedterm'];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A filter that never flags — useful in tests focusing on non-moderation logic. */
export class AllowAllModerationFilter implements ModerationFilter {
  async check(): Promise<ModerationVerdict> {
    return { flagged: false };
  }
}
