export type CollabUser = { name: string; color: string; colorLight: string };

/** Local identity: `custom` = name typed by the user (kept), otherwise a generated one. */
export type LocalIdentity = CollabUser & { custom: boolean };

const NAME_KEY = "collab-name"; // localStorage: only an explicitly chosen name
const SESSION_KEY = "collab-identity"; // sessionStorage: generated identity, per tab

// distinct hues, readable on both light and dark backgrounds
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

export const ANIMALS = [
  "Fox",
  "Owl",
  "Lynx",
  "Otter",
  "Heron",
  "Badger",
  "Wolf",
  "Moose",
  "Hare",
  "Crane",
  "Bison",
  "Raven",
  "Seal",
  "Gecko",
  "Panda",
  "Koala",
] as const;

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function pickFree<T>(list: readonly T[], taken: Set<T>): T {
  const free = list.filter((x) => !taken.has(x));
  return pick(free.length > 0 ? free : list);
}

export function withColor<T extends CollabUser>(user: T, color: string): T {
  return { ...user, color, colorLight: `${color}33` };
}

export const animalName = (animal: string) => `Anonymous ${animal}`;

function read<T>(storage: () => Storage, key: string): T | null {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: unknown) {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable; identity lasts for this page only
  }
}

export function getLocalIdentity(): LocalIdentity {
  const customName = read<string>(() => localStorage, NAME_KEY);
  const session =
    read<LocalIdentity>(() => sessionStorage, SESSION_KEY) ??
    withColor(
      { name: animalName(pick(ANIMALS)), color: "", colorLight: "", custom: false },
      pick(USER_COLORS),
    );
  const identity = customName ? { ...session, name: customName, custom: true } : session;
  write(() => sessionStorage, SESSION_KEY, identity);
  return identity;
}

export function saveLocalIdentity(identity: LocalIdentity) {
  write(() => sessionStorage, SESSION_KEY, identity);
  if (identity.custom) write(() => localStorage, NAME_KEY, identity.name);
}

/**
 * Makes our color (and generated name) unique against collaborators who joined earlier.
 * Everyone applies the same rule, so only the later joiner changes.
 */
export function resolveClashes(
  me: LocalIdentity,
  earlier: CollabUser[],
  everyone: CollabUser[],
): LocalIdentity {
  let next = me;
  if (earlier.some((u) => u.color === me.color)) {
    next = withColor(next, pickFree(USER_COLORS, new Set(everyone.map((u) => u.color))));
  }
  if (!me.custom && earlier.some((u) => u.name === me.name)) {
    const takenNames = new Set(everyone.map((u) => u.name));
    const free = ANIMALS.filter((a) => !takenNames.has(animalName(a)));
    next = { ...next, name: animalName(free.length > 0 ? pick(free) : pick(ANIMALS)) };
  }
  return next;
}

export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w && w !== "Anonymous");
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2);
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
