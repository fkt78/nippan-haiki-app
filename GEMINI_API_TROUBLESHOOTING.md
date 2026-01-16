# Gemini API エラー対策ガイド

## 🔴 現在のエラー状況

すべてのGeminiモデル（`gemini-pro`, `gemini-1.5-pro`, `gemini-1.5-flash-latest`）が404エラーを返しています。

## 📋 エラーの原因

### 主な原因（可能性の高い順）

1. **APIキーが無効または権限不足**
   - APIキーが正しく生成されていない
   - APIキーが無効化されている
   - APIキーに必要な権限が付与されていない

2. **Gemini APIが有効化されていない**
   - Google Cloudプロジェクトで「Generative Language API」が有効化されていない

3. **請求（Billing）設定が未完了**
   - プロジェクトに請求アカウントが紐づいていない
   - 無料枠でも請求設定は必要

4. **APIキーの制限設定**
   - IPアドレス制限やHTTPリファラー制限が設定されている
   - アプリケーションのドメインが許可されていない

5. **モデル名またはエンドポイントの誤り**
   - 使用しているモデル名が存在しない、または廃止されている
   - APIバージョン（v1/v1beta）がモデルに対応していない

## ✅ こちらで実施した対策

1. **利用可能なモデルを自動検出**
   - `ListModels` APIを呼び出して、実際に利用可能なモデルを確認
   - 利用可能なモデルを自動的に使用

2. **複数のAPIバージョンとモデルを試行**
   - `v1` と `v1beta` の両方を試行
   - 複数のモデル名のパターンを試行

3. **詳細なエラーメッセージの表示**
   - エラー発生時に原因と対処方法を表示

## 🔧 あなたが確認・実施すべきこと

### ステップ1: Google Cloud ConsoleでAPIの有効化を確認

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを選択（APIキーが作成されたプロジェクト）
3. 左メニューから「APIとサービス」>「有効なAPI」を選択
4. 「Generative Language API」または「Generative AI API」が有効か確認
5. 無効な場合は「APIを有効にする」をクリック

### ステップ2: 請求（Billing）設定を確認

1. Google Cloud Consoleで「請求」を選択
2. プロジェクトに請求アカウントが紐づいているか確認
3. 紐づいていない場合は、請求アカウントをリンク
   - 無料枠でも請求アカウントの登録が必要です

### ステップ3: APIキーの再生成と確認

1. Google Cloud Consoleで「APIとサービス」>「認証情報」を選択
2. 現在のAPIキーを確認
3. 必要に応じて新しいAPIキーを作成
4. APIキーの制限設定を確認：
   - 「アプリケーションの制限」が「なし」または適切に設定されているか
   - 「APIの制限」で「Generative Language API」が許可されているか

### ステップ4: IAMロールの確認

1. Google Cloud Consoleで「IAMと管理」>「IAM」を選択
2. APIキーが作成されたサービスアカウントまたはユーザーを確認
3. 以下のロールが付与されているか確認：
   - `roles/aiplatform.user`
   - `roles/serviceusage.serviceUsageConsumer`

### ステップ5: 新しいAPIキーを設定

1. 新しいAPIキーを取得したら、`.env`ファイルを更新：
   ```
   VITE_GEMINI_API_KEY=新しいAPIキー
   ```
2. 開発サーバーを再起動
3. ブラウザをリロード

## 🧪 テスト方法

修正後、ブラウザのコンソール（F12）で以下を確認：

1. **「利用可能なモデル: [...]」** というメッセージが表示されるか
2. **「✅ Successfully used: v1/models/...」** というメッセージが表示されるか
3. エラーメッセージが詳細になっているか

## 📞 追加のサポートが必要な場合

以下の情報を共有していただければ、さらに詳しく診断できます：

1. Google Cloud Consoleのスクリーンショット（API有効化状態、請求設定）
2. ブラウザコンソールの完全なエラーメッセージ
3. APIキーの制限設定の内容

## 🔗 参考リンク

- [Gemini API ドキュメント](https://ai.google.dev/gemini-api/docs)
- [APIキーの作成方法](https://ai.google.dev/gemini-api/docs/api-key)
- [トラブルシューティングガイド](https://ai.google.dev/gemini-api/docs/troubleshooting)
