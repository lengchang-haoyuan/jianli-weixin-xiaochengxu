import { bootstrapSession, getErrorMessage, updateUserMode } from "../../services/cloud-api";
import type { AppGlobalData } from "../../app";
import type { UserMode } from "../../types/domain";

interface HomeData {
  hasConfirmedResume: boolean;
  loading: boolean;
  savingMode: boolean;
  errorMessage: string;
  showResumeSaveNotice: boolean;
  mode: UserMode;
  modeDescription: string;
  quotaLimit: number;
  quotaRemaining: number;
}

interface ModeDataset extends Record<string, unknown> {
  mode?: unknown;
}

interface HomeMethods {
  onShow(): Promise<void>;
  loadSession(): Promise<void>;
  retrySession(): Promise<void>;
  selectMode(event: TapEvent<ModeDataset>): Promise<void>;
  goUpload(): void;
  goPrimary(): void;
  goHistory(): void;
}

const getModeDescription = (mode: UserMode): string =>
  mode === "student"
    ? "突出课程、项目、竞赛与实习，不限制毕业年限。"
    : "突出工作成果与可迁移能力，避免使用应届生身份措辞。";

const isUserMode = (value: unknown): value is UserMode => value === "student" || value === "social";

Page<HomeData, HomeMethods>({
  data: {
    hasConfirmedResume: false,
    loading: true,
    savingMode: false,
    errorMessage: "",
    showResumeSaveNotice: false,
    mode: "student",
    modeDescription: getModeDescription("student"),
    quotaLimit: 3,
    quotaRemaining: 3,
  },

  async onShow() {
    const app = getApp<AppGlobalData>();
    if (app.globalData.resumeSaveNoticePending) {
      app.globalData.resumeSaveNoticePending = false;
      this.setData({ showResumeSaveNotice: true });
    }

    await this.loadSession();
  },

  async loadSession() {
    if (this.data.savingMode) {
      return;
    }

    this.setData({ loading: true, errorMessage: "" });
    try {
      const session = await bootstrapSession();
      if (!session.hasConsent) {
        wx.redirectTo({ url: "/pages/privacy/index" });
        return;
      }

      getApp<AppGlobalData>().globalData.session = session;
      this.setData({
        hasConfirmedResume: session.hasConfirmedResume,
        loading: false,
        mode: session.mode,
        modeDescription: getModeDescription(session.mode),
        quotaLimit: session.quota.limit,
        quotaRemaining: session.quota.remaining,
      });
    } catch (error: unknown) {
      this.setData({
        loading: false,
        errorMessage: getErrorMessage(error),
      });
    }
  },

  async retrySession() {
    await this.loadSession();
  },

  async selectMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (!isUserMode(mode) || mode === this.data.mode || this.data.savingMode) {
      return;
    }

    this.setData({ savingMode: true, errorMessage: "" });
    try {
      const session = await updateUserMode(mode);
      getApp<AppGlobalData>().globalData.session = session;
      this.setData({
        savingMode: false,
        mode: session.mode,
        modeDescription: getModeDescription(session.mode),
      });
    } catch (error: unknown) {
      this.setData({
        savingMode: false,
        errorMessage: getErrorMessage(error),
      });
    }
  },

  goUpload() {
    wx.navigateTo({ url: `/pages/upload/index?mode=${this.data.mode}` });
  },

  goPrimary() {
    if (this.data.hasConfirmedResume) {
      wx.navigateTo({ url: "/pages/preferences/index" });
      return;
    }
    this.goUpload();
  },

  goHistory() {
    wx.navigateTo({ url: "/pages/history/index" });
  },
});
