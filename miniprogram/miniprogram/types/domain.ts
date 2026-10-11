export type UserMode = "student" | "social";
export type ResumeLanguage = "zh-CN" | "en" | "bilingual";
export type ResumeSourceType = "docx" | "pdf";
export type QuestionnaireAnswer = "yes" | "no" | "unknown";
export type GenerationTaskStatus = "PROCESSING" | "COMPLETED" | "FAILED";
export type ResumeVersionStatus = "DRAFT" | "CONFIRMED";
export type ResumeTemplateId =
  | "minimal-general"
  | "technical-project"
  | "campus-growth"
  | "social-experience";

export interface ResumeDraft {
  fileName: string;
  sourceType: ResumeSourceType;
  text: string;
}

export interface ExtractedResume {
  text: string;
}

export interface QuotaStatus {
  date: string;
  limit: number;
  usedCount: number;
  reservedCount: number;
  remaining: number;
}

export interface SessionState {
  hasConsent: boolean;
  hasConfirmedResume: boolean;
  consentVersion: string | null;
  mode: UserMode;
  language: ResumeLanguage;
  quota: QuotaStatus;
}

export interface CareerPreferences {
  language: ResumeLanguage;
  rawIntent: string;
}

export interface RoleEvidence {
  category: string;
  criterion: string;
  quote: string;
}

export interface RoleMatch {
  band: string;
  categoryName: string;
  coreSkills: string[];
  description: string;
  directionId: string;
  evidence: RoleEvidence[];
  gaps: string[];
  name: string;
  roleId: string;
  score: number;
}

export interface RoleAnalysis {
  analysisId: string;
  matches: RoleMatch[];
  standardVersion: string;
}

export interface GeneratedSection {
  changeType: "rewrite" | "reorder" | "translate";
  factIds: string[];
  language: ResumeLanguage;
  section: string;
  text: string;
}

export interface GeneratedResumeVersion {
  contactBlock: string;
  directionId: string;
  greetings: string[];
  language: ResumeLanguage;
  resumeTitle: string;
  revision: number;
  roleName: string;
  sections: GeneratedSection[];
  status: ResumeVersionStatus;
  versionId: string;
}

export interface GenerationTask {
  errorCode: string | null;
  status: GenerationTaskStatus;
  taskId: string;
  versions: GeneratedResumeVersion[];
}

export interface ResumeExportFile {
  fileID: string;
  fileName: string;
  tempUrl: string;
}

export interface ResumeExportBundle {
  exportId: string;
  files: {
    docx: ResumeExportFile;
    pdf: ResumeExportFile;
  };
  greetings: string[];
  pageCount: number;
  previewUrls: string[];
  resumeTitle: string;
  roleName: string;
  templateId: ResumeTemplateId;
  templateName: string;
  templateVersion: string;
  versionId: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorPayload };
