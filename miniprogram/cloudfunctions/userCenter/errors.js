class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

const toPublicError = (error) => {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "云服务暂时不可用，请稍后重试。",
  };
};

module.exports = {
  AppError,
  toPublicError,
};
