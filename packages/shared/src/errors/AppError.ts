import type { ErrorCode } from './codes';

/** Serialised error shape returned to clients: { error: { code, message, details? } }. */
export interface SerialisedError {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/**
 * Base application error carrying an HTTP status, a stable error code, and an
 * optional details payload (e.g. field-level validation info).
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, httpStatus: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON(): SerialisedError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }

  static isAppError(value: unknown): value is AppError {
    return value instanceof AppError;
  }
}
