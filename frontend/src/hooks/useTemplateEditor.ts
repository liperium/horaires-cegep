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
    setTemplate((current) => {
      if (!current) return current;
      setHistory((entries) => [...entries, current]);
      setFuture([]);
      return mutator(structuredClone(current));
    });
  }, []);

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
    setTemplate((current) => {
      if (!current) return current;
      let previous: TeacherTemplate | undefined;
      setHistory((entries) => {
        previous = entries[entries.length - 1];
        return entries.slice(0, -1);
      });
      if (!previous) return current;
      setFuture((entries) => [current, ...entries]);
      return previous;
    });
  }, []);

  const redo = useCallback((): void => {
    setTemplate((current) => {
      if (!current) return current;
      let next: TeacherTemplate | undefined;
      setFuture((entries) => {
        next = entries[0];
        return entries.slice(1);
      });
      if (!next) return current;
      setHistory((entries) => [...entries, current]);
      return next;
    });
  }, []);

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
