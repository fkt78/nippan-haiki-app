# デプロイ手順

## デプロイ先

| 項目 | 値 |
|---|---|
| Firebaseプロジェクト | `hattyuu-kanri-app-test` |
| Hostingサイト（ターゲット） | `nippan-haiki-app` |
| 公開URL | https://nippan-haiki-app.web.app |

`hattyuu-kanri-app-test` は他のアプリと共用のプロジェクトです。このアプリがデプロイするのは **Hostingの `nippan-haiki-app` サイトだけ**です。Firestoreのルールや他のサイトには触れません。

## 手順

1. `package.json` の `version` を上げる（画面左下の「v◯.◯.◯」に表示されます）
2. 変更をコミットして `main` にプッシュする
3. デプロイする

```bash
bash deploy.sh
```

`deploy.sh` は次の2つを順に実行します。

```bash
npm run build
firebase deploy --only hosting:nippan-haiki-app --project hattyuu-kanri-app-test
```

## 反映の確認

- https://nippan-haiki-app.web.app を再読み込みし、左下のバージョンと「デプロイ」の日時が新しくなっていることを確認する
- 開いたままの端末は再読み込みするまで古い版のままです

## 前提

- `firebase-tools` でログイン済みであること（`firebase login:list` で確認）
- AI分析でGeminiを使う場合のみ、ビルド前に `.env` に `VITE_GEMINI_API_KEY` を設定する（未設定なら簡易分析モードで動作）
