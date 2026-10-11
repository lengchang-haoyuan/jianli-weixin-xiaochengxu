const careerStandard = require("./career-standard.v1.json");
const scoringWeights = require("./scoring-weights.v1.json");
const { STANDARD_VERSION } = require("./constants");
const { AppError } = require("./errors");

const SCORE_KEYS = Object.freeze([
  "technology_projects",
  "internship_work",
  "major_courses",
  "competition_certificates",
  "education_school",
]);

const directions = careerStandard.categories.flatMap((category) =>
  category.directions.map((direction) => ({
    ...direction,
    categoryName: category.name,
    roleId: category.roleId,
  })),
);
const directionById = new Map(directions.map((direction) => [direction.directionId, direction]));

if (careerStandard.meta.standardVersion !== STANDARD_VERSION || directions.length !== 66) {
  throw new AppError("CAREER_STANDARD_INVALID", "岗位标准版本暂时不可用，请稍后重试。");
}

const clampScore = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

const toCompactStandard = () =>
  directions.map((direction) => ({
    aliases: direction.aliases,
    category: direction.categoryName,
    coreSkills: direction.coreSkills.map((skill) => skill.name),
    description: direction.description,
    directionId: direction.directionId,
    name: direction.name,
    supportingSkills: direction.supportingSkills.map((skill) => skill.name),
  }));

const getQuestionnaireScore = (direction, questionnaireScores) => {
  const values = direction.workStyleSignals
    .map((dimensionId) => questionnaireScores[dimensionId])
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const getScoreBand = (score) => {
  const band = scoringWeights.scoreBands.find((candidate) => {
    const aboveMinimum = score >= candidate.minInclusive;
    const belowMaximum = Object.hasOwn(candidate, "maxInclusive")
      ? score <= candidate.maxInclusive
      : score < candidate.maxExclusive;
    return aboveMinimum && belowMaximum;
  });
  return band || scoringWeights.scoreBands.at(-1);
};

const scoreMapping = (mapping, mode, questionnaireScores) => {
  const direction = directionById.get(mapping.directionId);
  if (!direction) {
    return null;
  }
  const profile = mode === "social" ? "social_recruitment" : "internship_campus";
  const configuredWeights = scoringWeights.profiles[profile].weights;
  const questionnaireScore = getQuestionnaireScore(direction, questionnaireScores);
  const activeKeys = questionnaireScore === null ? SCORE_KEYS : [...SCORE_KEYS, "questionnaire"];
  const weightTotal = activeKeys.reduce((sum, key) => sum + configuredWeights[key], 0);
  const categoryScores = {};
  for (const key of SCORE_KEYS) {
    const hasEvidence = Array.isArray(mapping.evidence)
      && mapping.evidence.some((item) => item.category === key && item.quote);
    categoryScores[key] = hasEvidence
      ? clampScore(mapping.categoryScores && mapping.categoryScores[key])
      : 0;
  }
  if (questionnaireScore !== null) {
    categoryScores.questionnaire = clampScore(questionnaireScore);
  }

  const score = Math.round(
    activeKeys.reduce((sum, key) => sum + categoryScores[key] * configuredWeights[key], 0) /
      weightTotal,
  );
  const band = getScoreBand(score);
  const evidence = Array.isArray(mapping.evidence)
    ? mapping.evidence.slice(0, 6).map((item) => ({
        category: SCORE_KEYS.includes(item.category) ? item.category : "technology_projects",
        criterion: typeof item.criterion === "string" ? item.criterion.slice(0, 80) : "已确认事实",
        quote: typeof item.quote === "string" ? item.quote.slice(0, 240) : "",
      }))
    : [];

  return {
    band: band.label,
    categoryName: direction.categoryName,
    coreSkills: direction.coreSkills.slice(0, 4).map((skill) => skill.name),
    description: direction.description,
    directionId: direction.directionId,
    evidence,
    gaps: Array.isArray(mapping.gaps)
      ? mapping.gaps.filter((gap) => typeof gap === "string").slice(0, 3).map((gap) => gap.slice(0, 120))
      : [],
    name: direction.name,
    roleId: direction.roleId,
    score,
  };
};

const scoreRoleMappings = (modelResult, mode, questionnaireScores, sanitizedText) => {
  const mappings = Array.isArray(modelResult && modelResult.mappings) ? modelResult.mappings : [];
  const seen = new Set();
  const scored = [];

  for (const mapping of mappings) {
    if (!mapping || seen.has(mapping.directionId)) {
      continue;
    }
    const validEvidence = Array.isArray(mapping.evidence)
      ? mapping.evidence.filter(
          (item) => item && typeof item.quote === "string" && sanitizedText.includes(item.quote.trim()),
        )
      : [];
    const result = scoreMapping({ ...mapping, evidence: validEvidence }, mode, questionnaireScores);
    if (result) {
      seen.add(result.directionId);
      scored.push(result);
    }
  }

  scored.sort((left, right) => right.score - left.score || left.directionId.localeCompare(right.directionId));
  if (scored.length < 3) {
    throw new AppError("MODEL_OUTPUT_INVALID", "岗位分析结果未通过校验，本次未保存。");
  }
  return scored.slice(0, 3);
};

module.exports = { scoreRoleMappings, toCompactStandard };
