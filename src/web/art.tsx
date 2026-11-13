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
export function Garden() {
  return (
    <svg
      className="garden"
      viewBox="0 0 340 230"
      fill="none"
      stroke="#493257"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 209q138 7 298-2" />
      <path d="m239 196 8-56q-10-27 3-29 13 0 8 26l-5 58" fill="#e1e8d4" />
      <path
        d="M248 164q-41-35-44-13 2 20 42 25m9-31q35-38 42-16 2 22-43 34"
        fill="#b7c99e"
      />
      <path d="M213 189q27-8 63-1l-8 23-47-1z" fill="#d9c5e6" />
      <path
        d="M87 181c-14-23-16-51-4-74m13 65c8-12 25-20 34-16-5 17-21 20-34 16M80 150c-17-3-24-18-20-28 17 2 25 12 20 28"
        fill="#d7dfc5"
      />
      <path d="M66 174h43l-6 35H73z" fill="#f1a46a" />
      <path
        d="M76 86c-35-11-18-37 3-20-11-30 23-36 24-7 22-20 41 4 15 18 32 2 24 33-3 22 12 27-20 38-26 10-23 17-39-9-13-23Z"
        fill="#d6bee7"
      />
      <circle cx="96" cy="84" r="15" fill="#f4bc70" />
      <path d="M90 82v1m11-1v1m-11 8q6 5 11-1" />
      <path d="M160 133q1-59 52-65" />
      <path d="M169 135q-1-51 46-58" stroke="#ed9a60" strokeWidth="8" />
      <path d="M183 134q-1-36 35-45" stroke="#b59ccb" strokeWidth="8" />
      <g transform="translate(245,35)">
        <circle r="20" fill="#f7bd70" />
        <path d="M-30-2h-7m65 0h7M0-29v-7M-25-23l-5-6m53 6 6-5M-9-2v2M8-3v2m-17 8q8 7 16-1" />
      </g>
      <path d="m151 28 2-9 4 8 9 1-7 5 1 8-7-5-7 3 3-8-6-5z" fill="#f1b272" />
      <path d="m28 70 7 4m-1-14 3 4M308 166l7 2m-6 7 6 1" />
      <path
        d="M148 209q-13-11-5-15 9-2 11 15m0 0q2-18 10-14 8 5-10 14"
        fill="#d8c4e6"
      />
    </svg>
  );
}
