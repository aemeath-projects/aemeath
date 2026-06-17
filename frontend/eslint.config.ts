import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    name: 'app/vuetify-overrides',
    rules: {
      'vue/valid-v-slot': ['error', { allowModifiers: true }],
    },
  },

  {
    name: 'app/naming-convention',
    files: ['**/*.{ts,mts,tsx,vue}'],
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
        // 解构变量：放行（来自 API 响应 / 外部对象）
        { selector: 'variable', modifiers: ['destructured'], format: null },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'function', format: ['camelCase', 'PascalCase'], leadingUnderscore: 'allow' },
        // 类/接口/类型别名/枚举：PascalCase
        { selector: 'typeLike', format: ['PascalCase'] },
        // 枚举成员：放行（Prisma 等外部枚举值映射）
        { selector: 'enumMember', format: null },
        // 对象字面量属性 / 类型属性：放行
        //   覆盖 API 响应字段、defineProps 类型属性、Pinia $patch 等场景
        { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
        // import 的绑定名：放行（遵从外部模块导出名）
        { selector: 'import', format: null },
      ],
    },
  },

  {
    name: 'app/tests-overrides',
    files: ['tests/**/*.{ts,vue}'],
    rules: {
      // 测试目录关闭 naming-convention，允许测试辅助函数、mock 变量使用非标准命名
      '@typescript-eslint/naming-convention': 'off',
    },
  },

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  skipFormatting,
)
