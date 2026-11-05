export type AppErrorCode =
  | "validation"
  | "rate_limited"
  | "invalid_invitation"
  | "invalid_credentials"
  | "forbidden"
  | "not_found"
  | "conflict";

/** Expected, user-presentable failures. Anything else is a 500. */
export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
