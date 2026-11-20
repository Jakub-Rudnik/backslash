const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function formatDate(iso: string | null) {
  return iso ? dateFormat.format(new Date(iso)) : "–";
}
