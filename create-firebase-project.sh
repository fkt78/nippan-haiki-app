#!/bin/bash
# Firebaseプロジェクト作成スクリプト

echo "Firebaseコンソールで新しいプロジェクトを作成してください:"
echo "1. https://console.firebase.google.com/ にアクセス"
echo "2. 'プロジェクトを追加'をクリック"
echo "3. プロジェクト名: 'nippan-haiki-app'"
echo "4. プロジェクトID: 'nippan-haiki-app-xxxxx' (一意のID)"
echo ""
echo "プロジェクト作成後、以下のコマンドを実行:"
echo "  firebase use <新しいプロジェクトID>"
echo "  npm run build"
echo "  firebase deploy --only hosting"
