import { describe, expect, test } from 'bun:test';
import { buildDisplaySegments, type DisplaySegment } from '../src/diff';

function reconstructOutput(segments: DisplaySegment[]) {
  return segments
    .filter((segment) => segment.kind !== 'deleted')
    .map((segment) => segment.text)
    .join('');
}

function reconstructSource(segments: DisplaySegment[]) {
  return segments
    .map((segment) => (segment.kind === 'added' ? '' : segment.originalText ?? segment.text))
    .join('');
}

function expectUniqueIds(segments: DisplaySegment[]) {
  expect(new Set(segments.map((segment) => segment.id)).size).toBe(segments.length);
}

describe('buildDisplaySegments', () => {
  test('出力が空なら空配列を返す', () => {
    expect(buildDisplaySegments('元の文章', '')).toEqual([]);
  });

  test('原文が空なら出力全体を追加として扱う', () => {
    expect(buildDisplaySegments('', '新しい文章')).toEqual([
      { id: 'added-all', kind: 'added', text: '新しい文章' }
    ]);
  });

  test('同一テキストは単一の same セグメントになる', () => {
    const text = '今日は良い天気です。\n明日も晴れるでしょう。';
    const segments = buildDisplaySegments(text, text);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ kind: 'same', text });
  });

  test('日本語の単語置換は replaced になり originalText を持つ', () => {
    const segments = buildDisplaySegments('私は学生です。', '私は先生です。');
    const replaced = segments.filter((segment) => segment.kind === 'replaced');
    expect(replaced).toHaveLength(1);
    expect(replaced[0].text).toContain('先');
    expect(replaced[0].originalText).toContain('学');
    expect(segments.every((segment) => segment.kind === 'same' || segment.kind === 'replaced')).toBe(true);
    expect(reconstructOutput(segments)).toBe('私は先生です。');
  });

  test('削除のみの変更は deleted になり〔削除〕を表示する', () => {
    const segments = buildDisplaySegments('今日はとても良い天気です。', '今日は良い天気です。');
    const deleted = segments.filter((segment) => segment.kind === 'deleted');
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatchObject({ text: '〔削除〕', originalText: 'とても' });
    expect(segments.some((segment) => segment.kind === 'added' || segment.kind === 'replaced')).toBe(false);
    expect(reconstructOutput(segments)).toBe('今日は良い天気です。');
  });

  test('挿入のみの変更は added になる', () => {
    const segments = buildDisplaySegments('今日は良い天気です。', '今日はとても良い天気です。');
    const added = segments.filter((segment) => segment.kind === 'added');
    expect(added).toHaveLength(1);
    expect(added[0].text).toBe('とても');
    expect(segments.some((segment) => segment.kind === 'deleted' || segment.kind === 'replaced')).toBe(false);
  });

  test('空白の種類だけの違いは same として扱う', () => {
    const segments = buildDisplaySegments('a  b\nc\t d', 'a b c d');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ kind: 'same', text: 'a b c d' });
  });

  test('deleted 以外のテキストを連結すると出力が、原文側を連結すると原文が再現される', () => {
    const cases: Array<[string, string]> = [
      ['私は学生です。', '私は先生です。'],
      ['今日はとても良い天気です。', '今日は良い天気です。'],
      ['', 'abc'],
      ['abc', 'abc def'],
      ['The quick brown fox', 'A quick red fox jumps'],
      ['一文目。\n\n二文目です。三文目。', '一文目です。\n二文目。\n三文目を追加。'],
      ['重複 重複 重複', '重複 重複'],
      ['  前後に空白  ', '前後に空白'],
      ['これは長い文章です。しかし、少し冗長です。', 'これは長い文章です。ただし、やや冗長です。'],
      ['abc', 'xyz']
    ];

    for (const [source, output] of cases) {
      const segments = buildDisplaySegments(source, output);
      expect(reconstructOutput(segments)).toBe(output);
      expectUniqueIds(segments);
      if (source) {
        // 空白は正規化されて比較されるため、空白を除いて原文と照合する
        expect(reconstructSource(segments).replace(/\s+/g, '')).toBe(source.replace(/\s+/g, ''));
      }
    }
  });

  test('長いテキストの中央だけが変わる場合も高速に処理できる', () => {
    const base = Array.from({ length: 1500 }, (_, index) => `第${index}文は本日の校正対象です。`).join('');
    const middle = Math.floor(base.length / 2);
    const source = base;
    const output = `${base.slice(0, middle)}追加された一文。${base.slice(middle)}`;
    expect(source.length).toBeGreaterThan(20000);

    const startedAt = performance.now();
    const segments = buildDisplaySegments(source, output);
    const elapsed = performance.now() - startedAt;

    expect(elapsed).toBeLessThan(2000);
    expect(reconstructOutput(segments)).toBe(output);
    expect(segments.filter((segment) => segment.kind !== 'same').length).toBeGreaterThan(0);
    expect(segments.filter((segment) => segment.kind !== 'same').length).toBeLessThanOrEqual(2);
    expectUniqueIds(segments);
  });

  test('差分の中央部分が巨大な場合は一つの replaced にまとめる', () => {
    const source = Array.from({ length: 2500 }, (_, index) => `src${index}`).join(' ');
    const output = Array.from({ length: 2500 }, (_, index) => `out${index}`).join(' ');

    const startedAt = performance.now();
    const segments = buildDisplaySegments(source, output);
    const elapsed = performance.now() - startedAt;

    expect(elapsed).toBeLessThan(2000);
    expect(segments).toEqual([
      { id: 'replaced-0', kind: 'replaced', text: output, originalText: source }
    ]);
  });

  test('巨大な差分でも共通の前後は same として残る', () => {
    const head = '共通の書き出し。\n';
    const tail = '\n共通の締めくくり。';
    const sourceBody = Array.from({ length: 2500 }, (_, index) => `src${index}`).join(' ');
    const outputBody = Array.from({ length: 2500 }, (_, index) => `out${index}`).join(' ');
    const segments = buildDisplaySegments(`${head}${sourceBody}${tail}`, `${head}${outputBody}${tail}`);

    expect(segments.map((segment) => segment.kind)).toEqual(['same', 'replaced', 'same']);
    expect(reconstructOutput(segments)).toBe(`${head}${outputBody}${tail}`);
  });
});
