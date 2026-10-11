import {
  CAREER_ASSISTANT_FUNCTION,
  RESUME_PARSER_FUNCTION,
  USER_CENTER_FUNCTION,
} from "../config/app-config";
import type {
  ApiResponse,
  CareerPreferences,
  ExtractedResume,
  GeneratedResumeVersion,
  GenerationTask,
  QuestionnaireAnswer,
  ResumeExportBundle,
  ResumeSourceType,
  ResumeTemplateId,
  RoleAnalysis,
  SessionState,
  UserMode,
} from "../types/domain";

export class CloudApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CloudApiError";
    this.code = code;
  }
}

const isApiResponse = <T>(value: unknown): value is ApiResponse<T> => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { data?: unknown; error?: unknown; ok?: unknown };
  if (candidate.ok === true) {
    return Object.prototype.hasOwnProperty.call(candidate, "data");
  }
  if (candidate.ok !== false || !candidate.error || typeof candidate.error !== "object") {
    return false;
  }

  const error = candidate.error as { code?: unknown; message?: unknown };
  return typeof error.code === "string" && typeof error.message === "string";
};

const callCloudFunction = async <T>(
  functionName: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> => {
  if (!wx.cloud) {
    throw new CloudApiError("CLOUD_UNAVAILABLE", "当前微信版本不支持云开发，请升级微信后重试。");
  }

  let response: CloudCallResult<ApiResponse<T>>;
  try {
    response = await wx.cloud.callFunction<ApiResponse<T>>({
      name: functionName,
      data: { action, payload },
    });
  } catch (_error: unknown) {
    throw new CloudApiError("CLOUD_CALL_FAILED", "暂时无法连接云服务，请检查网络后重试。");
  }

  if (!isApiResponse<T>(response.result)) {
    throw new CloudApiError("INVALID_RESPONSE", "云服务返回了无法识别的数据，请稍后重试。");
  }

  if (!response.result.ok) {
    throw new CloudApiError(response.result.error.code, response.result.error.message);
  }

  return response.result.data;
};

const callUserCenter = <T>(action: string, payload: Record<string, unknown> = {}): Promise<T> =>
  callCloudFunction(USER_CENTER_FUNCTION, action, payload);

const callResumeParser = <T>(action: string, payload: Record<string, unknown> = {}): Promise<T> =>
  callCloudFunction(RESUME_PARSER_FUNCTION, action, payload);

const callCareerAssistant = <T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> => callCloudFunction(CAREER_ASSISTANT_FUNCTION, action, payload);

export const bootstrapSession = (): Promise<SessionState> => callUserCenter("bootstrapSession");

export const acceptPrivacy = (mode: UserMode, privacyVersion: string): Promise<SessionState> =>
  callUserCenter("acceptPrivacy", {
    accepted: true,
    mode,
    privacyVersion,
  });

export const updateUserMode = (mode: UserMode): Promise<SessionState> =>
  callUserCenter("setUserMode", { mode });

export const deleteAllUserData = (): Promise<{ deleted: true }> =>
  callUserCenter("deleteAllUserData", {
    confirmation: "DELETE_ALL_MY_DATA",
  });

export const createResumeUploadTarget = (
  sourceType: ResumeSourceType,
): Promise<{ cloudPath: string }> => callResumeParser("createUploadTarget", { sourceType });

export const extractResume = (
  fileID: string,
  sourceType: ResumeSourceType,
): Promise<ExtractedResume> => callResumeParser("extractResume", { fileID, sourceType });

export const saveConfirmedResume = (
  text: string,
  sourceType: ResumeSourceType,
): Promise<{ saved: true }> =>
  callResumeParser("saveConfirmedResume", {
    confirmed: true,
    sourceType,
    text,
  });

export const saveCareerPreferences = (
  preferences: CareerPreferences,
): Promise<{ saved: true } & CareerPreferences> =>
  callCareerAssistant("savePreferences", { ...preferences });

export const saveQuestionnaire = (
  answers: Record<string, QuestionnaireAnswer>,
  skipped: boolean,
): Promise<{ saved: true; skipped: boolean }> =>
  callCareerAssistant("saveQuestionnaire", { answers, skipped });

export const analyzeRoleMatches = (): Promise<RoleAnalysis> =>
  callCareerAssistant("analyzeRoleMatches");

export const getRoleAnalysis = (analysisId: string): Promise<RoleAnalysis> =>
  callCareerAssistant("getRoleAnalysis", { analysisId });

export const generateResumePackage = (
  analysisId: string,
  selectedDirectionIds: string[],
  idempotencyKey: string,
): Promise<GenerationTask> =>
  callCareerAssistant("generateResumePackage", {
    analysisId,
    idempotencyKey,
    selectedDirectionIds,
  });

export const getGenerationTask = (taskId: string): Promise<GenerationTask> =>
  callCareerAssistant("getGenerationTask", { taskId });

export const updateResumeDraft = (
  versionId: string,
  expectedRevision: number,
  resumeTitle: string,
  sectionTexts: string[],
  greetings: string[],
): Promise<GeneratedResumeVersion> =>
  callCareerAssistant("updateResumeDraft", {
    expectedRevision,
    greetings,
    resumeTitle,
    sectionTexts,
    versionId,
  });

export const confirmResumeVersion = (
  versionId: string,
  expectedRevision: number,
): Promise<GeneratedResumeVersion> =>
  callCareerAssistant("confirmResumeVersion", { expectedRevision, versionId });

export const renderResumeFiles = (
  versionId: string,
  templateId: ResumeTemplateId,
): Promise<ResumeExportBundle> =>
  callCareerAssistant("renderResumeFiles", { templateId, versionId });

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof CloudApiError) {
    return error.message;
  }

  return "发生了未知错误，请稍后重试。";
};
