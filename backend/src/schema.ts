import { z } from "zod";
import { DAYS, PALETTE } from "./types.js";

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
    courses: z.array(
      z.object({
        id: z.string().min(1),
        code: z.string().min(1),
        nom: z.string().min(1),
        local: z.string().min(1),
        couleur: zPalette,
        seances: z.array(zSession),
      }),
    ),
    disponibilites: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        couleur: zPalette,
        seances: z.array(zSession),
      }),
    ),
    extras: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        couleur: zPalette,
        seances: z.array(zSession),
      }),
    ),
    version: z.object({
      timestamp: z.string().min(1),
      note: z.string().min(1),
    }),
  })
  .refine((v) => v.endHour > v.startHour, {
    message: "endHour must be after startHour",
    path: ["endHour"],
  });

export const zTemplateStore = z.object({
  templates: z.array(zTeacherTemplate),
});

export type TeacherTemplateInput = z.infer<typeof zTeacherTemplate>;
