// Email reminder preview: templates/reminders.json (from the AI layer) wins over the dev fixture.
import "server-only";
import { readFirstExisting } from "./course";
import type { ReminderType } from "./rules";
import type { Blocker } from "./types";

export interface Email {
  subject: string;
  body: string;
}

export interface ReminderVars {
  course_title: string;
  unit_title: string;
  minutes: number;
  lessons_left: number;
  days_left: number;
  link: string;
}

type Variant = Email | string;
type Templates = Partial<Record<ReminderType, Partial<Record<Blocker, Variant>>>>;

let cached: Templates | null = null;

async function templates(): Promise<Templates> {
  if (cached) return cached;
  const { text } = await readFirstExisting(["templates/reminders.json", "templates/dev-reminders.json"]);
  cached = JSON.parse(text) as Templates;
  return cached;
}

/** Accepts {subject, body} or a single string whose first line is "Subject: ...". */
function toEmail(variant: Variant): Email {
  if (typeof variant !== "string") return { subject: String(variant.subject ?? ""), body: String(variant.body ?? "") };
  const [first, ...rest] = variant.split("\n");
  const m = /^subject:\s*(.*)$/i.exec(first.trim());
  return m ? { subject: m[1], body: rest.join("\n").replace(/^\n+/, "") } : { subject: "", body: variant };
}

export function fill(template: string, vars: ReminderVars): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name as keyof ReminderVars]) : whole,
  );
}

export async function renderReminder(type: ReminderType, blocker: Blocker, vars: ReminderVars): Promise<Email> {
  const byBlocker = (await templates())[type] ?? {};
  const variant = byBlocker[blocker] ?? byBlocker.other ?? Object.values(byBlocker)[0];
  if (!variant) throw new Error(`No reminder template for ${type}`);
  const email = toEmail(variant);
  return { subject: fill(email.subject, vars), body: fill(email.body, vars) };
}
