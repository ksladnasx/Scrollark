import type { ParsedMarkdown } from '../domain/types';

const headingPattern = /^(#{1,6})\s+(.+)\s*$/;

function cleanTitle(raw: string) {
  return raw.replace(/[#*_`>\[\]]/g, '').trim() || '未命名';
}

export function parseMarkdownToCards(markdown: string, fallbackTitle: string): ParsedMarkdown {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  let h1 = cleanTitle(fallbackTitle.replace(/\.md$/i, ''));
  let h2 = '未分组';
  let active: { h1: string; h2: string; h3: string; title: string; lines: string[] } | null = null;
  const cards: ParsedMarkdown['cards'] = [];

  const flush = () => {
    if (!active) return;
    const content = active.lines.join('\n').trim();
    if (!content && !active.title) {
      active = null;
      return;
    }
    cards.push({
      h1: active.h1,
      h2: active.h2,
      h3: active.h3,
      title: active.title,
      content: content || `### ${active.title}`,
      sortOrder: cards.length,
    });
    active = null;
  };

  let inFence = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      active?.lines.push(line);
      continue;
    }

    if (!inFence) {
      const match = line.match(headingPattern);
      if (match) {
        const level = match[1].length;
        const title = cleanTitle(match[2]);
        if (level === 1) {
          flush();
          h1 = title;
          h2 = '未分组';
          continue;
        }
        if (level === 2) {
          flush();
          h2 = title;
          continue;
        }
        if (level === 3) {
          flush();
          active = { h1, h2, h3: title, title, lines: [] };
          continue;
        }
      }
    }

    if (active) active.lines.push(line);
  }
  flush();

  if (cards.length === 0) {
    const title = cleanTitle(fallbackTitle.replace(/\.md$/i, ''));
    cards.push({ h1: title, h2: '全文', h3: title, title, content: normalized.trim() || '# 空文档', sortOrder: 0 });
  }

  return { title: h1, cards };
}

export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; header: string[]; rows: string[][] };

function isTableSeparator(line: string) {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const cells = splitTableRow(trimmed);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function isTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.includes('|') && splitTableRow(trimmed).length >= 2;
}

function splitTableRow(line: string) {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function isBlockStarter(line: string, nextLine?: string) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('```') ||
    line.match(headingPattern) ||
    trimmed.startsWith('>') ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    (nextLine ? isTableRow(line) && isTableSeparator(nextLine) : false)
  );
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      continue;
    }

    const nextLine = lines[index + 1];
    if (nextLine && isTableRow(line) && isTableSeparator(nextLine)) {
      const header = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const heading = line.match(headingPattern);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quotes: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quotes.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: quotes.join('\n') });
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim();
        if (!(/^[-*+]\s+/.test(item) || /^\d+\.\s+/.test(item))) break;
        items.push(item.replace(/^([-*+]|\d+\.)\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      const currentTrimmed = current.trim();
      if (!currentTrimmed) break;
      if (isBlockStarter(current, lines[index + 1])) break;
      paragraph.push(currentTrimmed);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}
