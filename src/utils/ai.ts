import type { AiApiStyle, Settings } from '../domain/types';

// AI 文档转换服务：用户自带 API Key（OpenAI Compatible），请求直接从设备发往
// 用户配置的服务商，不经过任何自有后端。导入文件时可选地把 Markdown / 纯文本 /
// PDF 等内容交给 AI 解析整理成标准 Markdown，再交给现有解析器生成卡片。
// 接口模式：chat = Chat Completions（/v1/chat/completions）；responses = Responses
// API（/v1/responses，即 wire_api = "responses" 的中转站）；auto 先 chat 后 responses。

export type AiConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  apiStyle: AiApiStyle;
};

// 交给 AI 的文档来源：文本直接作为消息内容；pdf / word 等二进制文档以 base64
// 文件内容块发送（OpenAI file 内容块 / input_file，部分网关用 image_url 承载）。
export type AiDocumentSource = { type: 'text'; text: string } | { type: 'document'; fileName: string; base64: string; mimeType: string };

// 单次 AI 转换的文本长度上限（字符数）。文件 3MB 大小限制不代表 AI 上下文限制，
// 超长文本无法一次性放进模型上下文，提前给出可操作的提示比等服务商报错更友好。
export const AI_TEXT_LIMIT_CHARS = 50_000;

// 单次请求的总时长预算（含一次纠偏重试）。整理长文档耗时明显，放宽到 3 分钟。
const AI_REQUEST_TIMEOUT_MS = 180_000;

// 错误详情截断长度：错误弹窗里展示的原始返回内容上限，避免极端响应撑爆内存。
const ERROR_DETAIL_MAX_CHARS = 4000;

// 带原始返回详情的错误：上层弹出详细错误窗（报错 + AI 原始内容），便于定位
// 中转站返回格式差异等问题。
export class AiServiceError extends Error {
  readonly detail: string;

  constructor(message: string, detail = '') {
    super(message);
    this.detail = detail;
  }
}

export function getAiConfig(settings: Settings): AiConfig {
  return {
    baseUrl: settings.aiBaseUrl.trim().replace(/\/+$/, ''),
    apiKey: settings.aiApiKey.trim(),
    model: settings.aiModel.trim(),
    apiStyle: settings.aiApiStyle,
  };
}

export function isAiConfigured(config: AiConfig): boolean {
  return config.baseUrl !== '' && config.apiKey !== '' && config.model !== '';
}

export const AI_SETUP_HINT = '在「设置 → AI 设置」中填写 OpenAI 兼容的 API Base URL、API Key 与模型名称。';

export const AI_FEATURE_HINT =
  '软件默认按 # / ## / ### 标题层级解析知识卡片。开启后，导入的文件会先交给 AI 解析整理成符合该层级的标准 Markdown，再进行解析。';

// 判断 Markdown 文本是否已符合标准结构：至少要有一处三级标题（### 是划分知识
// 卡片的必要条件）。代码块内的 # 不是标题，扫描时按围栏状态跳过，与
// parseMarkdownToCards 的行为一致。
export function isStandardMarkdownStructure(markdown: string): boolean {
  let inFence = false;
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^###\s+\S/.test(line)) return true;
  }
  return false;
}

// AI 只做「解析整理」，不直接生成卡片数据；最终输出必须是可直接解析的纯 Markdown。
const AI_NORMALIZE_SYSTEM_PROMPT = [
  '你是一个文档解析与结构化助手。',
  '',
  '用户会提供一份文档，可能是 Markdown、纯文本，也可能是 PDF 等格式的文件内容。你的任务是解析这份文档，并把其中的内容整理转换为符合目标知识卡片系统规范的标准 Markdown 后返回。',
  '',
  '目标 Markdown 结构：',
  '',
  '# 文档名称',
  '',
  '## 卡片分组',
  '',
  '### 卡片名称',
  '',
  '卡片正文',
  '',
  '### 卡片名称',
  '',
  '卡片正文',
  '',
  '## 另一个卡片分组',
  '',
  '### 卡片名称',
  '',
  '卡片正文',
  '',
  '规则：',
  '1. # 一级标题表示整个文档名称，不生成知识卡片。',
  '2. ## 二级标题表示知识卡片分组，不直接生成知识卡片。',
  '3. ### 三级标题表示一张独立的知识卡片。',
  '4. 每一个 ### 标题都必须对应一张知识卡片。',
  '5. ### 后面的正文内容属于当前卡片，直到出现下一个 #、## 或 ### 标题。',
  '6. 如果原文没有明确的分组，可以根据内容合理创建 ## 分组。',
  '7. 如果原文没有明确的卡片标题，需要根据对应内容总结生成合适的 ### 标题。',
  '8. 保留原文的核心信息，不得凭空添加原文不存在的事实。',
  '9. 可以对内容进行合理的结构化、归类、拆分和标题优化。',
  '10. 最终输出必须是纯 Markdown 文本，不要输出 JSON 或其他结构化数据。',
  '11. 不要输出解释、分析过程、代码块围栏或其他额外内容。',
  '12. 确保输出的 Markdown 可以直接被按照 # / ## / ### 规则解析成知识卡片。',
  '',
  '请直接输出转换后的标准 Markdown。',
].join('\n');

// Base URL 尾部已带版本段（/v1 等）时不再补全；否则裸域名先试 /v1 路径再试根路径。
function hasVersionPath(baseUrl: string): boolean {
  return /\/(v\d+[a-z]*|api|openai)$/i.test(baseUrl);
}

function endpointCandidates(baseUrl: string, path: string): string[] {
  return hasVersionPath(baseUrl) ? [`${baseUrl}${path}`] : [`${baseUrl}/v1${path}`, `${baseUrl}${path}`];
}

type ApiStyle = 'chat' | 'responses' | 'anthropic';
type ApiEndpoint = { url: string; style: ApiStyle };

// 依接口模式规划候选端点（裸域名先试 /v1 路径再试根路径）。仅当失败属于
// 「路径不存在」（404 / 网页兜底）时才换下一个候选；鉴权、余额等错误直接上报。
function planEndpoints(config: AiConfig): ApiEndpoint[] {
  const path = config.apiStyle === 'chat' ? '/chat/completions' : config.apiStyle === 'anthropic' ? '/messages' : '/responses';
  return endpointCandidates(config.baseUrl, path).map((url) => ({ url, style: config.apiStyle }));
}

// Anthropic Messages 需要 x-api-key + anthropic-version 头；其余模式走 Bearer 即可。
function buildRequestHeaders(config: AiConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` };
  if (config.apiStyle === 'anthropic') {
    headers['x-api-key'] = config.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }
  return headers;
}

// 拉取服务商可用模型列表（GET /models，与接口模式无关）。服务不支持该接口时抛错，
// 由调用方提示用户手动填写模型名称。
export async function fetchAiModels(config: AiConfig): Promise<string[]> {
  const candidates = endpointCandidates(config.baseUrl, '/models');
  let lastStatus = 0;
  let lastRawText = '';
  for (let index = 0; index < candidates.length; index += 1) {
    const response = await requestAi(candidates[index], {
      method: 'GET',
      headers: buildRequestHeaders(config),
    });
    const rawText = await response.text();
    lastStatus = response.status;
    lastRawText = rawText;
    if ((response.status === 404 || looksLikeHtml(rawText)) && index < candidates.length - 1) continue;
    if (!response.ok) {
      throw describeHttpError(response.status, readProviderErrorMessage(parseJsonBody(rawText)), rawText);
    }
    if (looksLikeHtml(rawText)) throw htmlResponseError(rawText);
    const payload = parseJsonBody(rawText);
    const ids = Array.isArray(payload?.data)
      ? payload.data.map((item: { id?: unknown }) => (typeof item?.id === 'string' ? item.id : '')).filter((id: string) => id !== '')
      : [];
    if (ids.length === 0) {
      throw new AiServiceError('服务未返回可用模型列表，请手动填写模型名称。', rawText.slice(0, ERROR_DETAIL_MAX_CHARS));
    }
    return [...new Set(ids as string[])].sort((a, b) => a.localeCompare(b));
  }
  if (looksLikeHtml(lastRawText)) throw htmlResponseError(lastRawText);
  throw describeHttpError(lastStatus, readProviderErrorMessage(parseJsonBody(lastRawText)), lastRawText);
}

// 把用户文档交给 AI 解析整理成标准结构。首次返回不合规范时追加纠偏指令重试一次，
// 仍不合格则报错（不把可疑结果送进解析器）。PDF 依次尝试两种承载格式：
// OpenAI 官方 file 内容块 → image_url 数据 URL（Gemini 兼容层等网关的惯例）。
// options.signal 供导入弹窗的「取消导入」中断请求（丢弃返回内容）。
export async function normalizeMarkdownWithAi(config: AiConfig, source: AiDocumentSource, options?: { signal?: AbortSignal }): Promise<string> {
  if (source.type === 'text' && source.text.length > AI_TEXT_LIMIT_CHARS) {
    throw new AiServiceError(`文档约 ${source.text.length} 字，超出单次 AI 转换能力（上限 ${AI_TEXT_LIMIT_CHARS} 字）。请拆分后分别导入，或关闭 AI 手动整理。`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  const externalSignal = options?.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', onExternalAbort);
  // signal 被中止时区分两种来源：用户取消（丢弃结果，上层静默）与超时（提示重试）。
  const abortError = () => (externalSignal?.aborted ? new AiServiceError('请求已取消。') : new AiServiceError('AI 请求超时，请检查网络后重试。'));
  try {
    let lastOutput = '';
    // PDF 双格式兜底：记住第一次成功的承载格式，纠偏重试时只走该格式。
    let formatIndex = -1;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (controller.signal.aborted) throw abortError();
      const allContents = buildUserContents(source, attempt > 0);
      const candidates = formatIndex >= 0 ? [allContents[Math.min(formatIndex, allContents.length - 1)]] : allContents;
      let gotResponse = false;
      let lastThrown: unknown = null;
      for (let index = 0; index < candidates.length; index += 1) {
        if (controller.signal.aborted) throw abortError();
        try {
          const output = await requestCompletion(config, candidates[index], controller.signal);
          lastOutput = output;
          gotResponse = true;
          if (formatIndex < 0) formatIndex = index;
          const cleaned = stripOuterCodeFence(output);
          if (isStandardMarkdownStructure(cleaned)) return cleaned;
          break; // 拿到了回复但结构不合格 → 交给下一轮纠偏重试，不再换格式
        } catch (error) {
          if (controller.signal.aborted) throw abortError();
          lastThrown = error;
        }
      }
      if (!gotResponse) throw lastThrown instanceof Error ? lastThrown : new AiServiceError('AI 请求失败。');
    }
    throw new AiServiceError('AI 返回的内容不符合标准 Markdown 结构，已停止导入。可重试，或关闭 AI 后手动整理文档。', lastOutput.slice(0, ERROR_DETAIL_MAX_CHARS));
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

// 组装候选用户消息：文本直接作为字符串；文档优先用 OpenAI file 内容块（base64
// data URL），失败后换 image_url 数据 URL（部分兼容网关以此承载文档），并附任务说明。
function buildUserContents(source: AiDocumentSource, corrective: boolean): (string | ContentPart[])[] {
  if (source.type === 'text') {
    return [
      corrective
        ? `${source.text}\n\n（注意：你上一次的输出不符合标准结构，没有用 ### 划分出知识卡片。请严格使用 #、##、### 三级标题重新组织，并直接输出完整 Markdown。）`
        : source.text,
    ];
  }
  const dataUrl = `data:${source.mimeType};base64,${source.base64}`;
  const instruction = corrective
    ? '你上一次的输出不符合标准结构。请重新解析这份文档，严格使用 #、##、### 三级标题组织内容，并直接输出完整 Markdown。'
    : '请解析这份文档，并整理为符合规范的标准 Markdown。';
  return [
    [{ type: 'file', file: { filename: source.fileName, file_data: dataUrl } }, { type: 'text', text: instruction }],
    [{ type: 'image_url', image_url: { url: dataUrl } }, { type: 'text', text: instruction }],
  ];
}

type ContentPart =
  | { type: 'file'; file: { filename: string; file_data: string } }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'text'; text: string };

// AI 偶尔会用 ``` 围栏包住整段输出，剥掉外壳避免污染解析结果。
function stripOuterCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9]*\s*\n([\s\S]*?)\n?```$/);
  return (fenced ? fenced[1] : trimmed).trim();
}

// 按接口模式组装请求体。Chat Completions：system 放 messages；Responses：system
// 放 instructions，文本可为字符串，PDF 用 input_file 内容块（image_url 兜底格式
// 映射为 input_image）；Anthropic Messages：system 放 system 字段，max_tokens 必填。
function buildRequestBody(config: AiConfig, style: ApiStyle, userContent: string | ContentPart[]): Record<string, unknown> {
  if (style === 'chat') {
    return {
      model: config.model,
      temperature: 0.2,
      stream: false,
      messages: [
        { role: 'system', content: AI_NORMALIZE_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    };
  }
  if (style === 'anthropic') {
    return {
      model: config.model,
      max_tokens: 8192,
      stream: false,
      system: AI_NORMALIZE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: typeof userContent === 'string' ? userContent : anthropicContentParts(userContent) }],
    };
  }
  if (typeof userContent === 'string') {
    return { model: config.model, stream: false, instructions: AI_NORMALIZE_SYSTEM_PROMPT, input: userContent };
  }
  const parts = userContent.map((part) => {
    if (part.type === 'file') return { type: 'input_file', filename: part.file.filename, file_data: part.file.file_data };
    if (part.type === 'image_url') return { type: 'input_image', image_url: part.image_url.url };
    return { type: 'input_text', text: part.text };
  });
  return {
    model: config.model,
    stream: false,
    instructions: AI_NORMALIZE_SYSTEM_PROMPT,
    input: [{ role: 'user', content: parts }],
  };
}

// 从 data URL 中拆出 mime 与 base64 数据（Anthropic 的 document/image 块需要分开传）。
function parseDataUrl(dataUrl: string): { mime: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  return match ? { mime: match[1], data: match[2] } : null;
}

function anthropicContentParts(userContent: ContentPart[]) {
  return userContent.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    const dataUrl = part.type === 'file' ? part.file.file_data : part.image_url.url;
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return { type: 'text', text: '（附件解析失败）' };
    if (parsed.mime.startsWith('image/')) {
      return { type: 'image', source: { type: 'base64', media_type: parsed.mime, data: parsed.data } };
    }
    return { type: 'document', source: { type: 'base64', media_type: parsed.mime, data: parsed.data } };
  });
}

// 请求对话补全：依候选端点顺序尝试，拿到可解析文本即返回。
async function requestCompletion(config: AiConfig, userContent: string | ContentPart[], signal: AbortSignal): Promise<string> {
  const endpoints = planEndpoints(config);
  let lastStatus = 0;
  let lastRawText = '';
  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index];
    const response = await requestAi(endpoint.url, {
      method: 'POST',
      headers: buildRequestHeaders(config),
      body: JSON.stringify(buildRequestBody(config, endpoint.style, userContent)),
      signal,
    });
    const rawText = await response.text();
    lastStatus = response.status;
    lastRawText = rawText;
    // 404 或网页兜底说明该端点路径不存在，换下一个候选；其余错误直接上报。
    if ((response.status === 404 || looksLikeHtml(rawText)) && index < endpoints.length - 1) continue;
    if (!response.ok) {
      throw describeHttpError(response.status, readProviderErrorMessage(parseJsonBody(rawText)), rawText);
    }
    if (looksLikeHtml(rawText)) throw htmlResponseError(rawText);
    const payload = parseJsonBody(rawText);
    const content =
      endpoint.style === 'responses'
        ? extractResponsesContent(payload) || extractSseContent(rawText)
        : endpoint.style === 'anthropic'
          ? extractAnthropicContent(payload) || extractMessageContent(payload)
          : extractMessageContent(payload) || extractSseContent(rawText);
    if (content === '') {
      throw new AiServiceError('AI 服务返回了无法解析的内容，请检查模型名称与接口格式。', rawText.slice(0, ERROR_DETAIL_MAX_CHARS));
    }
    return content;
  }
  if (looksLikeHtml(lastRawText)) throw htmlResponseError(lastRawText);
  throw describeHttpError(lastStatus, readProviderErrorMessage(parseJsonBody(lastRawText)), lastRawText);
}

async function requestAi(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    if (init.signal?.aborted) throw new Error('AI 请求已取消。');
    throw new Error('无法连接 AI 服务，请检查网络与 API Base URL。');
  }
  return response;
}

// 识别"返回的是网页"：中转站首页多为 SPA，Base URL 指向网页地址时接口路径会
// 命中网页兜底，返回 200 + HTML，前端按 JSON 解析必然失败。
function looksLikeHtml(rawText: string): boolean {
  const head = rawText.trim().slice(0, 200).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

function extractHtmlTitle(rawText: string): string {
  const match = rawText.match(/<title[^>]*>([^<]{0,120})<\/title>/i);
  return match ? match[1].trim() : '';
}

function htmlResponseError(rawText: string): AiServiceError {
  const title = extractHtmlTitle(rawText);
  return new AiServiceError(
    `服务返回的是网页而不是 API 数据${title ? `（页面标题：${title}）` : ''}。请确认你填入的是 Base URL（API 根地址）而不是完整端点：如果你的服务商接口以 /v1 路径开头，请在 Base URL 尾部加上 /v1（例如 https://api.example.com/v1）后重试。`,
    rawText.slice(0, ERROR_DETAIL_MAX_CHARS),
  );
}

function parseJsonBody(rawText: string): any {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

// 从 chat completions 响应里提取文本：兼容 content 为字符串、内容分块数组
//（{type:'text', text} 等）、legacy 的 choices[0].text 与 output_text 字段。
function extractMessageContent(payload: any): string {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const message = choice?.message ?? choice?.delta;
  const candidates = [message?.content, choice?.text, payload?.output_text, typeof payload?.content === 'string' ? payload.content : ''];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
    if (Array.isArray(candidate)) {
      const joined = joinContentParts(candidate);
      if (joined.trim() !== '') return joined;
    }
  }
  return '';
}

// 从 Responses API 响应里提取文本：优先 output_text 聚合字段，其次遍历
// output[].content[] 收集 output_text 分块；个别网关套旧壳时退回 chat 解析。
function extractResponsesContent(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim() !== '') return payload.output_text;
  if (Array.isArray(payload?.output)) {
    const chunks: string[] = [];
    for (const item of payload.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const part of item.content) {
        if (typeof part?.text === 'string') chunks.push(part.text);
      }
    }
    const joined = chunks.join('');
    if (joined.trim() !== '') return joined;
  }
  return extractMessageContent(payload);
}

// 从 Anthropic Messages 响应里提取文本：content[] 中的 text 分块按序拼接。
function extractAnthropicContent(payload: any): string {
  if (Array.isArray(payload?.content)) {
    const joined = payload.content.map((part: { text?: unknown }) => (typeof part?.text === 'string' ? part.text : '')).join('');
    if (joined.trim() !== '') return joined;
  }
  return '';
}

function joinContentParts(parts: unknown[]): string {
  return parts
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') return (part as { text: string }).text;
      return '';
    })
    .join('');
}

// 个别网关忽略 stream:false，按 SSE 增量流返回：把 data: 行逐段拼回完整文本。
function extractSseContent(rawText: string): string {
  if (!rawText.includes('data:')) return '';
  const chunks: string[] = [];
  for (const line of rawText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (data === '' || data === '[DONE]') continue;
    const payload = parseJsonBody(data);
    if (!payload) continue;
    const piece = payload?.choices?.[0]?.delta?.content ?? payload?.choices?.[0]?.message?.content;
    if (typeof piece === 'string') chunks.push(piece);
    else if (Array.isArray(piece)) chunks.push(joinContentParts(piece));
  }
  return chunks.join('').trim();
}

function readProviderErrorMessage(payload: any): string {
  const message = payload?.error?.message ?? payload?.message;
  if (typeof message !== 'string' || message.trim() === '') return '';
  return message.trim().slice(0, 200);
}

function describeHttpError(status: number, providerMessage: string, rawText: string): AiServiceError {
  const detail = (providerMessage || rawText.trim()).slice(0, ERROR_DETAIL_MAX_CHARS);
  const suffix = providerMessage ? `\n服务返回：${providerMessage}` : '';
  // 错误状态码也可能伴随网页兜底（WAF 拦截页等），此时"网页地址"提示最贴近真相。
  if (looksLikeHtml(rawText)) return htmlResponseError(rawText);
  if (status === 401 || status === 403) return new AiServiceError(`API Key 无效或没有访问权限（HTTP ${status}）。${suffix}`, detail);
  if (status === 402) return new AiServiceError(`账户余额不足（HTTP 402），请充值后重试。${suffix}`, detail);
  if (status === 404) return new AiServiceError(`接口路径不存在（HTTP 404）。请检查 Base URL（一般以 /v1 结尾）与「接口模式」设置：若服务商仅支持 Responses API，请把接口模式切到 Responses。${suffix}`, detail);
  if (status === 413) return new AiServiceError(`文件或内容过大，服务拒绝接收（HTTP 413）。请尝试更小的文件。${suffix}`, detail);
  if (status === 429) return new AiServiceError(`请求过于频繁或配额已用尽（HTTP 429），请稍后重试。${suffix}`, detail);
  if (status >= 500) return new AiServiceError(`AI 服务暂时不可用（HTTP ${status}），请稍后重试。${suffix}`, detail);
  return new AiServiceError(`AI 请求失败（HTTP ${status}）。${suffix}`, detail);
}
