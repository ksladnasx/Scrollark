import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { HOME_BACKGROUND_IMAGE_URL } from './config/imageUrls';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { HomeScreen } from './screens/HomeScreen';
import { KnowledgeScreen } from './screens/KnowledgeScreen';
import { SessionEndScreen } from './screens/SessionEndScreen';
import { SessionScreen } from './screens/SessionScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatisticsScreen } from './screens/StatisticsScreen';
import { getSettings, getStatistics, initializeDatabase, listCards, listDocuments, listFavoriteCards } from './data/repository';
import type { CardRecord, DocumentRecord, Route, Settings, Statistics, TabKey } from './domain/types';
import { appFonts } from './theme/fonts';
import { resolveAppTheme, ThemeProvider, useAppTheme } from './theme/ThemeContext';
import { palette, radius } from './theme/tokens';

const initialStats: Statistics = { totalCards: 0, gotCards: 0, favoriteCards: 0, annotatedCards: 0, todayGets: 0, week: [], documents: 0 };
const initialSettings: Settings = {
  sessionCardCount: 10,
  fontSize: 18,
  fontColor: '#171611',
  headerImage: 'warm0',
  fontFamily: 'LXGWWenKai',
  cardHeaderImageMode: 'local',
  homeBackgroundImageMode: 'remote',
  homeBackgroundImageUrl: HOME_BACKGROUND_IMAGE_URL,
  homeBackgroundDownloadDirectory: '',
  themeMode: 'system',
};

const pageMeta: Record<TabKey, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }> = {
  home: { title: '首页', subtitle: 'Scrollark', icon: 'home-outline' },
  knowledge: { title: '知识库', subtitle: 'Markdown importing', icon: 'book-outline' },
  favorites: { title: '收藏与批注', subtitle: '我的卡片', icon: 'bookmark-outline' },
  stats: { title: '今日签', subtitle: '阅读统计', icon: 'bar-chart-outline' },
  settings: { title: '设置', subtitle: '阅读偏好', icon: 'settings-outline' },
};

export default function App() {
  const systemScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const [route, setRoute] = React.useState<Route>({ name: 'tabs', tab: 'home' });
  const [ready, setReady] = React.useState(false);
  const [settings, setSettings] = React.useState<Settings>(initialSettings);
  const [stats, setStats] = React.useState<Statistics>(initialStats);
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([]);
  const [cards, setCards] = React.useState<CardRecord[]>([]);
  const [favorites, setFavorites] = React.useState<CardRecord[]>([]);
  const [error, setError] = React.useState('');
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

  if (route.name === 'session') {
    return (
      <ThemeProvider settings={settings}>
        <SafeAreaProvider>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
          <SessionScreen
            settings={settings}
            onClose={() => { void refresh(); setRoute({ name: 'tabs', tab: 'home' }); }}
            onChanged={() => void refresh()}
            onEnd={(summary) => { void refresh(); setRoute({ name: 'sessionEnd', summary }); }}
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
            onHome={() => { void refresh(); setRoute({ name: 'tabs', tab: 'home' }); }}
            onContinue={() => setRoute({ name: 'session' })}
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
          {activeTab === 'home' ? (
            <HomeScreen
              stats={stats}
              settings={settings}
              onStartSession={() => setRoute({ name: 'session' })}
              onNavigate={(tab) => setRoute({ name: 'tabs', tab })}
            />
          ) : (
            <SafeAreaView style={[styles.page, { backgroundColor: theme.paper }]} edges={['top']}>
              <PageHeader tab={activeTab} onBack={() => setRoute({ name: 'tabs', tab: 'home' })} />
              <View style={styles.pageBody}>
                {renderPage(activeTab, { stats, settings, documents, cards, favorites, setRoute, refresh, setSettings })}
              </View>
            </SafeAreaView>
          )}
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
    setRoute: React.Dispatch<React.SetStateAction<Route>>;
    refresh: () => Promise<void>;
    setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  },
) {
  switch (tab) {
    case 'knowledge':
      return (
        <KnowledgeScreen
          documents={data.documents}
          cards={data.cards}
          settings={data.settings}
          onImported={() => void data.refresh()}
          onStartSession={() => data.setRoute({ name: 'session' })}
        />
      );
    case 'favorites':
      return <FavoritesScreen cards={data.favorites} settings={data.settings} />;
    case 'stats':
      return <StatisticsScreen stats={data.stats} />;
    case 'settings':
      return (
        <SettingsScreen
          settings={data.settings}
          onSettingsChanged={(next) => setImmediateSettings(data.setSettings, next)}
          onReset={() => { void data.refresh(); data.setRoute({ name: 'tabs', tab: 'home' }); }}
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
