import {
  analyzeRoleMatches,
  generateResumePackage,
  getErrorMessage,
} from "../../services/cloud-api";
import type { AppGlobalData } from "../../app";

type ProgressStage = "analysis" | "generation";

interface ProgressData {
  errorMessage: string;
  retryNewGeneration: boolean;
  stage: ProgressStage;
  statusCopy: string;
  statusTitle: string;
}

interface ProgressMethods {
  onLoad(query: Record<string, string>): Promise<void>;
  retry(): Promise<void>;
  runCurrentStage(): Promise<void>;
}

Page<ProgressData, ProgressMethods>({
  data: {
    errorMessage: "",
    retryNewGeneration: false,
    stage: "analysis",
    statusCopy: "正在读取确认后的简历事实，并与固定岗位标准进行证据映射。",
    statusTitle: "岗位方向分析中",
  },

  async onLoad(query) {
    const stage: ProgressStage = query.stage === "generation" ? "generation" : "analysis";
    this.setData({
      stage,
      retryNewGeneration: false,
      statusCopy:
        stage === "generation"
          ? "正在按所选方向生成简历内容和打招呼语，并执行事实引用校验。"
          : "正在读取确认后的简历事实，并与固定岗位标准进行证据映射。",
      statusTitle: stage === "generation" ? "方向简历生成中" : "岗位方向分析中",
    });
    await this.runCurrentStage();
  },

  async runCurrentStage() {
    this.setData({
      errorMessage: "",
      statusCopy: this.data.stage === "generation"
        ? "正在按所选方向生成简历内容和打招呼语，并执行事实引用校验。"
        : "正在读取确认后的简历事实，并与固定岗位标准进行证据映射。",
      statusTitle: this.data.stage === "generation" ? "方向简历生成中" : "岗位方向分析中",
    });
    try {
      const app = getApp<AppGlobalData>();
      if (this.data.stage === "analysis") {
        const analysis = await analyzeRoleMatches();
        app.globalData.roleAnalysis = analysis;
        wx.redirectTo({ url: `/pages/recommendations/index?analysisId=${analysis.analysisId}` });
        return;
      }

      const request = app.globalData.generationRequest;
      if (!request) {
        this.setData({ errorMessage: "生成请求已失效，请返回岗位方向页重新选择。" });
        return;
      }
      const task = await generateResumePackage(
        request.analysisId,
        request.selectedDirectionIds,
        request.idempotencyKey,
      );
      if (task.status === "FAILED") {
        this.setData({
          errorMessage: task.errorCode === "MODEL_OUTPUT_INVALID"
            ? "AI 返回内容未通过格式校验，本次未保存。点击重新尝试将新建生成任务。"
            : "上次生成失败，本次未保存。点击重新尝试将新建生成任务。",
          retryNewGeneration: true,
          statusCopy: "本次未生成新简历，请核对错误提示后重试。",
          statusTitle: "本次生成未完成",
        });
        return;
      }
      if (task.status === "PROCESSING") {
        this.setData({ errorMessage: "生成任务仍在处理中，请稍后点击重试。" });
        return;
      }
      app.globalData.generationTask = task;
      app.globalData.generationRequest = null;
      wx.redirectTo({ url: `/pages/editor/index?taskId=${task.taskId}` });
    } catch (error: unknown) {
      this.setData({
        errorMessage: getErrorMessage(error),
        statusCopy: this.data.stage === "generation"
          ? "本次未生成新简历，请核对错误提示后重试。"
          : "本次未生成岗位方向分析，请核对错误提示后重试。",
        statusTitle: this.data.stage === "generation" ? "本次生成未完成" : "岗位方向分析未完成",
      });
    }
  },

  async retry() {
    if (this.data.stage === "generation" && this.data.retryNewGeneration) {
      const app = getApp<AppGlobalData>();
      const request = app.globalData.generationRequest;
      if (request) {
        app.globalData.generationRequest = {
          ...request,
          idempotencyKey: `p4_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`,
        };
      }
    }
    this.setData({ retryNewGeneration: false });
    await this.runCurrentStage();
  },
});
