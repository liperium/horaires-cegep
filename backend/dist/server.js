import express from "express";
import cors from "cors";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import { zTeacherTemplate } from "./template-contract.js";
import { ROOT, TEACHERS_DIR, getTemplate, listTemplates, savePdf, upsertTemplate } from "./store.js";
import { renderPdf } from "./typst.js";
const app = express();
const port = Number(process.env.PORT ?? "4000");
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
app.use("/api", async (req, res, next) => {
    try {
        const expectedToken = (await readFile(path.join(TEACHERS_DIR, "token.txt"), "utf8")).trim();
        if (!expectedToken) {
            res.status(500).json({ error: "teachers/token.txt is empty" });
            return;
        }
        const providedToken = req.header("x-access-token")?.trim();
        if (!providedToken || providedToken !== expectedToken) {
            res.status(401).json({ error: "Invalid or missing access token" });
            return;
        }
        next();
    }
    catch {
        res.status(500).json({ error: "teachers/token.txt is missing" });
    }
});
app.get("/api/templates", async (_req, res) => {
    const templates = await listTemplates();
    res.json(templates.map((template) => ({
        id: template.id,
        teacherKey: template.teacherKey,
        nom: template.profile.nom,
        version: template.version,
    })));
});
app.get("/api/templates/:teacherKey", async (req, res) => {
    const template = await getTemplate(req.params.teacherKey);
    if (!template) {
        res.status(404).json({ error: "Template not found" });
        return;
    }
    res.json(template);
});
app.post("/api/templates", async (req, res) => {
    const parsed = zTeacherTemplate.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
    }
    const template = {
        ...parsed.data,
        id: parsed.data.id || nanoid(12),
        version: {
            ...parsed.data.version,
            timestamp: new Date().toISOString(),
        },
    };
    const saved = await upsertTemplate(template);
    res.json(saved);
});
app.post("/api/templates/:teacherKey/render", async (req, res) => {
    const bodyTemplate = zTeacherTemplate.safeParse(req.body);
    if (!bodyTemplate.success) {
        res.status(400).json({ error: bodyTemplate.error.flatten() });
        return;
    }
    if (bodyTemplate.data.teacherKey !== req.params.teacherKey) {
        res.status(400).json({ error: "teacherKey mismatch" });
        return;
    }
    try {
        const [pdf] = await Promise.all([
            renderPdf(bodyTemplate.data),
            upsertTemplate(bodyTemplate.data),
        ]);
        await savePdf(bodyTemplate.data.teacherKey, pdf);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${bodyTemplate.data.teacherKey}-horaire.pdf"`);
        res.send(pdf);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown render error";
        res.status(500).json({ error: message });
    }
});
app.post("/api/bootstrap/migrate", async (_req, res) => {
    // Avoid importing migrate script side effects; run command from UI setup when needed.
    res.status(501).json({ error: "Run `npm run migrate` in backend to import TOML data." });
});
const frontendDist = path.join(ROOT, "frontend", "dist");
if (existsSync(path.join(frontendDist, "index.html"))) {
    app.use(express.static(frontendDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
        res.sendFile(path.join(frontendDist, "index.html"));
    });
}
app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
});
app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.flatten() });
        return;
    }
    const message = error instanceof Error ? error.message : "Unexpected server error";
    res.status(500).json({ error: message });
});
app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${port}`);
});
