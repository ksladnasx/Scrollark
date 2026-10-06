import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from './AppButton';
import { showAlert } from './AppAlert';
import { AppSelectSheet, SelectField, folderSelectOptions } from './AppSelectSheet';
import { importMarkdownContent, getAiModelCatalog, MAX_IMPORT_FILE_BYTES, pickImportFile, readMarkdownText, readFileBase64, uniqueDocumentTitle, type AiModelMapping, type PickedImportFile } from '../data/repository';
import type { DocumentRecord, FolderRecord, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';
import { parseMarkdownToCards } from '../utils/markdown';
import { AiServiceError, getAiConfig, normalizeMarkdownWithAi } from '../utils/ai';

type ImportResult = { document: DocumentRecord; cards: number };

type Props = {
  visible: boolean;
  folders: FolderRecord[];
  settings: Settings;
  // 未显式选择文件夹时的兜底归属（默认文件夹）。
  defaultFolderId: number | null;
  onClose: () => void;
  onImported: (result: ImportResult, folderName: string) => void;
  // 可选：从「AI 未配置」提示直接跳到设置页的 AI 分区。
  onOpenAiSettings?: () => void;
};

// 导入流水线的阶段：与进度弹窗展示的文案一一对应。
type Phase = 'reading' | 'ai' | 'parsing';

const PHASE_LABELS: Record<Phase, string> = {
  reading: '正在读取文档...',
  ai: '正在重排文档...',
  parsing: '正在生成知识卡片...',
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// promise 化的确认弹窗：导入流水线中途需要用户决策（同名重命名）时暂停等待。
function confirmAsync(title: string, message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    showAlert({
      title,
      message,
      buttons: [
        { text: '取消', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, onPress: () => resolve(true) },
      ],
    });
  });
}

// 导入配置弹窗：先完成三项配置（所属文件夹 / 重排模型开关 / 选择文件），点「确定导入」
// 后执行 校验 → 读取 → [可选 AI 重排] → 现有解析器 → 入库。开关关闭时仅支持 md / txt，
// 开启后 md 也交给 AI 重排，同时支持 pdf / word。
export function ImportConfigModal({ visible, folders, settings, defaultFolderId, onClose, onImported, onOpenAiSettings }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const fontFamily = settings.fontFamily;

  const [folderId, setFolderId] = React.useState<number | null>(defaultFolderId);
  const [folderSelectOpen, setFolderSelectOpen] = React.useState(false);
  const [useAi, setUseAi] = React.useState(false);
  const [file, setFile] = React.useState<PickedImportFile | null>(null);
  const [phase, setPhase] = React.useState<Phase | null>(null);
  const [errorText, setErrorText] = React.useState('');
  // AI 失败详情弹窗：展示具体报错 + AI 原始返回内容（可滚动、可选中复制）。
  const [aiError, setAiError] = React.useState<{ message: string; detail: string } | null>(null);
  // 导入进度：确认导入后弹进度条弹窗，缓慢爬升、数据到达直接 100%，可手动取消。
  const [progress, setProgress] = React.useState(0);
  // 重排模型下拉：选项来自设置页的模型映射（菜单显示名 → 实际模型），本次导入可临时切换。
  const [catalog, setCatalog] = React.useState<AiModelMapping[]>([]);
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);
  const [modelSheetOpen, setModelSheetOpen] = React.useState(false);
  const cancelledRef = React.useRef(false);
  const aiAbortRef = React.useRef<AbortController | null>(null);
  const progressTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const stopProgressTick = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const startProgressTick = () => {
    stopProgressTick();
    // 隔一段时间加一点进度，越接近上限加得越慢；真实数据到达后由流水线直接置 100%。
    progressTimerRef.current = setInterval(() => {
      setProgress((current) => (current >= 92 ? 92 : current + Math.max(1.5, (92 - current) * 0.12)));
    }, 1500);
  };

  // 读取模型映射缓存（端点或 Key 变更后自动视为空）。
  const loadCatalog = (config: { baseUrl: string; apiKey: string }) => {
    getAiModelCatalog(config.baseUrl, config.apiKey)
      .then(setCatalog)
      .catch(() => setCatalog([]));
  };

  // 每次打开时清掉上次的文件与错误；文件夹 / 重排开关保留上次选择；重排模型恢复为默认。
  React.useEffect(() => {
    if (visible) {
      setFile(null);
      setErrorText('');
      setPhase(null);
      setAiError(null);
      setProgress(0);
      cancelledRef.current = false;
      setSelectedModel(null);
      setModelSheetOpen(false);
      setFolderId(defaultFolderId);
      if (useAi && aiConfig.baseUrl !== '' && aiConfig.apiKey !== '') {
        loadCatalog(aiConfig);
      } else {
        setCatalog([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, defaultFolderId]);

  // 卸载兜底：中断进行中的 AI 请求并停掉进度模拟。
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
      aiAbortRef.current?.abort();
      stopProgressTick();
    },
    [],
  );

  const aiConfig = getAiConfig(settings);
  // 本次导入实际使用的重排模型：默认取设置里的默认模型，可在下拉中临时切换。
  const effectiveModel = selectedModel ?? aiConfig.model;
  const selectedModelLabel = catalog.find((item) => item.model === effectiveModel)?.name ?? effectiveModel;
  const canRunAi = aiConfig.baseUrl !== '' && aiConfig.apiKey !== '' && effectiveModel !== '';
  const busy = phase !== null;
  const folderName = folders.find((folder) => folder.id === (folderId ?? defaultFolderId))?.name ?? '默认文件夹';

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  const handlePickFile = async () => {
    if (busy) return;
    setErrorText('');
    try {
      const picked = await pickImportFile({ allowDocuments: useAi });
      if (!picked) return;
      if (picked.size > MAX_IMPORT_FILE_BYTES) {
        setFile(null);
        setErrorText(`文件大小 ${formatFileSize(picked.size)} 超过 3MB 上限，无法导入。`);
        return;
      }
      setFile(picked);
    } catch (error) {
      setFile(null);
      setErrorText(error instanceof Error ? error.message : '文件选择失败，请重试');
    }
  };

  const handleToggleAi = (value: boolean) => {
    setUseAi(value);
    setErrorText('');
    // 关闭重排时若已选文件不是 md / txt，提前提示（确定导入时也会再校验）。
    if (!value && file && file.kind !== 'markdown') {
      setErrorText('当前文件需要开启重排模型才能导入；或重新选择 md / txt 文件。');
    }
    // 开启重排时立即加载模型映射，供下拉选择（不必退出重进）。
    if (value && aiConfig.baseUrl !== '' && aiConfig.apiKey !== '') {
      loadCatalog(aiConfig);
    }
  };

  // 手动取消导入：中断 AI 请求并丢弃其返回内容，不写入任何数据。
  const handleCancelImport = () => {
    cancelledRef.current = true;
    aiAbortRef.current?.abort();
    stopProgressTick();
    setPhase(null);
    setProgress(0);
  };

  // 点击「确定导入」后的完整流水线：校验 → 读取 → [可选 AI 重排] → 同名检测 → 现有解析器 → 入库。
  // 期间展示进度条弹窗，可随时取消；取消后丢弃请求内容，不产生任何数据。
  const handleConfirm = async () => {
    if (busy || !file) return;
    if (file.kind !== 'markdown' && !useAi) {
      setErrorText('当前文件需要开启重排模型后才能导入。');
      return;
    }
    if (useAi && !canRunAi) {
      showAlert({
        title: '尚未配置 AI',
        message: '已开启重排模型，但 AI 配置不完整。请先到「设置 → AI 设置」填写 API Base URL、API Key 与模型名称。',
        buttons: onOpenAiSettings
          ? [
              { text: '取消', style: 'cancel' },
              { text: '去配置', onPress: () => { onClose(); onOpenAiSettings(); } },
            ]
          : undefined,
      });
      return;
    }

    const finishRun = () => {
      stopProgressTick();
      setPhase(null);
    };
    // 各步骤之间的取消检查：命中即丢弃结果并退出（错误弹窗与提示都不出现）。
    const cancelled = () => {
      if (!cancelledRef.current) return false;
      finishRun();
      return true;
    };

    setErrorText('');
    cancelledRef.current = false;
    aiAbortRef.current = new AbortController();
    setProgress(4);
    startProgressTick();
    setPhase('reading');
    try {
      let content: string;
      if (file.kind === 'markdown') {
        const text = await readMarkdownText(file.uri);
        if (cancelled()) return;
        if (!text.trim()) throw new Error('文件内容为空，无法导入');
        if (useAi) {
          // 开启重排模型后 md / txt 也一律交给 AI 重排，不做本地结构判断。
          setPhase('ai');
          setProgress((current) => Math.max(current, 20));
          content = await normalizeMarkdownWithAi({ ...aiConfig, model: effectiveModel }, { type: 'text', text }, { signal: aiAbortRef.current?.signal });
        } else {
          content = text;
        }
      } else {
        // pdf / word 必须经 AI 重排（本地不解析），以 base64 文件块发给模型。
        const base64 = await readFileBase64(file.uri);
        if (cancelled()) return;
        if (!base64) throw new Error('文件读取失败，请重试');
        setPhase('ai');
        setProgress((current) => Math.max(current, 20));
        content = await normalizeMarkdownWithAi({ ...aiConfig, model: effectiveModel }, { type: 'document', fileName: file.name, base64, mimeType: file.mimeType ?? 'application/octet-stream' }, { signal: aiAbortRef.current?.signal });
      }
      if (cancelled()) return;

      // 数据已到达：进度直接拉满，余下的解析与入库都在本地瞬间完成。
      setProgress(100);
      setPhase('parsing');

      // 同名文档检测：目标文件夹下已有同名文档时询问用户，继续则自动重命名。
      const prospectiveTitle = parseMarkdownToCards(content, file.name).title;
      const uniqueTitle = await uniqueDocumentTitle(prospectiveTitle, folderId ?? defaultFolderId);
      if (cancelled()) return;
      let titleOverride: string | undefined;
      if (uniqueTitle !== prospectiveTitle) {
        const proceed = await confirmAsync('已存在同名文档', `目标文件夹中已存在《${prospectiveTitle}》。如果继续，将自动重命名为《${uniqueTitle}》。`, '继续导入');
        if (!proceed) {
          finishRun();
          return;
        }
        titleOverride = uniqueTitle;
      }
      if (cancelled()) return;

      const result = await importMarkdownContent({ content, fileName: file.name, fileUri: file.uri, folderId: folderId ?? defaultFolderId, titleOverride });
      // 入库已完成：即使用户此刻点了取消也不再回滚，按成功收尾。
      await sleep(450);
      if (cancelledRef.current) return;
      finishRun();
      onImported(result, folderName);
    } catch (error) {
      finishRun();
      if (cancelledRef.current) return;
      if (error instanceof AiServiceError && error.detail !== '') {
        setAiError({ message: error.message, detail: error.detail });
      } else {
        setErrorText(error instanceof Error ? error.message : '导入失败，请稍后再试');
      }
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
        <View style={styles.backdrop}>
          {/* 导入进行中禁止点遮罩 / 返回键关闭，避免半途产生脏状态 */}
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} disabled={busy} />
          <View style={[styles.sheet, { backgroundColor: theme.paperElevated, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={[styles.grabber, { backgroundColor: theme.inkMuted }]} />
            <View style={[styles.header, { borderColor: theme.line }]}>
              <Text style={[styles.title, { color: theme.ink, fontFamily }]}>导入文件</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭导入配置"
                onPress={handleClose}
                disabled={busy}
                style={({ pressed }) => [styles.closeButton, { backgroundColor: theme.paperSoft }, pressed && !busy && styles.pressed, busy && { opacity: 0.45 }]}
              >
                <Ionicons name="close" size={18} color={theme.ink} />
              </Pressable>
            </View>

            <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner} showsVerticalScrollIndicator={false}>
              <Text style={[styles.blockLabel, { color: theme.ink, fontFamily }]}>所属文件夹</Text>
              <SelectField value={folderName} placeholder="选择所属文件夹" onPress={busy ? () => undefined : () => setFolderSelectOpen(true)} />

              <View style={styles.switchRow}>
                <Text style={[styles.blockLabel, { color: theme.ink, fontFamily }]}>重排模型</Text>
                <Switch
                  accessibilityLabel="重排模型"
                  value={useAi}
                  onValueChange={handleToggleAi}
                  disabled={busy}
                  trackColor={{ false: theme.line, true: theme.accent }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={theme.line}
                />
              </View>
              {useAi ? (
                <>
                  {catalog.length > 0 ? (
                    <SelectField
                      icon="cube-outline"
                      value={selectedModelLabel || '未选择'}
                      placeholder="选择重排模型"
                      onPress={busy ? () => undefined : () => setModelSheetOpen(true)}
                    />
                  ) : (
                    <View style={styles.aiModelRow}>
                      <Ionicons name="sparkles-outline" size={14} color={canRunAi ? theme.accent : theme.red} />
                      <Text numberOfLines={1} style={[styles.aiModelText, { color: theme.inkMuted, fontFamily }]}>
                        {canRunAi ? effectiveModel : '未配置'}
                      </Text>
                    </View>
                  )}
                  {!canRunAi ? (
                    <View style={[styles.aiWarningBox, { borderColor: theme.red }]}>
                      <Text style={[styles.aiWarningText, { color: theme.red, fontFamily }]}>AI 配置不完整，请先在设置中完成配置。</Text>
                      {onOpenAiSettings ? (
                        <AppButton label="去 AI 设置" icon="settings-outline" variant="light" compact onPress={() => { onClose(); onOpenAiSettings(); }} />
                      ) : null}
                    </View>
                  ) : null}
                </>
              ) : null}

              <Text style={[styles.blockLabel, { color: theme.ink, fontFamily }]}>文件</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="选择要导入的文件"
                onPress={() => { void handlePickFile(); }}
                disabled={busy}
                style={({ pressed }) => [styles.fileField, { backgroundColor: theme.paperSoft, borderColor: theme.line }, pressed && !busy && styles.pressed, busy && { opacity: 0.55 }]}
              >
                <Ionicons name={file && file.kind !== 'markdown' ? 'document-attach-outline' : 'document-text-outline'} size={16} color={theme.inkMuted} />
                <Text numberOfLines={1} style={[styles.fileFieldValue, { color: file ? theme.ink : theme.inkMuted, fontFamily }]}>
                  {file ? file.name : '选择文件'}
                </Text>
                {file ? <Text style={[styles.fileSize, { color: theme.inkMuted, fontFamily }]}>{formatFileSize(file.size)}</Text> : null}
                <Ionicons name="folder-open-outline" size={16} color={theme.inkMuted} />
              </Pressable>
              <Text style={[styles.blockHint, { color: theme.inkMuted, fontFamily }]}>{useAi ? 'md / txt / pdf / word · ≤ 3MB' : 'md / txt · ≤ 3MB'}</Text>

              {errorText ? (
                <View style={[styles.errorRow, { borderColor: theme.red }]}>
                  <Ionicons name="alert-circle" size={14} color={theme.red} />
                  <Text style={[styles.errorText, { color: theme.red, fontFamily }]}>{errorText}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <AppButton label="取消" variant="light" style={styles.footerButton} disabled={busy} onPress={handleClose} />
              <AppButton label="确定导入" icon="arrow-down-circle-outline" style={styles.footerButton} loading={busy} disabled={!file} onPress={() => { void handleConfirm(); }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* 文件夹选择：与导入配置弹窗并列的原生弹层，展开时盖在上层 */}
      <AppSelectSheet
        visible={folderSelectOpen}
        title="选择所属文件夹"
        options={folderSelectOptions(folders)}
        selectedKey={folderId === null ? null : String(folderId)}
        onSelect={(key) => setFolderId(Number(key))}
        onClose={() => setFolderSelectOpen(false)}
      />

      {/* 重排模型选择：选项为设置页模型映射的菜单显示名，选中其对应的实际请求模型 */}
      <AppSelectSheet
        visible={modelSheetOpen}
        title="选择重排模型"
        options={catalog.map((item) => ({ key: item.model, label: item.name }))}
        selectedKey={effectiveModel}
        onSelect={(key) => setSelectedModel(key)}
        onClose={() => setModelSheetOpen(false)}
      />

      {/* 导入进度弹窗：确认导入后弹出，缓慢爬升、数据到达直接 100%；可手动取消丢弃结果 */}
      {phase ? (
        <Modal visible transparent animationType="fade" onRequestClose={handleCancelImport}>
          <View style={styles.progressBackdrop}>
            <View style={[styles.progressDialog, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
              <Text numberOfLines={1} style={[styles.progressTitle, { color: theme.ink, fontFamily }]}>{file?.name ?? '正在导入'}</Text>
              <Text style={[styles.progressPhase, { color: theme.inkMuted, fontFamily }]}>{PHASE_LABELS[phase]}</Text>
              <View style={[styles.progressTrack, { backgroundColor: theme.paperSoft }]}>
                <View style={[styles.progressFill, { width: `${Math.round(progress)}%`, backgroundColor: theme.accent }]} />
              </View>
              <Text style={[styles.progressPercent, { color: theme.inkMuted, fontFamily }]}>{Math.round(progress)}%</Text>
              <AppButton label="取消导入" icon="close-circle-outline" variant="light" onPress={handleCancelImport} />
            </View>
          </View>
        </Modal>
      ) : null}

      {/* AI 失败详情弹窗：挂在最后保证盖在所有弹层之上；原始内容超长时在固定高度内滚动 */}
      {aiError ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setAiError(null)}>
          <View style={styles.errorBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setAiError(null)} />
            <View style={[styles.errorDialog, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
              <Text style={[styles.errorDialogTitle, { color: theme.ink, fontFamily }]}>AI 处理失败</Text>
              <Text style={[styles.errorMessage, { color: theme.red, fontFamily }]}>{aiError.message}</Text>
              <Text style={[styles.errorDetailLabel, { color: theme.inkMuted, fontFamily }]}>AI 原始返回内容</Text>
              <View style={[styles.errorDetailBox, { backgroundColor: theme.paperSoft, borderColor: theme.line }]}>
                <ScrollView style={styles.errorDetailScroll} nestedScrollEnabled showsVerticalScrollIndicator>
                  <Text selectable style={[styles.errorDetailText, { color: theme.ink, fontFamily }]}>{aiError.detail}</Text>
                </ScrollView>
              </View>
              <View style={styles.errorActions}>
                <AppButton label="关闭" variant="light" style={styles.footerButton} onPress={() => setAiError(null)} />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,17,15,0.5)' },
  sheet: { height: '68%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, opacity: 0.28, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: 16, fontWeight: '800' },
  closeButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  bodyInner: { padding: 16, paddingBottom: 24, gap: 10 },
  blockLabel: { fontSize: 13, fontWeight: '800' },
  blockHint: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  aiModelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiModelText: { flex: 1, fontSize: 12, fontWeight: '700' },
  aiWarningBox: { gap: 8, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed' },
  aiWarningText: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  fileField: { minHeight: 46, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fileFieldValue: { flex: 1, fontSize: 15, fontWeight: '600' },
  fileSize: { fontSize: 12, fontWeight: '600' },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed' },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  footerButton: { flex: 1 },
  progressBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,17,15,0.55)', padding: 24 },
  progressDialog: { width: '100%', maxWidth: 380, borderRadius: radius.xl, borderWidth: 1, padding: 20, gap: 12 },
  progressTitle: { fontSize: 16, fontWeight: '900' },
  progressPhase: { fontSize: 13, fontWeight: '700' },
  progressTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: 10, borderRadius: 5 },
  progressPercent: { fontSize: 12, fontWeight: '800', alignSelf: 'flex-end' },
  errorBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,17,15,0.5)', padding: 24 },
  errorDialog: { width: '100%', maxWidth: 420, borderRadius: radius.xl, borderWidth: 1, padding: 18, gap: 10 },
  errorDialogTitle: { fontSize: 16, fontWeight: '900' },
  errorMessage: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  errorDetailLabel: { fontSize: 12, fontWeight: '800', marginTop: 2 },
  errorDetailBox: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  errorDetailScroll: { maxHeight: 240, padding: 12 },
  errorDetailText: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  errorActions: { flexDirection: 'row', gap: 10 },
  pressed: { opacity: 0.72 },
});
