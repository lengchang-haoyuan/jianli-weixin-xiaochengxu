const COLLECTIONS = Object.freeze({
  dailyUsage: "daily_usage",
  generationTasks: "generation_tasks",
  matchResults: "match_results",
  questionnaireResults: "questionnaire_results",
  resumeVersions: "resume_versions",
  roleIntents: "role_intents",
  users: "users",
});

const RESUME_TEMPLATES = Object.freeze({
  "campus-growth": Object.freeze({ name: "校招成长", version: "1.0.0" }),
  "minimal-general": Object.freeze({ name: "极简通用", version: "1.0.0" }),
  "social-experience": Object.freeze({ name: "社招经历", version: "1.0.0" }),
  "technical-project": Object.freeze({ name: "技术项目", version: "1.0.0" }),
});

module.exports = Object.freeze({
  ANALYSIS_MODEL_RETRIES: 0,
  ANALYSIS_MODEL_TIMEOUT_MS: 48000,
  COLLECTIONS,
  DAILY_LIMIT: 3,
  GENERATION_MODEL_RETRIES: 0,
  GENERATION_MODEL_TIMEOUT_MS: 50000,
  MAX_GENERATION_DIRECTIONS: 3,
  MAX_INTENT_CHARACTERS: 60,
  MAX_QUESTION_COUNT: 12,
  MAX_RESUME_GREETING_CHARACTERS: 500,
  MAX_RESUME_GREETINGS: 3,
  MAX_RESUME_SECTION_CHARACTERS: 6000,
  MAX_RESUME_SECTIONS: 20,
  MAX_RESUME_TITLE_CHARACTERS: 100,
  MAX_RENDERED_DOCX_BYTES: 1_500_000,
  MAX_RENDERED_PDF_BYTES: 2_500_000,
  MAX_RENDERED_PREVIEW_BYTES: 400_000,
  MAX_RENDERED_PREVIEW_PAGES: 3,
  PRIVACY_VERSION: "2026-09-15",
  QUESTIONNAIRE_VERSION: "2026-09-14",
  RESERVATION_TTL_MS: 10 * 60 * 1000,
  RESUME_TEMPLATES,
  STANDARD_VERSION: "career-standard-2026-09-14",
});
