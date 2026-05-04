import { z } from "zod";

export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"] as const;
export const PALETTE = [
  "orange",
  "blue",
  "light_blue",
  "green",
  "purple",
  "red",
  "pink",
  "yellow",
  "teal",
  "grey",
] as const;

export const PALETTE_COLORS: Record<(typeof PALETTE)[number], string> = {
  orange: "#f7941d",
  blue: "#1976d2",
  light_blue: "#00a2e8",
  green: "#4caf50",
  purple: "#9c59b6",
  red: "#d32f2f",
  pink: "#e91e63",
  yellow: "#fbc02d",
  teal: "#009688",
  grey: "#787878",
};

const zDay = z.enum(DAYS);
const zPalette = z.enum(PALETTE);

export const zSession = z
  .object({
    id: z.string().min(1),
    day: zDay,
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    groupe: z.string().optional(),
    lane: z.number().int().min(0).max(5).default(0),
  })
  .refine((v) => v.endHour > v.startHour, {
    message: "endHour must be after startHour",
    path: ["endHour"],
  });

export const zCourse = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  nom: z.string().min(1),
  local: z.string().min(1),
  couleur: zPalette,
  seances: z.array(zSession),
});

export const zAvailability = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  couleur: zPalette,
  seances: z.array(zSession),
});

export const zExtra = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  couleur: zPalette,
  seances: z.array(zSession),
});

export const zTeacherTemplate = z
  .object({
    id: z.string().min(1),
    teacherKey: z.string().min(1),
    session: z.string().min(1).default("Hiver 2026"),
    profile: z.object({
      nom: z.string().min(1),
      titre: z.string().min(1),
      courriel: z.string().email(),
      contactPreference: z.string().min(1),
    }),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    courses: z.array(zCourse),
    disponibilites: z.array(zAvailability),
    extras: z.array(zExtra),
    version: z.object({
      timestamp: z.string().min(1),
      note: z.string().min(1),
    }),
  })
  .refine((v) => v.endHour > v.startHour, {
    message: "endHour must be after startHour",
    path: ["endHour"],
  });

export const zTemplateListItem = z.object({
  id: z.string().min(1),
  teacherKey: z.string().min(1),
  nom: z.string().min(1),
  version: z.object({
    timestamp: z.string().min(1),
    note: z.string().min(1),
  }),
});

export const zTemplateListResponse = z.array(zTemplateListItem);

export type Day = z.infer<typeof zDay>;
export type Palette = z.infer<typeof zPalette>;
export type Session = z.infer<typeof zSession>;
export type Course = z.infer<typeof zCourse>;
export type Availability = z.infer<typeof zAvailability>;
export type Extra = z.infer<typeof zExtra>;
export type TeacherTemplate = z.infer<typeof zTeacherTemplate>;
