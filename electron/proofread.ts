import type { AppSettings, ModelProfile, ProofreadResponse, VerificationIssue } from './types';
import { getActiveRuleSetNames, getActiveRules } from './rules';

type RawVerificationIssue = {
  severity?: unknown;
  title?: unknown;
  detail?: unknown;
  sourceQuote?: unknown;
};

type StructuredProofreadPayload = {
  proofreadText?: unknown;
  output?: unknown;
  verification?: unknown;
};

function buildPrompt(source: string, settings: AppSettings) {
  const activeRuleSetNames = getActiveRuleSetNames(settings);
  const rules = getActiveRules(settings).length
    ? getActiveRules(settings).map((rule, index) => `${index + 1}. ${rule}`).join('\n')
    : 'なし';

  return `${settings.systemPrompt}

以下のルールセットを有効化しています: ${activeRuleSetNames.join(', ') || 'なし'}
以下のルールに従って校正してください。
${rules}

あなたの役割は2つです。
1. 原文を校正して、意味を変えずに読みやすくする
2. 原文に明らかな内容上の誤り、矛盾、主張の衝突、時系列破綻がある場合だけ検出して説明する

出力条件:
- 必ずJSONオブジェクト1つだけを返す
- Markdownのコードフェンスや前置きは不要
- JSONの形式は次のとおり
{
  "proofreadText": "校正後の本文",
  "verification": [
    {
      "severity": "warning または issue",
      "title": "問題の短い見出し",
      "detail": "何が明らかにおかしいかの説明",
      "sourceQuote": "該当箇所の抜粋"
    }
  ]
}
- verification は問題がない場合は空配列にする
- 推測レベルの違和感や好みの問題は verification に含めない
- proofreadText には校正後の本文だけを入れる

原文:
${source}`;
}

function extractJsonString(raw: string) {
  const trimmed = raw.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function normalizeVerificationIssues(value: unknown): VerificationIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const issue = item as RawVerificationIssue;
      if (typeof issue.title !== 'string' || typeof issue.detail !== 'string') {
        return null;
      }

      const severity: VerificationIssue['severity'] = issue.severity === 'issue' ? 'issue' : 'warning';
      return {
        id: `verification-${index + 1}`,
        severity,
        title: issue.title.trim(),
        detail: issue.detail.trim(),
        sourceQuote: typeof issue.sourceQuote === 'string' ? issue.sourceQuote.trim() : undefined
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function parseStructuredResponse(raw: string) {
  const jsonCandidate = extractJsonString(raw);

  try {
    const parsed = JSON.parse(jsonCandidate) as StructuredProofreadPayload;
    const proofreadText =
      typeof parsed.proofreadText === 'string'
        ? parsed.proofreadText.trim()
        : typeof parsed.output === 'string'
          ? parsed.output.trim()
          : '';

    if (!proofreadText) {
      return {
        output: raw.trim(),
        verification: []
      };
    }

    return {
      output: proofreadText,
      verification: normalizeVerificationIssues(parsed.verification)
    };
  } catch {
    return {
      output: raw.trim(),
      verification: []
    };
  }
}

function resolveApiKey(model: ModelProfile, settings: AppSettings): string {
  return model.apiKey || settings.providerApiKeys?.[model.provider] || '';
}

async function callOpenAICompatible(model: ModelProfile, apiKey: string, prompt: string) {
  const response = await fetch(model.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model.model,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI compatible API error: ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}

async function callAnthropic(model: ModelProfile, apiKey: string, prompt: string) {
  const response = await fetch(model.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model.model,
      max_tokens: 2048,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return json.content?.find((item) => item.type === 'text')?.text?.trim() ?? '';
}

async function callOllama(model: ModelProfile, prompt: string) {
  const response = await fetch(model.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model.model,
      stream: false,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as {
    message?: { content?: string };
  };
  return json.message?.content?.trim() ?? '';
}

export async function proofreadText(source: string, settings: AppSettings): Promise<ProofreadResponse> {
  const model = settings.models.find((item) => item.id === settings.activeModelId);

  if (!model) {
    throw new Error('選択中のLLM設定が見つかりません。');
  }

  const apiKey = resolveApiKey(model, settings);
  const prompt = buildPrompt(source, settings);
  let rawOutput = '';

  switch (model.provider) {
    case 'openai-compatible':
      rawOutput = await callOpenAICompatible(model, apiKey, prompt);
      break;
    case 'anthropic':
      rawOutput = await callAnthropic(model, apiKey, prompt);
      break;
    case 'ollama':
      rawOutput = await callOllama(model, prompt);
      break;
    default:
      throw new Error(`未対応のプロバイダです: ${String(model.provider)}`);
  }

  const parsedResponse = parseStructuredResponse(rawOutput);

  const output = parsedResponse.output;
  if (!output) {
    throw new Error('校正結果が空でした。');
  }

  return {
    output,
    modelName: model.name,
    promptPreview: prompt,
    verification: parsedResponse.verification
  };
}
