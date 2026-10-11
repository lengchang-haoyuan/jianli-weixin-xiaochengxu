import {
  confirmResumeVersion,
  getErrorMessage,
  getGenerationTask,
  updateResumeDraft,
} from "../../services/cloud-api";
import type { AppGlobalData } from "../../app";
import type {
  GeneratedResumeVersion,
  GeneratedSection,
  ResumeVersionStatus,
} from "../../types/domain";

interface SectionView extends GeneratedSection {
  factIdsText: string;
  viewKey: string;
}

interface GreetingView {
  text: string;
  viewKey: string;
}

interface VersionView extends Omit<GeneratedResumeVersion, "greetings" | "sections"> {
  dirty: boolean;
  greetings: GreetingView[];
  sections: SectionView[];
}

type EditorOperation = "" | "saving" | "confirming";

interface EditorData {
  currentDirty: boolean;
  currentIndex: number;
  currentStatus: ResumeVersionStatus | "";
  errorMessage: string;
  loading: boolean;
  operation: EditorOperation;
  statusMessage: string;
  taskId: string;
  versions: VersionView[];
}

interface EditorMethods {
  confirmCurrentVersion(): Promise<void>;
  goHome(): void;
  goTemplates(): void;
  loadTask(taskId: string): Promise<void>;
  onGreetingInput(event: InputEvent & TapEvent<{ greetingIndex: unknown; versionIndex: unknown }>): void;
  onLoad(query: Record<string, string>): Promise<void>;
  onSectionInput(event: InputEvent & TapEvent<{ sectionIndex: unknown; versionIndex: unknown }>): void;
  onSwiperChange(event: SwiperChangeEvent): void;
  onTitleInput(event: InputEvent & TapEvent<{ versionIndex: unknown }>): void;
  onUnload(): void;
  reloadTask(): Promise<void>;
  saveCurrentDraft(): Promise<void>;
}

const toVersionView = (version: GeneratedResumeVersion): VersionView => ({
  ...version,
  dirty: false,
  greetings: version.greetings.map((text, index) => ({
    text,
    viewKey: `${version.versionId}:greeting:${index}`,
  })),
  revision: Number.isInteger(version.revision) && version.revision >= 1 ? version.revision : 1,
  sections: version.sections.map((section, index) => ({
    ...section,
    factIdsText: section.factIds.join(" · "),
    viewKey: `${version.versionId}:section:${index}`,
  })),
  status: version.status === "CONFIRMED" ? "CONFIRMED" : "DRAFT",
});

const toIndex = (value: unknown, length: number): number | null => {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < length ? index : null;
};

const updateCachedVersion = (version: GeneratedResumeVersion): void => {
  const app = getApp<AppGlobalData>();
  const task = app.globalData.generationTask;
  if (!task) {
    return;
  }
  app.globalData.generationTask = {
    ...task,
    versions: task.versions.map((item) => item.versionId === version.versionId ? version : item),
  };
};

const hasDirtyVersion = (versions: VersionView[]): boolean =>
  versions.some((version) => version.dirty);

const setUnsavedGuard = (enabled: boolean): void => {
  if (enabled) {
    wx.enableAlertBeforeUnload({ message: "仍有未保存的简历修改，确认离开当前页面吗？" });
    return;
  }
  wx.disableAlertBeforeUnload();
};

const replaceVersion = (
  versions: VersionView[],
  version: GeneratedResumeVersion,
): { index: number; versions: VersionView[] } | null => {
  const index = versions.findIndex((item) => item.versionId === version.versionId);
  if (index < 0) {
    return null;
  }
  const nextVersions = [...versions];
  nextVersions[index] = toVersionView(version);
  return { index, versions: nextVersions };
};

Page<EditorData, EditorMethods>({
  data: {
    currentDirty: false,
    currentIndex: 0,
    currentStatus: "",
    errorMessage: "",
    loading: true,
    operation: "",
    statusMessage: "",
    taskId: "",
    versions: [],
  },

  async onLoad(query: Record<string, string>) {
    const cached = getApp<AppGlobalData>().globalData.generationTask;
    const taskId = query.taskId || cached?.taskId || "";
    if (!taskId) {
      this.setData({ errorMessage: "没有可核对的生成结果，请重新开始。", loading: false });
      return;
    }
    await this.loadTask(taskId);
  },

  async loadTask(taskId) {
    this.setData({ errorMessage: "", loading: true, statusMessage: "", taskId });
    try {
      const app = getApp<AppGlobalData>();
      const task = await getGenerationTask(taskId);
      if (task.status !== "COMPLETED" || task.versions.length === 0) {
        this.setData({ errorMessage: "生成任务尚未完成，请返回后重试。", loading: false });
        return;
      }
      app.globalData.generationTask = task;
      const versions = task.versions.map(toVersionView);
      const currentVersionId = this.data.versions[this.data.currentIndex]?.versionId;
      const matchedIndex = versions.findIndex((version) => version.versionId === currentVersionId);
      const currentIndex = matchedIndex >= 0 ? matchedIndex : 0;
      setUnsavedGuard(false);
      this.setData({
        currentDirty: false,
        currentIndex,
        currentStatus: versions[currentIndex].status,
        loading: false,
        versions,
      });
    } catch (error: unknown) {
      this.setData({ errorMessage: getErrorMessage(error), loading: false });
    }
  },

  async reloadTask() {
    if (!this.data.taskId || this.data.loading || this.data.operation) {
      return;
    }
    if (hasDirtyVersion(this.data.versions)) {
      const decision = await wx.showModal({
        title: "重新载入最新版本？",
        content: "未保存的本地修改将被放弃，页面会读取云端最新草稿。",
        confirmText: "重新载入",
        cancelText: "保留修改",
        confirmColor: "#A43D32",
      });
      if (!decision.confirm) {
        return;
      }
    }
    await this.loadTask(this.data.taskId);
  },

  onSwiperChange(event) {
    const currentIndex = event.detail.current;
    const version = this.data.versions[currentIndex];
    this.setData({
      currentDirty: Boolean(version?.dirty),
      currentIndex,
      currentStatus: version?.status || "",
      errorMessage: "",
      statusMessage: "",
    });
  },

  onTitleInput(event) {
    const versionIndex = toIndex(event.currentTarget.dataset.versionIndex, this.data.versions.length);
    if (
      versionIndex === null ||
      this.data.operation ||
      this.data.versions[versionIndex].status === "CONFIRMED"
    ) {
      return;
    }
    if (!hasDirtyVersion(this.data.versions)) {
      setUnsavedGuard(true);
    }
    this.setData({
      [`versions[${versionIndex}].dirty`]: true,
      [`versions[${versionIndex}].resumeTitle`]: event.detail.value,
      currentDirty: versionIndex === this.data.currentIndex ? true : this.data.currentDirty,
      errorMessage: "",
      statusMessage: "",
    });
  },

  onSectionInput(event) {
    const versionIndex = toIndex(event.currentTarget.dataset.versionIndex, this.data.versions.length);
    if (
      versionIndex === null ||
      this.data.operation ||
      this.data.versions[versionIndex].status === "CONFIRMED"
    ) {
      return;
    }
    const sections = this.data.versions[versionIndex].sections;
    const sectionIndex = toIndex(event.currentTarget.dataset.sectionIndex, sections.length);
    if (sectionIndex === null) {
      return;
    }
    if (!hasDirtyVersion(this.data.versions)) {
      setUnsavedGuard(true);
    }
    this.setData({
      [`versions[${versionIndex}].dirty`]: true,
      [`versions[${versionIndex}].sections[${sectionIndex}].text`]: event.detail.value,
      currentDirty: versionIndex === this.data.currentIndex ? true : this.data.currentDirty,
      errorMessage: "",
      statusMessage: "",
    });
  },

  onGreetingInput(event) {
    const versionIndex = toIndex(event.currentTarget.dataset.versionIndex, this.data.versions.length);
    if (
      versionIndex === null ||
      this.data.operation ||
      this.data.versions[versionIndex].status === "CONFIRMED"
    ) {
      return;
    }
    const greetings = this.data.versions[versionIndex].greetings;
    const greetingIndex = toIndex(event.currentTarget.dataset.greetingIndex, greetings.length);
    if (greetingIndex === null) {
      return;
    }
    if (!hasDirtyVersion(this.data.versions)) {
      setUnsavedGuard(true);
    }
    this.setData({
      [`versions[${versionIndex}].dirty`]: true,
      [`versions[${versionIndex}].greetings[${greetingIndex}].text`]: event.detail.value,
      currentDirty: versionIndex === this.data.currentIndex ? true : this.data.currentDirty,
      errorMessage: "",
      statusMessage: "",
    });
  },

  async saveCurrentDraft() {
    const version = this.data.versions[this.data.currentIndex];
    if (!version || version.status === "CONFIRMED" || this.data.operation) {
      return;
    }
    if (!version.dirty) {
      this.setData({ statusMessage: "当前草稿没有未保存的修改。" });
      return;
    }

    this.setData({ errorMessage: "", operation: "saving", statusMessage: "" });
    try {
      const saved = await updateResumeDraft(
        version.versionId,
        version.revision,
        version.resumeTitle,
        version.sections.map((section) => section.text),
        version.greetings.map((greeting) => greeting.text),
      );
      const replacement = replaceVersion(this.data.versions, saved);
      if (!replacement) {
        this.setData({ errorMessage: "本地版本状态已失效，请重新载入。", operation: "" });
        return;
      }
      updateCachedVersion(saved);
      setUnsavedGuard(hasDirtyVersion(replacement.versions));
      this.setData({
        currentDirty: replacement.index === this.data.currentIndex
          ? false
          : this.data.currentDirty,
        currentStatus: replacement.index === this.data.currentIndex
          ? saved.status
          : this.data.currentStatus,
        operation: "",
        statusMessage: "草稿已保存；事实编号仍表示 AI 生成时的依据。",
        versions: replacement.versions,
      });
    } catch (error: unknown) {
      this.setData({ errorMessage: getErrorMessage(error), operation: "" });
    }
  },

  async confirmCurrentVersion() {
    const initial = this.data.versions[this.data.currentIndex];
    if (!initial || initial.status === "CONFIRMED" || this.data.operation) {
      return;
    }
    const decision = await wx.showModal({
      title: "确认导出基线？",
      content: "请确认手工修改内容真实准确。确认后该版本将锁定，后续模板与 DOCX/PDF 都以此内容为准。",
      confirmText: "确认锁定",
      cancelText: "继续修改",
      confirmColor: "#1F6B4F",
    });
    if (!decision.confirm) {
      return;
    }

    this.setData({ errorMessage: "", operation: "confirming", statusMessage: "" });
    try {
      let current = initial;
      if (current.dirty) {
        const saved = await updateResumeDraft(
          current.versionId,
          current.revision,
          current.resumeTitle,
          current.sections.map((section) => section.text),
          current.greetings.map((greeting) => greeting.text),
        );
        current = toVersionView(saved);
        const savedReplacement = replaceVersion(this.data.versions, saved);
        if (!savedReplacement) {
          this.setData({ errorMessage: "本地版本状态已失效，请重新载入。", operation: "" });
          return;
        }
        updateCachedVersion(saved);
        setUnsavedGuard(hasDirtyVersion(savedReplacement.versions));
        this.setData({ currentDirty: false, versions: savedReplacement.versions });
      }
      const confirmed = await confirmResumeVersion(current.versionId, current.revision);
      const replacement = replaceVersion(this.data.versions, confirmed);
      if (!replacement) {
        this.setData({ errorMessage: "本地版本状态已失效，请重新载入。", operation: "" });
        return;
      }
      updateCachedVersion(confirmed);
      setUnsavedGuard(hasDirtyVersion(replacement.versions));
      this.setData({
        currentDirty: replacement.index === this.data.currentIndex
          ? false
          : this.data.currentDirty,
        currentStatus: replacement.index === this.data.currentIndex
          ? confirmed.status
          : this.data.currentStatus,
        operation: "",
        statusMessage: "该版本已确认为导出基线，可以选择模板并导出文件。",
        versions: replacement.versions,
      });
    } catch (error: unknown) {
      this.setData({ errorMessage: getErrorMessage(error), operation: "" });
    }
  },

  goHome() {
    if (!this.data.operation) {
      wx.reLaunch({ url: "/pages/index/index" });
    }
  },

  goTemplates() {
    const version = this.data.versions[this.data.currentIndex];
    if (!version || version.status !== "CONFIRMED" || this.data.operation) {
      return;
    }
    wx.navigateTo({
      url: `/pages/templates/index?taskId=${encodeURIComponent(this.data.taskId)}&versionId=${encodeURIComponent(version.versionId)}`,
    });
  },

  onUnload() {
    wx.disableAlertBeforeUnload();
  },
});
