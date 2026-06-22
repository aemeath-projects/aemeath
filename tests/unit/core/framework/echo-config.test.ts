// tests/unit/core/framework/echo-config.test.ts
import { defineConfig, normalizeEchoDirConfig } from '@aemeath-projects/exostrider/echo'
import { describe, it, expect } from 'vitest'

describe('EchoConfig', () => {
  it('defineConfig 透传配置', () => {
    const config = defineConfig({
      echoes: {
        handler: 'src/handlers',
        service: 'src/services',
        task: 'src/tasks',
        route: 'src/apis',
      },
    })
    expect(config.echoes.handler).toBe('src/handlers')
  })

  it('normalizeEchoDirConfig 处理 string 简写', () => {
    const result = normalizeEchoDirConfig('src/handlers')
    expect(result).toEqual({ dir: 'src/handlers' })
  })

  it('normalizeEchoDirConfig 处理完整配置', () => {
    const result = normalizeEchoDirConfig({ dir: 'src/apis', exclude: ['**/schemas/**'] })
    expect(result).toEqual({ dir: 'src/apis', exclude: ['**/schemas/**'] })
  })
})
