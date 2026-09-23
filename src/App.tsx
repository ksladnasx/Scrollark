import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
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
import { palette, radius } from './theme/tokens';

const initialStats: Statistics = { totalCards: 0, gotCards: 0, favoriteCards: 0, annotatedCards: 0, todayGets: 0, week: [], documents: 0 };
const initialSettings: Settings = { sessionCardCount: 10, fontSize: 18, fontColor: '#171611', headerImage: 'warm0', fontFamily: 'LXGWWenKai' };

const pageMeta: Record<TabKey, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }> = {
  home: { title: '首页', subtitle: 'Scrollark', icon: 'home-outline' },
  knowledge: { title: '万卷', subtitle: '本地知识库', icon: 'book-outline' },
  favorites: { title: '收藏与批注', subtitle: '我的卡片', icon: 'bookmark-outline' },
  stats: { title: '今日签', subtitle: '阅读统计', icon: 'bar-chart-outline' },
  settings: { title: '我的', subtitle: '字体与偏好', icon: 'person-circle-outline' },
};

export default function App() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const [route, setRoute] = React.useState<Route>({ name: 'tabs', tab: 'home' });
  const [ready, setReady] = React.useState(false);
  const [settings, setSettings] = React.useState<Settings>(initialSettings);
  const [stats, setStats] = React.useState<Statistics>(initialStats);
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([]);
  const [cards, setCards] = React.useState<CardRecord[]>([]);
  const [favorites, setFavorites] = React.useState<CardRecord[]>([]);
  const [error, setError] = React.useState('');

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
      <SafeAreaProvider>
        <View style={styles.center}>
          <ActivityIndicator color={palette.ink} />
          <Text style={styles.centerText}>Scrollark 正在启动…</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (error) {
    return (
      <SafeAreaProvider>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>启动失败</Text>
          <Text style={styles.centerText}>{error}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (route.name === 'session') {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SessionScreen
          settings={settings}
          onClose={() => { void refresh(); setRoute({ name: 'tabs', tab: 'home' }); }}
          onChanged={() => void refresh()}
          onEnd={(summary) => { void refresh(); setRoute({ name: 'sessionEnd', summary }); }}
        />
      </SafeAreaProvider>
    );
  }

  if (route.name === 'sessionEnd') {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SessionEndScreen
          summary={route.summary}
          onHome={() => { void refresh(); setRoute({ name: 'tabs', tab: 'home' }); }}
          onContinue={() => setRoute({ name: 'session' })}
        />
      </SafeAreaProvider>
    );
  }

  const activeTab = route.tab;
  return (
    <SafeAreaProvider>
      <StatusBar style={activeTab === 'home' ? 'light' : 'dark'} />
      <View style={styles.app}>
        {activeTab === 'home' ? (
          <HomeScreen
            stats={stats}
            settings={settings}
            onImported={() => void refresh()}
            onStartSession={() => setRoute({ name: 'session' })}
            onNavigate={(tab) => setRoute({ name: 'tabs', tab })}
          />
        ) : (
          <SafeAreaView style={styles.page} edges={['top']}>
            <PageHeader tab={activeTab} onBack={() => setRoute({ name: 'tabs', tab: 'home' })} />
            <View style={styles.pageBody}>
              {renderPage(activeTab, { stats, settings, documents, cards, favorites, setRoute, refresh, setSettings })}
            </View>
          </SafeAreaView>
        )}
      </View>
    </SafeAreaProvider>
  );
}

function PageHeader({ tab, onBack }: { tab: TabKey; onBack: () => void }) {
  const meta = pageMeta[tab];
  return (
    <View style={styles.headerBar}>
      <Pressable onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
        <Ionicons name="chevron-back" size={24} color={palette.ink} />
      </Pressable>
      <View style={styles.headerTitleWrap}>
        <Text style={styles.headerSubtitle}>{meta.subtitle}</Text>
        <Text style={styles.headerTitle}>{meta.title}</Text>
      </View>
      <View style={styles.headerIcon}>
        <Ionicons name={meta.icon} size={23} color={palette.ink} />
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
