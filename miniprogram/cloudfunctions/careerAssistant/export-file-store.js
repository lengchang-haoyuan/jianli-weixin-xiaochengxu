const { AppError } = require("./errors");

const TEMP_URL_MAX_AGE_SECONDS = 60 * 60;

const toSafeFileName = (title) => {
  const normalized = String(title || "岗位简历")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
  return normalized || "岗位简历";
};

class ExportFileStore {
  constructor(cloudApi) {
    this.cloudApi = cloudApi;
  }

  async save(ownerId, version, template, templateId, rendered) {
    const basePath = `resume-output/${ownerId}/${version.versionId}/${version.revision}/${templateId}`;
    const files = [
      { content: rendered.docx, key: "docx", path: `${basePath}/resume.docx` },
      { content: rendered.pdf, key: "pdf", path: `${basePath}/resume.pdf` },
      ...rendered.previews.map((content, index) => ({
        content,
        key: `preview-${index + 1}`,
        path: `${basePath}/preview-${index + 1}.jpg`,
      })),
    ];
    const uploaded = [];
    try {
      for (const file of files) {
        const result = await this.cloudApi.uploadFile({
          cloudPath: file.path,
          fileContent: file.content,
        });
        if (!result || typeof result.fileID !== "string" || !result.fileID) {
          throw new Error("missing fileID");
        }
        uploaded.push({ ...file, fileID: result.fileID });
      }
      const urlResult = await this.cloudApi.getTempFileURL({
        fileList: uploaded.map((file) => ({
          fileID: file.fileID,
          maxAge: TEMP_URL_MAX_AGE_SECONDS,
        })),
      });
      if (!urlResult || !Array.isArray(urlResult.fileList)) {
        throw new Error("missing temporary URLs");
      }
      const urlById = new Map(
        urlResult.fileList
          .filter((item) => item && item.status === 0 && typeof item.tempFileURL === "string")
          .map((item) => [item.fileID, item.tempFileURL]),
      );
      if (uploaded.some((file) => !urlById.get(file.fileID))) {
        throw new Error("incomplete temporary URLs");
      }

      const docx = uploaded.find((file) => file.key === "docx");
      const pdf = uploaded.find((file) => file.key === "pdf");
      const displayName = toSafeFileName(version.resumeTitle);
      return {
        files: {
          docx: {
            fileID: docx.fileID,
            fileName: `${displayName}-${template.name}.docx`,
            tempUrl: urlById.get(docx.fileID),
          },
          pdf: {
            fileID: pdf.fileID,
            fileName: `${displayName}-${template.name}.pdf`,
            tempUrl: urlById.get(pdf.fileID),
          },
        },
        previewUrls: uploaded
          .filter((file) => file.key.startsWith("preview-"))
          .map((file) => urlById.get(file.fileID)),
      };
    } catch (_error) {
      if (uploaded.length > 0) {
        try {
          await this.cloudApi.deleteFile({ fileList: uploaded.map((file) => file.fileID) });
        } catch (_cleanupError) {
          // 清理失败不覆盖原始错误；路径固定，后续重试会覆盖这些临时产物。
        }
      }
      throw new AppError("EXPORT_STORAGE_FAILED", "导出文件保存失败，请稍后重试。");
    }
  }
}

module.exports = { ExportFileStore, toSafeFileName };
