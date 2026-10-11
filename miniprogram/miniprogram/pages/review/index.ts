import { MAX_RESUME_TEXT_CHARACTERS } from "../../config/app-config";
import { getErrorMessage, saveConfirmedResume } from "../../services/cloud-api";
import type { AppGlobalData } from "../../app";
import type { ResumeSourceType } from "../../types/domain";

interface ReviewData {
  accepted: boolean;
  characterCount: number;
  errorMessage: string;
  fileName: string;
  hasDraft: boolean;
  maxCharacters: number;
  saving: boolean;
  sourceLabel: string;
  sourceType: ResumeSourceType | "";
  text: string;
}

interface ReviewMethods {
  onLoad(): void;
  onTextInput(event: InputEvent): void;
  onConfirmationChange(event: CheckboxGroupChangeEvent): void;
  goBack(): void;
  saveResumeFacts(): Promise<void>;
}

Page<ReviewData, ReviewMethods>({
  data: {
    accepted: false,
    characterCount: 0,
    errorMessage: "",
    fileName: "",
    hasDraft: false,
    maxCharacters: MAX_RESUME_TEXT_CHARACTERS,
    saving: false,
    sourceLabel: "",
    sourceType: "",
    text: "",
  },

  onLoad() {
    const draft = getApp<AppGlobalData>().globalData.resumeDraft;
    if (!draft) {
      this.setData({
        errorMessage: "没有可核对的提取结果，请返回并重新上传简历。",
        hasDraft: false,
      });
      return;
    }

    this.setData({
      characterCount: draft.text.length,
      fileName: draft.fileName,
      hasDraft: true,
      sourceLabel: draft.sourceType.toUpperCase(),
      sourceType: draft.sourceType,
      text: draft.text,
    });
  },

  onTextInput(event) {
    this.setData({
      accepted: false,
      characterCount: event.detail.value.length,
      errorMessage: "",
      text: event.detail.value,
    });
  },

  onConfirmationChange(event) {
    this.setData({ accepted: event.detail.value.includes("confirmed") });
  },

  goBack() {
    if (!this.data.saving) {
      wx.navigateBack();
    }
  },

  async saveResumeFacts() {
    const sourceType = this.data.sourceType;
    if (!this.data.hasDraft || !sourceType || !this.data.accepted || this.data.saving) {
      return;
    }

    this.setData({ saving: true, errorMessage: "" });
    try {
      await saveConfirmedResume(this.data.text, sourceType);
      const app = getApp<AppGlobalData>();
      app.globalData.resumeDraft = null;
      app.globalData.resumeSaveNoticePending = true;
      wx.reLaunch({ url: "/pages/index/index" });
    } catch (error: unknown) {
      this.setData({
        saving: false,
        errorMessage: getErrorMessage(error),
      });
    }
  },
});
