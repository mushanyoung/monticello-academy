export const CLASSES = [
  {
    id: "sunshine",
    name: "Sunshine Room",
    email: "parents-sunshine@school.example.com",
    color: "orange",
    symbol: "sun",
  },
  {
    id: "guppy",
    name: "Guppy Room",
    email: "parents-guppy@school.example.com",
    color: "purple",
    symbol: "fish",
  },
  {
    id: "twos",
    name: "Twos Town",
    email: "parents-twos@school.example.com",
    color: "green",
    symbol: "blocks",
  },
] as const;
export type ClassId = (typeof CLASSES)[number]["id"];
export function isClassId(value: string): value is ClassId {
  return CLASSES.some((c) => c.id === value);
}
export function identifyClasses(text: string): ClassId[] {
  const addresses = new Set(
    text.toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+/g) ??
      [],
  );
  return CLASSES.filter(
    (c) =>
      addresses.has(c.email) ||
      text.toLowerCase().includes(`<${c.email.replace("@", ".")}>`),
  ).map((c) => c.id);
}
