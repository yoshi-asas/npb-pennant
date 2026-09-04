# npb-pennant

NPB セ・パ両リーグの**優勝確率**と**優勝が決まる日**を毎日計算して公開する静的サイト。

マジックナンバーは「最悪の場合あと何勝必要か」しか教えてくれない。このサイトは残りの全日程を20,000回シミュレーションして、優勝確率と「優勝決定日の確率分布」を出す。

- 優勝確率 / CS進出確率 / 最終順位の確率分布 / 予想最終成績
- 優勝決定日の確率分布
- マジックナンバー（報道と同じ慣用値と、規定に忠実な厳密値）
- 自力優勝の可否、数学的敗退の厳密判定（最大流）
- ブラウザ内で条件を変えられる「もしも」シミュレーター

詳しい設計は [docs/SPEC.md](docs/SPEC.md)、計算方法はサイトの `/method/` ページに書いてある。

## 開発

```bash
npm install
npm run dev          # http://localhost:4321
```

## データの更新

```bash
npm run update       # scrape → verify → snapshot
```

個別に走らせる場合:

```bash
npm run scrape                    # npb.jp から試合結果を取得 → data/2026/games.json
npm run verify                    # 復元した順位表を NPB 公式と機械照合（不一致なら終了コード1）
npm run snapshot                  # 優勝確率を計算 → latest.json / snapshots/ / seed-*.json
npm run snapshot -- --iterations 100000
```

`verify` は試合数・勝敗分・対戦相手ごとの成績・交流戦成績まで NPB 公式順位表と突き合わせる。CI はこれを通らないとデータをコミットしない。

## テスト

```bash
npm test             # Vitest
npm run check        # astro check + tsc
npm run lint         # 未設定（prettier のみ: npm run format）
```

## 自動更新

`.github/workflows/daily.yml` が毎日 JST 01:00 に走る。テスト → スクレイプ → 公式との照合 → 計算 → 差分があればコミット → ビルド → GitHub Pages へデプロイ。

## データの出典

試合結果は [NPB オフィシャルサイト](https://npb.jp/)から1日1回取得している。本リポジトリは NPB とは関係のない個人プロジェクト。
