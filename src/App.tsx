import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, useColorScheme, View, type ImageSourcePropType } from 'react-native';
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
import { StatisticsScreen } from './screens/StatisticsScreen';
import { ShareCardOverlay } from './components/ShareCardOverlay';
import { HomeShareOverlay } from './components/HomeShareOverlay';
import { TabBar } from './components/TabBar';
import { getSettings, getStatistics, initializeDatabase, listCards, listDocuments, listFavoriteCards } from './data/repository';
import type { CardRecord, DocumentRecord, Route, Settings, Statistics, TabKey } from './domain/types';
import { appFonts } from './theme/fonts';
import { resolveAppTheme, ThemeProvider, useAppTheme } from './theme/ThemeContext';
import { palette, radius } from './theme/tokens';

const initialStats: Statistics = { totalCards: 0, gotCards: 0, favoriteCards: 0, annotatedCards: 0, todayGets: 0, todayReviews: 0, goal: 10, streakDays: 0, week: [], documents: 0, dueCount: 0, recentCount: 0, fuzzyCount: 0, clearCount: 0, forgotCount: 0, weakCount: 0, dueWeakCount: 0, tomorrowCount: 0 };
const initialSettings: Settings = {
  sessionCardCount: 10,
  fontSize: 18,
  headerImage: 'warm0',
  fontFamily: 'LXGWWenKai',
  cardHeaderImageMode: 'remote',
  cardBackgroundImageUrl: CARD_REMOTE_IMAGE_URLS[0],
  cardImagePoolSize: 20,
  dailyGetGoal: 10,
  homeBackgroundImageUrl: HOME_BACKGROUND_IMAGE_URL,
  homeBackgroundDownloadDirectory: '',
  themeMode: 'system',
};

const pageMeta: Record<TabKey, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }> = {
  home: { title: '首页', subtitle: 'Scrollark', icon: 'home-outline' },
  review: { title: '复习', subtitle: 'Spaced Review', icon: 'repeat-outline' },
  knowledge: { title: '知识库', subtitle: 'Markdown importing', icon: 'book-outline' },
  favorites: { title: '收藏与批注', subtitle: '我的卡片', icon: 'bookmark-outline' },
  stats: { title: '我的', subtitle: 'My Learning', icon: 'person-outline' },
  settings: { title: '设置', subtitle: '阅读偏好', icon: 'settings-outline' },
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
  const [error, setError] = React.useState('');
  // 分享海报挂在 App 主窗口层级渲染：整屏截图只能捕获主窗口，
  // 放进 <Modal>（独立 Dialog 窗口）里的内容截不到。
  const [sharingCard, setSharingCard] = React.useState<CardRecord | null>(null);
  // 首页数据海报同样挂在 App 层（Tab 栏之后）：保证盖住底部悬浮 Tab 栏。
  const [sharingHome, setSharingHome] = React.useState<ImageSourcePropType | null>(null);
  const theme = resolveAppTheme(settings.themeMode, systemScheme);

  const refresh = React.useCallback(async () => {
    const [nextSettings, nextStats, nextDocs, nextCards, nextFavorites] = await Promise.all([
      getSettings(),
      getStatistics(),
      listDocuments(),
      listCards(80),
      listFavoriteCards(),
    ]);
    setSettings(nextSettings);
    setStats(nextStats);
    setDocuments(nextDocs);
    setCards(nextCards);
    setFavorites(nextFavorites);
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

  React.useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  // 压栈跳转：把当前页面记入历史（同页重复跳转不压栈，历史上限 25 条防无限增长）。
  const navigate = React.useCallback((next: Route) => {
    setNav((s) => (JSON.stringify(s.current) === JSON.stringify(next) ? s : { current: next, history: [...s.history.slice(-24), s.current] }));
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

  if (!loaded) {
    return (
      <ThemeProvider settings={settings}>
        <SafeAreaProvider>
          <View style={[styles.center, { backgroundColor: theme.paper }] }>
            <ActivityIndicator color={theme.ink} />
            <Text style={[styles.centerText, { color: theme.inkMuted }]}>Scrollark 正在启动…</Text>
          </View>
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
            onClose={() => { void refresh(); goBack(); }}
            onChanged={refreshSoon}
            onEnd={(summary) => { void refresh(); replace({ name: 'sessionEnd', summary }); }}
            onStartReview={() => navigate({ name: 'review' })}
          />
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
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  const activeTab = route.tab;
  return (
    <ThemeProvider settings={settings}>
      <SafeAreaProvider>
        <StatusBar style={activeTab === 'home' || theme.dark ? 'light' : 'dark'} />
        <View style={[styles.app, { backgroundColor: theme.paper }] }>
          <View style={styles.appBody}>
            {activeTab === 'home' ? (
              <HomeScreen
                stats={stats}
                settings={settings}
                onStartSession={() => navigate({ name: 'session' })}
                onStartAheadReview={() => navigate({ name: 'review', mode: 'ahead' })}
                onNavigate={(tab) => navigate({ name: 'tabs', tab })}
                onSearch={() => navigate({ name: 'search' })}
                onShareHome={setSharingHome}
              />
            ) : (
              <SafeAreaView style={[styles.page, { backgroundColor: theme.paper }]} edges={['top']}>
                <PageHeader tab={activeTab} onBack={goBack} />
                <View style={styles.pageBody}>
                  {renderPage(activeTab, { stats, settings, documents, cards, favorites, navigate, goHome, refresh, setSettings, onShare: setSharingCard })}
                </View>
              </SafeAreaView>
            )}
          </View>
          <TabBar active={activeTab} onChange={(tab) => navigate({ name: 'tabs', tab })} />
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
        </View>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function PageHeader({ tab, onBack }: { tab: TabKey; onBack: () => void }) {
  const meta = pageMeta[tab];
  const theme = useAppTheme();
  return (
    <View style={[styles.headerBar, { backgroundColor: theme.paper }] }>
      <Pressable onPress={onBack} style={({ pressed }) => [styles.backButton, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}>
        <Ionicons name="chevron-back" size={24} color={theme.ink} />
      </Pressable>
      <View style={styles.headerTitleWrap}>
        <Text style={[styles.headerSubtitle, { color: theme.inkMuted }]}>{meta.subtitle}</Text>
        <Text style={[styles.headerTitle, { color: theme.ink }]}>{meta.title}</Text>
      </View>
      <View style={[styles.headerIcon, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
        <Ionicons name={meta.icon} size={23} color={theme.ink} />
      </View>
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
    navigate: (next: Route) => void;
    goHome: () => void;
    refresh: () => Promise<void>;
    setSettings: React.Dispatch<React.SetStateAction<Settings>>;
    onShare: (card: CardRecord) => void;
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
        />
      );
    case 'knowledge':
      return (
        <KnowledgeScreen
          documents={data.documents}
          cards={data.cards}
          settings={data.settings}
          onImported={() => void data.refresh()}
          onStartSession={() => data.navigate({ name: 'session' })}
          onShare={data.onShare}
        />
      );
    case 'favorites':
      return <FavoritesScreen cards={data.favorites} settings={data.settings} onChanged={() => void data.refresh()} onShare={data.onShare} />;
    case 'stats':
      return <StatisticsScreen stats={data.stats} onOpenFavorites={() => data.navigate({ name: 'tabs', tab: 'favorites' })} />;
    case 'settings':
      return (
        <SettingsScreen
          settings={data.settings}
          onSettingsChanged={(next) => setImmediateSettings(data.setSettings, next)}
          onReset={() => { void data.refresh(); data.goHome(); }}
          onCardImagesReset={() => { void data.refresh(); }}
          onDataChanged={() => { void data.refresh(); }}
        />
      );
    case 'home':
    default:
      return null;
  }
}

function setImmediateSettings(setSettings: React.Dispatch<React.SetStateAction<Settings>>, settings: Settings) {
  setSettings(settings);
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: palette.paper },
  appBody: { flex: 1 },
  page: { flex: 1, backgroundColor: palette.paper },
  pageBody: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: palette.paper },
  centerText: { color: palette.inkMuted, fontSize: 15, fontWeight: '700' },
  errorTitle: { color: palette.ink, fontSize: 28, fontWeight: '900' },
  headerBar: { height: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.paper },
  backButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paperElevated, borderWidth: 1, borderColor: palette.line },
  headerTitleWrap: { flex: 1 },
  headerSubtitle: { color: palette.inkMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  headerTitle: { color: palette.ink, fontSize: 28, lineHeight: 32, fontWeight: '900', letterSpacing: -0.8 },
  headerIcon: { width: 46, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paperElevated, borderWidth: 1, borderColor: palette.line },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});
