import type { ProcessingServiceHandle } from './pythonService';

export class ServiceClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly detail?: unknown,
  ) {
    super(message);
  }
}

/**
 * Thin JSON HTTP client scoped to the processing service's loopback
 * base URL and bearer token. Only the main process holds the token;
 * the renderer never sees it.
 */
export class ServiceClient {
  constructor(private readonly handle: ProcessingServiceHandle) {}

  private async request<T>(
    method: string,
    pathname: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.handle.baseUrl}${pathname}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.handle.token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      throw new ServiceClientError(
        `Processing service request failed: ${method} ${pathname} (${response.status})`,
        response.status,
        data?.detail ?? data,
      );
    }
    return data as T;
  }

  get<T>(pathname: string): Promise<T> {
    return this.request<T>('GET', pathname);
  }

  post<T>(pathname: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', pathname, body);
  }

  patch<T>(pathname: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', pathname, body);
  }

  delete<T>(pathname: string): Promise<T> {
    return this.request<T>('DELETE', pathname);
  }
}
