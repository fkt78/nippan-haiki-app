# Firebase Hosting デプロイ手順（アプリ名付きURL）

## 現在のデプロイ状況

✅ 既存プロジェクト「hattyuu-kanri-app-test」にデプロイ済み
- URL: https://hattyuu-kanri-app-test.web.app

## アプリ名をURLに含める方法

### 方法1: Firebaseコンソールで新しいプロジェクトを作成（推奨）

1. Firebaseコンソールにアクセス: https://console.firebase.google.com/
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: 「nippan-haiki-app」）
4. プロジェクトIDを確認（自動生成されますが、編集可能）
   - プロジェクトIDに「nippan-haiki-app」を含めるように設定
   - 例: `nippan-haiki-app-fkt` または `nippan-haiki-app-2025`
5. プロジェクトを作成
6. Hostingを有効化
7. 以下のコマンドで新しいプロジェクトに切り替えてデプロイ:

```bash
# 新しいプロジェクトを使用
firebase use <新しいプロジェクトID>

# デプロイ
npm run build
firebase deploy --only hosting
```

### 方法2: 既存プロジェクトでカスタムドメインを設定

1. Firebaseコンソールで「hattyuu-kanri-app-test」プロジェクトを開く
2. Hosting > カスタムドメイン
3. カスタムドメインを追加（例: `nippan-haiki-app.web.app`）
   - 注意: `.web.app`ドメインはFirebaseが自動生成するため、完全にカスタムドメインを設定する場合は独自ドメインが必要です

## 現在の設定ファイル

- `firebase.json`: Hosting設定済み
- `package.json`: ビルドスクリプト設定済み
- `.gitignore`: 適切に設定済み

## デプロイコマンド

```bash
# ビルド
npm run build

# デプロイ
firebase deploy --only hosting
```
