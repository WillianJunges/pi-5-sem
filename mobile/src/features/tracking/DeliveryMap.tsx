import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, spacing } from '../../theme';
import { MAP_HTML, MAP_RECENTER_SCRIPT, type MapState, mapUpdateScript } from './mapHtml';

/**
 * Mostra o motoboy e o endereço do pedido. Os dados vêm de fora (useDeliveryTracking),
 * então o mapa não sabe nada de socket nem de REST: só desenha o último estado recebido.
 */
export function DeliveryMap({ state, height = 260 }: { state: MapState; height?: number }) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Reenvia a cada mudança e também quando a página termina de carregar.
  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(mapUpdateScript(state));
  }, [ready, state]);

  function onMessage(event: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type?: string };
      if (msg.type === 'ready') setReady(true);
      if (msg.type === 'error') setFailed(true);
    } catch {
      // Mensagem que não é nossa: ignora.
    }
  }

  if (failed) {
    return (
      <View style={[styles.box, styles.center, { height }]}>
        <Text style={styles.muted}>Não foi possível carregar o mapa. Confira a internet do celular.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.box, { height }]}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: MAP_HTML }}
        onMessage={onMessage}
        onError={() => setFailed(true)}
        javaScriptEnabled
        scrollEnabled={false}
        // O mapa trata os gestos; sem isso o ScrollView da tela "rouba" o arrastar.
        nestedScrollEnabled
        setBuiltInZoomControls={false}
        style={styles.web}
      />
      {!ready ? (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <Pressable
          onPress={() => ref.current?.injectJavaScript(MAP_RECENTER_SCRIPT)}
          hitSlop={8}
          style={({ pressed }) => [styles.recenter, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Centralizar o mapa"
        >
          <Text style={styles.recenterText}>Centralizar</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface },
  web: { flex: 1, backgroundColor: 'transparent' },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  muted: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  recenter: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.lg,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recenterText: { fontSize: 13, fontWeight: '600', color: colors.primary },
});
