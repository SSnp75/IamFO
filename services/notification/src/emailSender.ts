/**
 * Email delivery abstraction. Phase 0 uses an in-memory sender for tests and a
 * Resend/Brevo-backed sender in the deployed Worker; both implement this
 * interface so the service is provider-agnostic.
 */
export interface EmailSender {
  send(to: string, subject: string, body: string): Promise<void>;
}

/** In-memory sender for tests; records sent messages. Can be told to fail. */
export class InMemoryEmailSender implements EmailSender {
  readonly sent: Array<{ to: string; subject: string; body: string }> = [];
  private failuresRemaining = 0;

  /** Make the next `n` send() calls throw, to exercise retry logic. */
  failNext(n: number): void {
    this.failuresRemaining = n;
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error('simulated email failure');
    }
    this.sent.push({ to, subject, body });
  }
}
