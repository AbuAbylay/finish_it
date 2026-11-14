// Every reminder variant must render with real values: no {placeholder} may survive.
// Runs against templates/reminders.json when the AI layer has added it, else the dev fixture.
import { describe, expect, it, vi } from "vitest";
import { BLOCKERS } from "@/lib/types";

vi.mock("server-only", () => ({}));

const vars = {
  course_title: "PMP exam prep",
  unit_title: "Identifying risks",
  minutes: 15,
  lessons_left: 6,
  days_left: 10,
  pace: "On track. 6 lessons left, 10 study days to your exam (4 spare).",
  goal: "Move into a project manager role",
  link: "https://example.com/lesson",
};

describe("reminder templates", () => {
  for (const type of ["planned_day", "missed_day"] as const) {
    it.each(BLOCKERS.map((b) => [b]))(`${type} / %s renders without leftover placeholders`, async (blocker) => {
      const { renderReminder } = await import("@/lib/reminders");
      const email = await renderReminder(type, blocker, vars);
      expect(email.subject.trim().length).toBeGreaterThan(0);
      expect(email.body.trim().length).toBeGreaterThan(0);
      expect(`${email.subject}\n${email.body}`).not.toMatch(/\{\w+\}/);
      expect(email.body).toContain(vars.link);
    });
  }
});
