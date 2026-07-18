/**
 * LLM REST API 路由 —— Fastify 插件，挂载于 /api/llm。
 */

import { Type } from '@sinclair/typebox'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { LLMService } from './index.js'

import {
  ok,
  OkResponse,
  FailResponse,
  CreateModelSchema,
  CreateProviderSchema,
  UpdateModelSchema,
  UpdateProviderSchema,
  ProviderIdParamSchema,
  ModelIdParamSchema,
  ModelListQuerySchema,
  ProviderListDataSchema,
  ModelListDataSchema,
  LlmProviderSchema,
  LlmModelSchema,
  type CreateModelData,
  type CreateProviderData,
  type UpdateModelData,
  type UpdateProviderData,
} from '@/core/schemas/index.js'

/* 内部工具 */

function getLlmService(request: FastifyRequest): LLMService {
  return request.server.services.get('llm_service')
}

/* Fastify 插件 */

/**
 * LLM 领域 Fastify 路由插件。
 *
 * 注册于 /api/llm，提供提供商和模型的 CRUD 接口。
 */
export async function llmRoutes(fastify: FastifyInstance): Promise<void> {
  // 提供商 CRUD

  /** GET /providers — 列出所有提供商 */
  fastify.get(
    '/providers',
    {
      schema: {
        response: {
          200: OkResponse(ProviderListDataSchema),
          404: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (request, reply) => {
      const providers = await getLlmService(request).listProviders()
      await reply.send(ok(providers))
    },
  )

  /** GET /providers/:id — 获取单个提供商详情 */
  fastify.get<{ Params: { id: string } }>(
    '/providers/:id',
    {
      schema: {
        params: ProviderIdParamSchema,
        response: { 200: OkResponse(LlmProviderSchema), 404: FailResponse(), 500: FailResponse() },
      },
    },
    async (request, reply) => {
      const provider = await getLlmService(request).getProvider(request.params.id)
      await reply.send(ok(provider))
    },
  )

  /** POST /providers — 创建提供商 */
  fastify.post(
    '/providers',
    {
      schema: {
        body: CreateProviderSchema,
        response: {
          201: OkResponse(LlmProviderSchema),
          404: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (request, reply) => {
      const provider = await getLlmService(request).createProvider(
        request.body as CreateProviderData,
      )
      await reply.status(201).send(ok(provider))
    },
  )

  /** PUT /providers/:id — 更新提供商 */
  fastify.put<{ Params: { id: string } }>(
    '/providers/:id',
    {
      schema: {
        params: ProviderIdParamSchema,
        body: UpdateProviderSchema,
        response: {
          200: OkResponse(LlmProviderSchema),
          404: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (request, reply) => {
      const provider = await getLlmService(request).updateProvider(
        request.params.id,
        request.body as UpdateProviderData,
      )
      await reply.send(ok(provider))
    },
  )

  /** DELETE /providers/:id — 删除提供商 */
  fastify.delete<{ Params: { id: string } }>(
    '/providers/:id',
    {
      schema: {
        params: ProviderIdParamSchema,
        response: { 200: OkResponse(Type.Null()), 404: FailResponse(), 500: FailResponse() },
      },
    },
    async (request, reply) => {
      await getLlmService(request).deleteProvider(request.params.id)
      await reply.send(ok(null, 'Provider deleted'))
    },
  )

  // 模型 CRUD

  /** GET /models — 列出所有模型（支持按提供商筛选 ?providerId=xxx） */
  fastify.get<{ Querystring: { providerId?: string } }>(
    '/models',
    {
      schema: {
        querystring: ModelListQuerySchema,
        response: {
          200: OkResponse(ModelListDataSchema),
          404: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (request, reply) => {
      const models = await getLlmService(request).listModels(request.query.providerId)
      await reply.send(ok(models))
    },
  )

  /** GET /models/:id — 获取单个模型详情 */
  fastify.get<{ Params: { id: string } }>(
    '/models/:id',
    {
      schema: {
        params: ModelIdParamSchema,
        response: { 200: OkResponse(LlmModelSchema), 404: FailResponse(), 500: FailResponse() },
      },
    },
    async (request, reply) => {
      const model = await getLlmService(request).getModel(request.params.id)
      await reply.send(ok(model))
    },
  )

  /** POST /models — 创建模型 */
  fastify.post(
    '/models',
    {
      schema: {
        body: CreateModelSchema,
        response: {
          201: OkResponse(LlmModelSchema),
          404: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (request, reply) => {
      const model = await getLlmService(request).createModel(request.body as CreateModelData)
      await reply.status(201).send(ok(model))
    },
  )

  /** PUT /models/:id — 更新模型 */
  fastify.put<{ Params: { id: string } }>(
    '/models/:id',
    {
      schema: {
        params: ModelIdParamSchema,
        body: UpdateModelSchema,
        response: {
          200: OkResponse(LlmModelSchema),
          404: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (request, reply) => {
      const model = await getLlmService(request).updateModel(
        request.params.id,
        request.body as UpdateModelData,
      )
      await reply.send(ok(model))
    },
  )

  /** DELETE /models/:id — 删除模型 */
  fastify.delete<{ Params: { id: string } }>(
    '/models/:id',
    {
      schema: {
        params: ModelIdParamSchema,
        response: { 200: OkResponse(Type.Null()), 404: FailResponse(), 500: FailResponse() },
      },
    },
    async (request, reply) => {
      await getLlmService(request).deleteModel(request.params.id)
      await reply.send(ok(null, 'Model deleted'))
    },
  )
}
