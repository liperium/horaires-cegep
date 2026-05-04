import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as pdfjsLib from "pdfjs-dist";
import "./App.css";
import {
  DAYS,
  PALETTE_COLORS,
  PALETTE,
  zTeacherTemplate,
  zTemplateListResponse,
} from "../../backend/src/template-contract.ts";
import type {
  Availability,
  Course,
  Day,
  Extra,
  Palette,
  Session,
  TeacherTemplate,
} from "../../backend/src/template-contract.ts";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

type GroupType = "course" | "availability" | "extra";

interface SessionRef {
  sessionId: string;
  groupId: string;
  groupType: GroupType;
  label: string;
  color: Palette;
  day: Day;
  startHour: number;
  endHour: number;
  lane: number;
}

type TemplateListItem = { teacherKey: string; nom: string };
type Group = Course | Availability | Extra;

const days: Day[] = [...DAYS];
const palette: Palette[] = [...PALETTE];
const coursePalette = palette.filter((p) => p !== "light_blue" && p !== "grey" && p !== "red");
const extraPalette: Palette[] = ["grey", "red"];

const hourPx = 46;

function allGroups(template: Pick<TeacherTemplate, "courses" | "disponibilites" | "extras">): Group[] {
  return [...template.courses, ...template.disponibilites, ...template.extras];
}

function updateGroupCollection(
  draft: TeacherTemplate,
  groupType: GroupType,
  updater: (groups: Group[]) => Group[],
): TeacherTemplate {
  if (groupType === "course") {
    draft.courses = updater(draft.courses) as Course[];
  } else if (groupType === "availability") {
    draft.disponibilites = updater(draft.disponibilites) as Availability[];
  } else {
    draft.extras = updater(draft.extras) as Extra[];
  }
  return draft;
}

function toTeacherKey(name: string): string {
  return name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nextHourFromY(y: number, startHour: number, endHour: number): number {
  return clamp(startHour + Math.round(y / hourPx), startHour, endHour);
}

function newSession(): Session {
  return {
    id: crypto.randomUUID(),
    day: "Lundi",
    startHour: 8,
    endHour: 10,
    lane: 0,
  };
}

function newCourse(): Course {
  return {
    id: crypto.randomUUID(),
    code: "420-XXX-JQ",
    nom: "Nouveau cours",
    local: "000.0",
    couleur: "orange",
    seances: [newSession()],
  };
}

function newAvailability(): Availability {
  return { id: crypto.randomUUID(), label: "Dispo", couleur: "light_blue", seances: [newSession()] };
}

function newExtra(): Extra {
  return { id: crypto.randomUUID(), label: "Activite", couleur: "grey", seances: [newSession()] };
}

function App() {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<string>("");
  const [template, setTemplate] = useState<TeacherTemplate | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [history, setHistory] = useState<TeacherTemplate[]>([]);
  const [future, setFuture] = useState<TeacherTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [autoRenderStatus, setAutoRenderStatus] = useState("Idle");
  const [creatingTeacher, setCreatingTeacher] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState("");
  const [profilOpen, setProfilOpen] = useState(true);
  const [coursOpen, setCoursOpen] = useState(true);
  const firstLoadDoneRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfBlobRef = useRef<Blob | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function loadList(): Promise<void> {
      const response = await fetch("/api/templates");
      const data = zTemplateListResponse.parse(await response.json());
      setTemplates(data);
      if (data[0]) {
        setSelectedTeacher(data[0].teacherKey);
      }
    }
    void loadList();
  }, []);

  useEffect(() => {
    if (!selectedTeacher) {
      return;
    }
    async function loadTemplate(): Promise<void> {
      setLoading(true);
      const response = await fetch(`/api/templates/${selectedTeacher}`);
      const data = zTeacherTemplate.parse(await response.json());
      setTemplate(data);
      setHistory([]);
      setFuture([]);
      setActiveBlockId(null);
      firstLoadDoneRef.current = false;
      setLoading(false);
    }
    void loadTemplate();
  }, [selectedTeacher]);

  const flatSessions = useMemo(() => {
    if (!template) return [] as SessionRef[];
    const toSessionRefs = <T extends Group>(groups: T[], groupType: GroupType, labelFrom: (group: T) => string) =>
      groups.flatMap((group) =>
        group.seances.map((session) => ({
          sessionId: session.id,
          groupId: group.id,
          groupType,
          label: labelFrom(group),
          color: group.couleur,
          day: session.day,
          startHour: session.startHour,
          endHour: session.endHour,
          lane: session.lane,
        })),
      );

    return [
      ...toSessionRefs(template.courses, "course", (group) => group.nom),
      ...toSessionRefs(template.disponibilites, "availability", (group) => group.label),
      ...toSessionRefs(template.extras, "extra", (group) => group.label),
    ];
  }, [template]);
  const hourCount = template ? template.endHour - template.startHour : 0;
  const selectedSession = useMemo(
    () => flatSessions.find((session) => session.sessionId === activeBlockId) ?? null,
    [activeBlockId, flatSessions],
  );
  const selectedCourse = useMemo(() => {
    if (!template || !selectedSession || selectedSession.groupType !== "course") return null;
    return template.courses.find((course) => course.id === selectedSession.groupId) ?? null;
  }, [selectedSession, template]);

  const selectedSessionObj = useMemo(() => {
    if (!template || !selectedSession) return null;
    for (const group of allGroups(template)) {
      const s = group.seances.find((s) => s.id === selectedSession.sessionId);
      if (s) return s;
    }
    return null;
  }, [selectedSession, template]);

  function updateSession(sessionId: string, updater: (s: Session) => Session): void {
    updateTemplate((draft) => {
      for (const group of allGroups(draft)) {
        const idx = group.seances.findIndex((s) => s.id === sessionId);
        if (idx !== -1) {
          group.seances[idx] = updater(group.seances[idx]);
          draft.version = { timestamp: new Date().toISOString(), note: "Edited in web app" };
          return draft;
        }
      }
      return draft;
    });
  }

  function updateGroup(groupType: GroupType, groupId: string, updater: (current: Course | Availability | Extra) => Course | Availability | Extra): void {
    updateTemplate((draft) => {
      updateGroupCollection(draft, groupType, (groups) =>
        groups.map((group) => (group.id === groupId ? updater(group) : group)),
      );
      draft.version = { timestamp: new Date().toISOString(), note: "Edited in web app" };
      return draft;
    });
  }

  function updateTemplate(mutator: (draft: TeacherTemplate) => TeacherTemplate): void {
    if (!template) return;
    setHistory((current) => [...current, template]);
    setFuture([]);
    setTemplate(mutator(structuredClone(template)));
  }

  function onDragStart(event: ReactPointerEvent<HTMLDivElement>, ref: SessionRef): void {
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startX = event.clientX;
    const blockStart = ref.startHour;
    const blockEnd = ref.endHour;
    const dayIndex = days.indexOf(ref.day);

    function onMove(moveEvent: PointerEvent): void {
      const deltaYHours = Math.round((moveEvent.clientY - startY) / hourPx);
      const deltaDays = Math.round((moveEvent.clientX - startX) / 130);
      const duration = blockEnd - blockStart;
      const nextDayIndex = clamp(dayIndex + deltaDays, 0, days.length - 1);
      const nextStart = clamp(blockStart + deltaYHours, template!.startHour, template!.endHour - duration);
      const nextEnd = nextStart + duration;
      setTemplate((current) => {
        if (!current) return current;
        const clone = structuredClone(current);
        for (const group of allGroups(clone)) {
          const session = group.seances.find((entry) => entry.id === ref.sessionId);
          if (session) {
            session.day = days[nextDayIndex];
            session.startHour = nextStart;
            session.endHour = nextEnd;
            break;
          }
        }
        return clone;
      });
    }

    function onUp(): void {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      if (template) {
        setHistory((current) => [...current, structuredClone(template)]);
        setFuture([]);
      }
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  function onResizeStart(event: ReactPointerEvent<HTMLDivElement>, ref: SessionRef): void {
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const initialEnd = ref.endHour;

    function onMove(moveEvent: PointerEvent): void {
      const deltaY = moveEvent.clientY - startY;
      const next = nextHourFromY((initialEnd - template!.startHour) * hourPx + deltaY, template!.startHour, template!.endHour);
      setTemplate((current) => {
        if (!current) return current;
        const clone = structuredClone(current);
        for (const group of allGroups(clone)) {
          const session = group.seances.find((entry) => entry.id === ref.sessionId);
          if (session) {
            session.endHour = Math.max(session.startHour + 1, next);
            break;
          }
        }
        return clone;
      });
    }

    function onUp(): void {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      if (template) {
        setHistory((current) => [...current, structuredClone(template)]);
        setFuture([]);
      }
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }


  async function saveTemplate(t: TeacherTemplate): Promise<void> {
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
  }

  async function renderPdfAndPreview(): Promise<void> {
    if (!template || !canvasRef.current) return;
    setRendering(true);
    setRenderError(null);
    try {
      const response = await fetch(`/api/templates/${template.teacherKey}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template),
      });
      if (!response.ok) {
        const err = (await response.json()) as unknown;
        const message = typeof err === "object" && err !== null && "error" in err ? (err as { error: unknown }).error : err;
        setRenderError(typeof message === "string" ? message : JSON.stringify(message));
        setAutoRenderStatus("Render failed");
        return;
      }
      const blob = await response.blob();
      pdfBlobRef.current = blob;
      const arrayBuffer = await blob.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const canvas = canvasRef.current;
      const containerWidth = canvas.parentElement?.clientWidth ?? 600;
      const unscaled = page.getViewport({ scale: 1 });
      const scale = containerWidth / unscaled.width;
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (ctx) await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      setAutoRenderStatus(`Rendered at ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : "Unknown error");
      setAutoRenderStatus("Render failed");
    } finally {
      setRendering(false);
    }
  }

  useEffect(() => {
    if (!template) return;
    if (!firstLoadDoneRef.current) {
      firstLoadDoneRef.current = true;
      void renderPdfAndPreview();
      return;
    }
    void saveTemplate(template);
    setAutoRenderStatus("Waiting for changes...");
    const handle = setTimeout(() => {
      setAutoRenderStatus("Auto-rendering...");
      void renderPdfAndPreview();
    }, 500);
    return () => clearTimeout(handle);
  }, [template]);

  function downloadPdf(): void {
    if (!pdfBlobRef.current || !template) return;
    const url = URL.createObjectURL(pdfBlobRef.current);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${template.teacherKey}-horaire.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function createTeacher(): Promise<void> {
    const name = newTeacherName.trim();
    if (!name) return;
    const teacherKey = toTeacherKey(name);
    const emailBase = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).join(".");
    const newTemplate: TeacherTemplate = {
      id: crypto.randomUUID(),
      teacherKey,
      session: "Hiver 2026",
      profile: { nom: name, titre: "Enseignant", courriel: `${emailBase}@cegepjonquiere.ca`, contactPreference: "Me contacter par Teams." },
      startHour: 8,
      endHour: 18,
      courses: [{ id: crypto.randomUUID(), code: "420-XXX-JQ", nom: "Nouveau cours", local: "000.0", couleur: "orange", seances: [{ id: crypto.randomUUID(), day: "Lundi", startHour: 8, endHour: 10, lane: 0 }] }],
      disponibilites: [{ ...newAvailability(), seances: [{ id: crypto.randomUUID(), day: "Mercredi", startHour: 8, endHour: 10, lane: 0 }] }],
      extras: [{ ...newExtra(), seances: [{ id: crypto.randomUUID(), day: "Vendredi", startHour: 8, endHour: 10, lane: 0 }] }],
      version: { timestamp: new Date().toISOString(), note: "Created in web app" },
    };
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTemplate),
    });
    const listRes = await fetch("/api/templates");
    const data = zTemplateListResponse.parse(await listRes.json());
    setTemplates(data);
    setSelectedTeacher(teacherKey);
    setNewTeacherName("");
    setCreatingTeacher(false);
  }

  function undo(): void {
    if (history.length === 0 || !template) return;
    const previous = history[history.length - 1];
    setHistory((current) => current.slice(0, -1));
    setFuture((current) => [template, ...current]);
    setTemplate(previous);
  }

  function redo(): void {
    if (future.length === 0 || !template) return;
    const [next, ...rest] = future;
    setFuture(rest);
    setHistory((current) => [...current, template]);
    setTemplate(next);
  }

  if (loading) {
    return <main className="loading">Loading templates...</main>;
  }

  return (
    <main className="layout">
      <section className="leftPane">
        <header className="toolbar">
          <h1>Horaire Builder</h1>
          <select value={selectedTeacher} onChange={(event) => setSelectedTeacher(event.target.value)}>
            {templates.map((entry) => (
              <option key={entry.teacherKey} value={entry.teacherKey}>
                {entry.nom}
              </option>
            ))}
          </select>
          {creatingTeacher ? (
            <>
              <input
                autoFocus
                placeholder="Prénom Nom"
                value={newTeacherName}
                onChange={(event) => setNewTeacherName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createTeacher();
                  if (event.key === "Escape") { setCreatingTeacher(false); setNewTeacherName(""); }
                }}
              />
              <button onClick={() => void createTeacher()} disabled={!newTeacherName.trim()}>Créer</button>
              <button onClick={() => { setCreatingTeacher(false); setNewTeacherName(""); }}>Annuler</button>
            </>
          ) : (
            <button onClick={() => setCreatingTeacher(true)}>+ Prof.</button>
          )}
          <button onClick={undo} disabled={history.length === 0}>
            Undo
          </button>
          <button onClick={redo} disabled={future.length === 0}>
            Redo
          </button>
        </header>

        {!template ? (
          <div className="loading">
            <p>Aucun professeur. Créer un avec <strong>+ Prof.</strong></p>
          </div>
        ) : <div className="editorBody">
          <aside className="inspector">
            <div className="sectionToggle" onClick={() => setProfilOpen((o) => !o)}>
              Profil <span className="chevron">{profilOpen ? "▾" : "▸"}</span>
            </div>
            {profilOpen && (
              <div className="blockEditor profileEditor">
                <label>
                  Session
                  <input
                    value={template.session}
                    onChange={(event) => updateTemplate((draft) => ({ ...draft, session: event.target.value }))}
                  />
                </label>
                <label>
                  Nom
                  <input
                    value={template.profile.nom}
                    onChange={(event) => updateTemplate((draft) => ({ ...draft, profile: { ...draft.profile, nom: event.target.value } }))}
                  />
                </label>
                <label>
                  Titre
                  <input
                    value={template.profile.titre}
                    onChange={(event) => updateTemplate((draft) => ({ ...draft, profile: { ...draft.profile, titre: event.target.value } }))}
                  />
                </label>
                <label>
                  Courriel
                  <input
                    value={template.profile.courriel}
                    onChange={(event) => updateTemplate((draft) => ({ ...draft, profile: { ...draft.profile, courriel: event.target.value } }))}
                  />
                </label>
                <label>
                  Contact préféré
                  <input
                    value={template.profile.contactPreference}
                    onChange={(event) => updateTemplate((draft) => ({ ...draft, profile: { ...draft.profile, contactPreference: event.target.value } }))}
                  />
                </label>
              </div>
            )}
            <div className="sectionToggle" onClick={() => setCoursOpen((o) => !o)}>
              Cours et séances <span className="chevron">{coursOpen ? "▾" : "▸"}</span>
            </div>
            {coursOpen && (
            <>
            <div className="quickActions">
              <button
                onClick={() =>
                  updateTemplate((draft) => ({
                    ...draft,
                    courses: [...draft.courses, newCourse()],
                  }))
                }
              >
                + Cours
              </button>
              <button
                onClick={() =>
                  updateTemplate((draft) => ({
                    ...draft,
                    disponibilites: [...draft.disponibilites, newAvailability()],
                  }))
                }
              >
                + Dispo
              </button>
              <button
                onClick={() =>
                  updateTemplate((draft) => ({
                    ...draft,
                    extras: [...draft.extras, newExtra()],
                  }))
                }
              >
                + Extra
              </button>
            </div>
            {selectedSession && selectedSessionObj ? (
              <div className="blockEditor">
                {selectedCourse ? (
                  <>
                    <div className="sectionLabel">Cours</div>
                    <label>
                      Nom
                      <input
                        value={selectedCourse.nom}
                        onChange={(event) =>
                          updateGroup("course", selectedCourse.id, (group) => ({ ...group, nom: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Code
                      <input
                        value={selectedCourse.code}
                        onChange={(event) =>
                          updateGroup("course", selectedCourse.id, (group) => ({ ...group, code: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Local
                      <input
                        value={selectedCourse.local}
                        onChange={(event) =>
                          updateGroup("course", selectedCourse.id, (group) => ({ ...group, local: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Couleur
                      <select
                        value={selectedSession.color}
                        onChange={(event) =>
                          updateGroup("course", selectedCourse.id, (group) => ({ ...group, couleur: event.target.value as Palette }))
                        }
                      >
                        {coursePalette.map((entry) => (
                          <option key={entry} value={entry}>{entry}</option>
                        ))}
                      </select>
                    </label>
                    <div className="sectionLabel">Séance</div>
                    <label>
                      Groupe
                      <input
                        value={selectedSessionObj.groupe ?? ""}
                        onChange={(event) =>
                          updateSession(selectedSession.sessionId, (s) => ({ ...s, groupe: event.target.value || undefined }))
                        }
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      Label
                      <input
                        value={selectedSession.label}
                        onChange={(event) =>
                          updateGroup(selectedSession.groupType, selectedSession.groupId, (group) => ({
                            ...group,
                            label: event.target.value,
                          }))
                        }
                      />
                    </label>
                    {selectedSession.groupType === "extra" && (
                      <label>
                        Couleur
                        <select
                          value={selectedSession.color}
                          onChange={(event) =>
                            updateGroup(selectedSession.groupType, selectedSession.groupId, (group) => ({
                              ...group,
                              couleur: event.target.value as Palette,
                            }))
                          }
                        >
                          {extraPalette.map((entry) => (
                            <option key={entry} value={entry}>{entry}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </>
                )}
                <label>
                  Jour
                  <select
                    value={selectedSessionObj.day}
                    onChange={(event) =>
                      updateSession(selectedSession.sessionId, (s) => ({ ...s, day: event.target.value as Day }))
                    }
                  >
                    {days.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                <label>
                  Début
                  <select
                    value={selectedSessionObj.startHour}
                    onChange={(event) => {
                      const v = parseInt(event.target.value);
                      updateSession(selectedSession.sessionId, (s) => ({
                        ...s,
                        startHour: v,
                        endHour: Math.max(s.endHour, v + 1),
                      }));
                    }}
                  >
                    {Array.from({ length: template.endHour - template.startHour }, (_, i) => template.startHour + i).map((h) => (
                      <option key={h} value={h}>{h}h</option>
                    ))}
                  </select>
                </label>
                <label>
                  Fin
                  <select
                    value={selectedSessionObj.endHour}
                    onChange={(event) => {
                      const v = parseInt(event.target.value);
                      updateSession(selectedSession.sessionId, (s) => ({
                        ...s,
                        endHour: v,
                        startHour: Math.min(s.startHour, v - 1),
                      }));
                    }}
                  >
                    {Array.from({ length: template.endHour - template.startHour }, (_, i) => template.startHour + 1 + i).map((h) => (
                      <option key={h} value={h}>{h}h</option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() =>
                    updateGroup(selectedSession.groupType, selectedSession.groupId, (group) => ({
                      ...group,
                      seances: [...group.seances, newSession()],
                    }))
                  }
                >
                  + Séance
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    updateTemplate((draft) => {
                      for (const type of ["course", "availability", "extra"] as const) {
                        updateGroupCollection(draft, type, (groups) =>
                          groups
                            .map((group) => ({
                              ...group,
                              seances: group.seances.filter((s) => s.id !== selectedSession.sessionId),
                            }))
                            .filter((group) => group.seances.length > 0),
                        );
                      }
                      return draft;
                    })
                  }
                >
                  Delete séance
                </button>
              </div>
            ) : (
              <p>Select a seance to edit.</p>
            )}
            </>
            )}
          </aside>

          <section className="grid" ref={gridRef}>
            <div className="dayHeader">
              <div />
              {days.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            <div className="gridCanvas" style={{ height: `${hourCount * hourPx}px` }}>
              {Array.from({ length: hourCount }).map((_, idx) => (
                <div key={idx} className="hourRow" style={{ top: `${idx * hourPx}px` }}>
                  <span>{template.startHour + idx}h</span>
                </div>
              ))}

              {flatSessions.map((session) => {
                const dayIndex = days.indexOf(session.day);
                const top = (session.startHour - template.startHour) * hourPx;
                const height = (session.endHour - session.startHour) * hourPx;
                const left = 80 + dayIndex * 130 + session.lane * 6;

                return (
                  <div
                    key={session.sessionId}
                    className={`block ${activeBlockId === session.sessionId ? "active" : ""}`}
                    style={{
                      top: `${top}px`,
                      left: `${left}px`,
                      height: `${height - 4}px`,
                      background: PALETTE_COLORS[session.color],
                    }}
                    onPointerDown={(event) => onDragStart(event, session)}
                    onClick={() => setActiveBlockId(session.sessionId)}
                  >
                    <strong>{session.label}</strong>
                    <span>
                      {session.startHour}h - {session.endHour}h
                    </span>
                    <div className="resizeHandle" onPointerDown={(event) => onResizeStart(event, session)} />
                  </div>
                );
              })}
            </div>
          </section>
        </div>}
      </section>

      <section className="rightPane">
        <header className="pdfToolbar">
          <h2>PDF Preview</h2>
          <button onClick={renderPdfAndPreview} disabled={rendering}>
            {rendering ? "Rendering..." : "Refresh PDF"}
          </button>
          <button onClick={downloadPdf} disabled={!pdfBlobRef.current}>
            Download PDF
          </button>
          <small>{autoRenderStatus}</small>
        </header>
        <div className="previewFrame">
          {rendering && <div className="previewOverlay">Updating preview...</div>}
          {renderError && <div className="previewError"><strong>Render error:</strong> {renderError}</div>}
          <canvas ref={canvasRef} className="pdfCanvas" />
        </div>
      </section>
    </main>
  );
}

export default App;
