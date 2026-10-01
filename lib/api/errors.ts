// Public API error codes and the error class thrown by API helpers. Written for the
// self-hosted fork: the module is imported by the core but missing upstream.
import { DocumentError } from "@/lib/errorHandler";

export const ERROR_CODES = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invite_expired: 410,
  unprocessable_entity: 422,
  rate_limit_exceeded: 429,
  internal_server_error: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/**
 * Extends DocumentError so the existing `errorhandler` answers with the right status and
 * message instead of a generic 500.
 */
export class PapermarkApiError extends DocumentError {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "PapermarkApiError";
    this.code = code;
    this.statusCode = ERROR_CODES[code];
  }
}
