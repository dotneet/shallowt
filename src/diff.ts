export type DisplaySegment = {
  id: string;
  kind: 'same' | 'added' | 'replaced' | 'deleted';
  text: string;
  originalText?: string;
};

type Operation = {
  kind: 'same' | 'insert' | 'delete';
  tokens: string[];
};

const MAX_LCS_CELLS = 4_000_000;

let cachedSegmenter: Intl.Segmenter | null | undefined;

function getSegmenter() {
  if (cachedSegmenter === undefined) {
    cachedSegmenter =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter('ja', { granularity: 'word' })
        : null;
  }
  return cachedSegmenter;
}

function tokenize(text: string) {
  const parts = text.split(/(\s+)/).filter((part) => part.length > 0);
  const segmenter = getSegmenter();

  return parts.flatMap((part) => {
    if (/^\s+$/.test(part)) {
      return [part];
    }

    if (!segmenter) {
      return Array.from(part);
    }

    return Array.from(segmenter.segment(part), (segment) => segment.segment);
  });
}

function normalizeToken(token: string) {
  return /^\s+$/.test(token) ? '\x00' : token;
}

type TokenOperation = { kind: 'same' | 'insert' | 'delete'; token: string };

function diffMiddle(
  sourceTokens: string[],
  outputTokens: string[],
  sourceKeys: string[],
  outputKeys: string[],
  operations: TokenOperation[]
) {
  const sourceLength = sourceTokens.length;
  const outputLength = outputTokens.length;

  // 大きすぎる差分は LCS を諦め、まとめて置換として扱う
  if (!sourceLength || !outputLength || sourceLength * outputLength > MAX_LCS_CELLS) {
    for (const token of sourceTokens) operations.push({ kind: 'delete', token });
    for (const token of outputTokens) operations.push({ kind: 'insert', token });
    return;
  }

  const width = outputLength + 1;
  const table = new Uint32Array((sourceLength + 1) * width);

  for (let sourceIndex = sourceLength - 1; sourceIndex >= 0; sourceIndex -= 1) {
    const row = sourceIndex * width;
    const nextRow = row + width;
    for (let outputIndex = outputLength - 1; outputIndex >= 0; outputIndex -= 1) {
      if (sourceKeys[sourceIndex] === outputKeys[outputIndex]) {
        table[row + outputIndex] = table[nextRow + outputIndex + 1] + 1;
      } else {
        const down = table[nextRow + outputIndex];
        const right = table[row + outputIndex + 1];
        table[row + outputIndex] = down > right ? down : right;
      }
    }
  }

  let sourceIndex = 0;
  let outputIndex = 0;

  while (sourceIndex < sourceLength && outputIndex < outputLength) {
    if (sourceKeys[sourceIndex] === outputKeys[outputIndex]) {
      operations.push({ kind: 'same', token: outputTokens[outputIndex] });
      sourceIndex += 1;
      outputIndex += 1;
      continue;
    }

    if (table[(sourceIndex + 1) * width + outputIndex] >= table[sourceIndex * width + outputIndex + 1]) {
      operations.push({ kind: 'delete', token: sourceTokens[sourceIndex] });
      sourceIndex += 1;
      continue;
    }

    operations.push({ kind: 'insert', token: outputTokens[outputIndex] });
    outputIndex += 1;
  }

  while (sourceIndex < sourceLength) {
    operations.push({ kind: 'delete', token: sourceTokens[sourceIndex] });
    sourceIndex += 1;
  }

  while (outputIndex < outputLength) {
    operations.push({ kind: 'insert', token: outputTokens[outputIndex] });
    outputIndex += 1;
  }
}

function groupOperations(operations: TokenOperation[]) {
  return operations.reduce<Operation[]>((groups, operation) => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.kind === operation.kind) {
      lastGroup.tokens.push(operation.token);
      return groups;
    }

    groups.push({
      kind: operation.kind,
      tokens: [operation.token]
    });
    return groups;
  }, []);
}

export function buildDisplaySegments(source: string, output: string): DisplaySegment[] {
  if (!output) {
    return [];
  }

  const sourceTokens = tokenize(source);
  const outputTokens = tokenize(output);

  if (!sourceTokens.length) {
    return [
      {
        id: 'added-all',
        kind: 'added',
        text: output
      }
    ];
  }

  const sourceKeys = sourceTokens.map(normalizeToken);
  const outputKeys = outputTokens.map(normalizeToken);

  let prefixLength = 0;
  while (
    prefixLength < sourceTokens.length &&
    prefixLength < outputTokens.length &&
    sourceKeys[prefixLength] === outputKeys[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < sourceTokens.length - prefixLength &&
    suffixLength < outputTokens.length - prefixLength &&
    sourceKeys[sourceTokens.length - 1 - suffixLength] === outputKeys[outputTokens.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const sourceEnd = sourceTokens.length - suffixLength;
  const outputEnd = outputTokens.length - suffixLength;
  const operations: TokenOperation[] = [];

  for (let index = 0; index < prefixLength; index += 1) {
    operations.push({ kind: 'same', token: outputTokens[index] });
  }

  diffMiddle(
    sourceTokens.slice(prefixLength, sourceEnd),
    outputTokens.slice(prefixLength, outputEnd),
    sourceKeys.slice(prefixLength, sourceEnd),
    outputKeys.slice(prefixLength, outputEnd),
    operations
  );

  for (let index = outputEnd; index < outputTokens.length; index += 1) {
    operations.push({ kind: 'same', token: outputTokens[index] });
  }

  const grouped = groupOperations(operations);
  const segments: DisplaySegment[] = [];

  for (let index = 0; index < grouped.length; index += 1) {
    const group = grouped[index];
    const text = group.tokens.join('');

    if (group.kind === 'same') {
      segments.push({
        id: `same-${index}`,
        kind: 'same',
        text
      });
      continue;
    }

    if (group.kind === 'delete' && grouped[index + 1]?.kind === 'insert') {
      const nextGroup = grouped[index + 1];
      segments.push({
        id: `replaced-${index}`,
        kind: 'replaced',
        text: nextGroup.tokens.join(''),
        originalText: text
      });
      index += 1;
      continue;
    }

    if (group.kind === 'delete') {
      segments.push({
        id: `deleted-${index}`,
        kind: 'deleted',
        text: '〔削除〕',
        originalText: text
      });
      continue;
    }

    segments.push({
      id: `added-${index}`,
      kind: 'added',
      text
    });
  }

  return segments;
}
