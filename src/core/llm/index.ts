/**
 * LLM 业务逻辑层 —— 提供商/模型 CRUD 与 LLM 调用编排。
 */

import { Service, Inject, Provide, Startup } from '@aemeath-projects/exostrider/lifecycle'
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'

import type { LlmModel, LlmProvider } from '#prisma/aemeath'

import type { AemeathPrismaClient } from '@/core/db/index.js'
import { NotFoundError } from '@/core/errors.js'
import {
  maskApiKey,
  type CreateModelData,
  type CreateProviderData,
  type UpdateModelData,
  type UpdateProviderData,
} from '@/core/schemas/index.js'

export type { LlmProvider, LlmModel }

/** 提供商响应 DTO。 */
export interface ProviderDto {
  id: string
  name: string
  type: 'openai' | 'anthropic' | 'gemini'
  apiBase: string
  apiKeyMasked: string
  modelCount: number
  models?: ModelDto[]
}

/** 模型响应 DTO。 */
export interface ModelDto {
  id: string
  providerId: string
  providerName: string
  modelName: string
  displayName: string | null
  temperature: number
  maxTokens: number | null
  forceStream: boolean
  extraParams: Record<string, unknown>
}

/**
 * LLM 核心服务 —— 封装提供商/模型 CRUD、调用编排。
 *
 * 通过 Startup / Shutdown 注册生命周期。
 */
export class LLMService {
  private readonly _log: PinoLogger = getLogger('llm') as unknown as PinoLogger

  constructor(private readonly aemeathDb: AemeathPrismaClient) {}

  // 提供商 CRUD

  /** 列出所有提供商（含模型数量）。 */
  async listProviders(limit = 200): Promise<ProviderDto[]> {
    const providers = await this.aemeathDb.llmProvider.findMany({
      include: { models: true },
      orderBy: { name: 'asc' },
      take: limit,
    })
    return providers.map((p) => this._providerToDto(p, p.models))
  }

  /** 获取单个提供商详情（含旗下模型列表）。 */
  async getProvider(providerId: string): Promise<ProviderDto> {
    const provider = await this.aemeathDb.llmProvider.findUnique({
      where: { id: providerId },
      include: { models: true },
    })
    if (!provider) throw new NotFoundError(`提供商不存在: ${providerId}`)
    const dto = this._providerToDto(provider, provider.models)
    dto.models = provider.models.map((m) => this._modelToDto(m, provider))
    return dto
  }

  /** 创建提供商。 */
  async createProvider(data: CreateProviderData): Promise<ProviderDto> {
    const provider = await this.aemeathDb.llmProvider.create({
      data: {
        name: data.name,
        type: data.type,
        apiBase: data.apiBase,
        apiKey: data.apiKey,
      },
    })
    this._log.info({ name: data.name }, 'LLM 提供商已创建')
    return this._providerToDto(provider, [])
  }

  /** 更新提供商（字段级部分更新）。 */
  async updateProvider(providerId: string, data: UpdateProviderData): Promise<ProviderDto> {
    const existing = await this.aemeathDb.llmProvider.findUnique({
      where: { id: providerId },
    })
    if (!existing) throw new NotFoundError(`提供商不存在: ${providerId}`)

    const provider = await this.aemeathDb.llmProvider.update({
      where: { id: providerId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.apiBase !== undefined ? { apiBase: data.apiBase } : {}),
        ...(data.apiKey !== undefined ? { apiKey: data.apiKey } : {}),
      },
      include: { models: true },
    })

    this._log.info({ providerId }, 'LLM 提供商已更新')
    return this._providerToDto(provider, provider.models)
  }

  /** 删除提供商（级联删除旗下模型）。 */
  async deleteProvider(providerId: string): Promise<void> {
    const existing = await this.aemeathDb.llmProvider.findUnique({
      where: { id: providerId },
    })
    if (!existing) throw new NotFoundError(`提供商不存在: ${providerId}`)

    await this.aemeathDb.llmProvider.delete({ where: { id: providerId } })
    this._log.info({ providerId }, 'LLM 提供商已删除')
  }

  // 模型 CRUD

  /** 列出模型（可按提供商筛选）。 */
  async listModels(providerId?: string, limit = 500): Promise<ModelDto[]> {
    const models = await this.aemeathDb.llmModel.findMany({
      where: providerId != null ? { providerId } : undefined,
      include: { provider: true },
      orderBy: { modelName: 'asc' },
      take: limit,
    })
    return models.map((m) => this._modelToDto(m, m.provider))
  }

  /** 获取单个模型详情。 */
  async getModel(modelId: string): Promise<ModelDto> {
    const model = await this.aemeathDb.llmModel.findUnique({
      where: { id: modelId },
      include: { provider: true },
    })
    if (!model) throw new NotFoundError(`模型不存在: ${modelId}`)
    return this._modelToDto(model, model.provider)
  }

  /** 创建模型。 */
  async createModel(data: CreateModelData): Promise<ModelDto> {
    const provider = await this.aemeathDb.llmProvider.findUnique({
      where: { id: data.providerId },
    })
    if (!provider) throw new NotFoundError(`提供商不存在: ${data.providerId}`)

    const model = await this.aemeathDb.llmModel.create({
      data: {
        providerId: data.providerId,
        modelName: data.modelName,
        displayName: data.displayName ?? null,
        temperature: data.temperature,
        maxTokens: data.maxTokens ?? null,
        forceStream: data.forceStream,
        extraParams: data.extraParams,
      },
      include: { provider: true },
    })
    this._log.info({ modelName: data.modelName, providerId: data.providerId }, 'LLM 模型已创建')
    return this._modelToDto(model, model.provider)
  }

  /** 更新模型（字段级部分更新）。 */
  async updateModel(modelId: string, data: UpdateModelData): Promise<ModelDto> {
    const existing = await this.aemeathDb.llmModel.findUnique({
      where: { id: modelId },
    })
    if (!existing) throw new NotFoundError(`模型不存在: ${modelId}`)

    const model = await this.aemeathDb.llmModel.update({
      where: { id: modelId },
      data: {
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        ...(data.temperature !== undefined ? { temperature: data.temperature } : {}),
        ...(data.maxTokens !== undefined ? { maxTokens: data.maxTokens } : {}),
        ...(data.forceStream !== undefined ? { forceStream: data.forceStream } : {}),
        ...(data.extraParams !== undefined ? { extraParams: data.extraParams } : {}),
      },
      include: { provider: true },
    })
    this._log.info({ modelId }, 'LLM 模型已更新')
    return this._modelToDto(model, model.provider)
  }

  /** 删除模型。 */
  async deleteModel(modelId: string): Promise<void> {
    const existing = await this.aemeathDb.llmModel.findUnique({
      where: { id: modelId },
    })
    if (!existing) throw new NotFoundError(`模型不存在: ${modelId}`)

    await this.aemeathDb.llmModel.delete({ where: { id: modelId } })
    this._log.info({ modelId }, 'LLM 模型已删除')
  }

  // 内部辅助

  private _providerToDto(provider: LlmProvider, models: LlmModel[]): ProviderDto {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      apiBase: provider.apiBase,
      apiKeyMasked: maskApiKey(provider.apiKey),
      modelCount: models.length,
    }
  }

  private _modelToDto(model: LlmModel, provider: LlmProvider): ModelDto {
    return {
      id: model.id,
      providerId: model.providerId,
      providerName: provider.name,
      modelName: model.modelName,
      displayName: model.displayName,
      temperature: model.temperature,
      maxTokens: model.maxTokens,
      forceStream: model.forceStream,
      extraParams: model.extraParams as Record<string, unknown>,
    }
  }
}

/* 生命周期注册 */

@Service({ name: 'llm_bootstrap' })
export class LlmBootstrap {
  /** 注入主数据库 */
  @Inject('db')
  db!: AemeathPrismaClient

  /** 对外暴露 LLM 服务实例 */
  @Provide('llm_service')
  llmService!: LLMService

  @Startup
  start(): void {
    this.llmService = new LLMService(this.db)
  }
}
