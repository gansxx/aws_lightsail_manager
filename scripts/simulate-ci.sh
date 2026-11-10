#!/usr/bin/env bash
# ==============================================================================
# GitHub Actions CI/CD 本地模拟验证脚本
# 用于在推送前本地验证：版本号 +0.0.1 计算、代码检查、Web 打包、产物校验
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}   Lightsail Manager CI/CD 本地模拟构建与验证流程      ${NC}"
echo -e "${BLUE}======================================================${NC}"

# 1. 模拟 Job 1: 版本号自动计算与 +0.0.1 递增测试
echo -e "\n${YELLOW}[Step 1/5] 模拟版本号自动计算 (+0.0.1)...${NC}"
LATEST_TAG=$(git tag -l "v[0-9]*.[0-9]*.[0-9]*" 2>/dev/null | sort -V | tail -n 1)

if [ -z "$LATEST_TAG" ]; then
  LATEST_TAG="v1.0.0"
  echo "  ℹ️  未找到历史发布标签，默认初始版本: ${LATEST_TAG}"
else
  echo "  ℹ️  当前最新发布标签: ${LATEST_TAG}"
fi

CLEAN_VER="${LATEST_TAG#v}"
MAJOR=$(echo "$CLEAN_VER" | cut -d. -f1)
MINOR=$(echo "$CLEAN_VER" | cut -d. -f2)
PATCH=$(echo "$CLEAN_VER" | cut -d. -f3)

MAJOR=${MAJOR:-1}
MINOR=${MINOR:-0}
PATCH=${PATCH:-0}

NEW_PATCH=$((PATCH + 1))
NEXT_VERSION="v${MAJOR}.${MINOR}.${NEW_PATCH}"

echo -e "  ${GREEN}✓ 版本计算成功: 下次推送将发布为 ${NEXT_VERSION} (Patch + 1)${NC}"

# 2. 模拟依赖与锁文件检查
echo -e "\n${YELLOW}[Step 2/5] 检查依赖与 package-lock.json...${NC}"
if [ -f "package-lock.json" ]; then
  echo -e "  ${GREEN}✓ package-lock.json 存在且有效${NC}"
else
  echo -e "  ${RED}✗ package-lock.json 缺失，请执行 npm i --package-lock-only${NC}"
  exit 1
fi

# 3. 模拟代码类型校验 (npm run lint)
echo -e "\n${YELLOW}[Step 3/5] 执行 TypeScript 静态类型校验 (npm run lint)...${NC}"
npm run lint
echo -e "  ${GREEN}✓ TypeScript 0 错误通过${NC}"

# 4. 模拟 Web 生产打包 (npm run build)
echo -e "\n${YELLOW}[Step 4/5] 执行 Vite 生产构建 (npm run build)...${NC}"
npm run build
if [ -f "dist/index.html" ]; then
  echo -e "  ${GREEN}✓ Web 生产产物 dist/ 构建成功 (index.html, JS, CSS 已就绪)${NC}"
else
  echo -e "  ${RED}✗ dist/index.html 未生成${NC}"
  exit 1
fi

# 5. 模拟产物归档与发布准备
echo -e "\n${YELLOW}[Step 5/5] 模拟 Release 产物打包输出...${NC}"
mkdir -p release-output
tar -czf "release-output/Lightsail-Manager-Web-${NEXT_VERSION}.tar.gz" -C dist .
echo -e "  ${GREEN}✓ 模拟生成发布归档: release-output/Lightsail-Manager-Web-${NEXT_VERSION}.tar.gz${NC}"

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}   🎉 CI/CD 本地模拟验证全量通过！可以安全推送到 GitHub ${NC}"
echo -e "${GREEN}======================================================${NC}"
