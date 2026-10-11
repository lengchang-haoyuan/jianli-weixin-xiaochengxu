const { COLLECTIONS } = require("./constants");

const getErrorMessage = (error) => {
  if (!error || typeof error !== "object") {
    return "";
  }
  return String(error.errMsg || error.message || "");
};

const isDocumentMissing = (error) => /not exist|not found|不存在/i.test(getErrorMessage(error));

class ResumeRepository {
  constructor(db) {
    this.db = db;
    this.users = db.collection(COLLECTIONS.users);
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

  async saveConfirmedResume(ownerId, input) {
    const timestamp = this.db.serverDate();
    await this.users.doc(ownerId).update({
      data: {
        confirmedResume: {
          text: input.text,
          sourceType: input.sourceType,
          confirmedAt: timestamp,
        },
        updatedAt: timestamp,
      },
    });
  }
}

module.exports = {
  ResumeRepository,
};

