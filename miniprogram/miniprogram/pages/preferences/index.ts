import { bootstrapSession, getErrorMessage, saveCareerPreferences } from "../../services/cloud-api";
import type { AppGlobalData } from "../../app";
import type { ResumeLanguage } from "../../types/domain";

interface PreferencesData {
  errorMessage: string;
  language: ResumeLanguage;
  modeLabel: string;
  rawIntent: string;
  saving: boolean;
}

interface PreferencesMethods {
  onLoad(): Promise<void>;
  onIntentInput(event: InputEvent): void;
  selectLanguage(event: TapEvent<{ language: unknown }>): void;
  submitPreferences(): Promise<void>;
}

const isLanguage = (value: unknown): value is ResumeLanguage =>
  value === "zh-CN" || value === "en" || value === "bilingual";

Page<PreferencesData, PreferencesMethods>({
  data: {
    errorMessage: "",
    language: "zh-CN",
    modeLabel: "实习 / 校招",
    rawIntent: "",
    saving: false,
  },

  async onLoad() {
    try {
      const session = await bootstrapSession();
      if (!session.hasConsent || !session.hasConfirmedResume) {
        wx.reLaunch({ url: "/pages/index/index" });
        return;
      }
      const cached = getApp<AppGlobalData>().globalData.careerPreferences;
      this.setData({
        language: cached?.language ?? session.language,
        modeLabel: session.mode === "social" ? "社会招聘" : "实习 / 校招",
        rawIntent: cached?.rawIntent ?? "",
      });
    } catch (error: unknown) {
      this.setData({ errorMessage: getErrorMessage(error) });
    }
  },

  onIntentInput(event) {
    this.setData({ errorMessage: "", rawIntent: event.detail.value.slice(0, 60) });
  },

  selectLanguage(event) {
    const language = event.currentTarget.dataset.language;
    if (isLanguage(language)) {
      this.setData({ language });
    }
  },

  async submitPreferences() {
    if (this.data.saving) {
      return;
    }
    this.setData({ saving: true, errorMessage: "" });
    try {
      const saved = await saveCareerPreferences({
        language: this.data.language,
        rawIntent: this.data.rawIntent.trim(),
      });
      getApp<AppGlobalData>().globalData.careerPreferences = {
        language: saved.language,
        rawIntent: saved.rawIntent,
      };
      wx.navigateTo({ url: "/pages/questionnaire/index" });
    } catch (error: unknown) {
      this.setData({ saving: false, errorMessage: getErrorMessage(error) });
    }
  },
});
