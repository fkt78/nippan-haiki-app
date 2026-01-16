#!/bin/bash
# Firebase Hosting デプロイスクリプト

echo "=========================================="
echo "Firebase Hosting デプロイスクリプト"
echo "=========================================="
echo ""

# プロジェクトIDの確認
CURRENT_PROJECT=$(firebase use 2>&1 | grep "Now using" | awk '{print $4}' || echo "")
echo "現在のプロジェクト: $CURRENT_PROJECT"
echo ""

# 新しいプロジェクトIDの入力
read -p "新しいプロジェクトIDを入力してください (例: nippan-haiki-app-xxxxx): " NEW_PROJECT_ID

if [ -z "$NEW_PROJECT_ID" ]; then
    echo "エラー: プロジェクトIDが入力されていません"
    exit 1
fi

echo ""
echo "プロジェクトを切り替え中..."
firebase use "$NEW_PROJECT_ID"

if [ $? -ne 0 ]; then
    echo "エラー: プロジェクトの切り替えに失敗しました"
    echo "Firebaseコンソールでプロジェクトが作成されているか確認してください"
    exit 1
fi

echo ""
echo "ビルド中..."
npm run build

if [ $? -ne 0 ]; then
    echo "エラー: ビルドに失敗しました"
    exit 1
fi

echo ""
echo "デプロイ中..."
firebase deploy --only hosting

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "デプロイが完了しました！"
    echo "URL: https://${NEW_PROJECT_ID}.web.app"
    echo "=========================================="
else
    echo "エラー: デプロイに失敗しました"
    exit 1
fi
