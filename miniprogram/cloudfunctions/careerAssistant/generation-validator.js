const { AppError } = require("./errors");

const NUMBER_PATTERN = /(?:\d+(?:\.\d+)?%?|\$\d+(?:\.\d+)?[KMB]?)/gi;

const normalizeNumbers = (text) => (text.match(NUMBER_PATTERN) || []).map((value) => value.toLowerCase());

const validateGeneratedPackages = (modelResult, selectedMatches, facts, language) => {
  const packages = modelResult && Array.isArray(modelResult.packages) ? modelResult.packages : [];
  const selectedById = new Map(selectedMatches.map((match) => [match.directionId, match]));
  const factById = new Map(facts.map((fact) => [fact.id, fact.text]));
  const seen = new Set();
  const validated = [];

  for (const item of packages) {
    if (!item || seen.has(item.directionId) || !selectedById.has(item.directionId)) {
      continue;
    }
    if (!Array.isArray(item.sections) || !Array.isArray(item.greetings)) {
      continue;
    }
    const sections = [];
    for (const section of item.sections) {
      const factIds = Array.isArray(section.factIds) ? [...new Set(section.factIds)] : [];
      if (
        typeof section.section !== "string" ||
        typeof section.text !== "string" ||
        section.text.trim().length < 2 ||
        factIds.length === 0 ||
        factIds.some((factId) => !factById.has(factId)) ||
        section.language !== language
      ) {
        throw new AppError("MODEL_OUTPUT_INVALID", "生成内容未通过事实校验，本次未保存。");
      }
      const sourceNumbers = new Set(
        factIds.flatMap((factId) => normalizeNumbers(factById.get(factId))).map((value) => value.toLowerCase()),
      );
      if (normalizeNumbers(section.text).some((value) => !sourceNumbers.has(value))) {
        throw new AppError("MODEL_OUTPUT_INVALID", "生成内容包含未确认数字，本次未保存。");
      }
      sections.push({
        changeType: ["rewrite", "reorder", "translate"].includes(section.changeType)
          ? section.changeType
          : "rewrite",
        factIds,
        language,
        section: section.section.trim().slice(0, 48),
        text: section.text.trim().slice(0, 6000),
      });
    }
    if (sections.length < 2) {
      continue;
    }
    const greetings = item.greetings
      .filter((greeting) => typeof greeting === "string" && greeting.trim().length >= 8)
      .slice(0, 3)
      .map((greeting) => greeting.trim().slice(0, 500));
    if (greetings.length === 0) {
      continue;
    }
    const match = selectedById.get(item.directionId);
    validated.push({
      directionId: item.directionId,
      greetings,
      language,
      resumeTitle:
        typeof item.resumeTitle === "string" && item.resumeTitle.trim()
          ? item.resumeTitle.trim().slice(0, 100)
          : `${match.name}方向简历`,
      roleName: match.name,
      sections,
    });
    seen.add(item.directionId);
  }

  if (validated.length !== selectedMatches.length) {
    throw new AppError("MODEL_OUTPUT_INVALID", "生成方向不完整，本次未保存。");
  }
  return validated;
};

module.exports = { validateGeneratedPackages };
