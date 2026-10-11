const questionnaire = require("./questionnaire.v1.json");
const { AppError } = require("./errors");

const QUESTION_IDS = Object.freeze(questionnaire.questions.map((question) => question.id));

const calculateQuestionnaireScores = (answers, skipped) => {
  if (skipped) {
    return {};
  }

  const questionById = new Map(questionnaire.questions.map((question) => [question.id, question]));
  const scores = {};

  for (const dimension of questionnaire.dimensions) {
    let total = 0;
    let maximum = 0;
    for (const questionId of dimension.questionIds) {
      const question = questionById.get(questionId);
      if (!question) {
        throw new AppError("QUESTIONNAIRE_CONFIG_INVALID", "问卷配置暂时不可用，请稍后重试。");
      }
      total += questionnaire.scoring[question.polarity][answers[questionId]];
      maximum += 2;
    }
    scores[dimension.id] = Math.round((total / maximum) * 100);
  }
  return scores;
};

module.exports = { QUESTION_IDS, calculateQuestionnaireScores };
