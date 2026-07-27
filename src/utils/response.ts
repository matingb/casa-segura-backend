export function successResponse<T>(data: T) {
  return { status: 'success' as const, data };
}

export function errorResponse(message: string) {
  return { status: 'error' as const, message };
}
