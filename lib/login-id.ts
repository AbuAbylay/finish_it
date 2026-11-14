// The shape of a learner ID, shared by the entry form and the server (no secrets, no server code).

const LOGIN_ID = /^[a-z0-9-]{8,40}$/;

/** Shown when what was typed cannot be an ID at all. */
export const LOGIN_ID_HINT = "An ID is 8 to 40 characters: letters, digits and dashes.";

export function normalizeLoginId(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "");
}

export function isValidLoginId(id: string): boolean {
  return LOGIN_ID.test(id);
}
