import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { zTeacherTemplate } from "./schema.js";
import type { Day, Palette, TeacherTemplate } from "./types.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(moduleDir, "..", "..");
export const TEACHERS_DIR = path.join(ROOT, "teachers");

function templatePath(teacherKey: string): string {
  return path.join(TEACHERS_DIR, teacherKey, "template.json");
}

export function pdfPath(teacherKey: string): string {
  return path.join(TEACHERS_DIR, teacherKey, "horaire.pdf");
}

interface LegacyBlock {
  id: string;
  type: "course" | "availability" | "extra";
  day: Day;
  startHour: number;
  endHour: number;
  label: string;
  code?: string;
  local?: string;
  groupe?: string;
  style: { color: Palette };
  lane: number;
}

function migrateDispoColors(template: TeacherTemplate): TeacherTemplate {
  if (!template.disponibilites.some((d) => d.couleur === "blue")) return template;
  return {
    ...template,
    disponibilites: template.disponibilites.map((d) => ({
      ...d,
      couleur: d.couleur === "blue" ? "light_blue" : d.couleur,
    })),
  };
}

function normalizeLegacyTemplate(raw: unknown): TeacherTemplate {
  const asCurrent = zTeacherTemplate.safeParse(raw);
  if (asCurrent.success) {
    return migrateDispoColors(asCurrent.data);
  }

  const legacy = raw as TeacherTemplate & { blocks?: LegacyBlock[] };
  const blocks = legacy.blocks ?? [];
  const courseMap = new Map<string, TeacherTemplate["courses"][number]>();
  const dispoMap = new Map<string, TeacherTemplate["disponibilites"][number]>();
  const extraMap = new Map<string, TeacherTemplate["extras"][number]>();

  for (const block of blocks) {
    const session = {
      id: block.id || nanoid(10),
      day: block.day,
      startHour: block.startHour,
      endHour: block.endHour,
      lane: block.lane ?? 0,
      groupe: block.groupe,
    };

    if (block.type === "course") {
      const key = `${block.code ?? "Sans code"}|${block.label}|${block.local ?? "N/A"}|${block.style.color}`;
      if (!courseMap.has(key)) {
        courseMap.set(key, {
          id: nanoid(10),
          code: block.code ?? "Sans code",
          nom: block.label,
          local: block.local ?? "N/A",
          couleur: block.style.color,
          seances: [],
        });
      }
      courseMap.get(key)!.seances.push(session);
    } else if (block.type === "availability") {
      const key = `${block.label}|${block.style.color}`;
      if (!dispoMap.has(key)) {
        dispoMap.set(key, {
          id: nanoid(10),
          label: block.label || "Dispo",
          couleur: block.style.color,
          seances: [],
        });
      }
      dispoMap.get(key)!.seances.push(session);
    } else {
      const key = `${block.label}|${block.style.color}`;
      if (!extraMap.has(key)) {
        extraMap.set(key, {
          id: nanoid(10),
          label: block.label,
          couleur: block.style.color,
          seances: [],
        });
      }
      extraMap.get(key)!.seances.push(session);
    }
  }

  const normalized: TeacherTemplate = {
    id: legacy.id,
    teacherKey: legacy.teacherKey,
    session: (legacy as { session?: string }).session ?? "Hiver 2026",
    profile: legacy.profile,
    startHour: legacy.startHour,
    endHour: legacy.endHour,
    courses: Array.from(courseMap.values()),
    disponibilites: Array.from(dispoMap.values()),
    extras: Array.from(extraMap.values()),
    version: legacy.version,
  };
  return migrateDispoColors(zTeacherTemplate.parse(normalized));
}

export async function listTemplates(): Promise<TeacherTemplate[]> {
  let entries: string[];
  try {
    entries = await readdir(TEACHERS_DIR);
  } catch {
    return [];
  }

  const templates: TeacherTemplate[] = [];
  for (const entry of entries) {
    try {
      const content = await readFile(templatePath(entry), "utf8");
      templates.push(normalizeLegacyTemplate(JSON.parse(content) as unknown));
    } catch {
      // no template.json for this teacher directory
    }
  }
  return templates;
}

export async function getTemplate(teacherKey: string): Promise<TeacherTemplate | undefined> {
  try {
    const content = await readFile(templatePath(teacherKey), "utf8");
    return normalizeLegacyTemplate(JSON.parse(content) as unknown);
  } catch {
    return undefined;
  }
}

export async function upsertTemplate(template: TeacherTemplate): Promise<TeacherTemplate> {
  const parsed = zTeacherTemplate.parse(template);
  await mkdir(path.join(TEACHERS_DIR, parsed.teacherKey), { recursive: true });
  await writeFile(templatePath(parsed.teacherKey), JSON.stringify(parsed, null, 2), "utf8");
  return parsed;
}

export async function savePdf(teacherKey: string, buffer: Buffer): Promise<void> {
  await mkdir(path.join(TEACHERS_DIR, teacherKey), { recursive: true });
  await writeFile(pdfPath(teacherKey), buffer);
}
