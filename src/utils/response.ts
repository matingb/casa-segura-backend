export function successResponse<T>(data: T) {
  return { status: 'success' as const, data };
}

export function errorResponse(message: string) {
  return { status: 'error' as const, message };
}

export function paginatedResponse<T>(items: T[], hasMore: boolean) {
  return { status: 'success' as const, data: items, page: { hasMore } };
}
