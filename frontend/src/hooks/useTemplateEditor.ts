import { useCallback, useState } from "react";
import type { GroupType } from "../template-groups.ts";
import { updateGroupById, updateSessionById } from "../template-groups.ts";
import type { Availability, Course, Extra, Session, TeacherTemplate } from "../../../backend/src/template-contract.ts";

type Group = Course | Availability | Extra;

const EDIT_NOTE = "Edited in web app";

export interface TemplateEditor {
  template: TeacherTemplate | null;
  history: TeacherTemplate[];
  future: TeacherTemplate[];
  setLoadedTemplate: (template: TeacherTemplate) => void;
  updateTemplate: (mutator: (draft: TeacherTemplate) => TeacherTemplate) => void;
  updateSession: (sessionId: string, updater: (session: Session) => Session) => void;
  updateGroup: (groupType: GroupType, groupId: string, updater: (group: Group) => Group) => void;
  undo: () => void;
  redo: () => void;
}

export function useTemplateEditor(): TemplateEditor {
  const [template, setTemplate] = useState<TeacherTemplate | null>(null);
  const [history, setHistory] = useState<TeacherTemplate[]>([]);
  const [future, setFuture] = useState<TeacherTemplate[]>([]);

  function withVersion(draft: TeacherTemplate): TeacherTemplate {
    draft.version = { timestamp: new Date().toISOString(), note: EDIT_NOTE };
    return draft;
  }

  const setLoadedTemplate = useCallback((nextTemplate: TeacherTemplate): void => {
    setTemplate(nextTemplate);
    setHistory([]);
    setFuture([]);
  }, []);

  const updateTemplate = useCallback((mutator: (draft: TeacherTemplate) => TeacherTemplate): void => {
    if (!template) return;
    setHistory((entries) => [...entries, template]);
    setFuture([]);
    setTemplate(mutator(structuredClone(template)));
  }, [template]);

  const updateSession = useCallback((sessionId: string, updater: (session: Session) => Session): void => {
    updateTemplate((draft) => {
      if (updateSessionById(draft, sessionId, updater)) {
        return withVersion(draft);
      }
      return draft;
    });
  }, [updateTemplate]);

  const updateGroup = useCallback((groupType: GroupType, groupId: string, updater: (group: Group) => Group): void => {
    updateTemplate((draft) => withVersion(updateGroupById(draft, groupType, groupId, updater)));
  }, [updateTemplate]);

  const undo = useCallback((): void => {
    if (!template || history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((entries) => entries.slice(0, -1));
    setFuture((entries) => [template, ...entries]);
    setTemplate(previous);
  }, [history, template]);

  const redo = useCallback((): void => {
    if (!template || future.length === 0) return;
    const [next, ...rest] = future;
    setFuture(rest);
    setHistory((entries) => [...entries, template]);
    setTemplate(next);
  }, [future, template]);

  return {
    template,
    history,
    future,
    setLoadedTemplate,
    updateTemplate,
    updateSession,
    updateGroup,
    undo,
    redo,
  };
}
