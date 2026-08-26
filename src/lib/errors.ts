// Typed application errors that the central error handler maps to HTTP responses.

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = "app_error",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request") {
    super(400, message, "bad_request");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, "forbidden");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, message, "not_found");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(409, message, "conflict");
  }
}
