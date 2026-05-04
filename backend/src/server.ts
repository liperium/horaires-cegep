import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { z } from "zod";
import { zTeacherTemplate } from "./schema.js";
import { getTemplate, listTemplates, savePdf, upsertTemplate } from "./store.js";
import { renderPdf } from "./typst.js";

const app = express();
const port = Number(process.env.PORT ?? "4000");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/templates", async (_req, res) => {
  const templates = await listTemplates();
  res.json(
    templates.map((template) => ({
      id: template.id,
      teacherKey: template.teacherKey,
      nom: template.profile.nom,
      version: template.version,
    })),
  );
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
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${bodyTemplate.data.teacherKey}-horaire.pdf"`,
    );
    res.send(pdf);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown render error";
    res.status(500).json({ error: message });
  }
});

app.post("/api/bootstrap/migrate", async (_req, res) => {
  // Avoid importing migrate script side effects; run command from UI setup when needed.
  res.status(501).json({ error: "Run `npm run migrate` in backend to import TOML data." });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
