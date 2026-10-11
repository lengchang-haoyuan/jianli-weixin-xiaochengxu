import { getErrorMessage, renderResumeFiles } from "../../services/cloud-api";
import type { AppGlobalData } from "../../app";
import type {
  ResumeExportBundle,
  ResumeTemplateId,
} from "../../types/domain";

interface GreetingView {
  text: string;
  viewKey: string;
}

type FileKind = "docx" | "pdf";
type ResultOperation = "" | FileKind | "copy";

interface ResultData {
  bundle: ResumeExportBundle | null;
  errorMessage: string;
  greetings: GreetingView[];
  loading: boolean;
  operation: ResultOperation;
  taskId: string;
  templateId: ResumeTemplateId | "";
  versionId: string;
}

interface ResultMethods {
  copyGreeting(event: TapEvent<{ index: unknown }>): Promise<void>;
  loadExport(versionId: string, templateId: ResumeTemplateId): Promise<void>;
  onLoad(query: Record<string, string>): Promise<void>;
  openExportFile(event: TapEvent<{ kind: unknown }>): Promise<void>;
  retry(): Promise<void>;
  switchTemplate(): void;
}

const TEMPLATE_IDS: ResumeTemplateId[] = [
  "minimal-general",
  "technical-project",
  "campus-growth",
  "social-experience",
];

const downloadFile = (url: string): Promise<DownloadFileResult> =>
  new Promise((resolve, reject) => {
    wx.downloadFile({ url, success: resolve, fail: reject });
  });

const openDocument = (filePath: string, fileType: FileKind): Promise<void> =>
  new Promise((resolve, reject) => {
    wx.openDocument({ filePath, fileType, showMenu: true, success: resolve, fail: reject });
  });

const copyText = (data: string): Promise<void> =>
  new Promise((resolve, reject) => {
    wx.setClipboardData({ data, success: resolve, fail: reject });
  });

Page<ResultData, ResultMethods>({
  data: {
    bundle: null,
    errorMessage: "",
    greetings: [],
    loading: true,
    operation: "",
    taskId: "",
    templateId: "",
    versionId: "",
  },

  async onLoad(query: Record<string, string>) {
    const templateId = TEMPLATE_IDS.includes(query.templateId as ResumeTemplateId)
      ? query.templateId as ResumeTemplateId
      : "";
    const versionId = query.versionId || "";
    const taskId = query.taskId || "";
    if (!templateId || !versionId) {
      this.setData({ errorMessage: "导出参数已失效，请返回重新选择模板。", loading: false });
      return;
    }
    this.setData({ taskId, templateId, versionId });
    const cached = getApp<AppGlobalData>().globalData.resumeExportBundle;
    if (cached && cached.versionId === versionId && cached.templateId === templateId) {
      this.setData({
        bundle: cached,
        greetings: cached.greetings.map((text, index) => ({
          text,
          viewKey: `${cached.exportId}:greeting:${index}`,
        })),
        loading: false,
      });
      return;
    }
    await this.loadExport(versionId, templateId);
  },

  async loadExport(versionId, templateId) {
    this.setData({ errorMessage: "", loading: true });
    try {
      const bundle = await renderResumeFiles(versionId, templateId);
      getApp<AppGlobalData>().globalData.resumeExportBundle = bundle;
      this.setData({
        bundle,
        greetings: bundle.greetings.map((text, index) => ({
          text,
          viewKey: `${bundle.exportId}:greeting:${index}`,
        })),
        loading: false,
      });
    } catch (error: unknown) {
      this.setData({ errorMessage: getErrorMessage(error), loading: false });
    }
  },

  async retry() {
    if (this.data.operation || !this.data.versionId || !this.data.templateId) {
      return;
    }
    await this.loadExport(this.data.versionId, this.data.templateId);
  },

  async openExportFile(event) {
    const kind = event.currentTarget.dataset.kind;
    if ((kind !== "docx" && kind !== "pdf") || !this.data.bundle || this.data.operation) {
      return;
    }
    this.setData({ errorMessage: "", operation: kind });
    try {
      const downloaded = await downloadFile(this.data.bundle.files[kind].tempUrl);
      if (downloaded.statusCode !== 200 || !downloaded.tempFilePath) {
        throw new Error("download failed");
      }
      await openDocument(downloaded.tempFilePath, kind);
      this.setData({ operation: "" });
    } catch (_error: unknown) {
      this.setData({ errorMessage: "文件打开失败，下载链接可能已过期，请重新生成。", operation: "" });
    }
  },

  async copyGreeting(event) {
    const index = Number(event.currentTarget.dataset.index);
    const greeting = this.data.greetings[index];
    if (!greeting || this.data.operation) {
      return;
    }
    this.setData({ errorMessage: "", operation: "copy" });
    try {
      await copyText(greeting.text);
      this.setData({ operation: "" });
      wx.showToast({ title: "打招呼语已复制", icon: "success" });
    } catch (_error: unknown) {
      this.setData({ errorMessage: "复制失败，请长按文字手动复制。", operation: "" });
    }
  },

  switchTemplate() {
    if (this.data.operation) {
      return;
    }
    wx.redirectTo({
      url: `/pages/templates/index?taskId=${encodeURIComponent(this.data.taskId)}&versionId=${encodeURIComponent(this.data.versionId)}`,
    });
  },
});
