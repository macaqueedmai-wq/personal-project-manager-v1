import type { ZodError, ZodType } from 'zod';

/** An error that may safely be returned to the client. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function zodFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        fieldErrors[key] ??= '不允許的欄位';
      }
      continue;
    }

    const key = issue.path.length === 0 ? '_' : issue.path.map((part) => String(part)).join('.');
    fieldErrors[key] ??= issue.message;
  }

  return fieldErrors;
}

export function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', '輸入格式有誤', zodFieldErrors(result.error));
  }

  return result.data;
}
