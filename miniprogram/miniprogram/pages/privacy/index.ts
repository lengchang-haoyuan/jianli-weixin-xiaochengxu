import { PRIVACY_VERSION } from "../../config/app-config";
import { acceptPrivacy, getErrorMessage } from "../../services/cloud-api";
import type { AppGlobalData } from "../../app";

interface PrivacyData {
  accepted: boolean;
  submitting: boolean;
  errorMessage: string;
}

interface PrivacyMethods {
  onConsentChange(event: CheckboxGroupChangeEvent): void;
  submitConsent(): Promise<void>;
  leaveMiniProgram(): Promise<void>;
}

Page<PrivacyData, PrivacyMethods>({
  data: {
    accepted: false,
    submitting: false,
    errorMessage: "",
  },

  onConsentChange(event) {
    this.setData({ accepted: event.detail.value.includes("accepted") });
  },

  async submitConsent() {
    if (!this.data.accepted || this.data.submitting) {
      return;
    }

    this.setData({ submitting: true, errorMessage: "" });
    try {
      const session = await acceptPrivacy("student", PRIVACY_VERSION);
      getApp<AppGlobalData>().globalData.session = session;
      wx.reLaunch({ url: "/pages/index/index" });
    } catch (error: unknown) {
      this.setData({
        submitting: false,
        errorMessage: getErrorMessage(error),
      });
    }
  },

  async leaveMiniProgram() {
    const result = await wx.showModal({
      title: "暂不使用？",
      content: "不同意时不会创建个人记录，你可以之后重新进入。",
      confirmText: "退出",
      cancelText: "继续查看",
    });

    if (result.confirm) {
      wx.exitMiniProgram();
    }
  },
});
