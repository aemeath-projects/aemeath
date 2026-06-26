#!/usr/bin/env bash
# 从 CHANGELOG.md 提取指定版本的发布说明，写入临时文件并输出路径。
# 用法：VERSION_TAG=v1.2.3 bash scripts/release/extract-changelog.sh
set -euo pipefail

VERSION_TAG="${VERSION_TAG:?需要设置 VERSION_TAG 环境变量}"
NOTES_FILE="${NOTES_FILE:-/tmp/release_notes.txt}"

if [ -f "CHANGELOG.md" ]; then
  # 提取对应版本段落：从 "## vX.Y.Z" 行开始，到下一个 "## " 或文件末尾
  awk "/^## ${VERSION_TAG}[[:space:]]*/,/^## [^${VERSION_TAG}]/" CHANGELOG.md \
    | tail -n +2 \
    | sed '/^## /d' \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
    > "$NOTES_FILE"
  if [ ! -s "$NOTES_FILE" ]; then
    echo "未在 CHANGELOG.md 中找到 ${VERSION_TAG} 的条目" > "$NOTES_FILE"
  fi
else
  echo "未找到 CHANGELOG.md" > "$NOTES_FILE"
fi

echo "notes_file=${NOTES_FILE}"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "notes_file=${NOTES_FILE}" >> "$GITHUB_OUTPUT"
fi
