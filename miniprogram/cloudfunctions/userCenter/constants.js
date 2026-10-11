const COLLECTIONS = Object.freeze({
  generationTasks: "generation_tasks",
  users: "users",
  dailyUsage: "daily_usage",
  matchResults: "match_results",
  questionnaireResults: "questionnaire_results",
  resumeVersions: "resume_versions",
  roleIntents: "role_intents",
});

module.exports = Object.freeze({
  COLLECTIONS,
  DAILY_LIMIT: 3,
  DEFAULT_LANGUAGE: "zh-CN",
  DEFAULT_MODE: "student",
  PRIVACY_VERSION: "2026-09-15",
  DELETE_CONFIRMATION: "DELETE_ALL_MY_DATA",
});
