/**
 * Custom error classes for Runic Protocol
 */

export class RunicError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'RUNIC_ERROR'
  ) {
    super(message);
    this.name = 'RunicError';
  }
}

export class NotFoundError extends RunicError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id '${id}' not found` : `${resource} not found`,
      404,
      'NOT_FOUND'
    );
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends RunicError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends RunicError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends RunicError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends RunicError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class AuctionError extends RunicError {
  constructor(message: string) {
    super(message, 400, 'AUCTION_ERROR');
    this.name = 'AuctionError';
  }
}






