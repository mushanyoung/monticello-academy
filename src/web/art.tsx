type IconName =
  | "sun"
  | "mail"
  | "calendar"
  | "arrow"
  | "search"
  | "clip"
  | "download"
  | "check"
  | "chevron"
  | "book";
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    mail: "M3 5h18v14H3z M3 6l9 7 9-7",
    calendar: "M4 5h16v16H4z M4 10h16M8 3v4m8-4v4M8 14h2m4 0h2m-8 3h2",
    arrow: "M4 12h15m-6-6 6 6-6 6",
    search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    clip: "m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2",
    download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
    check: "m5 12 4 4L19 6",
    chevron: "m9 5 7 7-7 7",
    book: "M12 5v16M3 3c4 0 7 1 9 3 2-2 5-3 9-3v15c-4 0-7 1-9 3-2-2-5-3-9-3z",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function RoomDoodle({
  kind,
  size = 60,
}: {
  kind: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "sun" ? (
        <>
          <path
            fill="#f7ba76"
            d="M58 39c1 13-8 22-20 22S18 52 19 39s8-20 20-20 20 7 19 20Z"
          />
          <path d="m38 5 1 8m0 54-1 8M5 39l8 1m54-1 8-2M14 14l7 7m39 39 6 6M13 66l7-7m41-39 6-7M30 36v3m17-3v3m-16 7q8 8 16-1" />
        </>
      ) : kind === "fish" ? (
        <>
          <path
            fill="#c9b5e1"
            d="M13 41c9-19 32-24 46-3l13-11-1 28-13-11C42 65 23 59 13 41Z"
          />
          <path d="M26 38v2m14-13 4-9 8 13M20 47q5 0 7-4M8 20l2-2m2-8 2-1" />
          <circle cx="8" cy="28" r="3" />
        </>
      ) : (
        <>
          <path fill="#c4d1b2" d="m12 40 25-2 1 28-27 1z" />
          <path fill="#f2b98a" d="m40 40 26 1 1 26-28-1z" />
          <path fill="#d0bcdf" d="m26 12 26 1 1 26-28-1z" />
          <path d="m32 30 6-12 6 12m-10-5h8M18 48h8q8 4 0 7 9 5 0 7h-8zm33 1q-13 7 0 13" />
        </>
      )}
    </svg>
  );
}
