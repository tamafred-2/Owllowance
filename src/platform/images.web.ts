// Goal photos are kept as files on the phone; the web version does not offer them yet.
export const canPickImages = false;

export async function pickGoalImage(): Promise<string | null> {
  return null;
}

export function removeGoalImage(_uri: string | null): void {}
