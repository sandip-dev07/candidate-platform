/**
 * Central API client for the Candidate Communication Platform backend.
 *
 * Base URL defaults to the deployed Render backend and can be overridden with:
 *   NEXT_PUBLIC_API_URL=https://candidate-platform-backend.onrender.com
 */

export const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? "https://candidate-platform-backend.onrender.com").replace(
    /\/+$/,
    "",
  );

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function extractDetail(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((d) =>
          d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : null,
        )
        .filter(Boolean);
      if (msgs.length) return msgs.join(" ");
      try {
        return JSON.stringify(detail);
      } catch {
        return fallback;
      }
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "Could not reach the communication service. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const fallback =
      res.status === 0
        ? "Could not reach the communication service. Check your connection and try again."
        : res.status >= 500
          ? `Service temporarily unavailable (HTTP ${res.status}). It may be redeploying — wait a moment and try again.`
          : `Request failed (${res.status}).`;
    throw new ApiError(res.status, extractDetail(body, fallback));
  }
  return body as T;
}

/* ---------- Types (mirror backend schemas) ---------- */

export type ApiCandidate = {
  id: string;
  name: string;
  phone: string;
  email: string;
  created_at: string;
  updated_at: string;
};

export type ApiCandidateList = { items: ApiCandidate[]; total: number };

export type ApiMessage = {
  id: string;
  candidate_id: string;
  body: string;
  provider: string;
  provider_message_id: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  retryable: boolean;
  attempt_count: number;
  scheduled_for: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiMessageList = { items: ApiMessage[]; total: number };

export type ApiBulkItem = {
  candidate_id: string;
  message_id: string | null;
  status: string;
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
};

export type ApiBulkResult = {
  total: number;
  sent: number;
  failed: number;
  results: ApiBulkItem[];
};

export type ApiProviderHealth = {
  provider: string;
  operational: boolean;
  messages_sent: number;
  messages_delivered: number;
  messages_failed: number;
  messages_scheduled: number;
};

export type ApiTemplate = {
  id: string;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
};

/* ---------- Candidates ---------- */

export function listCandidates(opts?: { search?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (opts?.search?.trim()) params.set("search", opts.search.trim());
  params.set("limit", String(opts?.limit ?? 100));
  params.set("offset", String(opts?.offset ?? 0));
  return request<ApiCandidateList>(`/candidates?${params.toString()}`);
}

export function createCandidate(input: { name: string; phone: string; email: string }) {
  return request<ApiCandidate>(`/candidates`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteCandidate(id: string) {
  return request<void>(`/candidates/${id}`, { method: "DELETE" });
}

export function getCandidateHistory(
  candidateId: string,
  opts?: { limit?: number; offset?: number },
) {
  const params = new URLSearchParams();
  params.set("limit", String(opts?.limit ?? 50));
  params.set("offset", String(opts?.offset ?? 0));
  return request<ApiMessageList>(`/candidates/${candidateId}/messages?${params.toString()}`);
}

/* ---------- Messages ---------- */

export function sendMessage(candidateId: string, body: string) {
  return request<ApiMessage>(`/messages`, {
    method: "POST",
    body: JSON.stringify({ candidate_id: candidateId, body }),
  });
}

export function sendBulk(candidateIds: string[], body: string) {
  return request<ApiBulkResult>(`/messages/bulk`, {
    method: "POST",
    body: JSON.stringify({ candidate_ids: candidateIds, body }),
  });
}

export function retryMessage(messageId: string) {
  return request<ApiMessage>(`/messages/${messageId}/retry`, { method: "POST" });
}

/* ---------- Provider / templates ---------- */

export function getProviderHealth() {
  return request<ApiProviderHealth>(`/provider/health`);
}

export function listTemplates() {
  return request<ApiTemplate[]>(`/templates`);
}

export function createTemplate(input: { name: string; body: string }) {
  return request<ApiTemplate>(`/templates`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTemplate(id: string, input: { name?: string; body?: string }) {
  return request<ApiTemplate>(`/templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTemplate(id: string) {
  return request<void>(`/templates/${id}`, { method: "DELETE" });
}
