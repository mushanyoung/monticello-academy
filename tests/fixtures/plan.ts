import type { LessonPlan } from "../../src/shared/plans";
export function fixturePlan(
  sourceMessageId: string,
  date = "2040-11-13",
): LessonPlan {
  return {
    classId: "sunshine",
    month: date.slice(0, 7),
    title: "A month of little discoveries",
    theme: "Autumn & gratitude",
    overview: "Exploring nature through play.",
    objectives: ["Notice seasonal changes"],
    sourceMessageId,
    status: "published",
    days: [
      {
        date,
        title: "A little walk, a big discovery",
        activities: [
          {
            area: "Nature & science",
            description: "Collect leaves and compare their colors.",
          },
          { area: "Creative play", description: "Make a leaf rubbing." },
        ],
        reminders: ["Wear comfortable shoes."],
        bring: ["Rain boots"],
        note: "Outdoor activities depend on the weather.",
        noSchool: false,
      },
    ],
  };
}
