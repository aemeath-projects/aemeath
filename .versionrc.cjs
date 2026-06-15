/** commit-and-tag-version 配置：以根 package.json 为版本基准，同步更新前端和 Helm。 */

module.exports = {
  /** 版本来源：以根 package.json 为唯一基准。 */
  packageFiles: [{ filename: 'package.json', type: 'json' }],

  /** 同步写入版本号的文件列表 */
  bumpFiles: [
    { filename: 'package.json', type: 'json' },
    { filename: 'frontend/package.json', type: 'json' },
    { filename: 'helm/aemeath/Chart.yaml', updater: 'scripts/release/helm-version-updater.cjs' },
  ],

  /** 每次 bump 自动更新 CHANGELOG.md */
  changelog: true,
  infile: 'CHANGELOG.md',
  header: '# Changelog\n\n所有版本变更记录，遵循 [Conventional Commits](https://conventionalcommits.org/) 规范。\n',

  /** 提交时将所有 bumpFiles 及 CHANGELOG.md 的变更一并包含 */
  commitAll: true,

  /** 提交消息格式 */
  releaseCommitMessageFormat: 'chore(release): v{{currentTag}}',

  /** Tag 前缀 */
  tagPrefix: 'v',

  /** Conventional Commits 类型映射，控制 CHANGELOG 中显示的分类 */
  types: [
    { type: 'feat', section: '新功能' },
    { type: 'fix', section: 'Bug 修复' },
    { type: 'perf', section: '性能优化' },
    { type: 'refactor', section: '重构' },
    { type: 'docs', section: '文档' },
    { type: 'style', section: '代码风格', hidden: true },
    { type: 'test', section: '测试', hidden: true },
    { type: 'chore', section: '杂项', hidden: true },
    { type: 'ci', section: 'CI/CD', hidden: true },
  ],
}
