import { zTeacherTemplate, zTemplateListResponse } from "../../../backend/src/template-contract.ts";
import type { TeacherTemplate } from "../../../backend/src/template-contract.ts";

export type TemplateListItem = { teacherKey: string; nom: string };

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

const BASE_PATH = (() => {
  const idx = new URL(import.meta.url).pathname.indexOf("/assets/");
  return idx !== -1 ? new URL(import.meta.url).pathname.slice(0, idx) : "";
})();

function authHeaders(accessToken: string): HeadersInit {
  return { "x-access-token": accessToken };
}

export async function listTemplates(accessToken: string, signal?: AbortSignal): Promise<TemplateListItem[]> {
  const response = await fetch(`${BASE_PATH}/api/templates`, { signal, headers: authHeaders(accessToken) });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(parseApiError(payload));
  }
  return zTemplateListResponse.parse(payload);
}

export async function getTemplate(teacherKey: string, accessToken: string, signal?: AbortSignal): Promise<TeacherTemplate> {
  const response = await fetch(`${BASE_PATH}/api/templates/${teacherKey}`, { signal, headers: authHeaders(accessToken) });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(parseApiError(payload));
  }
  return zTeacherTemplate.parse(payload);
}

export async function saveTemplate(template: TeacherTemplate, accessToken: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(`${BASE_PATH}/api/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
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
  accessToken: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetch(`${BASE_PATH}/api/templates/${teacherKey}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify(template),
    signal,
  });
  if (!response.ok) {
    throw new Error(parseApiError(await parseJson(response)));
  }
  return response.blob();
}
