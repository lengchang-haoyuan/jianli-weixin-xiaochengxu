import { getErrorMessage, getRoleAnalysis } from "../../services/cloud-api";
import type { AppGlobalData } from "../../app";
import type { RoleMatch } from "../../types/domain";

interface RoleCard extends RoleMatch {
  coreSkillsText: string;
  selected: boolean;
}

interface RecommendationData {
  analysisId: string;
  currentIndex: number;
  errorMessage: string;
  loading: boolean;
  roleCards: RoleCard[];
  selectedCount: number;
}

interface RecommendationMethods {
  loadAnalysis(analysisId: string): Promise<void>;
  onLoad(query: Record<string, string>): Promise<void>;
  onSwiperChange(event: SwiperChangeEvent): void;
  startGeneration(): void;
  toggleRole(event: TapEvent<{ id: unknown }>): void;
}

Page<RecommendationData, RecommendationMethods>({
  data: {
    analysisId: "",
    currentIndex: 0,
    errorMessage: "",
    loading: true,
    roleCards: [],
    selectedCount: 0,
  },

  async onLoad(query) {
    const cached = getApp<AppGlobalData>().globalData.roleAnalysis;
    const analysisId = query.analysisId || cached?.analysisId || "";
    if (!analysisId) {
      this.setData({ errorMessage: "没有可用的岗位分析结果，请返回重新分析。", loading: false });
      return;
    }
    await this.loadAnalysis(analysisId);
  },

  async loadAnalysis(analysisId) {
    try {
      const cached = getApp<AppGlobalData>().globalData.roleAnalysis;
      const analysis = cached?.analysisId === analysisId ? cached : await getRoleAnalysis(analysisId);
      getApp<AppGlobalData>().globalData.roleAnalysis = analysis;
      this.setData({
        analysisId,
        loading: false,
        roleCards: analysis.matches.map((match) => ({
          ...match,
          coreSkillsText: match.coreSkills.join(" · "),
          evidence: match.evidence.slice(0, 2),
          selected: false,
        })),
      });
    } catch (error: unknown) {
      this.setData({ errorMessage: getErrorMessage(error), loading: false });
    }
  },

  onSwiperChange(event) {
    this.setData({ currentIndex: event.detail.current });
  },

  toggleRole(event) {
    const id = event.currentTarget.dataset.id;
    if (typeof id !== "string") {
      return;
    }
    const roleCards = this.data.roleCards.map((card) =>
      card.directionId === id ? { ...card, selected: !card.selected } : card,
    );
    this.setData({
      roleCards,
      selectedCount: roleCards.filter((card) => card.selected).length,
    });
  },

  startGeneration() {
    const selectedDirectionIds = this.data.roleCards
      .filter((card) => card.selected)
      .map((card) => card.directionId);
    if (selectedDirectionIds.length === 0) {
      return;
    }
    getApp<AppGlobalData>().globalData.generationRequest = {
      analysisId: this.data.analysisId,
      idempotencyKey: `p4_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`,
      selectedDirectionIds,
    };
    wx.navigateTo({ url: "/pages/progress/index?stage=generation" });
  },
});
