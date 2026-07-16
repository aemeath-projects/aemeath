/**
 * 业务异常基类与常用子类 —— 所有业务层异常统一继承 AppError。
 */

/** 通用业务异常基类，携带 code 和 HTTP 状态码。 */
export class AppError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/** 资源未找到（HTTP 404）。 */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(-1, message, 404)
    this.name = 'NotFoundError'
  }
}

/** 无权限访问（HTTP 403）。 */
export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(-1, message, 403)
    this.name = 'ForbiddenError'
  }
}

/** 请求参数校验失败（HTTP 422）。 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(-1, message, 422)
    this.name = 'ValidationError'
  }
}

/** Bot API 调用失败（SDK Result.ok === false）。502 语义：上游 Bot API 调用失败。 */
export class BotApiError extends AppError {
  constructor(
    /** OneBot 协议返回的 retcode。 */
    public readonly retcode: number,
    message: string,
  ) {
    super(-1, message, 502)
    this.name = 'BotApiError'
  }
}
