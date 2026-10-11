import { bootstrapSession, deleteAllUserData, getErrorMessage } from "../../services/cloud-api";
import type { AppGlobalData } from "../../app";

interface HistoryData {
  loading: boolean;
  deleting: boolean;
  errorMessage: string;
  modeLabel: string;
  quotaLimit: number;
  quotaRemaining: number;
}

interface HistoryMethods {
  onShow(): Promise<void>;
  loadSession(): Promise<void>;
  confirmDeleteAll(): Promise<void>;
}

Page<HistoryData, HistoryMethods>({
  data: {
    loading: true,
    deleting: false,
    errorMessage: "",
    modeLabel: "实习 / 校招",
    quotaLimit: 3,
    quotaRemaining: 3,
  },

  async onShow() {
    await this.loadSession();
  },

  async loadSession() {
    this.setData({ loading: true, errorMessage: "" });
    try {
      const session = await bootstrapSession();
      if (!session.hasConsent) {
        wx.redirectTo({ url: "/pages/privacy/index" });
        return;
      }

      getApp<AppGlobalData>().globalData.session = session;
      this.setData({
        loading: false,
        modeLabel: session.mode === "student" ? "实习 / 校招" : "社会招聘",
        quotaLimit: session.quota.limit,
        quotaRemaining: session.quota.remaining,
      });
    } catch (error: unknown) {
      this.setData({ loading: false, errorMessage: getErrorMessage(error) });
    }
  },

  async confirmDeleteAll() {
    if (this.data.deleting) {
      return;
    }

    const first = await wx.showModal({
      title: "清空全部个人数据？",
      content: "当前阶段保存的求职模式、隐私同意和额度记录都将删除。",
      confirmText: "继续确认",
      cancelText: "取消",
      confirmColor: "#A43D32",
    });
    if (!first.confirm) {
      return;
    }

    const second = await wx.showModal({
      title: "删除后不可恢复",
      content: "请再次确认。完成后需要重新阅读并同意隐私说明。",
      confirmText: "确认清空",
      cancelText: "保留数据",
      confirmColor: "#A43D32",
    });
    if (!second.confirm) {
      return;
    }

    this.setData({ deleting: true, errorMessage: "" });
    try {
      await deleteAllUserData();
      wx.clearStorageSync();
      getApp<AppGlobalData>().globalData.session = null;
      wx.reLaunch({ url: "/pages/privacy/index" });
    } catch (error: unknown) {
      this.setData({ deleting: false, errorMessage: getErrorMessage(error) });
    }
  },
});
