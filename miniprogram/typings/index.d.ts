interface CloudCallOptions {
  name: string;
  data?: Record<string, unknown>;
}

interface CloudCallResult<T> {
  result?: T;
}

interface CloudApi {
  init(options: { env: string; traceUser: boolean }): void;
  callFunction<T>(options: CloudCallOptions): Promise<CloudCallResult<T>>;
  uploadFile(options: { cloudPath: string; filePath: string }): Promise<{ fileID: string }>;
  deleteFile(options: {
    fileList: string[];
  }): Promise<{
    fileList: Array<{
      code?: string;
      errMsg?: string;
      fileID: string;
      message?: string;
      status?: number;
    }>;
  }>;
}

interface ChosenMessageFile {
  name: string;
  path: string;
  size: number;
  time?: number;
  type?: string;
}

interface DownloadFileResult {
  statusCode: number;
  tempFilePath: string;
}

interface CallbackOptions<T> {
  fail?(error: unknown): void;
  success?(result: T): void;
}

interface ChooseMessageFileResult {
  tempFiles: ChosenMessageFile[];
}

interface ModalResult {
  confirm: boolean;
  cancel: boolean;
}

interface MiniProgramApi {
  cloud?: CloudApi;
  chooseMessageFile(options: {
    count: number;
    type: "file";
    extension: string[];
  }): Promise<ChooseMessageFileResult>;
  downloadFile(options: CallbackOptions<DownloadFileResult> & { url: string }): unknown;
  openDocument(options: CallbackOptions<void> & {
    filePath: string;
    fileType: "docx" | "pdf";
    showMenu?: boolean;
  }): unknown;
  setClipboardData(options: CallbackOptions<void> & { data: string }): unknown;
  navigateTo(options: { url: string }): void;
  redirectTo(options: { url: string }): void;
  reLaunch(options: { url: string }): void;
  navigateBack(options?: { delta?: number }): void;
  showToast(options: {
    title: string;
    icon?: "success" | "error" | "loading" | "none";
    duration?: number;
  }): void;
  showModal(options: {
    title: string;
    content: string;
    confirmText?: string;
    cancelText?: string;
    confirmColor?: string;
    showCancel?: boolean;
  }): Promise<ModalResult>;
  exitMiniProgram(): void;
  clearStorageSync(): void;
  enableAlertBeforeUnload(options: { message: string }): void;
  disableAlertBeforeUnload(): void;
}

declare const wx: MiniProgramApi;

interface AppInstance<TGlobalData> {
  globalData: TGlobalData;
}

interface AppOptions<TGlobalData> {
  globalData: TGlobalData;
  onLaunch?(this: AppInstance<TGlobalData>): void;
}

declare function App<TGlobalData>(options: AppOptions<TGlobalData>): void;
declare function getApp<TGlobalData>(): AppInstance<TGlobalData>;

interface PageInstance<TData> {
  data: TData;
  setData(data: Partial<TData> | Record<string, unknown>): void;
}

type PageOptions<TData, TMethods extends object> = {
  data: TData;
  onLoad?(this: PageInstance<TData> & TMethods, query: Record<string, string>): void;
  onShow?(this: PageInstance<TData> & TMethods): void | Promise<void>;
  onUnload?(this: PageInstance<TData> & TMethods): void;
} & TMethods & ThisType<PageInstance<TData> & TMethods>;

declare function Page<TData, TMethods extends object>(options: PageOptions<TData, TMethods>): void;

interface TapEvent<TDataset extends Record<string, unknown>> {
  currentTarget: {
    dataset: TDataset;
  };
}

interface CheckboxGroupChangeEvent {
  detail: {
    value: string[];
  };
}

interface InputEvent {
  detail: {
    value: string;
  };
}

interface SwiperChangeEvent {
  detail: {
    current: number;
  };
}
