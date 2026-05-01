import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import toml from "toml";
import { nanoid } from "nanoid";
import { upsertTemplate, ROOT } from "./store.js";
async function runMigration() {
    const teachersDir = path.join(ROOT, "teachers");
    const entries = await readdir(teachersDir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const teacherKey = entry.name;
        const configPath = path.join(teachersDir, teacherKey, "config.toml");
        const raw = await readFile(configPath, "utf8");
        const parsed = toml.parse(raw);
        const template = {
            id: nanoid(12),
            teacherKey,
            profile: {
                nom: parsed.nom,
                titre: parsed.titre,
                courriel: parsed.courriel,
                contactPreference: parsed.contact_preference,
            },
            startHour: parsed.premiere_heure,
            endHour: parsed.derniere_heure,
            courses: (parsed.courses ?? []).map((course) => ({
                id: nanoid(10),
                code: course.code ?? "Sans code",
                nom: course.nom,
                local: course.local ?? "N/A",
                couleur: course.couleur ?? "blue",
                seances: (course.seances ?? []).map((session) => ({
                    id: nanoid(10),
                    day: session.jour,
                    startHour: session.debut,
                    endHour: session.fin,
                    lane: 0,
                    groupe: session.groupe,
                })),
            })),
            disponibilites: (parsed.disponibilites ?? []).map((availability) => ({
                id: nanoid(10),
                label: "Dispo",
                couleur: "blue",
                seances: [
                    {
                        id: nanoid(10),
                        day: availability.jour,
                        startHour: availability.debut,
                        endHour: availability.fin,
                        lane: 0,
                    },
                ],
            })),
            extras: (parsed.extras ?? []).map((extra) => ({
                id: nanoid(10),
                label: extra.label,
                couleur: extra.couleur ?? "grey",
                seances: (extra.seances ?? []).map((session) => ({
                    id: nanoid(10),
                    day: session.jour,
                    startHour: session.debut,
                    endHour: session.fin,
                    lane: 0,
                })),
            })),
            version: {
                timestamp: new Date().toISOString(),
                note: "Migrated from config.toml",
            },
        };
        await upsertTemplate(template);
        // eslint-disable-next-line no-console
        console.log(`Migrated ${teacherKey}`);
    }
}
runMigration().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
});
