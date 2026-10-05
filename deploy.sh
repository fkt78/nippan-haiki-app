#!/bin/bash
# 日販廃棄アプリ デプロイスクリプト
# 使い方: bash deploy.sh
# デプロイ先: Firebaseプロジェクト hattyuu-kanri-app-test / Hostingサイト nippan-haiki-app
#            https://nippan-haiki-app.web.app

set -e
cd "$(dirname "$0")"

PROJECT_ID="hattyuu-kanri-app-test"
HOSTING_TARGET="nippan-haiki-app"

echo "ビルド中..."
npm run build

echo ""
echo "デプロイ中... (${PROJECT_ID} / ${HOSTING_TARGET})"
# Hostingのみデプロイする。Firestoreルール等には触れない
firebase deploy --only "hosting:${HOSTING_TARGET}" --project "${PROJECT_ID}"

echo ""
echo "デプロイが完了しました: https://${HOSTING_TARGET}.web.app"
