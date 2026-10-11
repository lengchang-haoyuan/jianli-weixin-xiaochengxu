import { CLOUD_ENV_ID, PRIVACY_VERSION } from "./config/app-config";
import type {
  CareerPreferences,
  GenerationTask,
  ResumeExportBundle,
  ResumeDraft,
  RoleAnalysis,
  SessionState,
} from "./types/domain";

export interface AppGlobalData {
  envId: string;
  privacyVersion: string;
  session: SessionState | null;
  resumeDraft: ResumeDraft | null;
  resumeSaveNoticePending: boolean;
  careerPreferences: CareerPreferences | null;
  roleAnalysis: RoleAnalysis | null;
  generationTask: GenerationTask | null;
  generationRequest: {
    analysisId: string;
    idempotencyKey: string;
    selectedDirectionIds: string[];
  } | null;
  resumeExportBundle: ResumeExportBundle | null;
}

App<AppGlobalData>({
  globalData: {
    envId: CLOUD_ENV_ID,
    privacyVersion: PRIVACY_VERSION,
    session: null,
    resumeDraft: null,
    resumeSaveNoticePending: false,
    careerPreferences: null,
    roleAnalysis: null,
    generationTask: null,
    generationRequest: null,
    resumeExportBundle: null,
  },

  onLaunch() {
    if (!wx.cloud) {
      return;
    }

    wx.cloud.init({
      env: this.globalData.envId,
      traceUser: false,
    });
  },
});
