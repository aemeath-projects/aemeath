import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'

// eslint-disable-next-line @typescript-eslint/no-deprecated
export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'frontend/',
      'prisma/*/generated/',
      'docs/',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['prisma/*/prisma.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: { 'import-x': importPlugin },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [
            { pattern: '#prisma/**', group: 'external', position: 'after' },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
      'import-x/no-duplicates': 'error',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        // 默认：camelCase，允许前导下划线（私有）
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
        // 变量：允许 camelCase / UPPER_CASE（模块常量）/ PascalCase（类/组件赋值）
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        // 解构变量：放行（来自 SDK 事件 / $queryRaw 行 / 外部对象）
        { selector: 'variable', modifiers: ['destructured'], format: null },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'function', format: ['camelCase', 'PascalCase'], leadingUnderscore: 'allow' },
        // 类/接口/类型别名/枚举：PascalCase
        { selector: 'typeLike', format: ['PascalCase'] },
        // 枚举成员：放行（Prisma 等外部枚举值映射）
        { selector: 'enumMember', format: null },
        // 对象字面量属性 / 类型属性：
        //   camelCase — 业务字段默认格式；
        //   PascalCase — Fastify 路由 schema 固定键（Params / Querystring / Body / Reply）；
        //   UPPER_CASE — @SettingNode enumOptions 的选项键（如 { ANYONE: 0, GROUP_ADMIN: 20 }）
        //   数字属性名（HTTP 状态码如 200/400/500）通过 filter 放行
        {
          selector: ['objectLiteralProperty', 'typeProperty'],
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          filter: { regex: '^[0-9]', match: false },
        },
        // 数字属性名（如 HTTP 状态码 200/400/500）：放行
        {
          selector: ['objectLiteralProperty', 'typeProperty'],
          format: null,
          filter: { regex: '^[0-9]', match: true },
        },
        // import 的绑定名：放行（遵从外部模块导出名）
        { selector: 'import', format: null },
      ],
    },
  },
  {
    files: ['*.config.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
    },
  },
  {
    // SQL/DB 边界：$queryRaw 行类型与 Parquet 归档列名为 snake_case 数据契约，放行 property 命名
    files: [
      'src/core/chat/exporter.ts',
      'src/core/chat/archive.ts',
      'src/services/checkin.ts',
      'src/services/drift-bottle.ts',
    ],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
      ],
    },
  },
  {
    // 框架协议契约豁免 —— 以下文件含有 snake_case 标识符，均属外部协议/框架约定，非我们自定义命名：
    //
    // DI 容器注入 key（如 'chat_db', 'msg_api', 'bot_client'）：
    //   生命周期 DI 容器约定 snake_case key，文档明确规定（src/core/lifecycle/types.ts、main.ts、worker.ts）
    //
    // BullMQ 队列/任务名（如 'daily_checkin', 'chat_archive'）：
    //   持久化到 Redis 的 topic 名，变更会导致已入队任务丢失（apis/queue.ts、tasks/daily-checkin.ts）
    //
    // HTTP 协议头 / MIME 类型常量（如 'Content-Type', 'image/png'）：
    //   HTTP 协议约定格式，含 '-' 和 '/'，不属于 JS 标识符命名（core/chat/media.ts）
    //
    // Prisma $queryRaw 返回行类型（如 value_type, group_id）：
    //   $queryRaw 直接映射数据库列名（snake_case），类型声明须与列名一致（core/settings/query.ts）
    //
    // Prisma 复合唯一键 / settings 点分 key（如 'userId_groupId', 'bot.enabled'）：
    //   ORM compound key 和 settings key 均为持久化字符串契约（personnel/events.ts、personnel/index.ts、settings/service.ts）
    files: [
      'src/core/lifecycle.ts',
      'src/core/main.ts',
      'src/core/worker.ts',
      'src/apis/queue.ts',
      'src/core/chat/media.ts',
      'src/core/personnel/events.ts',
      'src/core/personnel/index.ts',
      'src/core/settings/query.ts',
      'src/core/settings/service.ts',
      'src/tasks/daily-checkin.ts',
    ],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
      ],
    },
  },
  {
    // Prisma.sql / Prisma.join 为生成代码导出，ESLint TypeScript 服务无法推断其模板标签类型
    files: ['src/core/settings/service.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/handlers/*', '@/services/*', '@/tasks/*', '@/apis/*'],
              message: 'core 目录禁止导入外部业务模块',
            },
          ],
        },
      ],
    },
  },
  prettier,
)
