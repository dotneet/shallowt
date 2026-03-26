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

function tokenize(text: string) {
  const parts = text.split(/(\s+)/).filter((part) => part.length > 0);
  const segmenter =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? new Intl.Segmenter('ja', { granularity: 'word' })
      : null;

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

function groupOperations(operations: Array<{ kind: 'same' | 'insert' | 'delete'; token: string }>) {
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

  const normalizeToken = (token: string) => (/^\s+$/.test(token) ? '\x00' : token);

  const table = Array.from({ length: sourceTokens.length + 1 }, () =>
    Array.from({ length: outputTokens.length + 1 }, () => 0)
  );

  for (let sourceIndex = sourceTokens.length - 1; sourceIndex >= 0; sourceIndex -= 1) {
    for (let outputIndex = outputTokens.length - 1; outputIndex >= 0; outputIndex -= 1) {
      if (normalizeToken(sourceTokens[sourceIndex]) === normalizeToken(outputTokens[outputIndex])) {
        table[sourceIndex][outputIndex] = table[sourceIndex + 1][outputIndex + 1] + 1;
      } else {
        table[sourceIndex][outputIndex] = Math.max(
          table[sourceIndex + 1][outputIndex],
          table[sourceIndex][outputIndex + 1]
        );
      }
    }
  }

  const operations: Array<{ kind: 'same' | 'insert' | 'delete'; token: string }> = [];
  let sourceIndex = 0;
  let outputIndex = 0;

  while (sourceIndex < sourceTokens.length && outputIndex < outputTokens.length) {
    if (normalizeToken(sourceTokens[sourceIndex]) === normalizeToken(outputTokens[outputIndex])) {
      operations.push({
        kind: 'same',
        token: outputTokens[outputIndex]
      });
      sourceIndex += 1;
      outputIndex += 1;
      continue;
    }

    if (table[sourceIndex + 1][outputIndex] >= table[sourceIndex][outputIndex + 1]) {
      operations.push({
        kind: 'delete',
        token: sourceTokens[sourceIndex]
      });
      sourceIndex += 1;
      continue;
    }

    operations.push({
      kind: 'insert',
      token: outputTokens[outputIndex]
    });
    outputIndex += 1;
  }

  while (sourceIndex < sourceTokens.length) {
    operations.push({
      kind: 'delete',
      token: sourceTokens[sourceIndex]
    });
    sourceIndex += 1;
  }

  while (outputIndex < outputTokens.length) {
    operations.push({
      kind: 'insert',
      token: outputTokens[outputIndex]
    });
    outputIndex += 1;
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
