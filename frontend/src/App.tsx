import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import "./App.css";

type Day = "Lundi" | "Mardi" | "Mercredi" | "Jeudi" | "Vendredi";
type Palette = "orange" | "blue" | "green" | "purple" | "red" | "pink" | "yellow" | "teal" | "grey";
type GroupType = "course" | "availability" | "extra";

interface Session {
  id: string;
  day: Day;
  startHour: number;
  endHour: number;
  groupe?: string;
  lane: number;
}

interface Course {
  id: string;
  code: string;
  nom: string;
  local: string;
  couleur: Palette;
  seances: Session[];
}

interface Availability {
  id: string;
  label: string;
  couleur: Palette;
  seances: Session[];
}

interface Extra {
  id: string;
  label: string;
  couleur: Palette;
  seances: Session[];
}

interface TeacherTemplate {
  id: string;
  teacherKey: string;
  profile: { nom: string; titre: string; courriel: string; contactPreference: string };
  startHour: number;
  endHour: number;
  courses: Course[];
  disponibilites: Availability[];
  extras: Extra[];
  version: { timestamp: string; note: string };
}

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

const days: Day[] = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const palette: Palette[] = ["orange", "blue", "green", "purple", "red", "pink", "yellow", "teal", "grey"];
const colorMap: Record<Palette, string> = {
  orange: "#f7941d",
  blue: "#00a2e8",
  green: "#4caf50",
  purple: "#9c59b6",
  red: "#d32f2f",
  pink: "#e91e63",
  yellow: "#fbc02d",
  teal: "#009688",
  grey: "#787878",
};

const hourPx = 46;

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

function App() {
  const [templates, setTemplates] = useState<Array<{ teacherKey: string; nom: string }>>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<string>("");
  const [template, setTemplate] = useState<TeacherTemplate | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [history, setHistory] = useState<TeacherTemplate[]>([]);
  const [future, setFuture] = useState<TeacherTemplate[]>([]);
  const [previewSlots, setPreviewSlots] = useState<[string | null, string | null]>([null, null]);
  const [activePreviewSlot, setActivePreviewSlot] = useState<0 | 1>(0);
  const [loadingPreviewSlot, setLoadingPreviewSlot] = useState<0 | 1 | null>(null);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [previewTransitioning, setPreviewTransitioning] = useState(false);
  const [autoRenderEnabled, setAutoRenderEnabled] = useState(true);
  const [autoRenderStatus, setAutoRenderStatus] = useState("Idle");
  const firstLoadDoneRef = useRef(false);
  const previewSlotsRef = useRef<[string | null, string | null]>([null, null]);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function loadList(): Promise<void> {
      const response = await fetch("/api/templates");
      const data = (await response.json()) as Array<{ teacherKey: string; nom: string }>;
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
      const data = (await response.json()) as TeacherTemplate;
      setTemplate(data);
      setHistory([]);
      setFuture([]);
      setActiveBlockId(null);
      firstLoadDoneRef.current = false;
      setLoading(false);
    }
    void loadTemplate();
  }, [selectedTeacher]);

  useEffect(() => {
    previewSlotsRef.current = previewSlots;
  }, [previewSlots]);

  useEffect(() => {
    return () => {
      for (const url of previewSlotsRef.current) {
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, []);

  const flatSessions = useMemo(() => {
    if (!template) return [] as SessionRef[];
    const fromCourses = template.courses.flatMap((course) =>
      course.seances.map((session) => ({
        sessionId: session.id,
        groupId: course.id,
        groupType: "course" as const,
        label: course.nom,
        color: course.couleur,
        day: session.day,
        startHour: session.startHour,
        endHour: session.endHour,
        lane: session.lane,
      })),
    );
    const fromDispos = template.disponibilites.flatMap((group) =>
      group.seances.map((session) => ({
        sessionId: session.id,
        groupId: group.id,
        groupType: "availability" as const,
        label: group.label,
        color: group.couleur,
        day: session.day,
        startHour: session.startHour,
        endHour: session.endHour,
        lane: session.lane,
      })),
    );
    const fromExtras = template.extras.flatMap((group) =>
      group.seances.map((session) => ({
        sessionId: session.id,
        groupId: group.id,
        groupType: "extra" as const,
        label: group.label,
        color: group.couleur,
        day: session.day,
        startHour: session.startHour,
        endHour: session.endHour,
        lane: session.lane,
      })),
    );
    return [...fromCourses, ...fromDispos, ...fromExtras];
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

  function updateGroup(groupType: GroupType, groupId: string, updater: (current: Course | Availability | Extra) => Course | Availability | Extra): void {
    updateTemplate((draft) => {
      if (groupType === "course") {
        draft.courses = draft.courses.map((group) => (group.id === groupId ? (updater(group) as Course) : group));
      } else if (groupType === "availability") {
        draft.disponibilites = draft.disponibilites.map((group) =>
          group.id === groupId ? (updater(group) as Availability) : group,
        );
      } else {
        draft.extras = draft.extras.map((group) => (group.id === groupId ? (updater(group) as Extra) : group));
      }
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
        const groups = [...clone.courses, ...clone.disponibilites, ...clone.extras];
        for (const group of groups) {
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
        const groups = [...clone.courses, ...clone.disponibilites, ...clone.extras];
        for (const group of groups) {
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

  async function saveTemplate(): Promise<void> {
    if (!template) return;
    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...template,
        version: { timestamp: new Date().toISOString(), note: "Saved from UI" },
      }),
    });
    const saved = (await response.json()) as TeacherTemplate;
    setTemplate(saved);
  }

  async function renderPdfAndPreview(): Promise<void> {
    if (!template) return;
    setRendering(true);
    setPreviewTransitioning(true);
    const response = await fetch(`/api/templates/${template.teacherKey}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template),
    });
    const blob = await response.blob();
    const nextUrl = URL.createObjectURL(blob);
    const nextSlot: 0 | 1 = activePreviewSlot === 0 ? 1 : 0;
    setPreviewSlots((current) => {
      const currentAtNext = current[nextSlot];
      if (currentAtNext) {
        URL.revokeObjectURL(currentAtNext);
      }
      const copy: [string | null, string | null] = [...current] as [string | null, string | null];
      copy[nextSlot] = nextUrl;
      return copy;
    });
    setLoadingPreviewSlot(nextSlot);
    setAutoRenderStatus(`Rendered at ${new Date().toLocaleTimeString()}`);
  }

  function handlePreviewLoad(slot: 0 | 1): void {
    if (loadingPreviewSlot !== slot) return;
    const previousSlot = activePreviewSlot;
    const previousUrl = previewSlots[previousSlot];
    setActivePreviewSlot(slot);
    setLoadingPreviewSlot(null);
    window.setTimeout(() => setPreviewTransitioning(false), 120);
    setRendering(false);
    if (previousUrl && previousSlot !== slot) {
      window.setTimeout(() => URL.revokeObjectURL(previousUrl), 2500);
      setPreviewSlots((current) => {
        const copy: [string | null, string | null] = [...current] as [string | null, string | null];
        if (copy[previousSlot] === previousUrl) {
          copy[previousSlot] = null;
        }
        return copy;
      });
    }
  }

  useEffect(() => {
    if (!template) return;
    if (!firstLoadDoneRef.current) {
      firstLoadDoneRef.current = true;
      void renderPdfAndPreview();
      return;
    }
    if (!autoRenderEnabled) return;
    setAutoRenderStatus("Waiting for changes...");
    const handle = setTimeout(() => {
      setAutoRenderStatus("Auto-rendering...");
      void renderPdfAndPreview();
    }, 500);
    return () => clearTimeout(handle);
  }, [template, autoRenderEnabled]);

  function downloadPdf(): void {
    const activeUrl = previewSlots[activePreviewSlot];
    if (!activeUrl || !template) return;
    const anchor = document.createElement("a");
    anchor.href = activeUrl;
    anchor.download = `${template.teacherKey}-horaire.pdf`;
    anchor.click();
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

  if (loading || !template) {
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
          <button onClick={saveTemplate}>Save template</button>
          <button onClick={undo} disabled={history.length === 0}>
            Undo
          </button>
          <button onClick={redo} disabled={future.length === 0}>
            Redo
          </button>
          <button onClick={renderPdfAndPreview} disabled={rendering}>
            {rendering ? "Rendering..." : "Refresh PDF"}
          </button>
          <button onClick={downloadPdf} disabled={!previewSlots[activePreviewSlot]}>
            Download PDF
          </button>
          <label>
            <input
              type="checkbox"
              checked={autoRenderEnabled}
              onChange={(event) => setAutoRenderEnabled(event.target.checked)}
            />
            Auto-render
          </label>
          <small>{autoRenderStatus}</small>
        </header>

        <div className="editorBody">
          <aside className="inspector">
            <h2>Cours et seances</h2>
            <div className="quickActions">
              <button
                onClick={() =>
                  updateTemplate((draft) => ({
                    ...draft,
                    courses: [
                      ...draft.courses,
                      {
                        id: crypto.randomUUID(),
                        code: "420-XXX-JQ",
                        nom: "Nouveau cours",
                        local: "000.0",
                        couleur: "orange",
                        seances: [newSession()],
                      },
                    ],
                  }))
                }
              >
                + Cours
              </button>
              <button
                onClick={() =>
                  updateTemplate((draft) => ({
                    ...draft,
                    disponibilites: [
                      ...draft.disponibilites,
                      { id: crypto.randomUUID(), label: "Dispo", couleur: "blue", seances: [newSession()] },
                    ],
                  }))
                }
              >
                + Dispo
              </button>
              <button
                onClick={() =>
                  updateTemplate((draft) => ({
                    ...draft,
                    extras: [
                      ...draft.extras,
                      { id: crypto.randomUUID(), label: "Activite", couleur: "grey", seances: [newSession()] },
                    ],
                  }))
                }
              >
                + Extra
              </button>
            </div>
            {selectedSession ? (
              <div className="blockEditor">
                <label>
                  Label
                  <input
                    value={selectedSession.label}
                    onChange={(event) => {
                      if (selectedSession.groupType === "course") {
                        updateGroup("course", selectedSession.groupId, (group) => ({
                          ...group,
                          nom: event.target.value,
                        }));
                        return;
                      }
                      updateGroup(selectedSession.groupType, selectedSession.groupId, (group) => ({
                        ...group,
                        label: event.target.value,
                      }));
                    }}
                  />
                </label>
                {selectedCourse ? (
                  <>
                    <label>
                      Code
                      <input
                        value={selectedCourse.code}
                        onChange={(event) =>
                          updateGroup("course", selectedCourse.id, (group) => ({
                            ...group,
                            code: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Local
                      <input
                        value={selectedCourse.local}
                        onChange={(event) =>
                          updateGroup("course", selectedCourse.id, (group) => ({
                            ...group,
                            local: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </>
                ) : null}
                <label>
                  Color
                  <select
                    value={selectedSession.color}
                    onChange={(event) =>
                      updateGroup(selectedSession.groupType, selectedSession.groupId, (group) => ({
                        ...group,
                        couleur: event.target.value as Palette,
                      }))
                    }
                  >
                    {palette.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="danger"
                  onClick={() =>
                    updateTemplate((draft) => ({
                      ...draft,
                      courses: draft.courses
                        .map((group) => ({
                          ...group,
                          seances: group.seances.filter((session) => session.id !== selectedSession.sessionId),
                        }))
                        .filter((group) => group.seances.length > 0),
                      disponibilites: draft.disponibilites
                        .map((group) => ({
                          ...group,
                          seances: group.seances.filter((session) => session.id !== selectedSession.sessionId),
                        }))
                        .filter((group) => group.seances.length > 0),
                      extras: draft.extras
                        .map((group) => ({
                          ...group,
                          seances: group.seances.filter((session) => session.id !== selectedSession.sessionId),
                        }))
                        .filter((group) => group.seances.length > 0),
                    }))
                  }
                >
                  Delete seance
                </button>
                <button
                  onClick={() =>
                    updateGroup(selectedSession.groupType, selectedSession.groupId, (group) => ({
                      ...group,
                      seances: [...group.seances, newSession()],
                    }))
                  }
                >
                  + Seance
                </button>
              </div>
            ) : (
              <p>Select a seance to edit.</p>
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
                      background: colorMap[session.color],
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
        </div>
      </section>

      <section className="rightPane">
        <h2>PDF Preview</h2>
        {previewSlots[0] || previewSlots[1] ? (
          <div className={`previewFrame ${previewTransitioning ? "transitioning" : ""}`}>
            {previewSlots[0] ? (
              <iframe
                src={previewSlots[0]}
                title="PDF preview slot 1"
                className={activePreviewSlot === 0 ? "active" : "inactive"}
                onLoad={() => handlePreviewLoad(0)}
              />
            ) : null}
            {previewSlots[1] ? (
              <iframe
                src={previewSlots[1]}
                title="PDF preview slot 2"
                className={activePreviewSlot === 1 ? "active" : "inactive"}
                onLoad={() => handlePreviewLoad(1)}
              />
            ) : null}
            {rendering ? <div className="previewOverlay">Updating preview...</div> : null}
          </div>
        ) : (
          <p>Click “Refresh PDF” to preview.</p>
        )}
      </section>
    </main>
  );
}

export default App;
