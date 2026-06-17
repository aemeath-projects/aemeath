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
        // 对象字面量属性 / 类型属性：放行
        //   覆盖 OneBot 协议字段（SDK 边界）、$queryRaw 行类型（SQL 边界）、外部 API 形状
        { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
        // import 的绑定名：放行（遵从外部模块导出名）
        { selector: 'import', format: null },
      ],
    },
  },
  {
    // 业务层禁止越过 Context 直接访问 OneBot 协议字段（snake_case）
    // 注意：selector `property.name=/_/` 匹配属性名含下划线的成员访问，是"尽力而为"的边界守卫，
    // 非类型安全级约束——无法区分 ctx.event 与其他碰巧有 .event 属性的对象，也无法完全
    // 区分 snake_case 与含下划线的 camelCase（在本代码库中实际不存在后者，风险低）。
    files: ['src/handlers/**/*.ts', 'src/services/**/*.ts', 'src/apis/**/*.ts', 'src/tasks/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.type='MemberExpression'][object.property.name='event'][property.name=/_/]",
          message:
            '业务层禁止直接访问 .event.<snake_case> 协议字段，请使用 Context 的 camelCase 访问器（如 ctx.groupId / ctx.userId）',
        },
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
    // SDK (@aemeath-projects/napcat) TypedEventEmitter 使用了 any[] 泛型约束，
    // 导致调用 .on()/.connect()/.disconnect() 时触发 no-unsafe-* 规则。
    // 这是 SDK 类型设计的限制，非业务代码错误，在此处统一豁免。
    files: [
      'src/core/bot-client.ts',
      'src/core/main.ts',
      'src/core/tasks/executor.ts',
      'src/core/utils/message-builder.ts',
      'src/core/personnel/sync.ts',
      'src/services/daily-checkin.ts',
      'src/services/like.ts',
      'src/services/feedback.ts',
      'src/handlers/drift-bottle.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
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
