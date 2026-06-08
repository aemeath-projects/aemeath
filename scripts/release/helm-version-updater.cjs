/** 用于 commit-and-tag-version 的 Helm Chart.yaml 版本更新器 */

module.exports.readVersion = function (contents) {
  const match = contents.match(/^version:\s*(.+)$/m)
  return match ? match[1].trim() : '0.0.0'
}

module.exports.writeVersion = function (contents, version) {
  return contents
    .replace(/^version:\s*.+$/m, `version: ${version}`)
    .replace(/^appVersion:\s*".+"$/m, `appVersion: "${version}"`)
}
