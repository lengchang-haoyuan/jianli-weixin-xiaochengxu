const test = require("node:test");
const assert = require("node:assert/strict");
const { PRIVACY_VERSION } = require("../../cloudfunctions/userCenter/constants");
const {
  toUsageDocumentId: toCareerUsageDocumentId,
} = require("../../cloudfunctions/careerAssistant/identity");
const {
  toUsageDocumentId: toUserUsageDocumentId,
} = require("../../cloudfunctions/userCenter/identity");
const { UserService } = require("../../cloudfunctions/userCenter/user-service");

class FakeRepository {
  constructor() {
    this.user = null;
    this.usage = null;
    this.usageDeletedFor = null;
    this.userDeletedFor = null;
    this.careerDataDeletedFor = null;
  }

  async ensureCollections() {
    throw new Error("业务请求链路不应尝试创建数据库集合");
  }

  async getUser() {
    return this.user;
  }

  async savePrivacyAcceptance(ownerId, input) {
    this.user = {
      ownerId,
      mode: input.mode,
      language: input.language,
      consentVersion: input.privacyVersion,
    };
  }

  async updateMode(_ownerId, mode) {
    this.user = { ...this.user, mode };
  }

  async getDailyUsage() {
    return this.usage;
  }

  async deleteAllDailyUsage(ownerId) {
    this.usageDeletedFor = ownerId;
    this.usage = null;
    return 1;
  }

  async deleteAllCareerData(ownerId) {
    this.careerDataDeletedFor = ownerId;
  }

  async deleteUser(ownerId) {
    this.userDeletedFor = ownerId;
    this.user = null;
  }
}

test("配额读写使用同一个每日文档编号", () => {
  const ownerId = "a".repeat(32);
  const date = "2026-09-20";

  assert.equal(toUserUsageDocumentId(ownerId, date), toCareerUsageDocumentId(ownerId, date));
});

test("未同意隐私时只返回匿名会话状态", async () => {
  const repository = new FakeRepository();
  const session = await new UserService(repository).bootstrapSession("owner-a");

  assert.equal(session.hasConsent, false);
  assert.equal(session.hasConfirmedResume, false);
  assert.equal(session.consentVersion, null);
  assert.equal(session.mode, "student");
  assert.equal(session.quota.remaining, 3);
  assert.equal(Object.hasOwn(session, "ownerId"), false);
});

test("明确同意后建立用户状态但不返回内部身份", async () => {
  const repository = new FakeRepository();
  const service = new UserService(repository);
  const session = await service.acceptPrivacy("owner-a", {
    accepted: true,
    mode: "student",
    privacyVersion: PRIVACY_VERSION,
  });

  assert.equal(session.hasConsent, true);
  assert.equal(repository.user.ownerId, "owner-a");
  assert.equal(Object.hasOwn(session, "ownerId"), false);
});

test("拒绝过期的隐私版本", async () => {
  const service = new UserService(new FakeRepository());

  await assert.rejects(
    service.acceptPrivacy("owner-a", {
      accepted: true,
      mode: "student",
      privacyVersion: "2026-01-01",
    }),
    (error) => error.code === "PRIVACY_VERSION_MISMATCH",
  );
});

test("未同意时不能修改求职模式", async () => {
  const service = new UserService(new FakeRepository());

  await assert.rejects(
    service.setUserMode("owner-a", { mode: "social" }),
    (error) => error.code === "CONSENT_REQUIRED",
  );
});

test("社会招聘模式仅在当前用户同意后保存", async () => {
  const repository = new FakeRepository();
  repository.user = {
    ownerId: "owner-a",
    mode: "student",
    language: "zh-CN",
    consentVersion: PRIVACY_VERSION,
  };
  const session = await new UserService(repository).setUserMode("owner-a", { mode: "social" });

  assert.equal(session.mode, "social");
});

test("每日额度同时扣除已使用和已预留次数", async () => {
  const repository = new FakeRepository();
  repository.usage = { usedCount: 1, reservedCount: 2 };
  const session = await new UserService(repository).bootstrapSession("owner-a");

  assert.equal(session.quota.limit, 3);
  assert.equal(session.quota.remaining, 0);
});

test("过期的生成预留不占用当日额度", async () => {
  const repository = new FakeRepository();
  repository.usage = {
    usedCount: 1,
    reservedCount: 2,
    reservations: {
      expired: Date.now() - 1000,
      active: Date.now() + 60000,
    },
  };
  const session = await new UserService(repository).bootstrapSession("owner-a");

  assert.equal(session.quota.reservedCount, 1);
  assert.equal(session.quota.remaining, 1);
});

test("删除必须携带固定确认值", async () => {
  const repository = new FakeRepository();
  const service = new UserService(repository);

  await assert.rejects(
    service.deleteAllUserData("owner-a", { confirmation: "wrong" }),
    (error) => error.code === "DELETE_CONFIRMATION_REQUIRED",
  );
  assert.equal(repository.userDeletedFor, null);
});

test("删除只使用服务端确定的当前所有者", async () => {
  const repository = new FakeRepository();
  const service = new UserService(repository);
  const result = await service.deleteAllUserData("owner-a", {
    confirmation: "DELETE_ALL_MY_DATA",
  });

  assert.deepEqual(result, { deleted: true });
  assert.equal(repository.usageDeletedFor, "owner-a");
  assert.equal(repository.careerDataDeletedFor, "owner-a");
  assert.equal(repository.userDeletedFor, "owner-a");
});
