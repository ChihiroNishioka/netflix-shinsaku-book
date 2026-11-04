# Netflix新作集

Netflix の日本向け新作を、本のようにめくって選べる静的サイトです。Vite と JavaScript/CSS で作り、API キーやログインは使いません。

```sh
npm ci
npm run dev
```

幅と画面比率に応じて1ページと見開きを切り替えます。次へ・前へ、左右矢印、スワイプ、目次から移動できます。表紙の封蝋は公開済みデータの読み直しです。データの収集は実行しません。画像を押すと Netflix の作品ページを開きます。

## 検証

```sh
npm run lint
npm test
npm run build
npx playwright install --with-deps chromium webkit
npm run test:e2e
npm run check:pii
```

単体テストは論理ページ、スキーマ、データ取得、しおり、秘密と個人情報、workflow を検証します。Playwright は保存したデータと画像だけで動き、外部通信を遮断します。390px と見開きのスクリーンショットは `docs/screenshots/` に保存します。

`check:pii` は管理ファイル、未追跡の対象ファイル、生成済み `dist/` を検査し、検出した値を出力しません。CI はさらに gitleaks 8.30.0 のバイナリを SHA-256 で確認し、全履歴と生成物を検査します。検出用の秘密・個人情報はテストで分割して組み立て、ファイルには記録しません。

## データ更新

```sh
npm run build:data
```

日本時間の当月を対象に、[Netflix 公式の配信予定](https://about.netflix.com/ja/new-to-watch)と各作品の公開ページから収集します。取得できない場合の扱いと日本配信を確認できない予備データの表示は [実装の判断](docs/decisions.md) を参照してください。出典、取得日時、状態は `public/data.json` に保存します。あらすじや作品は作りません。

## CI と公開

`ci.yml` は pull request と main への push で lint、単体テスト、ビルド、Playwright、秘密と個人情報の検査を実行します。ブラウザテストの失敗時はレポートを artifact に保存します。

`publish.yml` は main への push、毎日日本時間6時、手動実行でデータを更新し、検証済み `dist/` を `gh-pages` ブランチに公開します。`.nojekyll` と `data.json` の検証を push より先に行い、どれかが失敗すると公開しません。認証は `GITHUB_TOKEN`、権限は `contents: write` のみです。

リポジトリの Settings → Pages で Source を **Deploy from a branch**、Branch を **gh-pages / (root)** に設定してください。初回は workflow の実行後にブランチを選択します。

公開したら `https://chihironishioka.github.io/netflix-shinsaku-book/` を開き、HTML、`assets/` の JS/CSS、`data.json` が200で取得でき、更新日時と作品数が生成物に一致することを確認します。この作業中は push・公開を実行していません。

iPhone のユニバーサルリンクは、Netflix アプリをインストールした実機 Safari で画像を押し、アプリ内の同じ作品が開くことを確認してください。Playwright はリンクの URL、`target`、`rel`、遷移試行を保証します。アプリ起動は実機確認が必要です。

差分と画面をレビューし、マージはちひろの OK を得てから行います。
