"use client";
// Where the course's passages came from, for every label that describes them: the learner's own text,
// or study notes written by AI for a subject they named (a "topic" plan). AppShell provides it from /api/me.
import { createContext, useContext } from "react";
import { sourceCopy, type CourseSource } from "@/lib/copy/pages";

const Ctx = createContext<CourseSource>(null);
export const CourseSourceProvider = Ctx.Provider;

/** The wording for this learner's course. */
export function useSourceCopy() {
  return sourceCopy(useContext(Ctx));
}
