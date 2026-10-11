import { getErrorMessage, getGenerationTask, renderResumeFiles } from "../../services/cloud-api";
import type { AppGlobalData } from "../../app";
import type {
  GeneratedResumeVersion,
  ResumeTemplateId,
} from "../../types/domain";

interface TemplateCard {
  accent: string;
  description: string;
  id: ResumeTemplateId;
  name: string;
  selected: boolean;
  tag: string;
}

interface TemplateData {
  errorMessage: string;
  loading: boolean;
  operation: boolean;
  selectedTemplateId: ResumeTemplateId;
  taskId: string;
  templates: TemplateCard[];
  version: GeneratedResumeVersion | null;
  versionId: string;
}

interface TemplateMethods {
  goEditor(): void;
  loadConfirmedVersion(taskId: string, versionId: string): Promise<void>;
  onLoad(query: Record<string, string>): Promise<void>;
  renderSelectedTemplate(): Promise<void>;
  selectTemplate(event: TapEvent<{ id: unknown }>): void;
}

const TEMPLATE_CARDS: Omit<TemplateCard, "selected">[] = [
  {
    accent: "绿",
    description: "留白充足、阅读顺序稳定，适合跨岗位投递与通用场景。",
    id: "minimal-general",
    name: "极简通用",
    tag: "GENERAL · A4",
  },
  {
    accent: "蓝",
    description: "突出技术栈、项目职责和可验证结果，适合研发与数据方向。",
    id: "technical-project",
    name: "技术项目",
    tag: "TECH · A4",
  },
  {
    accent: "金",
    description: "强化课程、项目、竞赛与实习成长线，适合实习和校招。",
    id: "campus-growth",
    name: "校招成长",
    tag: "CAMPUS · A4",
  },
  {
    accent: "红",
    description: "强调职责层级、业务结果与连续经历，适合社会招聘。",
    id: "social-experience",
    name: "社招经历",
    tag: "SOCIAL · A4",
  },
];

const toCards = (selectedTemplateId: ResumeTemplateId): TemplateCard[] =>
  TEMPLATE_CARDS.map((template) => ({
    ...template,
    selected: template.id === selectedTemplateId,
  }));

Page<TemplateData, TemplateMethods>({
  data: {
    errorMessage: "",
    loading: true,
    operation: false,
    selectedTemplateId: "minimal-general",
    taskId: "",
    templates: toCards("minimal-general"),
    version: null,
    versionId: "",
  },

  async onLoad(query: Record<string, string>) {
    const cached = getApp<AppGlobalData>().globalData.generationTask;
    const taskId = query.taskId || cached?.taskId || "";
    const versionId = query.versionId || "";
    if (!taskId || !versionId) {
      this.setData({
        errorMessage: "没有可导出的确认版本，请返回简历编辑页。",
        loading: false,
      });
      return;
    }
    await this.loadConfirmedVersion(taskId, versionId);
  },

  async loadConfirmedVersion(taskId, versionId) {
    this.setData({ errorMessage: "", loading: true, taskId, versionId });
    try {
      const task = await getGenerationTask(taskId);
      const version = task.versions.find((item) => item.versionId === versionId) || null;
      if (task.status !== "COMPLETED" || !version) {
        this.setData({ errorMessage: "找不到当前简历版本，请返回后重新进入。", loading: false });
        return;
      }
      if (version.status !== "CONFIRMED") {
        this.setData({ errorMessage: "请先确认简历内容，再选择模板导出。", loading: false });
        return;
      }
      getApp<AppGlobalData>().globalData.generationTask = task;
      this.setData({ loading: false, version });
    } catch (error: unknown) {
      this.setData({ errorMessage: getErrorMessage(error), loading: false });
    }
  },

  selectTemplate(event) {
    const id = event.currentTarget.dataset.id;
    if (
      this.data.operation ||
      !TEMPLATE_CARDS.some((template) => template.id === id)
    ) {
      return;
    }
    const selectedTemplateId = id as ResumeTemplateId;
    this.setData({
      errorMessage: "",
      selectedTemplateId,
      templates: toCards(selectedTemplateId),
    });
  },

  async renderSelectedTemplate() {
    if (!this.data.version || this.data.operation) {
      return;
    }
    this.setData({ errorMessage: "", operation: true });
    try {
      const bundle = await renderResumeFiles(
        this.data.version.versionId,
        this.data.selectedTemplateId,
      );
      getApp<AppGlobalData>().globalData.resumeExportBundle = bundle;
      wx.navigateTo({
        url: `/pages/result/index?taskId=${encodeURIComponent(this.data.taskId)}&versionId=${encodeURIComponent(bundle.versionId)}&templateId=${encodeURIComponent(bundle.templateId)}`,
      });
      this.setData({ operation: false });
    } catch (error: unknown) {
      this.setData({ errorMessage: getErrorMessage(error), operation: false });
    }
  },

  goEditor() {
    if (!this.data.operation) {
      wx.navigateBack();
    }
  },
});
