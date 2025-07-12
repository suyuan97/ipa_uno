// public/ai-names.js

const aiNameList = ["Wug", "Another wug", "A third wug"];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { aiNameList };
} else {
  window.aiNameList = aiNameList;
}
