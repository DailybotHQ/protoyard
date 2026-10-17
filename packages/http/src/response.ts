/**
 * What a route handler may return besides plain data: an explicit status,
 * headers and body. `undefined` from a handler means 204 No Content.
 */
export class MockResponse<T = unknown> {
  readonly status: number;
  readonly body: T;
  readonly headers: Record<string, string>;

  constructor(status: number, body: T, headers: Record<string, string> = {}) {
    if (!Number.isInteger(status) || status < 200 || status > 599) {
      throw new RangeError(`MockResponse: invalid HTTP status ${status}`);
    }
    this.status = status;
    this.body = body;
    this.headers = headers;
  }
}

/** `return json(deal, { status: 201 })` */
export function json<T>(
  body: T,
  init: { status?: number; headers?: Record<string, string> } = {}
): MockResponse<T> {
  return new MockResponse(init.status ?? 200, body, init.headers);
}

/**
 * Throw from a handler for an explicit HTTP error:
 * `throw new HttpError(404, 'Deal not found')`.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = CODES[status] ?? 'error';
    this.details = details;
  }
}

export const CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  402: 'payment_required',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  422: 'validation_failed',
  429: 'rate_limited',
  500: 'internal',
  502: 'bad_gateway',
  503: 'unavailable',
  504: 'timeout',
};

/** Every mock response is labelled so DevTools and people can tell it apart. */
export const MOCK_HEADER = 'x-protoyard-mock';

export function toResponse(result: MockResponse): Response {
  const headers = new Headers(result.headers);
  headers.set(MOCK_HEADER, '1');
  const empty = result.status === 204 || result.status === 205 || result.status === 304;
  if (empty) return new Response(null, { status: result.status, headers });
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  const body =
    typeof result.body === 'string' && !headers.get('content-type')?.includes('json')
      ? result.body
      : JSON.stringify(result.body ?? null);
  return new Response(body, { status: result.status, headers });
}
