import React from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius } from '../theme/tokens';
import { parseMarkdownBlocks } from '../utils/markdown';

type InlineProps = {
  text: string;
  color: string;
  fontSize: number;
  fontFamily?: string;
};

function Inline({ text, color, fontSize, fontFamily }: InlineProps) {
  const theme = useAppTheme();
  const parts = text.split(/(\*\*[^*]+\*\*|==[^=]+==|`[^`]+`)/g).filter(Boolean);
  return (
    <Text selectable style={[styles.paragraphText, { color, fontSize, lineHeight: fontSize * 1.66, fontFamily }]}> 
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <Text key={`inline-bold-${index}`} style={styles.bold}>{part.slice(2, -2)}</Text>;
        }
        if (part.startsWith('==') && part.endsWith('==')) {
          return <Text key={`inline-mark-${index}`} style={[styles.mark, { color: theme.dark ? theme.paper : palette.ink }]}>{part.slice(2, -2)}</Text>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <Text key={`inline-code-${index}`} style={[styles.inlineCode, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(17,17,15,0.08)' }]}>{part.slice(1, -1)}</Text>;
        }
        return <Text key={`inline-text-${index}`}>{part}</Text>;
      })}
    </Text>
  );
}

export function MarkdownRenderer({
  markdown,
  color = palette.ink,
  fontSize = 18,
  fontFamily,
}: {
  markdown: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
}) {
  const blocks = parseMarkdownBlocks(markdown);
  const { width } = useWindowDimensions();
  const theme = useAppTheme();
  return (
    <View style={styles.wrap}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const size = block.level <= 2 ? fontSize + 8 : fontSize + 4;
          return <Text selectable key={`block-heading-${index}`} style={[styles.heading, { color, fontSize: size, lineHeight: size * 1.28, fontFamily }]}>{block.text}</Text>;
        }
        if (block.type === 'code') {
          return (
            <View key={`block-code-${index}`} style={[styles.codeBox, { borderColor: theme.dark ? theme.line : 'rgba(255,255,255,0.08)' }] }>
              {block.language ? <Text style={styles.codeLang}>{block.language}</Text> : null}
              <Text selectable style={styles.codeText}>{block.code}</Text>
            </View>
          );
        }
        if (block.type === 'quote') {
          return (
            <View key={`block-quote-${index}`} style={[styles.quote, { borderLeftColor: theme.sage, backgroundColor: theme.dark ? 'rgba(169,181,155,0.14)' : 'rgba(135,146,124,0.12)' }] }>
              <Inline text={block.text} color={theme.inkMuted} fontSize={Math.max(15, fontSize - 1)} fontFamily={fontFamily} />
            </View>
          );
        }
        if (block.type === 'list') {
          return (
            <View key={`block-list-${index}`} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={`list-item-${itemIndex}`} style={styles.listItem}>
                  <View style={[styles.bullet, { backgroundColor: theme.ink }]} />
                  <View style={styles.listText}><Inline text={item} color={color} fontSize={fontSize} fontFamily={fontFamily} /></View>
                </View>
              ))}
            </View>
          );
        }
        if (block.type === 'table') {
          const columnCount = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1);
          const visibleColumns = Math.min(columnCount, 3);
          const columnWidth = Math.max(104, Math.floor((width - 56) / visibleColumns));
          const rows = [block.header, ...block.rows];

          return (
            <View key={`block-table-${index}`} style={[styles.tableFrame, { backgroundColor: theme.card, borderColor: theme.line }] }>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={columnCount > 3} style={styles.tableScroller} contentContainerStyle={styles.tableScrollerInner}>
                <View style={[styles.table, { backgroundColor: theme.card }] }>
                  {rows.map((row, rowIndex) => {
                    const isHeader = rowIndex === 0;
                    const isLastRow = rowIndex === rows.length - 1;
                    return (
                      <View key={`row-${rowIndex}`} style={[styles.tableRow, !isLastRow && [styles.tableRowDivider, { borderBottomColor: theme.line }], isHeader && [styles.tableHeaderRow, { backgroundColor: theme.tableHeader }]]}>
                        {Array.from({ length: columnCount }).map((_, cellIndex) => {
                          const isLastCell = cellIndex === columnCount - 1;
                          return (
                            <View key={`cell-${rowIndex}-${cellIndex}`} style={[styles.tableCell, { width: columnWidth, backgroundColor: theme.card }, isHeader && [styles.tableHeaderCell, { backgroundColor: theme.tableHeader }], !isLastCell && [styles.tableCellDivider, { borderRightColor: theme.line }], !isHeader && rowIndex % 2 === 0 && [styles.tableCellAlt, { backgroundColor: theme.tableAlt }]]}>
                              <Text selectable style={[isHeader ? styles.tableHeaderText : styles.tableCellText, { color: theme.ink, fontFamily }]}>{row[cellIndex] ?? ''}</Text>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          );
        }
        return <Inline key={`block-paragraph-${index}`} text={block.text} color={color} fontSize={fontSize} fontFamily={fontFamily} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  paragraphText: {
    fontWeight: '400',
  },
  bold: {
    fontWeight: '800',
  },
  mark: {
    backgroundColor: '#F3D990',
    color: palette.ink,
    borderRadius: 6,
  },
  inlineCode: {
    fontFamily: 'monospace',
    color: '#A34D35',
    backgroundColor: 'rgba(17,17,15,0.08)',
  },
  heading: {
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  codeBox: {
    borderRadius: radius.md,
    backgroundColor: '#171A1D',
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  codeLang: {
    color: '#98A2B3',
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  codeText: {
    color: '#E8EDF2',
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'monospace',
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: palette.sage,
    paddingLeft: 12,
    backgroundColor: 'rgba(135,146,124,0.12)',
    borderRadius: radius.sm,
  },
  list: {
    gap: 8,
  },
  listItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.ink,
    marginTop: 13,
  },
  listText: {
    flex: 1,
  },
  tableFrame: {
    marginVertical: 6,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6DCCC',
    overflow: 'hidden',
  },
  tableScroller: {
    width: '100%',
  },
  tableScrollerInner: {
    flexGrow: 0,
  },
  table: {
    backgroundColor: '#FFFFFF',
  },
  tableHeaderRow: {
    backgroundColor: '#EFE3D0',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tableRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#E6DCCC',
  },
  tableCell: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  tableHeaderCell: {
    backgroundColor: '#EFE3D0',
  },
  tableCellAlt: {
    backgroundColor: '#FBF7EF',
  },
  tableCellDivider: {
    borderRightWidth: 1,
    borderRightColor: '#E6DCCC',
  },
  tableHeaderText: {
    color: palette.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  tableCellText: {
    color: palette.ink,
    fontSize: 13,
    lineHeight: 19,
  },
});
