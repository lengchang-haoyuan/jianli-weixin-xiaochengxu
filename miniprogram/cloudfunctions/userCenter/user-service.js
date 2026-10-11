const {
  DAILY_LIMIT,
  DEFAULT_LANGUAGE,
  DEFAULT_MODE,
  PRIVACY_VERSION,
} = require("./constants");
const { AppError } = require("./errors");
const { getShanghaiDate } = require("./identity");
const {
  assertMode,
  validateDeletion,
  validatePrivacyAcceptance,
} = require("./validators");

const toBoundedCount = (value) => {
  if (!Number.isInteger(value) || value < 0) {
    return 0;
  }
  return Math.min(value, DAILY_LIMIT);
};

const countActiveReservations = (usage, nowMs = Date.now()) => {
  const reservations = usage && usage.reservations;
  if (!reservations || typeof reservations !== "object" || Array.isArray(reservations)) {
    return toBoundedCount(usage && usage.reservedCount);
  }
  return Math.min(
    Object.values(reservations).filter((expiresAtMs) => Number(expiresAtMs) > nowMs).length,
    DAILY_LIMIT,
  );
};

class UserService {
  constructor(repository) {
    this.repository = repository;
  }

  async bootstrapSession(ownerId) {
    return this.buildSession(ownerId);
  }

  async acceptPrivacy(ownerId, payload) {
    const input = validatePrivacyAcceptance(payload);
    await this.repository.savePrivacyAcceptance(ownerId, {
      ...input,
      language: DEFAULT_LANGUAGE,
    });
    return this.buildSession(ownerId);
  }

  async setUserMode(ownerId, payload) {
    const user = await this.requireCurrentConsent(ownerId);
    const mode = assertMode(payload.mode);
    if (user.mode !== mode) {
      await this.repository.updateMode(ownerId, mode);
    }
    return this.buildSession(ownerId);
  }

  async deleteAllUserData(ownerId, payload) {
    validateDeletion(payload);
    await this.repository.deleteAllCareerData(ownerId);
    await this.repository.deleteAllDailyUsage(ownerId);
    await this.repository.deleteUser(ownerId);
    return { deleted: true };
  }

  async requireCurrentConsent(ownerId) {
    const user = await this.repository.getUser(ownerId);
    if (!user || user.consentVersion !== PRIVACY_VERSION) {
      throw new AppError("CONSENT_REQUIRED", "请先阅读并同意当前隐私说明。");
    }
    return user;
  }

  async buildSession(ownerId) {
    const date = getShanghaiDate();
    const [user, usage] = await Promise.all([
      this.repository.getUser(ownerId),
      this.repository.getDailyUsage(ownerId, date),
    ]);
    const usedCount = toBoundedCount(usage && usage.usedCount);
    const reservedCount = countActiveReservations(usage);

    return {
      hasConsent: Boolean(user && user.consentVersion === PRIVACY_VERSION),
      hasConfirmedResume: Boolean(
        user && user.confirmedResume && typeof user.confirmedResume.text === "string",
      ),
      consentVersion: user && typeof user.consentVersion === "string" ? user.consentVersion : null,
      mode: user && (user.mode === "student" || user.mode === "social") ? user.mode : DEFAULT_MODE,
      language:
        user && ["zh-CN", "en", "bilingual"].includes(user.language)
          ? user.language
          : DEFAULT_LANGUAGE,
      quota: {
        date,
        limit: DAILY_LIMIT,
        usedCount,
        reservedCount,
        remaining: Math.max(0, DAILY_LIMIT - usedCount - reservedCount),
      },
    };
  }
}

module.exports = {
  UserService,
};
