# 共有家計簿

`Hqzuki/liffformapp` 専用プロジェクトです。ローカルのフォルダ名は `kakeibo-shared` です。個人用の `liffforapps` とは別に管理します。

## 構成

| パス | 内容 |
| --- | --- |
| `index.html` | 既存のLIFF画面。公開パスと接続先URLは変更していません |
| `src/コード.js` | 今回のスプレッドシートを使用するGAS「カケーボ」 |
| `src/appsscript.json` | GASマニフェスト |
| `.clasp.example.json` | 接続設定のひな形 |

対象スプレッドシート：<https://docs.google.com/spreadsheets/d/1QfdthujdSmMt165FOmp0gX3TGLiZx9zhOtclPV3J4jk/edit>

## スクリプトプロパティ

接続設定はスクリプトプロパティへ移行済みです。新しいGASへ導入する場合は、次の4項目をプロジェクト設定から登録してください。

| プロパティ | 用途 |
| --- | --- |
| `ACCESS_TOKEN` | LINEチャネルアクセストークン |
| `SHEET_ID` | スプレッドシートID |
| `USER_A` | LINE通知先A |
| `USER_B` | LINE通知先B |

通知先を設定しない場合も、対応するプロパティは空文字で登録してください。

移行用の登録関数は削除済みです。
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

## シート整理

- 登録内容は1回の書き込みで保存し、登録後に日付順へ並べ替えます。
- 実行時点の当月より前の行を、費目・日付では分けず連続範囲ごとにグループ化します。
- 過去のグループは初期状態で折りたたみ、「＋」で開くことができます。当月・翌月以降は表示に残します。
- 既存の時間トリガー用の関数名 `sortAndHideBeforeThisMonth` は維持しています。
- LINEの「確認」は従来どおり、今年の年シートから当月の各費目を「余り」行まで返します。
