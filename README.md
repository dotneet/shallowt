# Kousei

DeepL Write 風の Mac 向け校正アプリです。Electron 上で常駐し、グローバルショートカットから選択中テキストを取得して、設定した LLM で校正します。

## できること

- 常駐起動してグローバルショートカットから校正を実行
- 3 ペイン UI で原文 / 校正結果 / 設定を同時表示
- OpenAI 互換 API / Anthropic / Ollama のモデルプロファイル切り替え
- カスタムルール保存
- 必要に応じて校正結果の自動貼り戻し

## セットアップ

```bash
npm install
npm run dev
```

## 使い方

1. 設定ペインで使いたいモデルの API Key や endpoint を設定します。
2. 他のアプリで文章を選択します。
3. `CommandOrControl+Shift+K` で選択中テキストを校正します。
4. 必要なら `結果を貼り戻す` を押して元のアプリに戻します。

## macOS 権限

選択テキストの取得と貼り戻しには `System Events` を使うため、macOS のアクセシビリティ許可が必要です。

## ビルド

```bash
npm run build
```
