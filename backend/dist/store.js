import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { zTemplateStore, zTeacherTemplate } from "./schema.js";
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(moduleDir, "..", "..");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "templates.json");
const EMPTY_STORE = { templates: [] };
function normalizeLegacyTemplate(raw) {
    const asCurrent = zTeacherTemplate.safeParse(raw);
    if (asCurrent.success) {
        return asCurrent.data;
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
        profile: legacy.profile,
        startHour: legacy.startHour,
        endHour: legacy.endHour,
        courses: Array.from(courseMap.values()),
        disponibilites: Array.from(dispoMap.values()),
        extras: Array.from(extraMap.values()),
        version: legacy.version,
    };
    return zTeacherTemplate.parse(normalized);
}
async function ensureStoreFile() {
    await mkdir(DATA_DIR, { recursive: true });
    try {
        await readFile(DATA_FILE, "utf8");
    }
    catch {
        await writeFile(DATA_FILE, JSON.stringify(EMPTY_STORE, null, 2), "utf8");
    }
}
export async function readStore() {
    await ensureStoreFile();
    const content = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(content);
    const normalized = {
        templates: (parsed.templates ?? []).map((template) => normalizeLegacyTemplate(template)),
    };
    return zTemplateStore.parse(normalized);
}
export async function writeStore(store) {
    zTemplateStore.parse(store);
    await writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}
export async function listTemplates() {
    const store = await readStore();
    return store.templates;
}
export async function getTemplate(teacherKey) {
    const templates = await listTemplates();
    return templates.find((template) => template.teacherKey === teacherKey);
}
export async function upsertTemplate(template) {
    const parsed = zTeacherTemplate.parse(template);
    const store = await readStore();
    const index = store.templates.findIndex((entry) => entry.teacherKey === parsed.teacherKey);
    if (index >= 0) {
        store.templates[index] = parsed;
    }
    else {
        store.templates.push(parsed);
    }
    await writeStore(store);
    return parsed;
}
export { DATA_FILE, DATA_DIR, ROOT };
