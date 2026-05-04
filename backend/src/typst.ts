import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { TeacherTemplate } from "./types.js";
import { ROOT } from "./store.js";

function shellEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildToml(template: TeacherTemplate): string {
  const lines: string[] = [];
  lines.push(`session = "${shellEscape(template.session)}"`);
  lines.push(`nom = "${shellEscape(template.profile.nom)}"`);
  lines.push(`titre = "${shellEscape(template.profile.titre)}"`);
  lines.push(`courriel = "${shellEscape(template.profile.courriel)}"`);
  lines.push(`contact_preference = "${shellEscape(template.profile.contactPreference)}"`);
  lines.push("");
  lines.push(`premiere_heure = ${template.startHour}`);
  lines.push(`derniere_heure = ${template.endHour}`);
  lines.push("");

  for (const course of template.courses) {
    lines.push("[[courses]]");
    lines.push(`code = "${shellEscape(course.code || "Sans code")}"`);
    lines.push(`nom = "${shellEscape(course.nom)}"`);
    lines.push(`local = "${shellEscape(course.local || "N/A")}"`);
    lines.push(`couleur = "${shellEscape(course.couleur)}"`);
    lines.push("");
    for (const session of course.seances) {
      lines.push("[[courses.seances]]");
      lines.push(`jour = "${session.day}"`);
      lines.push(`debut = ${session.startHour}`);
      lines.push(`fin = ${session.endHour}`);
      lines.push(`groupe = "${shellEscape(session.groupe ?? "Gr.00")}"`);
      lines.push("");
    }
  }

  for (const availability of template.disponibilites) {
    for (const session of availability.seances) {
      lines.push("[[disponibilites]]");
      lines.push(`jour = "${session.day}"`);
      lines.push(`debut = ${session.startHour}`);
      lines.push(`fin = ${session.endHour}`);
      lines.push("");
    }
  }

  for (const extra of template.extras) {
    lines.push("[[extras]]");
    lines.push(`label = "${shellEscape(extra.label)}"`);
    lines.push(`couleur = "${shellEscape(extra.couleur)}"`);
    lines.push("");
    for (const session of extra.seances) {
      lines.push("[[extras.seances]]");
      lines.push(`jour = "${session.day}"`);
      lines.push(`debut = ${session.startHour}`);
      lines.push(`fin = ${session.endHour}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function runTypst(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("typst", args, { cwd: ROOT });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `typst exited with code ${code}`));
    });
  });
}

export async function renderPdf(template: TeacherTemplate): Promise<Buffer> {
  const tempRoot = path.join(ROOT, ".tmp-render");
  await mkdir(tempRoot, { recursive: true });
  const tempDir = await mkdtemp(path.join(tempRoot, "horaire-editor-"));
  const tomlPath = path.join(tempDir, "config.toml");
  const typPath = path.join(tempDir, "horaire.typ");
  const pdfPath = path.join(tempDir, "horaire.pdf");
  const relativeTypPath = path.relative(ROOT, typPath);
  const relativePdfPath = path.relative(ROOT, pdfPath);

  try {
    await mkdir(tempDir, { recursive: true });
    await writeFile(tomlPath, buildToml(template), "utf8");
    await writeFile(
      typPath,
      '#set page(paper: "us-letter", margin: (x: 1.5cm, top: 1cm, bottom: 1cm))\n\n#let data = toml("config.toml")\n#import "../../template.typ": render\n#render(data)\n',
      "utf8",
    );
    await runTypst(["compile", "--root", ROOT, relativeTypPath, relativePdfPath]);
    return await readFile(pdfPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
