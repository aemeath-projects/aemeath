/**
 * dispatch 统一出口 —— 透传 exostrider 导出，并对路由装饰器做类型适配。
 *
 * Handler 方法签名（如 `(ctx: Context) => Promise<void>`）无法直接赋值给
 * exostrider 内部的 `(...args: unknown[]) => unknown`（逆变参数检查失败），
 * 因此此处包装一层，将参数类型放宽为 `any` 后再 cast 转发，
 * 使类型差异仅封闭在本模块内。
 */

// 透传 exostrider dispatch 中与路由装饰器无关的全部导出
export {
  Context,
  Permission,
  MessageScope,
  FinishError,
  CompositeHandlerMapping,
  CommandHandlerMapping,
  RegexHandlerMapping,
  KeywordHandlerMapping,
  StartsWithHandlerMapping,
  EndsWithHandlerMapping,
  FullMatchHandlerMapping,
  EventTypeHandlerMapping,
  buildHandlerMethod,
  HandlerRegistry,
  handlerRegistry,
  EventDispatcher,
  Handler,
  PermissionDecorator,
  Scope,
  Priority,
  Interceptor,
  SettingNode,
  HANDLER_METHODS,
  HANDLER_CLASS_INTERCEPTORS,
  HANDLER_SETTINGS,
  HANDLER_NAME,
  HANDLER_OPTIONS,
} from '@aemeath-projects/exostrider/dispatch'

export type {
  ContextConfig,
  PermissionLevel,
  MessageScopeValue,
  HandlerInterceptor,
  ResolvedHandler,
  HandlerMethod,
  HandlerMapping,
  MappingType,
  HandlerOptions,
  HandlerRegistryData,
  EventDispatcherOptions,
  OnCommandOptions,
  EventMatchConfig,
  SettingNodeOptions,
  MethodMetaEntry,
  InterceptorEntry,
  SettingNodeEntry,
  HandlerOptions as HandlerDecoratorOptions,
} from '@aemeath-projects/exostrider/dispatch'

// 透传 aemeath 自定义路由装饰器（OnNotice、OnPoke 等）
export * from './decorators.js'

// aemeath 扩展类型与上下文
export type { ContextApis } from './adapter.js'
export { oneBotContextConfig } from './adapter.js'
export { OneBotContext } from './context.js'
export type { FeatureChecker } from './types.js'

// ─── 路由装饰器类型适配包装 ──────────────────────────────────────────────────
//
// exostrider 将装饰目标限定为 `(...args: unknown[]) => unknown`。
// 对参数使用逆变检查时，具体 Context 类型无法满足该约束。
// 通过将 target 参数类型放宽为 `any`，TypeScript 对参数类型绕过严格检查，
// 内部再 cast 回 unknown 变体传给 exostrider，不影响运行时行为。

import {
  OnCommand as _OnCommand,
  OnKeyword as _OnKeyword,
  OnRegex as _OnRegex,
  OnStartsWith as _OnStartsWith,
  OnEndsWith as _OnEndsWith,
  OnFullMatch as _OnFullMatch,
  OnEvent as _OnEvent,
} from '@aemeath-projects/exostrider/dispatch'
import type { OnCommandOptions, EventMatchConfig } from '@aemeath-projects/exostrider/dispatch'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any
type UnknownFn = (...args: unknown[]) => unknown

function wrapRouteDecorator(
  inner: (t: UnknownFn, ctx: ClassMethodDecoratorContext) => void,
): (target: AnyFn, ctx: ClassMethodDecoratorContext) => void {
  return (target, ctx) => {
    inner(target as UnknownFn, ctx)
  }
}

export const OnCommand = (cmd: string, opts?: OnCommandOptions) =>
  wrapRouteDecorator(_OnCommand(cmd, opts))

export const OnKeyword = (keywords: string[]) => wrapRouteDecorator(_OnKeyword(keywords))

export const OnRegex = (pattern: RegExp) => wrapRouteDecorator(_OnRegex(pattern))

export const OnStartsWith = (prefix: string) => wrapRouteDecorator(_OnStartsWith(prefix))

export const OnEndsWith = (suffix: string) => wrapRouteDecorator(_OnEndsWith(suffix))

export const OnFullMatch = (text: string) => wrapRouteDecorator(_OnFullMatch(text))

export const OnEvent = (config: EventMatchConfig) => wrapRouteDecorator(_OnEvent(config))
