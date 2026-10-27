export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "BAD_REQUEST",
  ) {
    super(message);
  }
}
export const forbidden = (m = "غير مصرح لك بتنفيذ هذه العملية") => new AppError(m, 403, "FORBIDDEN");
export const notFound = (m = "السجل غير موجود") => new AppError(m, 404, "NOT_FOUND");
export const conflict = (m: string) => new AppError(m, 409, "CONFLICT");
