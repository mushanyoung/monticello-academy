import type {
  LessonExtraction,
  LessonSource,
} from "../../src/shared/lesson-extraction";

export function fixtureExtraction(): LessonExtraction {
  return {
    isLessonPlan: true,
    classId: "sunshine",
    documentMonth: "2027-11",
    title: "A month of discoveries",
    theme: "Our neighborhood",
    overview: "Explore familiar places through stories, art and counting.",
    objectives: ["Recognize familiar places"],
    monthlyReminders: ["Label all belongings"],
    weeks: [
      {
        startDate: "2027-11-29",
        endDate: "2027-12-03",
        theme: "Around the neighborhood",
        focus: [{ area: "Language", items: ["Letter Rr"] }],
        pages: [1, 2],
      },
    ],
    days: ["2027-11-30", "2027-12-01"].map((date) => ({
      date,
      title: "Exploring our neighborhood",
      activities: [{ area: "Art", description: "Draw a familiar place" }],
      reminders: ["Wear a blue shirt"],
      bring: ["A favorite book"],
      note: "",
      noSchool: false,
      pages: [1, 2],
    })),
    pageCount: 2,
    issues: [],
  };
}
export const fixtureLessonSource: LessonSource = {
  attachmentId: "a".repeat(64),
  messageId: "b".repeat(64),
  filename: "November Lesson Plan Sunshine 2027.pdf",
};
