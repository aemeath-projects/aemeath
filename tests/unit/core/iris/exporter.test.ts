import { describe, expect, it, vi } from 'vitest'

import type { IrisPrismaClient } from '@/core/db/index.js'
import { IrisExporter } from '@/core/iris/exporter.js'

// parquet-wasm 和文件 I/O 在单元测试中 mock 掉
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 1024 }),
}))
vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue(Buffer.alloc(0)),
  createReadStream: vi.fn().mockReturnValue({
    on: vi.fn().mockImplementation(function (
      this: { on: unknown },
      event: string,
      cb: (chunk?: Buffer) => void,
    ) {
      if (event === 'end')
        setTimeout(() => {
          cb()
        }, 0)
      return this
    }),
  }),
}))
vi.mock('parquet-wasm/esm', () => ({
  initSync: vi.fn(),
  Table: { fromIPCStream: vi.fn().mockReturnValue({}) },
  WriterPropertiesBuilder: class {
    setCompression() {
      return this
    }
    build() {
      return {}
    }
  },
  writeParquet: vi.fn().mockReturnValue(new Uint8Array(512)),
  Compression: { ZSTD: 0, GZIP: 1, UNCOMPRESSED: 2 },
}))
vi.mock('apache-arrow', () => ({
  tableFromArrays: vi.fn().mockReturnValue({}),
  tableToIPC: vi.fn().mockReturnValue(new Uint8Array(0)),
}))

function makeMockDb(rows: unknown[] = []) {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue(rows),
  } as unknown as IrisPrismaClient
}

describe('IrisExporter.exportGroup', () => {
  it('无数据时 totalRows 为 0，返回 maxExportedId = 0n', async () => {
    const db = makeMockDb([])
    const exporter = new IrisExporter(db, {
      retentionMonths: 6,
      batchSize: 100,
      compression: 'zstd',
    })

    const [totalRows, , , , maxId] = await exporter.exportGroup(
      '123',
      new Date('2024-01-01Z'),
      new Date('2024-07-01Z'),
      '/tmp/test.parquet',
    )

    expect(totalRows).toBe(0)
    expect(maxId).toBe(0n)
  })

  it('有数据时应调用 $queryRawUnsafe 进行分批查询', async () => {
    const fakeRow = {
      id: 1n,

      created_at: new Date('2024-03-01Z'),

      message_id: 10n,

      message_type: 2,

      group_id: '123',

      user_id: '456',

      raw_message: 'hello',
      segments: [],

      sender_nickname: 'user',

      sender_card: null,

      sender_role: null,

      stored_at: new Date(),
    }
    // batchSize=1：第一批返回 1 条（满批，hasMore=true），第二批返回空（终止）
    const db = {
      $queryRawUnsafe: vi.fn().mockResolvedValueOnce([fakeRow]).mockResolvedValueOnce([]),
    } as unknown as IrisPrismaClient

    const exporter = new IrisExporter(db, {
      retentionMonths: 6,
      batchSize: 1, // 1 行恰好等于 batchSize，hasMore=true，触发第二次查询
      compression: 'zstd',
    })

    const [totalRows, , , , maxId] = await exporter.exportGroup(
      '123',
      new Date('2024-01-01Z'),
      new Date('2024-07-01Z'),
      '/tmp/test.parquet',
    )

    expect(totalRows).toBe(1)
    expect(maxId).toBe(1n)
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(2)
  })
})
