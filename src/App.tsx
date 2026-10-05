import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as NativeSplashScreen from 'expo-splash-screen';
import React from 'react';
import { Animated, BackHandler, Dimensions, Easing, Pressable, StyleSheet, Text, useColorScheme, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CARD_REMOTE_IMAGE_URLS, HOME_BACKGROUND_IMAGE_URL } from './config/imageUrls';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { HomeScreen } from './screens/HomeScreen';
import { KnowledgeScreen } from './screens/KnowledgeScreen';
import { ReviewHubScreen } from './screens/ReviewHubScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { SessionEndScreen } from './screens/SessionEndScreen';
import { SearchScreen } from './screens/SearchScreen';
import { SessionScreen } from './screens/SessionScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SettingsDetailScreen } from './screens/SettingsDetailScreen';
import { SettingsSearchOverlay } from './components/SettingsSearchOverlay';
import { StatisticsScreen } from './screens/StatisticsScreen';
import { ShareCardOverlay } from './components/ShareCardOverlay';
import { HomeShareOverlay } from './components/HomeShareOverlay';
import { StatsShareOverlay } from './components/StatsShareOverlay';
import { MarkdownGuideModal } from './components/MarkdownGuideModal';
import { SplashScreen } from './components/SplashScreen';
import { TabBar } from './components/TabBar';
import { getSettings, getStatistics, initializeDatabase, listCardGroupsWithCounts, listCards, listDocuments, listFavoriteCards, listFolders, updateSetting } from './data/repository';
import type { CardGroupWithCount, CardRecord, DocumentRecord, FolderRecord, KnowledgeListMode, Route, Settings, SettingsSection, Statistics, TabKey } from './domain/types';
import { routeEquals } from './utils/navigation';
import { appFonts } from './theme/fonts';
import { resolveAppTheme, ThemeProvider, useAppTheme } from './theme/ThemeContext';
import { palette, radius } from './theme/tokens';
import { AppAlertHost } from './components/AppAlert';
import { OverlayHost } from './components/AppOverlay';

void NativeSplashScreen.preventAutoHideAsync().catch(() => undefined);

const SPLASH_MIN_VISIBLE_MS = 1300;

const initialStats: Statistics = { totalCards: 0, gotCards: 0, favoriteCards: 0, annotatedCards: 0, todayGets: 0, todayReviews: 0, goal: 10, streakDays: 0, week: [], documents: 0, dueCount: 0, recentCount: 0, fuzzyCount: 0, clearCount: 0, forgotCount: 0, weakCount: 0, dueWeakCount: 0, tomorrowCount: 0 };
const initialSettings: Settings = {
  sessionCardCount: 10,
  reviewBatchSize: 50,
  fontSize: 18,
  fontLetterSpacing: 0,
  headerImage: 'warm0',
  fontFamily: 'LXGWWenKai',
  cardHeaderImageMode: 'remote',
  cardBackgroundImageUrl: CARD_REMOTE_IMAGE_URLS[0],
  cardImagePoolSize: 20,
  dailyGetGoal: 10,
  homeBackgroundImageUrl: HOME_BACKGROUND_IMAGE_URL,
  homeBackgroundDownloadDirectory: '',
  themeMode: 'system',
  knowledgeListMode: 'folders',
};

const pageMeta: Record<TabKey, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }> = {
  home: { title: '首页', subtitle: 'Scrollark', icon: 'home-outline' },
  review: { title: '复习', subtitle: 'Spaced Review', icon: 'repeat-outline' },
  knowledge: { title: '知识库', subtitle: 'Markdown importing', icon: 'book-outline' },
  favorites: { title: '收藏与批注', subtitle: '我的卡片', icon: 'bookmark-outline' },
  stats: { title: '我的', subtitle: 'My Learning', icon: 'share-social-outline' },
  settings: { title: '设置', subtitle: 'Setting', icon: 'search-outline' },
};

export default function App() {
  const systemScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts(appFonts);
  // 轻量导航历史：跳转压栈、返回出栈。返回键与各页返回按钮都回到上一次的页面，
  // 而不是固定回首页；只有显式「返回首页」或清空数据才重置历史。
  const [nav, setNav] = React.useState<{ current: Route; history: Route[] }>({ current: { name: 'tabs', tab: 'home' }, history: [] });
  const route = nav.current;
  const [ready, setReady] = React.useState(false);
  const [settings, setSettings] = React.useState<Settings>(initialSettings);
  const [stats, setStats] = React.useState<Statistics>(initialStats);
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([]);
  const [cards, setCards] = React.useState<CardRecord[]>([]);
  const [favorites, setFavorites] = React.useState<CardRecord[]>([]);
  const [folders, setFolders] = React.useState<FolderRecord[]>([]);
  const [cardGroups, setCardGroups] = React.useState<CardGroupWithCount[]>([]);
  const [error, setError] = React.useState('');
  const [showSplash, setShowSplash] = React.useState(true);
  const [splashExiting, setSplashExiting] = React.useState(false);
  const splashStartedAt = React.useRef(Date.now());
  // 分享海报挂在 App 主窗口层级渲染：整屏截图只能捕获主窗口，
  // 放进 <Modal>（独立 Dialog 窗口）里的内容截不到。
  const [sharingCard, setSharingCard] = React.useState<CardRecord | null>(null);
  // 首页数据海报同样挂在 App 层（Tab 栏之后）：保证盖住底部悬浮 Tab 栏。
  const [sharingHome, setSharingHome] = React.useState<ImageSourcePropType | null>(null);
  // 「我的」页学习档案海报：内容不含壁纸图源，只挂浮层即可。
  const [sharingStats, setSharingStats] = React.useState(false);
  // 知识库页头按钮：Markdown 导入格式说明。
  const [mdGuideOpen, setMdGuideOpen] = React.useState(false);
  // 设置页头按钮：设置项搜索浮层。
  const [settingsSearchOpen, setSettingsSearchOpen] = React.useState(false);
  const theme = resolveAppTheme(settings.themeMode, systemScheme);
  // Tab 保活：记录访问过的 Tab，首次访问才挂载，之后用 display 切换保留滚动位置与已加载数据。
  const [visitedTabs, setVisitedTabs] = React.useState<ReadonlySet<TabKey>>(() => new Set<TabKey>(['home']));
  // 设置二级页最后进入的分类：路由切回 tabs 后，退场动画期间仍需渲染该分类（ref 需在早退分支前声明）。
  const lastDetailSection = React.useRef<SettingsSection>('reading');
  if (route.name === 'settingsDetail') {
    lastDetailSection.current = route.section;
  }

  const refresh = React.useCallback(async () => {
    const [nextSettings, nextStats, nextDocs, nextCards, nextFavorites, nextFolders, nextGroups] = await Promise.all([
      getSettings(),
      getStatistics(),
      listDocuments(),
      listCards(80),
      listFavoriteCards(),
      listFolders(),
      listCardGroupsWithCounts(),
    ]);
    setSettings(nextSettings);
    setStats(nextStats);
    setDocuments(nextDocs);
    setCards(nextCards);
    setFavorites(nextFavorites);
    setFolders(nextFolders);
    setCardGroups(nextGroups);
  }, []);

  // 刷卡会话中的 get/收藏/批注高频触发刷新：合并为一次延迟刷新，
  // 会话结束（onEnd/onClose）仍会立即完整刷新。
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshSoon = React.useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, 1200);
  }, [refresh]);

  // 「我的」页目标卡快捷设置：写库后立即完整刷新（目标、连续天数即时生效）。
  const updateDailyGoal = React.useCallback(async (goal: number) => {
    await updateSetting('dailyGetGoal', goal);
    await refresh();
  }, [refresh]);

  // 知识库列表展示方式（文件夹 / 文档）：写库持久化后刷新。
  const updateKnowledgeListMode = React.useCallback(async (mode: KnowledgeListMode) => {
    await updateSetting('knowledgeListMode', mode);
    await refresh();
  }, [refresh]);

  React.useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  // 压栈跳转：把当前页面记入历史（结构化判等，同页重复跳转不压栈，历史上限 25 条防无限增长）。
  const navigate = React.useCallback((next: Route) => {
    setNav((s) => (routeEquals(s.current, next) ? s : { current: next, history: [...s.history.slice(-24), s.current] }));
  }, []);

  // 返回上一次的页面；没有历史时回到首页（首页再返回则交给系统退出应用）。
  const goBack = React.useCallback(() => {
    setNav((s) => {
      if (s.history.length === 0) {
        return s.current.name === 'tabs' && s.current.tab === 'home' ? s : { current: { name: 'tabs', tab: 'home' }, history: [] };
      }
      return { current: s.history[s.history.length - 1], history: s.history.slice(0, -1) };
    });
  }, []);

  // 显式「返回首页」：重置历史，返回键不会再穿过陈旧的流程页。
  const goHome = React.useCallback(() => {
    setNav({ current: { name: 'tabs', tab: 'home' }, history: [] });
  }, []);

  // 流程页之间的替换（会话 → 总结 → 下一轮）：不压栈，返回时跳过中间态。
  const replace = React.useCallback((next: Route) => {
    setNav((s) => ({ ...s, current: next }));
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        await initializeDatabase();
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : '应用初始化失败');
      } finally {
        setReady(true);
      }
    })();
  }, [refresh]);

  // Android 返回手势/返回键：统一回退到上一次的页面；只有首页且无历史时交给系统（退出应用）。
  // 刷卡页与复习页注册了自己的返回拦截，会先于这里触发。
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.name === 'tabs' && route.tab === 'home' && nav.history.length === 0) {
        return false;
      }
      if (route.name === 'search' || route.name === 'sessionEnd') {
        void refresh();
      }
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack, nav.history.length, refresh, route]);

  const loaded = ready && (fontsLoaded || Boolean(fontError));

  const hideNativeSplash = React.useCallback(() => {
    void NativeSplashScreen.hideAsync().catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (error) hideNativeSplash();
  }, [error, hideNativeSplash]);

  React.useEffect(() => {
    if (!loaded || !showSplash) return;
    hideNativeSplash();
    const elapsed = Date.now() - splashStartedAt.current;
    const timer = setTimeout(() => setSplashExiting(true), Math.max(0, SPLASH_MIN_VISIBLE_MS - elapsed));
    return () => clearTimeout(timer);
  }, [hideNativeSplash, loaded, showSplash]);

  if (!loaded) {
    return (
      <ThemeProvider settings={settings}>
        <SafeAreaProvider>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          <SplashScreen mode="enter" onReady={hideNativeSplash} />
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  if (error) {
    return (
      <ThemeProvider settings={settings}>
        <SafeAreaProvider>
          <View style={[styles.center, { backgroundColor: theme.paper }] }>
            <Text style={[styles.errorTitle, { color: theme.ink }]}>启动失败</Text>
            <Text style={[styles.centerText, { color: theme.inkMuted }]}>{error}</Text>
          </View>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  if (route.name === 'search') {
    return (
      <ThemeProvider settings={settings}>
        <SafeAreaProvider>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          <SearchScreen settings={settings} onBack={goBack} onShare={setSharingCard} />
          {sharingCard ? (
            <ShareCardOverlay
              key={sharingCard.id}
              card={sharingCard}
              settings={settings}
              onDone={() => setSharingCard(null)}
            />
          ) : null}
          {/* 全局弹窗宿主：每个路由分支都要挂载，否则该分支里 showAlert 只入队不弹出 */}
          <AppAlertHost fontFamily={settings.fontFamily} />
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  if (route.name === 'session') {
    return (
      <ThemeProvider settings={settings}>
        <SafeAreaProvider>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          <SessionScreen
            settings={settings}
            startCardId={route.startCardId}
            onClose={() => { void refresh(); goBack(); }}
            onChanged={refreshSoon}
            onEnd={(summary) => { void refresh(); replace({ name: 'sessionEnd', summary }); }}
            onStartReview={() => navigate({ name: 'review' })}
          />
          <AppAlertHost fontFamily={settings.fontFamily} />
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  if (route.name === 'review') {
    return (
      <ThemeProvider settings={settings}>
        <SafeAreaProvider>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          <ReviewScreen
            mode={route.mode}
            settings={settings}
            tomorrowCount={stats.tomorrowCount}
            onClose={() => { void refresh(); goBack(); }}
            onChanged={refreshSoon}
            onStartSession={() => navigate({ name: 'session' })}
          />
          <AppAlertHost fontFamily={settings.fontFamily} />
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  if (route.name === 'sessionEnd') {
    return (
      <ThemeProvider settings={settings}>
        <SafeAreaProvider>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          <SessionEndScreen
            summary={route.summary}
            onHome={() => { void refresh(); goHome(); }}
            onContinue={() => replace({ name: 'session' })}
            onStartReview={() => navigate({ name: 'review' })}
          />
          <AppAlertHost fontFamily={settings.fontFamily} />
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  const activeTab = route.tab;
  // 设置二级页：以推入浮层叠加在 Tab 层之上，Tab 树全程保持挂载（跳转/返回均为滑动转场，
  // 不再有整树卸载重建导致的闪屏）。
  const detailActive = route.name === 'settingsDetail';
  // 渲染期补录当前 Tab（带守卫，只触发一次重渲染），随后所有已访问 Tab 保持挂载。
  if (!visitedTabs.has(activeTab)) {
    setVisitedTabs((prev) => new Set(prev).add(activeTab));
  }
  const tabPageData = {
    stats,
    settings,
    documents,
    cards,
    favorites,
    folders,
    cardGroups,
    navigate,
    goHome,
    refresh,
    setSettings,
    onShare: setSharingCard,
    onShareStats: () => setSharingStats(true),
    onUpdateGoal: (goal: number) => { void updateDailyGoal(goal); },
    onChangeListMode: (mode: KnowledgeListMode) => { void updateKnowledgeListMode(mode); },
  };
  const nonHomeTabs: TabKey[] = ['review', 'knowledge', 'favorites', 'stats', 'settings'];
  return (
    <ThemeProvider settings={settings}>
      <SafeAreaProvider>
        <StatusBar style={activeTab === 'home' || theme.dark ? 'light' : 'dark'} />
        <View style={[styles.app, { backgroundColor: theme.paper }] }>
          <View style={styles.appBody}>
            <View style={[styles.tabPage, activeTab !== 'home' && styles.tabPageHidden]}>
              {visitedTabs.has('home') ? (
                <HomeScreen
                  stats={stats}
                  settings={settings}
                  onStartSession={(startCardId) => navigate({ name: 'session', startCardId })}
                  onStartAheadReview={() => navigate({ name: 'review', mode: 'ahead' })}
                  onNavigate={(tab) => navigate({ name: 'tabs', tab })}
                  onSearch={() => navigate({ name: 'search' })}
                  onShareHome={setSharingHome}
                />
              ) : null}
            </View>
            {nonHomeTabs.map((tab) => (
              <View key={tab} style={[styles.tabPage, activeTab !== tab && styles.tabPageHidden]}>
                {visitedTabs.has(tab) ? (
                  <SafeAreaView style={[styles.page, { backgroundColor: theme.paper }]} edges={['top']}>
                    <PageHeader
                      tab={tab}
                      onIconPress={
                        tab === 'review'
                          ? () => navigate({ name: 'review', mode: 'ahead' })
                          : tab === 'knowledge'
                            ? () => setMdGuideOpen(true)
                            : tab === 'stats'
                              ? () => setSharingStats(true)
                              : tab === 'settings'
                                ? () => setSettingsSearchOpen(true)
                                : undefined
                      }
                    />
                    <View style={styles.pageBody}>
                      {renderPage(tab, tabPageData)}
                    </View>
                  </SafeAreaView>
                ) : null}
              </View>
            ))}
          </View>
          <TabBar active={activeTab} onChange={(tab) => navigate({ name: 'tabs', tab })} />
          {/* 页面层级编辑浮层（文档 / 分组 / 手写卡 / 批注）经传送门渲染在这里，保证盖住悬浮 Tab 栏 */}
          <OverlayHost />
          {sharingCard ? (
            <ShareCardOverlay
              key={sharingCard.id}
              card={sharingCard}
              settings={settings}
              onDone={() => setSharingCard(null)}
            />
          ) : null}
          {sharingHome ? (
            <HomeShareOverlay
              imageSource={sharingHome}
              settings={settings}
              stats={stats}
              onDone={() => setSharingHome(null)}
            />
          ) : null}
          {sharingStats ? (
            <StatsShareOverlay
              settings={settings}
              stats={stats}
              onDone={() => setSharingStats(false)}
            />
          ) : null}
          {mdGuideOpen ? (
            <MarkdownGuideModal
              settings={settings}
              onClose={() => setMdGuideOpen(false)}
            />
          ) : null}
          {settingsSearchOpen ? (
            <SettingsSearchOverlay
              settings={settings}
              onClose={() => setSettingsSearchOpen(false)}
              onOpenSection={(section) => {
                setSettingsSearchOpen(false);
                navigate({ name: 'settingsDetail', section, tab: activeTab });
              }}
            />
          ) : null}
          {/* 设置二级页推入浮层：盖住 Tab 栏与页面内容 */}
          <PushOverlay active={detailActive}>
            <SettingsDetailScreen
              section={lastDetailSection.current}
              settings={settings}
              onSettingsChanged={setSettings}
              onReset={() => { void refresh(); goHome(); }}
              onCardImagesReset={() => { void refresh(); }}
              onDataChanged={() => { void refresh(); }}
              onBack={goBack}
            />
          </PushOverlay>
          {/* 全局自定义提示弹窗（iOS 风格）：以独立原生 Modal 窗口弹出，盖在所有页面与其他 Modal 之上 */}
          <AppAlertHost fontFamily={settings.fontFamily} />
          {showSplash ? (
            <SplashScreen
              mode={splashExiting ? 'exit' : 'enter'}
              onDone={() => setShowSplash(false)}
            />
          ) : null}
        </View>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

// 全屏推入浮层：二级页从右侧滑入覆盖 Tab 层，返回时滑出后再卸载。
// active 由路由驱动；路由切走（active = false）时继续挂载播完退场动画，
// 下层 Tab 树因此不需要重建，返回时不会闪屏。
function PushOverlay({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(active);
  const progress = React.useRef(new Animated.Value(active ? 1 : 0)).current;
  // 动画代数：快速连续跳转/返回时，让被打断的旧动画的完成回调失效。
  const generation = React.useRef(0);
  const animation = React.useRef<Animated.CompositeAnimation | null>(null);

  React.useEffect(() => {
    const gen = generation.current + 1;
    generation.current = gen;
    animation.current?.stop();
    animation.current = Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: active ? 280 : 240,
      easing: active ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.current.start(() => {
      if (!active && gen === generation.current) setMounted(false);
    });
    return () => {
      animation.current?.stop();
    };
  }, [active, progress]);

  // active 时无条件渲染（与路由变更同步挂载，入场动画从屏幕右缘开始）；
  // 退场动画播完（mounted 置 false）后才真正卸载。
  if (!mounted && !active) return null;
  const width = Dimensions.get('window').width;
  return (
    <Animated.View
      style={[
        styles.pushOverlay,
        { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// 各 Tab 页头右上角按钮的无障碍标签（有 onIconPress 的 Tab 才会用到）。
const pageIconLabels: Partial<Record<TabKey, string>> = {
  review: '提前复习',
  knowledge: 'Markdown 格式说明',
  stats: '分享学习档案',
  settings: '搜索设置',
};

function PageHeader({ tab, onIconPress }: { tab: TabKey; onIconPress?: () => void }) {
  const meta = pageMeta[tab];
  const theme = useAppTheme();
  // 右侧图标默认仅作装饰；提供 onIconPress 时变成可点按钮（复习 = 提前复习，知识库 = 格式说明，我的 = 分享档案，设置 = 搜索设置）。
  // 设置页头不放「设置」图标（与页面内容重复），固定换成搜索入口。
  const iconLabel = pageIconLabels[tab] ?? meta.title;
  return (
    <View style={[styles.headerBar, { backgroundColor: theme.paper }] }>
      <View style={styles.headerTitleWrap}>
        <Text style={[styles.headerSubtitle, { color: theme.inkMuted }]}>{meta.subtitle}</Text>
        <Text style={[styles.headerTitle, { color: theme.ink }]}>{meta.title}</Text>
      </View>
      {onIconPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={iconLabel}
          onPress={onIconPress}
          style={({ pressed }) => [styles.headerIcon, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}
        >
          <Ionicons name={meta.icon} size={23} color={theme.ink} />
        </Pressable>
      ) : (
        <View style={[styles.headerIcon, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
          <Ionicons name={meta.icon} size={23} color={theme.ink} />
        </View>
      )}
    </View>
  );
}

function renderPage(
  tab: TabKey,
  data: {
    stats: Statistics;
    settings: Settings;
    documents: DocumentRecord[];
    cards: CardRecord[];
    favorites: CardRecord[];
    folders: FolderRecord[];
    cardGroups: CardGroupWithCount[];
    navigate: (next: Route) => void;
    goHome: () => void;
    refresh: () => Promise<void>;
    setSettings: React.Dispatch<React.SetStateAction<Settings>>;
    onShare: (card: CardRecord) => void;
    onShareStats: () => void;
    onUpdateGoal: (goal: number) => void;
    onChangeListMode: (mode: KnowledgeListMode) => void;
  },
) {
  switch (tab) {
    case 'review':
      return (
        <ReviewHubScreen
          stats={data.stats}
          settings={data.settings}
          onStartReview={() => data.navigate({ name: 'review' })}
          onStartAheadReview={() => data.navigate({ name: 'review', mode: 'ahead' })}
          onStartGet={() => data.navigate({ name: 'session' })}
          onShare={data.onShare}
          onDataChanged={() => { void data.refresh(); }}
        />
      );
    case 'knowledge':
      return (
        <KnowledgeScreen
          documents={data.documents}
          cards={data.cards}
          folders={data.folders}
          cardGroups={data.cardGroups}
          settings={data.settings}
          onImported={() => void data.refresh()}
          onStartSession={() => data.navigate({ name: 'session' })}
          onShare={data.onShare}
          onChangeListMode={data.onChangeListMode}
        />
      );
    case 'favorites':
      return <FavoritesScreen cards={data.favorites} settings={data.settings} onChanged={() => void data.refresh()} onShare={data.onShare} />;
    case 'stats':
      return <StatisticsScreen stats={data.stats} onOpenFavorites={() => data.navigate({ name: 'tabs', tab: 'favorites' })} onShareStats={data.onShareStats} onUpdateGoal={data.onUpdateGoal} />;
    case 'settings':
      return (
        <SettingsScreen
          settings={data.settings}
          onOpenSection={(section) => data.navigate({ name: 'settingsDetail', section, tab })}
        />
      );
    case 'home':
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: palette.paper },
  appBody: { flex: 1 },
  tabPage: { flex: 1 },
  tabPageHidden: { display: 'none' },
  page: { flex: 1, backgroundColor: palette.paper },
  pageBody: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: palette.paper },
  centerText: { color: palette.inkMuted, fontSize: 15, fontWeight: '700' },
  errorTitle: { color: palette.ink, fontSize: 28, fontWeight: '900' },
  headerBar: { height: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.paper },
  headerTitleWrap: { flex: 1 },
  headerSubtitle: { color: palette.inkMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  headerTitle: { color: palette.ink, fontSize: 28, lineHeight: 32, fontWeight: '900', letterSpacing: -0.8 },
  headerIcon: { width: 46, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paperElevated, borderWidth: 1, borderColor: palette.line },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  // 二级页推入浮层：全屏覆盖，左侧投影在滑动时体现层级深度。
  pushOverlay: {
    ...StyleSheet.absoluteFillObject,
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
  },
});
