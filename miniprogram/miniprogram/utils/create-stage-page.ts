export interface StageItem {
  name: string;
  status: string;
}

export interface StagePageConfig {
  title: string;
  description: string;
  phase: string;
  status: string;
  items: StageItem[];
  primaryLabel: string;
  enabled?: boolean;
  nextUrl?: string;
}

interface StagePageData extends StagePageConfig {
  enabled: boolean;
  nextUrl: string;
}

interface StagePageMethods {
  handlePrimary(): void;
  backHome(): void;
}

export const createStagePage = (config: StagePageConfig): void => {
  Page<StagePageData, StagePageMethods>({
    data: {
      ...config,
      enabled: config.enabled ?? false,
      nextUrl: config.nextUrl ?? "",
    },

    handlePrimary() {
      if (!this.data.enabled || !this.data.nextUrl) {
        wx.showToast({
          title: `${this.data.phase}阶段启用`,
          icon: "none",
        });
        return;
      }

      wx.navigateTo({ url: this.data.nextUrl });
    },

    backHome() {
      wx.reLaunch({ url: "/pages/index/index" });
    },
  });
};
