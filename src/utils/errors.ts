export class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class CatalogoError extends BusinessError {
  constructor(message: string, public code: string, public status = 400) {
    super(message);
    this.name = 'CatalogoError';
  }
}
