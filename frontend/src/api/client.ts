const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export interface StaleRevisionDetail {
  code: "stale_revision";
  current_edit_sequence: number;
  message: string;
}

export interface RevisionPublishedDetail {
  code: "revision_already_published";
  message: string;
}

type ApiErrorDetail =
  | string
  | StaleRevisionDetail
  | RevisionPublishedDetail
  | { detail?: string };

export class ApiError extends Error {
  staleRevision?: StaleRevisionDetail;
  revisionPublished?: RevisionPublishedDetail;

  constructor(
    message: string,
    public status: number,
    detail?: ApiErrorDetail,
  ) {
    super(message);
    if (detail && typeof detail === "object" && "code" in detail) {
      if (detail.code === "stale_revision") {
        this.staleRevision = detail as StaleRevisionDetail;
      }
      if (detail.code === "revision_already_published") {
        this.revisionPublished = detail as RevisionPublishedDetail;
      }
    }
  }
}

export function isStaleRevisionError(
  error: unknown,
): error is ApiError & { staleRevision: StaleRevisionDetail } {
  return error instanceof ApiError && Boolean(error.staleRevision);
}

export function isRevisionPublishedError(
  error: unknown,
): error is ApiError & { revisionPublished: RevisionPublishedDetail } {
  return error instanceof ApiError && Boolean(error.revisionPublished);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body || response.statusText;
    let detail: ApiErrorDetail | undefined;
    try {
      const parsed = JSON.parse(body) as { detail?: ApiErrorDetail };
      detail = parsed.detail;
      if (typeof detail === "string") {
        message = detail;
      } else if (detail && typeof detail === "object" && "message" in detail) {
        message = detail.message;
      }
    } catch {
      // keep raw body
    }
    throw new ApiError(message, response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
