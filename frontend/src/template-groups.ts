import type { Availability, Course, Extra, Session, TeacherTemplate } from "../../backend/src/template-contract.ts";

export type GroupType = "course" | "availability" | "extra";
export type Group = Course | Availability | Extra;

export function allGroups(template: Pick<TeacherTemplate, "courses" | "disponibilites" | "extras">): Group[] {
  return [...template.courses, ...template.disponibilites, ...template.extras];
}

export function updateGroupCollection(
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

export function updateGroupById(
  draft: TeacherTemplate,
  groupType: GroupType,
  groupId: string,
  updater: (group: Group) => Group,
): TeacherTemplate {
  return updateGroupCollection(draft, groupType, (groups) =>
    groups.map((group) => (group.id === groupId ? updater(group) : group)),
  );
}

export function updateSessionById(
  draft: TeacherTemplate,
  sessionId: string,
  updater: (session: Session) => Session,
): boolean {
  for (const group of allGroups(draft)) {
    const idx = group.seances.findIndex((session) => session.id === sessionId);
    if (idx !== -1) {
      group.seances[idx] = updater(group.seances[idx]);
      return true;
    }
  }
  return false;
}

export function removeSessionEverywhere(draft: TeacherTemplate, sessionId: string): TeacherTemplate {
  for (const type of ["course", "availability", "extra"] as const) {
    updateGroupCollection(draft, type, (groups) =>
      groups
        .map((group) => ({
          ...group,
          seances: group.seances.filter((session) => session.id !== sessionId),
        }))
        .filter((group) => group.seances.length > 0),
    );
  }
  return draft;
}
