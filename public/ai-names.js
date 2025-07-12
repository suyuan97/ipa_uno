// public/ai-names.js

const aiNameList = ["Bibi", "Sass", "Mimi"];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { aiNameList };
} else {
  window.aiNameList = aiNameList;
}
