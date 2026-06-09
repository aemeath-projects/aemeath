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

/** 模板未找到。 */
export class TemplateNotFoundError extends AppError {
  constructor(name: string) {
    super(-1, `Template not found: ${name}`, 500)
    this.name = 'TemplateNotFoundError'
  }
}

/** 模板执行异常。 */
export class TemplateRenderError extends AppError {
  constructor(name: string, cause: unknown) {
    super(-1, `Template render failed: ${name}`, 500)
    this.name = 'TemplateRenderError'
    this.cause = cause
  }
}

/** 渲染管线异常。 */
export class RenderError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(-1, message, 500)
    this.name = 'RenderError'
    if (cause !== undefined) this.cause = cause
  }
}
