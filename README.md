# 家計簿：LIFFとGAS

`Hqzuki/liffformapp` 専用プロジェクトです。`liffforapps`（個人カケーボ）とは別に管理します。

## 構成

| パス | 内容 |
| --- | --- |
| `index.html` | 既存のLIFF画面。公開パスと接続先URLは変更していません |
| `src/コード.js` | 今回のスプレッドシートを使用するGAS「カケーボ」 |
| `src/appsscript.json` | GASマニフェスト |
| `.clasp.example.json` | 接続設定のひな形 |

対象スプレッドシート：<https://docs.google.com/spreadsheets/d/1QfdthujdSmMt165FOmp0gX3TGLiZx9zhOtclPV3J4jk/edit>

## 最初に：スクリプトプロパティへの移行

**初回の `npm run push` より先に、GAS側の登録関数を実行してください。**

1. GAS「カケーボ」のエディタで `initializeScriptProperties()` を1回実行します。
   この移行作業では既存ソースへ登録関数を追加し、実行済みです。以下の4項目を登録します。
   既存のプロパティは上書きしません。実行ログに値は出力しません。
2. プロジェクト設定の「スクリプトプロパティ」に4項目があることを確認します。
3. `npm run push` で、このリポジトリのソースを反映します。
   トークン等の直書きと移行用関数は、この段階でソースから除かれます。
4. 公開Web APIにも適用する場合は、**使用中の既存デプロイ**を新しいバージョンへ更新します。
   新規デプロイや既存デプロイの削除は不要です。

| プロパティ | 用途 |
| --- | --- |
| `ACCESS_TOKEN` | LINEチャネルアクセストークン |
| `SHEET_ID` | スプレッドシートID |
| `USER_A` | LINE通知先A |
| `USER_B` | LINE通知先B |

通知先を設定しない場合も、対応するプロパティは空文字で登録してください。

登録関数は移行後のソースから削除済みです。今回のソース反映は公開デプロイの更新を伴いません。
スクリプトプロパティは同じGASプロジェクトのデプロイ間で使用します。
過去の公開バージョンの直書き値は、リポジトリへの移行だけでは削除されません。

## ローカル開発

1. `npm ci` でツールをインストールします。
2. 初めて取得した環境では、`.clasp.example.json` を `.clasp.json` にコピーして対象GASのIDを設定します。
3. `npm run login` でGoogleへログインします。
4. `npm run status` で反映対象を確認します。送信対象は `src/` 内のGASファイルだけです。

Googleログイン情報は既存プロジェクトからコピーしていません。必要に応じて `npm run login` を実行してください。
`.local/`、`.clasprc.json`、`.clasp.json`、`node_modules/` はGit管理の対象外です。

## 反映先

- LIFF画面：このリポジトリの従来のWeb公開手順で反映します。
- GASソース：`npm run push` で反映します。
- GAS Webアプリ：必要時に使用中のデプロイを更新します。LIFFとLINEに設定されたURLを維持してください。

GitHubへのpushだけではGASのソースや公開デプロイは更新されません。
