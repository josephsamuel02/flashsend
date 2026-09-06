// src/screens/MediaViewerScreen.tsx
// Full-screen swipeable viewer for photos/videos.
// Top: back icon. Bottom: size + WhatsApp / Business WhatsApp only. Safe-area aware.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useColors, type ThemeColors, Spacing, FontSize, BorderRadius, FontFamily } from '../theme/colors';
import * as SendappNative from 'sendapp-native';

const { width, height } = Dimensions.get('window');
const WA_PKG = 'com.whatsapp';
const WA_BUSINESS_PKG = 'com.whatsapp.w4b';

export type ViewerAsset = {
  id: string;
  uri: string;
  name: string;
  size: number;
  mimeType: string;
  duration?: number;
};

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function MediaViewerScreen() {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const assets: ViewerAsset[] = route.params?.assets ?? [];
  const initialIndex: number = route.params?.initialIndex ?? 0;
  const [index, setIndex] = useState(initialIndex);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [sharing, setSharing] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    // Resolve size for current item only (lazy, avoids scanning whole library)
    const a = assets[index];
    if (!a || (a.size || 0) > 0 || sizes[a.id] !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        let s = 0;
        try {
          s = (SendappNative as any).getFileSize?.(a.uri) || 0;
        } catch {}
        if (!s) {
          const info: any = await FileSystem.getInfoAsync(a.uri);
          if (info.exists) s = info.size ?? 0;
        }
        if (s > 0 && !cancelled) setSizes((prev) => ({ ...prev, [a.id]: s }));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, assets.length]);

  useEffect(() => {
    if (initialIndex > 0 && listRef.current && assets.length > 0) {
      const t = setTimeout(() => {
        try {
          listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
        } catch {}
      }, 50);
      return () => clearTimeout(t);
    }
  }, [initialIndex, assets.length]);

  const current = assets[index];
  const currentSize = current ? sizes[current.id] ?? current.size ?? 0 : 0;

  const handleShare = useCallback(
    async (pkg: string, label: string) => {
      if (!current) return;
      setSharing(true);
      try {
        const mime = current.mimeType || (current.name.match(/\.mp4|\.mkv|\.mov/i) ? 'video/*' : 'image/*');
        await (SendappNative as any).shareFileToApp(current.uri, mime, pkg);
      } catch (e: any) {
        const msg = e?.message || '';
        if (msg.includes('NOT_INSTALLED')) {
          Alert.alert(`${label} not installed`, `Please install ${label} to share directly.`);
        } else if (msg.includes('rebuild') || msg.includes('not available')) {
          Alert.alert(
            'Rebuild required',
            'Direct share needs a fresh build. Run: npx expo prebuild --clean && npx expo run:android'
          );
        } else {
          Alert.alert('Share failed', msg.slice(0, 200) || `Could not share to ${label}.`);
        }
      } finally {
        setSharing(false);
      }
    },
    [current]
  );

  const onViewableChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems?.length > 0 && viewableItems[0].index != null) {
      setIndex(viewableItems[0].index);
    }
  }).current;

  const renderItem = ({ item }: { item: ViewerAsset }) => {
    const isVideo = item.mimeType.startsWith('video');
    return (
      <View style={styles.page}>
        <Image source={{ uri: item.uri }} style={styles.media} resizeMode="contain" />
        {isVideo && (
          <View style={styles.videoBadge} pointerEvents="none">
            <MaterialIcons name="play-circle-filled" size={64} color="rgba(255,255,255,0.9)" />
          </View>
        )}
      </View>
    );
  };

  if (assets.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No media</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="black" />
      {/* Top bar with back icon */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.counter}>
          {index + 1} / {assets.length}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <FlatList
        ref={listRef}
        data={assets}
        keyExtractor={(i) => i.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onViewableItemsChanged={onViewableChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={renderItem}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            try {
              listRef.current?.scrollToIndex({ index: info.index, animated: false });
            } catch {}
          }, 100);
        }}
      />

      {/* Bottom bar: size + WhatsApp actions only */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
        <Text style={styles.sizeText}>{formatSize(currentSize)}</Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.shareBtn, styles.waBtn]}
            onPress={() => handleShare(WA_PKG, 'WhatsApp')}
            disabled={sharing}
            activeOpacity={0.85}
          >
            {sharing ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <MaterialIcons name="chat" size={20} color="white" />
            )}
            <Text style={styles.shareText}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shareBtn, styles.wabBtn]}
            onPress={() => handleShare(WA_BUSINESS_PKG, 'Business WhatsApp')}
            disabled={sharing}
            activeOpacity={0.85}
          >
            {sharing ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <MaterialIcons name="business-center" size={20} color="white" />
            )}
            <Text style={styles.shareText}>Business</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: 'white', fontSize: 16 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: { flex: 1, textAlign: 'center', color: 'white', fontSize: 14, fontWeight: '600' },
  page: { width, height: height * 0.72, alignItems: 'center', justifyContent: 'center' },
  media: { width: '100%', height: '100%' },
  videoBadge: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingTop: 12,
    paddingHorizontal: Spacing.lg,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  sizeText: { color: 'white', fontSize: FontSize.md, fontWeight: '600', textAlign: 'center', fontFamily: FontFamily.semiBold },
  actions: { flexDirection: 'row', gap: 12 },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: BorderRadius.round,
  },
  waBtn: { backgroundColor: '#1DA851' },
  wabBtn: { backgroundColor: '#0E7C6B' },
  shareText: { color: 'white', fontWeight: '800', fontSize: 14 },
});
