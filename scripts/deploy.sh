#!/bin/bash
set -euo pipefail

echo "=== Portfolio Manager 部署脚本 ==="
cd "$(dirname "$0")/.."

echo "[1/4] 拉取最新代码..."
git pull

echo "[2/4] 安装依赖..."
pnpm install --frozen-lockfile

echo "[3/4] 类型检查..."
pnpm typecheck

echo "[4/4] 重启调度器..."
pm2 startOrReload ecosystem.config.js --update-env

echo "=== 部署完成 ==="
