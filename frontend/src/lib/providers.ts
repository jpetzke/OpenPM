import { api } from "./api";

export type ProviderType = "openrouter" | "azure_openai" | "openai_compat" | "kreuzberg";
export type Purpose = "llm" | "embedding";
export type ModelRole = "chat" | "extraction" | "embedding";

export type OpenRouterCreds = { api_key: string };
export type OpenAICompatCreds = { api_key: string; base_url: string };
export type AzureCreds = { api_key: string; endpoint: string; api_version: string };
export type KreuzbergCreds = Record<string, never>;

export interface ProviderHealth {
  health?: "ok" | "corrupt";
  health_detail?: string | null;
}

export type ProviderConfig = (
  | {
      id: string;
      name: string;
      provider_type: "openrouter";
      purpose: "llm";
      credentials: OpenRouterCreds;
      model_assignments: Partial<Record<ModelRole, string>>;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }
  | {
      id: string;
      name: string;
      provider_type: "openai_compat";
      purpose: Purpose;
      credentials: OpenAICompatCreds;
      model_assignments: Partial<Record<ModelRole, string>>;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }
  | {
      id: string;
      name: string;
      provider_type: "azure_openai";
      purpose: Purpose;
      credentials: AzureCreds;
      model_assignments: Partial<Record<ModelRole, string>>;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }
  | {
      id: string;
      name: string;
      provider_type: "kreuzberg";
      purpose: "embedding";
      credentials: KreuzbergCreds;
      model_assignments: Partial<Record<ModelRole, string>>;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }
) & ProviderHealth;

export interface CreateProviderBody {
  name: string;
  provider_type: ProviderType;
  purpose: Purpose;
  credentials: Record<string, string>;
  model_assignments: Partial<Record<ModelRole, string>>;
}

export interface UpdateProviderBody {
  name?: string;
  credentials?: Record<string, string>;
  model_assignments?: Partial<Record<ModelRole, string>>;
}

export interface TestResult {
  ok: boolean;
  error?: string | null;
}

export interface ModelInfo {
  id: string;
  label: string;
  role: ModelRole;
}

export interface RolesResponse {
  llm: ModelRole[];
  embedding: ModelRole[];
}

export interface ActiveSummary {
  llm_active: boolean;
  embedding_active: boolean;
}

const MASK_RE = /^.+•{4,}$/;
// Treat ANY bullet as a sign of a masked credential. Trailing-bullet only was
// too narrow — endpoint masks like "https://••••.example.com/" slip through.
export const isMaskedSecret = (value: string | undefined | null) =>
  typeof value === "string" && (value.includes("•") || MASK_RE.test(value));

export const PROVIDER_TYPE_LABEL: Record<ProviderType, string> = {
  openrouter: "OpenRouter",
  openai_compat: "OpenAI-kompatibel",
  azure_openai: "Azure OpenAI",
  kreuzberg: "Kreuzberg",
};

export const LLM_PROVIDER_TYPES: ProviderType[] = ["openrouter", "openai_compat", "azure_openai"];
export const EMBEDDING_PROVIDER_TYPES: ProviderType[] = [
  "openai_compat",
  "azure_openai",
  "kreuzberg",
];

export const providersApi = {
  list: (purpose?: Purpose) =>
    api.get<ProviderConfig[]>(
      `/api/settings/providers${purpose ? `?purpose=${purpose}` : ""}`,
    ),
  active: (purpose: Purpose) =>
    api.get<ProviderConfig | null>(`/api/settings/providers/active?purpose=${purpose}`),
  create: (body: CreateProviderBody) =>
    api.post<ProviderConfig>("/api/settings/providers", body),
  update: (id: string, body: UpdateProviderBody) =>
    api.put<ProviderConfig>(`/api/settings/providers/${id}`, body),
  remove: (id: string) => api.delete(`/api/settings/providers/${id}`),
  activate: (id: string) =>
    api.post<ProviderConfig>(`/api/settings/providers/${id}/activate`),
  test: (id: string) => api.post<TestResult>(`/api/settings/providers/${id}/test`),
  models: () => api.get<ModelInfo[]>("/api/settings/models"),
  roles: () => api.get<RolesResponse>("/api/settings/roles"),
  summary: () => api.get<ActiveSummary>("/api/settings"),
};
