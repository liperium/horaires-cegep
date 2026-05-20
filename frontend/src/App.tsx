import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as pdfjsLib from "pdfjs-dist";
import "./App.css";
import {
  DAYS,
  PALETTE_COLORS,
  PALETTE,
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
import { getTemplate, listTemplates, renderTemplatePdf, saveTemplate } from "./api/templates.ts";
import type { TemplateListItem } from "./api/templates.ts";
import { useTemplateEditor } from "./hooks/useTemplateEditor.ts";
import { allGroups, removeSessionEverywhere } from "./template-groups.ts";
import type { GroupType } from "./template-groups.ts";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

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

const days: Day[] = [...DAYS];
const palette: Palette[] = [...PALETTE];
const coursePalette = palette.filter((p) => p !== "light_blue" && p !== "grey" && p !== "red");
const extraPalette: Palette[] = ["grey", "red"];
const LAST_TEACHER_KEY = "horaires-prof:last-teacher";

const hourPx = 46;

const BASE_PATH = (() => {
  const idx = new URL(import.meta.url).pathname.indexOf("/assets/");
  return idx !== -1 ? new URL(import.meta.url).pathname.slice(0, idx) : "";
})();

function getTokenFromPathname(pathname: string): string | null {
  const relative = pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) : pathname;
  const token = relative.split("/").filter(Boolean)[0] ?? "";
  return token.trim() ? token : null;
}

function toTeacherKey(name: string): string {
  return name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function toFilePart(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
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
  return { id: crypto.randomUUID(), label: "Disponible", couleur: "light_blue", seances: [newSession()] };
}

function newExtra(): Extra {
  return { id: crypto.randomUUID(), label: "Activité", couleur: "grey", seances: [newSession()] };
}

function App() {
  const [accessToken] = useState<string | null>(() => getTokenFromPathname(window.location.pathname));
  const [isTokenValidated, setIsTokenValidated] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<string>("");
  const { template, history, future, setLoadedTemplate, updateTemplate, updateSession, updateGroup, undo, redo } = useTemplateEditor();
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [autoRenderStatus, setAutoRenderStatus] = useState("En attente");
  const [dragPreview, setDragPreview] = useState<{
    sessionId: string;
    day: Day;
    startHour: number;
    endHour: number;
  } | null>(null);
  const [creatingTeacher, setCreatingTeacher] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState("");
  const [profilOpen, setProfilOpen] = useState(true);
  const [coursOpen, setCoursOpen] = useState(true);
  const [coursDetailsOpen, setCoursDetailsOpen] = useState(true);
  const [seanceDetailsOpen, setSeanceDetailsOpen] = useState(true);
  const [leftPaneWidth, setLeftPaneWidth] = useState(62);
  const [inspectorHidden, setInspectorHidden] = useState(false);
  const [rightPaneHidden, setRightPaneHidden] = useState(false);
  const firstLoadDoneRef = useRef(false);
  const saveAbortRef = useRef<AbortController | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const pdfBlobRef = useRef<Blob | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const token = accessToken;
    if (!token) {
      setTokenError("Acces refuse : le jeton est absent de l'URL.");
      setIsTokenValidated(false);
      return;
    }
    const controller = new AbortController();
    async function validateToken(): Promise<void> {
      try {
        await listTemplates(token!, controller.signal);
        setTokenError(null);
        setIsTokenValidated(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setTokenError(error instanceof Error ? error.message : "Acces refuse : jeton invalide.");
          setIsTokenValidated(false);
        }
      }
    }
    void validateToken();
    return () => controller.abort();
  }, [accessToken]);

  useEffect(() => {
    const token = accessToken;
    if (!isTokenValidated || !token) return;
    const controller = new AbortController();
    async function loadList(): Promise<void> {
      try {
        const data = await listTemplates(token!, controller.signal);
        setTemplates(data);
        const savedTeacher = window.sessionStorage.getItem(LAST_TEACHER_KEY);
        const preferredTeacher = savedTeacher && data.some((entry) => entry.teacherKey === savedTeacher)
          ? savedTeacher
          : data[0]?.teacherKey;
        if (preferredTeacher) {
          setSelectedTeacher(preferredTeacher);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRenderError(error instanceof Error ? error.message : "Impossible de charger les modeles");
        }
      }
    }
    void loadList();
    return () => controller.abort();
  }, [accessToken, isTokenValidated]);

  useEffect(() => {
    if (!selectedTeacher) return;
    window.sessionStorage.setItem(LAST_TEACHER_KEY, selectedTeacher);
  }, [selectedTeacher]);

  useEffect(() => {
    const token = accessToken;
    if (!isTokenValidated || !selectedTeacher || !token) {
      return;
    }
    const controller = new AbortController();
    async function loadTemplate(): Promise<void> {
      setLoading(true);
      try {
        const data = await getTemplate(selectedTeacher, token!, controller.signal);
        setLoadedTemplate(data);
        setActiveBlockId(null);
        firstLoadDoneRef.current = false;
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRenderError(error instanceof Error ? error.message : "Impossible de charger le modele");
        }
      } finally {
        setLoading(false);
      }
    }
    void loadTemplate();
    return () => controller.abort();
  }, [accessToken, isTokenValidated, selectedTeacher, setLoadedTemplate]);

  const flatSessions = useMemo(() => {
    if (!template) return [] as SessionRef[];
    const toSessionRefs = (
      groups: Array<{ id: string; couleur: Palette; seances: Session[]; nom?: string; label?: string }>,
      groupType: GroupType,
      labelKey: "nom" | "label",
    ) =>
      groups.flatMap((group) => group.seances.map((session) => {
        const preview = dragPreview?.sessionId === session.id ? dragPreview : null;
        return {
          sessionId: session.id,
          groupId: group.id,
          groupType,
          label: groupType === "availability" ? "Disponible" : (group[labelKey] ?? ""),
          color: group.couleur,
          day: preview?.day ?? session.day,
          startHour: preview?.startHour ?? session.startHour,
          endHour: preview?.endHour ?? session.endHour,
          lane: session.lane,
        };
      }));

    return [
      ...toSessionRefs(template.courses, "course", "nom"),
      ...toSessionRefs(template.disponibilites, "availability", "label"),
      ...toSessionRefs(template.extras, "extra", "label"),
    ];
  }, [dragPreview, template]);
  const hourCount = template ? template.endHour - template.startHour : 0;
  const gridHours = useMemo(
    () => Array.from({ length: hourCount }, (_, i) => (template ? template.startHour + i : i)),
    [hourCount, template],
  );
  const startHourOptions = useMemo(
    () => (template ? Array.from({ length: template.endHour - template.startHour }, (_, i) => template.startHour + i) : []),
    [template],
  );
  const endHourOptions = useMemo(
    () => (template ? Array.from({ length: template.endHour - template.startHour }, (_, i) => template.startHour + 1 + i) : []),
    [template],
  );
  const globalStartHourOptions = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const globalEndHourOptions = useMemo(() => Array.from({ length: 24 }, (_, i) => i + 1), []);
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

  function onDragStart(event: ReactPointerEvent<HTMLDivElement>, ref: SessionRef): void {
    if (!template) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startX = event.clientX;
    const blockStart = ref.startHour;
    const blockEnd = ref.endHour;
    const dayIndex = days.indexOf(ref.day);
    const startHourLimit = template.startHour;
    const endHourLimit = template.endHour;
    let nextValues = { day: ref.day, startHour: ref.startHour, endHour: ref.endHour };

    function onMove(moveEvent: PointerEvent): void {
      const deltaYHours = Math.round((moveEvent.clientY - startY) / hourPx);
      const deltaDays = Math.round((moveEvent.clientX - startX) / 130);
      const duration = blockEnd - blockStart;
      const nextDayIndex = clamp(dayIndex + deltaDays, 0, days.length - 1);
      const nextStart = clamp(blockStart + deltaYHours, startHourLimit, endHourLimit - duration);
      const nextEnd = nextStart + duration;
      nextValues = { day: days[nextDayIndex], startHour: nextStart, endHour: nextEnd };
      setDragPreview({
        sessionId: ref.sessionId,
        ...nextValues,
      });
    }

    function onUp(): void {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      updateSession(ref.sessionId, (session) => ({ ...session, ...nextValues }));
      setDragPreview(null);
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  function onResizeStart(event: ReactPointerEvent<HTMLDivElement>, ref: SessionRef): void {
    if (!template) return;
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const initialEnd = ref.endHour;
    const startHourLimit = template.startHour;
    const endHourLimit = template.endHour;
    let nextEndHour = ref.endHour;

    function onMove(moveEvent: PointerEvent): void {
      const deltaY = moveEvent.clientY - startY;
      const next = nextHourFromY((initialEnd - startHourLimit) * hourPx + deltaY, startHourLimit, endHourLimit);
      nextEndHour = Math.max(ref.startHour + 1, next);
      setDragPreview({
        sessionId: ref.sessionId,
        day: ref.day,
        startHour: ref.startHour,
        endHour: nextEndHour,
      });
    }

    function onUp(): void {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      updateSession(ref.sessionId, (session) => ({ ...session, endHour: Math.max(session.startHour + 1, nextEndHour) }));
      setDragPreview(null);
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }


  async function drawPdfBlobToCanvas(blob: Blob): Promise<void> {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const arrayBuffer = await blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const containerWidth = previewFrameRef.current?.clientWidth ?? canvas.parentElement?.clientWidth ?? 600;
    const unscaled = page.getViewport({ scale: 1 });
    const scale = containerWidth / unscaled.width;
    const viewport = page.getViewport({ scale });
    // Render offscreen first so the previous preview stays visible until ready.
    const offscreen = document.createElement("canvas");
    offscreen.width = viewport.width;
    offscreen.height = viewport.height;
    const offscreenCtx = offscreen.getContext("2d");
    if (!offscreenCtx) return;
    await page.render({ canvasContext: offscreenCtx, canvas: offscreen, viewport }).promise;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreen, 0, 0);
  }

  async function renderPdfAndPreview(templateToRender: TeacherTemplate): Promise<void> {
    if (!canvasRef.current) return;
    const token = accessToken;
    if (!token) {
      throw new Error("Acces refuse : jeton invalide.");
    }
    renderAbortRef.current?.abort();
    const controller = new AbortController();
    renderAbortRef.current = controller;
    setRendering(true);
    setRenderError(null);
    try {
      const blob = await renderTemplatePdf(templateToRender.teacherKey, templateToRender, token, controller.signal);
      pdfBlobRef.current = blob;
      await drawPdfBlobToCanvas(blob);
      setAutoRenderStatus(`Rendu a ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setRenderError(err instanceof Error ? err.message : "Erreur inconnue");
      setAutoRenderStatus("Echec du rendu");
    } finally {
      setRendering(false);
    }
  }

  useEffect(() => {
    if (rightPaneHidden) return;
    const frame = previewFrameRef.current;
    if (!frame) return;
    let timeout: number | undefined;
    const scheduleRedraw = (): void => {
      if (!pdfBlobRef.current || rendering) return;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        if (!pdfBlobRef.current) return;
        void drawPdfBlobToCanvas(pdfBlobRef.current).catch(() => {
          // Keep current preview if a resize-time rerender fails.
        });
      }, 120);
    };
    const observer = new ResizeObserver(scheduleRedraw);
    observer.observe(frame);
    window.addEventListener("resize", scheduleRedraw);
    return () => {
      if (timeout) window.clearTimeout(timeout);
      window.removeEventListener("resize", scheduleRedraw);
      observer.disconnect();
    };
  }, [rendering, rightPaneHidden]);

  useEffect(() => {
    if (rightPaneHidden || rendering || !pdfBlobRef.current) return;
    const handle = window.setTimeout(() => {
      if (!pdfBlobRef.current) return;
      void drawPdfBlobToCanvas(pdfBlobRef.current).catch(() => {
        // Keep current preview if visibility-time rerender fails.
      });
    }, 80);
    return () => window.clearTimeout(handle);
  }, [rightPaneHidden, rendering]);

  useEffect(() => {
    if (!template) return;
    const token = accessToken;
    if (!token) return;
    if (!firstLoadDoneRef.current) {
      firstLoadDoneRef.current = true;
      void renderPdfAndPreview(template);
      return;
    }
    setAutoRenderStatus("En attente des changements...");
    saveAbortRef.current?.abort();
    const saveController = new AbortController();
    saveAbortRef.current = saveController;
    const handle = setTimeout(() => {
      setAutoRenderStatus("Rendu automatique...");
      void renderPdfAndPreview(template);
    }, 600);
    void saveTemplate(template, token, saveController.signal).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setRenderError(error instanceof Error ? error.message : "Echec de sauvegarde");
        setAutoRenderStatus("Echec de sauvegarde");
      }
    });
    return () => {
      clearTimeout(handle);
      saveController.abort();
    };
  }, [accessToken, template]);

  function downloadPdf(): void {
    if (!pdfBlobRef.current || !template) return;
    const url = URL.createObjectURL(pdfBlobRef.current);
    const anchor = document.createElement("a");
    anchor.href = url;
    const teacherNamePart = toFilePart(template.profile.nom) || toFilePart(template.teacherKey) || "enseignant";
    const sessionPart = toFilePart(template.session) || "session";
    anchor.download = `Horaire_${teacherNamePart}_${sessionPart}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function createTeacher(): Promise<void> {
    const token = accessToken;
    if (!token) return;
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
      endHour: 20,
      courses: [{ id: crypto.randomUUID(), code: "420-XXX-JQ", nom: "Nouveau cours", local: "000.0", couleur: "orange", seances: [{ id: crypto.randomUUID(), day: "Lundi", startHour: 8, endHour: 10, lane: 0 }] }],
      disponibilites: [{ ...newAvailability(), seances: [{ id: crypto.randomUUID(), day: "Mercredi", startHour: 8, endHour: 10, lane: 0 }] }],
      extras: [{ ...newExtra(), seances: [{ id: crypto.randomUUID(), day: "Vendredi", startHour: 8, endHour: 10, lane: 0 }] }],
      version: { timestamp: new Date().toISOString(), note: "Cree dans l'application web" },
    };
    await saveTemplate(newTemplate, token);
    const data = await listTemplates(token);
    setTemplates(data);
    setSelectedTeacher(teacherKey);
    setNewTeacherName("");
    setCreatingTeacher(false);
  }

  function deleteSession(sessionId: string): void {
    updateTemplate((draft) => removeSessionEverywhere(draft, sessionId));
    if (activeBlockId === sessionId) {
      setActiveBlockId(null);
    }
  }

  function startPaneResize(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    function onMove(moveEvent: PointerEvent): void {
      const next = (moveEvent.clientX / window.innerWidth) * 100;
      setLeftPaneWidth(clamp(next, 28, 72));
    }
    function onUp(): void {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  if (loading) {
    return <main className="loading">Chargement des modeles...</main>;
  }

  if (tokenError) {
    return (
      <main className="loading">
        <p>{tokenError}</p>
        <p>Utilisez un lien comme <code>/MONJETON</code>.</p>
      </main>
    );
  }
  if (!isTokenValidated) return <main className="loading">Validation du jeton d'acces...</main>;

  return (
    <main className="layout">
      <section className="leftPane" style={!rightPaneHidden ? { flex: `0 0 ${leftPaneWidth}%` } : { flex: 1 }}>
        <header className="toolbar">
          <h1>DICJ Horaires</h1>
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
          <button className="iconButton" onClick={undo} disabled={history.length === 0} title="Annuler" aria-label="Annuler">
            ↶
          </button>
          <button className="iconButton" onClick={redo} disabled={future.length === 0} title="Retablir" aria-label="Retablir">
            ↷
          </button>
        </header>

        {!template ? (
          <div className="loading">
            <p>Aucun professeur. Créer un avec <strong>+ Prof.</strong></p>
          </div>
        ) : <div className={`editorBody ${inspectorHidden ? "inspectorHidden" : ""}`}>
          <button
            className={`paneEdgeToggle iconButton left ${inspectorHidden ? "hidden" : ""}`}
            onClick={() => setInspectorHidden((current) => !current)}
            title={inspectorHidden ? "Afficher le panneau des proprietes" : "Masquer le panneau des proprietes"}
          >
            {inspectorHidden ? ">>" : "<<"}
          </button>
          {!inspectorHidden && <aside className="inspector">
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
                <div className="hourRangeRow">
                  <span>Plage</span>
                  <select
                    value={template.startHour}
                    onChange={(event) => {
                      const nextStart = parseInt(event.target.value, 10);
                      updateTemplate((draft) => {
                        const nextEnd = Math.max(draft.endHour, nextStart + 1);
                        const clampSessionToBounds = (session: Session): Session => {
                          const start = clamp(session.startHour, nextStart, nextEnd - 1);
                          const end = clamp(session.endHour, start + 1, nextEnd);
                          return { ...session, startHour: start, endHour: end };
                        };
                        return {
                          ...draft,
                          startHour: nextStart,
                          endHour: nextEnd,
                          courses: draft.courses.map((group) => ({ ...group, seances: group.seances.map(clampSessionToBounds) })),
                          disponibilites: draft.disponibilites.map((group) => ({ ...group, seances: group.seances.map(clampSessionToBounds) })),
                          extras: draft.extras.map((group) => ({ ...group, seances: group.seances.map(clampSessionToBounds) })),
                        };
                      });
                    }}
                  >
                    {globalStartHourOptions.map((h) => (
                      <option key={h} value={h}>{h}h</option>
                    ))}
                  </select>
                  <select
                    value={template.endHour}
                    onChange={(event) => {
                      const nextEnd = parseInt(event.target.value, 10);
                      updateTemplate((draft) => {
                        const safeEnd = Math.max(nextEnd, draft.startHour + 1);
                        const clampSessionToBounds = (session: Session): Session => {
                          const start = clamp(session.startHour, draft.startHour, safeEnd - 1);
                          const end = clamp(session.endHour, start + 1, safeEnd);
                          return { ...session, startHour: start, endHour: end };
                        };
                        return {
                          ...draft,
                          endHour: safeEnd,
                          courses: draft.courses.map((group) => ({ ...group, seances: group.seances.map(clampSessionToBounds) })),
                          disponibilites: draft.disponibilites.map((group) => ({ ...group, seances: group.seances.map(clampSessionToBounds) })),
                          extras: draft.extras.map((group) => ({ ...group, seances: group.seances.map(clampSessionToBounds) })),
                        };
                      });
                    }}
                  >
                    {globalEndHourOptions.map((h) => (
                      <option key={h} value={h}>{h}h</option>
                    ))}
                  </select>
                </div>
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
                + Activité
              </button>
            </div>
            {selectedSession && selectedSessionObj ? (
              <div className="blockEditor">
                <div className="sessionActionRow">
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
                  <button className="danger" onClick={() => deleteSession(selectedSession.sessionId)}>
                    Supprimer la seance
                  </button>
                </div>
                {selectedCourse ? (
                  <>
                    <div className="sectionToggle" onClick={() => setCoursDetailsOpen((open) => !open)}>
                      Cours <span className="chevron">{coursDetailsOpen ? "▾" : "▸"}</span>
                    </div>
                    {coursDetailsOpen && (
                      <>
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
                            onChange={(event) => {
                              const nextColor = event.target.value as Palette;
                              updateTemplate((draft) => {
                                const selected = draft.courses.find((course) => course.id === selectedCourse.id);
                                if (!selected) return draft;
                                if (selected.couleur === nextColor) return draft;
                                const conflicting = draft.courses.find(
                                  (course) => course.id !== selected.id && course.couleur === nextColor,
                                );
                                return {
                                  ...draft,
                                  courses: draft.courses.map((course) => {
                                    if (course.id === selected.id) {
                                      return { ...course, couleur: nextColor };
                                    }
                                    if (conflicting && course.id === conflicting.id) {
                                      return { ...course, couleur: selected.couleur };
                                    }
                                    return course;
                                  }),
                                };
                              });
                            }}
                          >
                            {coursePalette.map((entry) => (
                              <option key={entry} value={entry}>{entry}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                    <div className="sectionToggle" onClick={() => setSeanceDetailsOpen((open) => !open)}>
                      Séance <span className="chevron">{seanceDetailsOpen ? "▾" : "▸"}</span>
                    </div>
                    {seanceDetailsOpen && (
                      <>
                        <label>
                          Groupe
                          <input
                            value={selectedSessionObj.groupe ?? ""}
                            onChange={(event) =>
                              updateSession(selectedSession.sessionId, (s) => ({ ...s, groupe: event.target.value || undefined }))
                            }
                          />
                        </label>
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
                        <div className="hourRangeRow">
                          <span>Début - Fin</span>
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
                            {startHourOptions.map((h) => (
                              <option key={h} value={h}>{h}h</option>
                            ))}
                          </select>
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
                            {endHourOptions.map((h) => (
                              <option key={h} value={h}>{h}h</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <label>
                      Titre
                      <input
                        value={selectedSession.groupType === "availability" ? "Disponible" : selectedSession.label}
                        disabled={selectedSession.groupType === "availability"}
                        onChange={(event) =>
                          selectedSession.groupType === "availability" ? undefined :
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
                {selectedSession.groupType !== "course" && (
                  <>
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
                    <div className="hourRangeRow">
                      <span>Début - Fin</span>
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
                        {startHourOptions.map((h) => (
                          <option key={h} value={h}>{h}h</option>
                        ))}
                      </select>
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
                        {endHourOptions.map((h) => (
                          <option key={h} value={h}>{h}h</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p>Sélectionnez une séance a modifier.</p>
            )}
            </>
            )}
          </aside>}

          <section className="grid" ref={gridRef}>
            <div className="dayHeader">
              <div />
              {days.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            <div className="gridCanvas" style={{ height: `${hourCount * hourPx}px` }}>
              {gridHours.map((hour, idx) => (
                <div key={hour} className="hourRow" style={{ top: `${idx * hourPx}px` }}>
                  <span>{hour}h</span>
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
                    <button
                      className="trashSessionBtn iconButton"
                      title="Supprimer la seance"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteSession(session.sessionId);
                      }}
                    >
                      🗑
                    </button>
                    <div className="resizeHandle" onPointerDown={(event) => onResizeStart(event, session)} />
                  </div>
                );
              })}
            </div>
          </section>
        </div>}
      </section>

      {!rightPaneHidden && (
        <div className="paneDivider" onPointerDown={startPaneResize} />
      )}

      {!rightPaneHidden && (
      <section className="rightPane" style={{ flex: `1 1 ${100 - leftPaneWidth}%` }}>
        <button
          className="paneEdgeToggle iconButton right"
          onClick={() => setRightPaneHidden(true)}
          title="Masquer l'aperçu PDF"
        >
          {">>"}
        </button>
        <header className="pdfToolbar">
          <h2>Aperçu PDF</h2>
          <button
            className="iconButton"
            onClick={() => template && void renderPdfAndPreview(template)}
            disabled={rendering || !template}
            title="Actualiser le PDF"
            aria-label="Actualiser le PDF"
          >
            ↻
          </button>
          <button
            className="iconButton"
            onClick={downloadPdf}
            disabled={!pdfBlobRef.current}
            title="Télécharger le PDF"
            aria-label="Télécharger le PDF"
          >
            ⬇
          </button>
          <small>{autoRenderStatus}</small>
        </header>
        <div className="previewFrame" ref={previewFrameRef}>
          {renderError && <div className="previewError"><strong>Erreur de rendu :</strong> {renderError}</div>}
          <canvas ref={canvasRef} className="pdfCanvas" />
        </div>
      </section>
      )}

      {rightPaneHidden && (
        <button
          className="paneEdgeToggle iconButton right hidden"
          onClick={() => setRightPaneHidden(false)}
          title="Afficher l'aperçu PDF"
        >
          {"<<"}
        </button>
      )}
    </main>
  );
}

export default App;
