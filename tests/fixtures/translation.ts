// Synthetic language fixtures for the local provider boundary only.
const chinese: Record<string, string> = {
  "A colorful week": "多彩的一周",
  Monday: "星期一",
  "Bring rain boots": "请带雨靴",
  "Classroom drawing": "班级画作",
  "External photo": "外部照片",
  "School website": "学校网站",
  "art.png": "画作.png",
  "A month of discoveries": "发现的一个月",
  "Our neighborhood": "我们的社区",
  "Explore familiar places through stories, art and counting.":
    "通过故事、美术和数数探索熟悉的地方。",
  "Recognize familiar places": "认识熟悉的地方",
  "Label all belongings": "为所有物品写上姓名",
  "Around the neighborhood": "社区周围",
  Language: "语言",
  "Letter Rr": "字母 Rr",
  "Exploring our neighborhood": "探索我们的社区",
  Art: "美术",
  "Draw a familiar place": "画一个熟悉的地方",
  "Wear a blue shirt": "穿蓝色上衣",
  "A favorite book": "一本喜欢的书",
  "Weekly table: wear red": "周表：穿红色衣服",
  "Calendar: wear blue. Weekly table: wear red. Both source entries are retained.":
    "月历：穿蓝色衣服。周表：穿红色衣服。两项原文记录均保留。",
};
export function fixtureTranslation(text: string) {
  return chinese[text] || `译文：${text}`;
}
