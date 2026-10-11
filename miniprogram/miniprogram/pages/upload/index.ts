import { MAX_RESUME_FILE_BYTES } from "../../config/app-config";
import {
  CloudApiError,
  createResumeUploadTarget,
  extractResume,
  getErrorMessage,
} from "../../services/cloud-api";
import type { AppGlobalData } from "../../app";
import type { ResumeSourceType } from "../../types/domain";

type UploadPhase = "idle" | "selected" | "uploading" | "extracting" | "error";

interface UploadData {
  busy: boolean;
  errorMessage: string;
  fileName: string;
  filePath: string;
  fileSizeLabel: string;
  phase: UploadPhase;
  primaryLabel: string;
  sourceType: ResumeSourceType | "";
  statusCopy: string;
  statusTitle: string;
}

interface UploadMethods {
  onChooseFile(): Promise<void>;
  onPrimaryAction(): Promise<void>;
  processSelectedFile(): Promise<void>;
  cleanupTemporaryFile(fileID: string): Promise<boolean>;
}

const getSourceType = (fileName: string): ResumeSourceType | null => {
  const normalized = fileName.trim().toLowerCase();
  if (normalized.endsWith(".docx")) {
    return "docx";
  }
  if (normalized.endsWith(".pdf")) {
    return "pdf";
  }
  return null;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isCancelledSelection = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === "object" &&
      "errMsg" in error &&
      typeof error.errMsg === "string" &&
      /cancel/i.test(error.errMsg),
  );

Page<UploadData, UploadMethods>({
  data: {
    busy: false,
    errorMessage: "",
    fileName: "",
    filePath: "",
    fileSizeLabel: "",
    phase: "idle",
    primaryLabel: "选择简历文件",
    sourceType: "",
    statusCopy: "原文件只用于提取文字，服务端完成后立即删除；本阶段不会调用 AI。",
    statusTitle: "等待选择文件",
  },

  async onChooseFile() {
    if (this.data.busy) {
      return;
    }

    this.setData({ errorMessage: "" });
    try {
      const result = await wx.chooseMessageFile({
        count: 1,
        type: "file",
        extension: ["docx", "pdf"],
      });
      const file = result.tempFiles[0];
      if (!file) {
        return;
      }

      const sourceType = getSourceType(file.name);
      if (!sourceType) {
        this.setData({
          errorMessage: "仅支持扩展名为 .docx 或 .pdf 的文件。",
          phase: "error",
        });
        return;
      }
      if (!Number.isFinite(file.size) || file.size <= 0) {
        this.setData({ errorMessage: "文件内容为空，请重新选择。", phase: "error" });
        return;
      }
      if (file.size > MAX_RESUME_FILE_BYTES) {
        this.setData({ errorMessage: "文件不能超过 10MB。", phase: "error" });
        return;
      }

      this.setData({
        fileName: file.name,
        filePath: file.path,
        fileSizeLabel: formatFileSize(file.size),
        phase: "selected",
        primaryLabel: "上传并提取文字",
        sourceType,
        statusCopy: "请确认文件无误。上传后将先提取文字，再进入人工核对。",
        statusTitle: "文件已就绪",
      });
    } catch (error: unknown) {
      if (!isCancelledSelection(error)) {
        this.setData({ errorMessage: "无法选择文件，请稍后重试。", phase: "error" });
      }
    }
  },

  async onPrimaryAction() {
    if (this.data.busy) {
      return;
    }
    if (!this.data.filePath || !this.data.sourceType) {
      await this.onChooseFile();
      return;
    }
    await this.processSelectedFile();
  },

  async cleanupTemporaryFile(fileID) {
    const cloud = wx.cloud;
    if (!cloud) {
      return false;
    }

    try {
      const result = await cloud.deleteFile({ fileList: [fileID] });
      const item = result.fileList[0];
      const detail = item ? `${item.errMsg || ""} ${item.message || ""}` : "";
      return Boolean(
        item &&
          (item.code === "SUCCESS" ||
            item.status === 0 ||
            /not exist|not found|不存在/i.test(detail)),
      );
    } catch (_error: unknown) {
      return false;
    }
  },

  async processSelectedFile() {
    const sourceType = this.data.sourceType;
    if (!this.data.filePath || !sourceType || this.data.busy) {
      return;
    }

    const cloud = wx.cloud;
    if (!cloud) {
      this.setData({
        errorMessage: "当前微信版本不支持云开发，请升级微信后重试。",
        phase: "error",
      });
      return;
    }

    let temporaryFileID = "";
    this.setData({
      busy: true,
      errorMessage: "",
      phase: "uploading",
      primaryLabel: "正在上传…",
      statusCopy: "文件正在进入你的临时云空间，请保持网络连接。",
      statusTitle: "上传中",
    });

    try {
      const target = await createResumeUploadTarget(sourceType);
      let upload: { fileID: string };
      try {
        upload = await cloud.uploadFile({
          cloudPath: target.cloudPath,
          filePath: this.data.filePath,
        });
      } catch (_error: unknown) {
        throw new CloudApiError(
          "UPLOAD_FAILED",
          "文件上传被云存储拒绝，请确认云存储权限已生效后重试。",
        );
      }
      temporaryFileID = upload.fileID;
      if (!temporaryFileID) {
        throw new CloudApiError("UPLOAD_FAILED", "文件上传未完成，请重试。");
      }

      this.setData({
        phase: "extracting",
        primaryLabel: "正在提取…",
        statusCopy: "正在读取文档中的文字；图片内容不会被识别。",
        statusTitle: "提取文字中",
      });
      const extracted = await extractResume(temporaryFileID, sourceType);
      temporaryFileID = "";

      getApp<AppGlobalData>().globalData.resumeDraft = {
        fileName: this.data.fileName,
        sourceType,
        text: extracted.text,
      };
      this.setData({ busy: false, primaryLabel: "上传并提取文字" });
      wx.navigateTo({ url: "/pages/review/index" });
    } catch (error: unknown) {
      let cleanupConfirmed = true;
      if (temporaryFileID) {
        cleanupConfirmed = await this.cleanupTemporaryFile(temporaryFileID);
      }

      const cleanupSuffix = cleanupConfirmed
        ? ""
        : " 临时文件清理状态未确认，请稍后重试；系统不会继续处理该文件。";
      this.setData({
        busy: false,
        errorMessage: `${getErrorMessage(error)}${cleanupSuffix}`,
        phase: "error",
        primaryLabel: "重新上传并提取",
        statusCopy: "你可以检查文件后重试，或换成可提取文字的 DOCX。",
        statusTitle: "本次提取未完成",
      });
    }
  },
});
