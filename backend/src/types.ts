export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"] as const;
export const PALETTE = [
  "orange",
  "blue",
  "green",
  "purple",
  "red",
  "pink",
  "yellow",
  "teal",
  "grey",
] as const;

export type Day = (typeof DAYS)[number];
export type Palette = (typeof PALETTE)[number];

export interface TeacherProfile {
  nom: string;
  titre: string;
  courriel: string;
  contactPreference: string;
}

export interface Session {
  id: string;
  day: Day;
  startHour: number;
  endHour: number;
  lane: number;
  groupe?: string;
}

export interface Course {
  id: string;
  code: string;
  nom: string;
  local: string;
  couleur: Palette;
  seances: Session[];
}

export interface Availability {
  id: string;
  label: string;
  couleur: Palette;
  seances: Session[];
}

export interface Extra {
  id: string;
  label: string;
  couleur: Palette;
  seances: Session[];
}

export interface TemplateVersion {
  timestamp: string;
  note: string;
}

export interface TeacherTemplate {
  id: string;
  teacherKey: string;
  profile: TeacherProfile;
  startHour: number;
  endHour: number;
  courses: Course[];
  disponibilites: Availability[];
  extras: Extra[];
  version: TemplateVersion;
}

export interface TemplateStore {
  templates: TeacherTemplate[];
}
