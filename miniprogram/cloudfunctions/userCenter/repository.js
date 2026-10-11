const { COLLECTIONS } = require("./constants");
const { AppError } = require("./errors");
const { toUsageDocumentId } = require("./identity");

const getErrorMessage = (error) => {
  if (!error || typeof error !== "object") {
    return "";
  }

  return String(error.errMsg || error.message || "");
};

const isDocumentMissing = (error) => /not exist|not found|不存在/i.test(getErrorMessage(error));

class UserRepository {
  constructor(db) {
    this.db = db;
    this.users = db.collection(COLLECTIONS.users);
    this.dailyUsage = db.collection(COLLECTIONS.dailyUsage);
  }

  async getUser(ownerId) {
    try {
      const result = await this.users.doc(ownerId).get();
      return result.data || null;
    } catch (error) {
      if (isDocumentMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  async savePrivacyAcceptance(ownerId, input) {
    const existing = await this.getUser(ownerId);
    const timestamp = this.db.serverDate();

    if (!existing) {
      await this.users.doc(ownerId).set({
        data: {
          ownerId,
          mode: input.mode,
          language: input.language,
          consentVersion: input.privacyVersion,
          consentAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
      return;
    }

    await this.users.doc(ownerId).update({
      data: {
        mode: input.mode,
        consentVersion: input.privacyVersion,
        consentAt: timestamp,
        updatedAt: timestamp,
      },
    });
  }

  async updateMode(ownerId, mode) {
    await this.users.doc(ownerId).update({
      data: {
        mode,
        updatedAt: this.db.serverDate(),
      },
    });
  }

  async getDailyUsage(ownerId, date) {
    const documentId = toUsageDocumentId(ownerId, date);
    try {
      const result = await this.dailyUsage.doc(documentId).get();
      return result.data || null;
    } catch (error) {
      if (isDocumentMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteAllDailyUsage(ownerId) {
    let deletedCount = 0;
    for (let batchIndex = 0; batchIndex < 50; batchIndex += 1) {
      const result = await this.dailyUsage.where({ ownerId }).limit(100).get();
      const documents = Array.isArray(result.data) ? result.data : [];
      if (documents.length === 0) {
        return deletedCount;
      }

      await Promise.all(documents.map((document) => this.dailyUsage.doc(document._id).remove()));
      deletedCount += documents.length;
    }

    throw new AppError("DELETE_LIMIT_REACHED", "个人数据较多，本次未能全部删除，请稍后重试。");
  }

  async deleteOwnedDocuments(collectionName, ownerId) {
    const collection = this.db.collection(collectionName);
    let deletedCount = 0;
    for (let batchIndex = 0; batchIndex < 50; batchIndex += 1) {
      const result = await collection.where({ ownerId }).limit(100).get();
      const documents = Array.isArray(result.data) ? result.data : [];
      if (documents.length === 0) {
        return deletedCount;
      }
      await Promise.all(documents.map((document) => collection.doc(document._id).remove()));
      deletedCount += documents.length;
    }
    throw new AppError("DELETE_LIMIT_REACHED", "个人数据较多，本次未能全部删除，请稍后重试。");
  }

  async deleteAllCareerData(ownerId) {
    const collections = [
      COLLECTIONS.generationTasks,
      COLLECTIONS.matchResults,
      COLLECTIONS.questionnaireResults,
      COLLECTIONS.resumeVersions,
      COLLECTIONS.roleIntents,
    ];
    for (const collectionName of collections) {
      await this.deleteOwnedDocuments(collectionName, ownerId);
    }
  }

  async deleteUser(ownerId) {
    try {
      await this.users.doc(ownerId).remove();
    } catch (error) {
      if (!isDocumentMissing(error)) {
        throw error;
      }
    }
  }
}

module.exports = {
  UserRepository,
};
