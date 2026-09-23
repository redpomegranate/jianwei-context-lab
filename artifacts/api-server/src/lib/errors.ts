export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function sanitizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (
    error instanceof SyntaxError &&
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 400
  ) {
    return new ApiError(400, "INVALID_JSON", "请求正文不是有效的 JSON");
  }
  return new ApiError(500, "INTERNAL_ERROR", "请求暂时无法完成");
}