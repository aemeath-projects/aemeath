#!/bin/sh
set -e

cmd="${1:-main}"
shift 2>/dev/null || true

case "$cmd" in
  main)
    exec node dist/core/main.js "$@"
    ;;
  worker)
    exec node dist/worker.js "$@"
    ;;
  *)
    echo "Error: unknown command '$cmd'" >&2
    echo "Valid commands: main, worker" >&2
    exit 1
    ;;
esac
