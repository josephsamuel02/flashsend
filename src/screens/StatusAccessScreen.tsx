// src/screens/StatusAccessScreen.tsx
// First-open gate. Only the Get Status button. Auto-prompts on open.

import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, StatusBar, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, type ThemeColors } from '../theme/colors';
import StatusAccessButton from '../components/StatusAccessButton';
import { hasStatusAccess, openAllFilesAccessSettings } from '../lib/statusAccess';

export default function StatusAccessScreen({ onDone }: { onDone: () => void }) {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const autoFired = useRef(false);

  const recheck = useCallback(async () => {
    try {
      if (await hasStatusAccess()) doneRef.current();
    } catch {}
  }, []);

  // Auto-prompt shortly after first paint.
  useEffect(() => {
    if (autoFired.current) return;
    autoFired.current = true;
    const t = setTimeout(async () => {
      try {
        if (await hasStatusAccess()) {
          doneRef.current();
          return;
        }
      } catch {}
      try {
        await openAllFilesAccessSettings();
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, []);

  // Granted in Settings → continue on return.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheck();
    });
    return () => sub.remove();
  }, [recheck]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />
      <View style={styles.center}>
        <StatusAccessButton onDone={recheck} />
      </View>
    </View>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
