import { zTeacherTemplate, zTemplateListResponse } from "../../../backend/src/template-contract.ts";
import type { TeacherTemplate } from "../../../backend/src/template-contract.ts";

export type TemplateListItem = { teacherKey: string; nom: string };

export async function getAccessToken(signal?: AbortSignal): Promise<string> {
  const response = await fetch("/api/access-token", { signal });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(parseApiError(payload));
  }
  const token = typeof payload === "object" && payload !== null && "token" in payload
    ? (payload as { token: unknown }).token
    : undefined;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Invalid token payload");
  }
  return token.trim();
}

function parseApiError(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    return typeof error === "string" ? error : JSON.stringify(error);
  }
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

async function parseJson(response: Response): Promise<unknown> {
  return response.json() as Promise<unknown>;
}

export async function listTemplates(signal?: AbortSignal): Promise<TemplateListItem[]> {
  const response = await fetch("/api/templates", { signal });
  return zTemplateListResponse.parse(await parseJson(response));
}

export async function getTemplate(teacherKey: string, signal?: AbortSignal): Promise<TeacherTemplate> {
  const response = await fetch(`/api/templates/${teacherKey}`, { signal });
  return zTeacherTemplate.parse(await parseJson(response));
}

export async function saveTemplate(template: TeacherTemplate, signal?: AbortSignal): Promise<void> {
  const response = await fetch("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(template),
    signal,
  });
  if (!response.ok) {
    throw new Error(parseApiError(await parseJson(response)));
  }
}

export async function renderTemplatePdf(
  teacherKey: string,
  template: TeacherTemplate,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetch(`/api/templates/${teacherKey}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(template),
    signal,
  });
  if (!response.ok) {
    throw new Error(parseApiError(await parseJson(response)));
  }
  return response.blob();
}
