import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { zTeacherTemplate } from "./template-contract.js";
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(moduleDir, "..", "..");
export const TEACHERS_DIR = path.join(ROOT, "teachers");
function templatePath(teacherKey) {
    return path.join(TEACHERS_DIR, teacherKey, "template.json");
}
export function pdfPath(teacherKey) {
    return path.join(TEACHERS_DIR, teacherKey, "horaire.pdf");
}
function migrateDispoColors(template) {
    if (!template.disponibilites.some((d) => d.couleur === "blue"))
        return template;
    return {
        ...template,
        disponibilites: template.disponibilites.map((d) => ({
            ...d,
            couleur: d.couleur === "blue" ? "light_blue" : d.couleur,
        })),
    };
}
function normalizeLegacyTemplate(raw) {
    const asCurrent = zTeacherTemplate.safeParse(raw);
    if (asCurrent.success) {
        return migrateDispoColors(asCurrent.data);
    }
    const legacy = raw;
    const blocks = legacy.blocks ?? [];
    const courseMap = new Map();
    const dispoMap = new Map();
    const extraMap = new Map();
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
            courseMap.get(key).seances.push(session);
        }
        else if (block.type === "availability") {
            const key = `${block.label}|${block.style.color}`;
            if (!dispoMap.has(key)) {
                dispoMap.set(key, {
                    id: nanoid(10),
                    label: block.label || "Dispo",
                    couleur: block.style.color,
                    seances: [],
                });
            }
            dispoMap.get(key).seances.push(session);
        }
        else {
            const key = `${block.label}|${block.style.color}`;
            if (!extraMap.has(key)) {
                extraMap.set(key, {
                    id: nanoid(10),
                    label: block.label,
                    couleur: block.style.color,
                    seances: [],
                });
            }
            extraMap.get(key).seances.push(session);
        }
    }
    const normalized = {
        id: legacy.id,
        teacherKey: legacy.teacherKey,
        session: legacy.session ?? "Hiver 2026",
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
export async function listTemplates() {
    let entries;
    try {
        entries = await readdir(TEACHERS_DIR);
    }
    catch {
        return [];
    }
    const templates = [];
    for (const entry of entries) {
        try {
            const content = await readFile(templatePath(entry), "utf8");
            templates.push(normalizeLegacyTemplate(JSON.parse(content)));
        }
        catch {
            // no template.json for this teacher directory
        }
    }
    return templates;
}
export async function getTemplate(teacherKey) {
    try {
        const content = await readFile(templatePath(teacherKey), "utf8");
        return normalizeLegacyTemplate(JSON.parse(content));
    }
    catch {
        return undefined;
    }
}
export async function upsertTemplate(template) {
    const parsed = zTeacherTemplate.parse(template);
    await mkdir(path.join(TEACHERS_DIR, parsed.teacherKey), { recursive: true });
    await writeFile(templatePath(parsed.teacherKey), JSON.stringify(parsed, null, 2), "utf8");
    return parsed;
}
export async function savePdf(teacherKey, buffer) {
    await mkdir(path.join(TEACHERS_DIR, teacherKey), { recursive: true });
    await writeFile(pdfPath(teacherKey), buffer);
}
