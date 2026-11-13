export const CLASSES = [
  {
    id: "sunshine",
    name: "Sunshine Room",
    color: "orange",
    symbol: "sun",
  },
  {
    id: "guppy",
    name: "Guppy Room",
    color: "purple",
    symbol: "fish",
  },
  {
    id: "twos",
    name: "Twos Town",
    color: "green",
    symbol: "blocks",
  },
] as const;
export type ClassId = (typeof CLASSES)[number]["id"];
export function isClassId(value: string): value is ClassId {
  return CLASSES.some((c) => c.id === value);
}
export type ClassEmailMap = Record<ClassId, string>;
export function identifyClasses(
  text: string,
  emails: ClassEmailMap,
): ClassId[] {
  const addresses = new Set(
    text.toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+/g) ??
      [],
  );
  return CLASSES.filter(
    (c) =>
      addresses.has(emails[c.id].toLowerCase()) ||
      text
        .toLowerCase()
        .includes(`<${emails[c.id].toLowerCase().replace("@", ".")}>`),
  ).map((c) => c.id);
}
