# ShallowT Write

DeepL Write 風の macOS 向け校正アプリです。Electron 上で常駐し、グローバルショートカットから選択中テキストを取得して、設定した LLM で校正します。

## できること

- メニューバー常駐でグローバルショートカットから校正を実行
- 3 ペイン UI で入力 / 校正結果 / 実行条件を同時表示
- 校正結果の差分表示と、内容矛盾・事実誤りの確認表示
- OpenAI compatible / Anthropic / Ollama の組み込みモデル切り替え
- カスタムモデル追加、API キー管理、ルールセット編集
- 校正履歴の保存と再読み込み

## セットアップ

```bash
bun install
bun run dev
```

`bun` を利用します。

## 使い方

1. 設定ペインで使いたいモデル、API キー、ルールセットを設定します。
2. 他のアプリで文章を選択します。
3. デフォルトの `Command+Shift+K` で選択中テキストを校正します。
4. 必要に応じて結果をコピーして元のアプリに貼り付けます。

デフォルトでは `Command+Shift+L` でウィンドウを再表示できます。ショートカットはアプリ内から変更できます。

## macOS 権限

選択テキストの取得には `System Events` を使うため、macOS のアクセシビリティ許可が必要です。

## ビルド

```bash
bun run build
```

ビルドが完了すると、`dist/` 配下に macOS 向けの配布物が生成されます。

- `dist/*.dmg`: インストーラー形式のディスクイメージ
- `dist/mac-*/ShallowT Write.app`: アプリ本体

`dmg` を開いてアプリを `Applications` に移動するか、生成された `.app` をそのまま `Applications` へコピーしてインストールできます。
