import * as z from "zod";

export const CollabUser = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  colorLight: z.string(),
});

export type CollabUser = z.infer<typeof CollabUser>;

export const USER_COLORS = [
  "#c8df4c",
  "#4cc9df",
  "#df4c9b",
  "#df9a4c",
  "#8f7cf0",
  "#4cdf8a",
  "#f06c6c",
  "#4c7cdf",
  "#dfd34c",
  "#b46cf0",
  "#6cf0d9",
  "#f0a3c8",
] as const;

function withColor(user: CollabUser, color: string): CollabUser {
  return { ...user, color, colorLight: `${color}33` };
}

/** Presence identity of an account; the color is stable per user. */
export function identityFor(account: { id: string; name: string }): CollabUser {
  let hash = 0;
  for (const ch of account.id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const color = USER_COLORS[Math.abs(hash) % USER_COLORS.length]!;
  return withColor({ id: account.id, name: account.name, color: "", colorLight: "" }, color);
}

/**
 * Makes our color unique against other users who joined earlier.
 * Everyone applies the same rule, so only the later joiner changes.
 */
export function resolveColorClash(
  me: CollabUser,
  earlier: CollabUser[],
  everyone: CollabUser[],
): CollabUser {
  const clash = earlier.some((u) => u.color === me.color && u.id !== me.id);
  if (!clash) return me;
  const taken = new Set(everyone.filter((u) => u.id !== me.id).map((u) => u.color));
  const free = USER_COLORS.filter((c) => !taken.has(c));
  return withColor(me, free[0] ?? me.color);
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2);
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
