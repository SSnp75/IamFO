import {
  AppError,
  ERROR_CODES,
  EVENTS,
  hashPassword,
  type Db,
  type MessageBus,
} from '@iamfriendof/shared';
import { RegistrationRepository } from './repository';
import { validateRegistration, type RegistrationInput, type SkillDeclaration } from './validation';

export { registrationMigrations } from './migrations';
export * from './validation';

const VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours (Req 1.10)

/** Generate a cryptographically random URL-safe verification token. */
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

interface RegistrationBody {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  country?: unknown;
  password?: unknown;
  skills?: unknown;
}

function parseBody(raw: unknown): RegistrationInput {
  const b = (raw ?? {}) as RegistrationBody;
  const skills: SkillDeclaration[] = Array.isArray(b.skills)
    ? b.skills.map((s) => ({
        name: String((s as { name?: unknown })?.name ?? ''),
        isCustom: Boolean((s as { isCustom?: unknown })?.isCustom),
      }))
    : [];
  return {
    firstName: typeof b.firstName === 'string' ? b.firstName : '',
    lastName: typeof b.lastName === 'string' ? b.lastName : '',
    email: typeof b.email === 'string' ? b.email : '',
    country: typeof b.country === 'string' ? b.country : '',
    password: typeof b.password === 'string' ? b.password : '',
    skills,
  };
}

/**
 * Core registration operations, DB/bus-injected so they are unit-testable.
 * The HTTP module (registerRoutes) is a thin adapter over these.
 */
export class RegistrationService {
  private readonly repo: RegistrationRepository;
  constructor(private readonly db: Db, private readonly bus: MessageBus) {
    this.repo = new RegistrationRepository(db);
  }

  async register(rawBody: unknown, now: Date = new Date()): Promise<{ memberId: string }> {
    const input = parseBody(rawBody);
    validateRegistration(input); // throws AppError on invalid input

    if (await this.repo.emailExists(input.email)) {
      throw new AppError(ERROR_CODES.EMAIL_ALREADY_REGISTERED, 'That email address is already registered', 409);
    }

    const passwordHash = await hashPassword(input.password);
    const token = generateToken();
    const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MS);

    const memberId = await this.repo.createMember({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      country: input.country,
      passwordHash,
      verificationToken: token,
      tokenExpiresAt: expiresAt,
    });

    // Notification module consumes this to send the verification email (Req 1.6).
    await this.bus.publish(EVENTS.MEMBER_REGISTERED, {
      memberId,
      email: input.email,
      verificationToken: token,
    });

    return { memberId };
  }

  async verify(token: string, now: Date = new Date()): Promise<void> {
    if (!token) {
      throw new AppError(ERROR_CODES.VERIFICATION_LINK_INVALID, 'Verification link is invalid or expired', 400);
    }
    const result = await this.repo.consumeVerification(token, now);
    if (result === 'invalid') {
      throw new AppError(ERROR_CODES.VERIFICATION_LINK_INVALID, 'Verification link is invalid or expired', 400);
    }
  }

  async resend(email: string, now: Date = new Date()): Promise<void> {
    const member = await this.repo.findByEmail(email);
    // Do not reveal whether the email exists; only act if unverified.
    if (member && !member.is_verified) {
      const token = generateToken();
      const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MS);
      await this.repo.createVerificationToken(member.id, token, expiresAt);
      await this.bus.publish(EVENTS.MEMBER_REGISTERED, { memberId: member.id, email, verificationToken: token });
    }
  }
}
