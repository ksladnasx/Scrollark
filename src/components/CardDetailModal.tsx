import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CardRecord, Settings } from '../domain/types';
import { radius } from '../theme/tokens';
import { KnowledgeCard } from './KnowledgeCard';

type Props = {
  card: CardRecord | null;
  settings: Settings;
  onClose: () => void;
};

export function CardDetailModal({ card, settings, onClose }: Props) {
  return (
    <Modal visible={Boolean(card)} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.wrap} edges={['top', 'bottom']}>
        {card ? <KnowledgeCard card={card} settings={settings} onClose={onClose} /> : null}
        <Pressable onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#FFFFFF' },
  close: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
