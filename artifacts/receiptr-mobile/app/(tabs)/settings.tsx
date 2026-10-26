import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useColors } from '@/hooks/useColors';
import {
  useDisconnectMailProvider,
  useMailConnectUrl,
  useMailStatus,
  useSyncMail,
  type MailProviderStatus,
} from '@/hooks/useGmail';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { signOut } = useAuth();
  const { user } = useUser();
  const qc = useQueryClient();

  const { data: mailStatus, isLoading: statusLoading, refetch: refetchStatus } = useMailStatus();
  const connectUrl = useMailConnectUrl();
  const disconnect = useDisconnectMailProvider();
  const sync = useSyncMail();
  // Only providers enabled by MAIL_PROVIDERS_ENABLED (and configured), plus a
  // legacy connection the user can still disconnect.
  const providers = mailStatus?.providers ?? [];

  // Poll for connection status after opening the provider's sign-in page
  const [polling, setPolling] = useState<MailProviderStatus['id'] | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(null);
  };

  // Stop polling when connected
  const pollingConnected = !!polling && providers.some((p) => p.id === polling && p.connected && !p.needsReconnect);
  useEffect(() => {
    if (pollingConnected) {
      stopPolling();
    }
  }, [pollingConnected]);

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const onConnect = async (provider: MailProviderStatus) => {
    try {
      const url = await connectUrl.mutateAsync(provider.id);
      await Linking.openURL(url);
      // Start polling for status changes after user opens OAuth
      setPolling(provider.id);
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        await refetchStatus();
        if (attempts >= 15) stopPolling(); // give up after ~30s
      }, 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : `Could not open ${provider.label} connect`;
      Alert.alert('Error', msg);
    }
  };

  const onDisconnect = (provider: MailProviderStatus) => {
    Alert.alert(
      `Disconnect ${provider.label}`,
      `This will stop auto-importing receipts from ${provider.label}. Are you sure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            disconnect.mutate(provider.id);
          },
        },
      ],
    );
  };

  const onSync = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sync.mutate();
  };

  const onSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          void qc.clear();
        },
      },
    ]);
  };

  const bottomPadding = isWeb ? 34 : insets.bottom;
  const topPad = isWeb ? 67 : 0;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding + 24, paddingTop: topPad + 4 }]}
    >
      {/* Account */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ACCOUNT</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={styles.accountRow}>
            <View style={[styles.avatar, { backgroundColor: colors.foreground }]}>
              <Text style={[styles.avatarLetter, { color: colors.background }]}>
                {(user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? '?').toUpperCase()}
              </Text>
            </View>
            <View style={styles.accountInfo}>
              {user?.firstName ? (
                <Text style={[styles.accountName, { color: colors.foreground }]}>
                  {user.firstName} {user.lastName ?? ''}
                </Text>
              ) : null}
              <Text style={[styles.accountEmail, { color: colors.mutedForeground }]} numberOfLines={1}>
                {user?.emailAddresses?.[0]?.emailAddress ?? ''}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Email import — providers come from /mail/status (MAIL_PROVIDERS_ENABLED) */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>EMAIL IMPORT</Text>
        {statusLoading ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <ActivityIndicator color={colors.foreground} style={{ paddingVertical: 12 }} />
          </View>
        ) : providers.length === 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Text style={[styles.gmailDescription, { color: colors.mutedForeground }]}>
              Inbox import isn't available right now. You can still scan or upload receipts.
            </Text>
          </View>
        ) : (
          providers.map((provider) => (
            <View
              key={provider.id}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, marginBottom: 12 }]}
            >
              {provider.connected ? (
                <>
                  {/* Connected state */}
                  <View style={styles.gmailConnected}>
                    <View style={[styles.connectedDot, { backgroundColor: provider.needsReconnect ? '#f59e0b' : '#22c55e' }]} />
                    <Text style={[styles.gmailEmail, { color: colors.foreground }]} numberOfLines={1}>
                      {provider.label} · {provider.accountEmail ?? 'Connected'}
                    </Text>
                  </View>

                  {!provider.enabled ? (
                    <Text style={[styles.gmailDescription, { color: colors.mutedForeground }]}>
                      {provider.label} import is no longer available. Disconnect to remove Receebo's access to this inbox.
                    </Text>
                  ) : provider.needsReconnect ? (
                    <Text style={[styles.gmailDescription, { color: colors.mutedForeground }]}>
                      {provider.label} needs you to sign in again before new receipts can be imported.
                    </Text>
                  ) : null}

                  <View style={[styles.divider, { backgroundColor: colors.border }]} />

                  <View style={styles.metaRow}>
                    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Last synced</Text>
                    <Text style={[styles.metaValue, { color: colors.foreground }]}>
                      {formatDate(provider.lastSyncedAt)}
                    </Text>
                  </View>

                  {(mailStatus?.pendingCount ?? 0) > 0 && (
                    <View style={styles.metaRow}>
                      <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Pending imports</Text>
                      <Text style={[styles.metaValue, { color: colors.foreground }]}>
                        {mailStatus?.pendingCount}
                      </Text>
                    </View>
                  )}

                  <View style={[styles.divider, { backgroundColor: colors.border }]} />

                  {/* Actions */}
                  {provider.enabled && provider.needsReconnect ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.rowBtn,
                        { opacity: pressed || connectUrl.isPending || !!polling ? 0.6 : 1 },
                      ]}
                      onPress={() => void onConnect(provider)}
                      disabled={connectUrl.isPending || !!polling}
                    >
                      <Feather name="log-in" size={16} color={colors.foreground} />
                      <Text style={[styles.rowBtnText, { color: colors.foreground }]}>
                        {polling === provider.id ? 'Waiting for connection…' : `Reconnect ${provider.label}`}
                      </Text>
                    </Pressable>
                  ) : provider.enabled ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.rowBtn,
                        { opacity: pressed || sync.isPending ? 0.6 : 1 },
                      ]}
                      onPress={onSync}
                      disabled={sync.isPending}
                    >
                      {sync.isPending ? (
                        <ActivityIndicator size="small" color={colors.foreground} />
                      ) : (
                        <Feather name="refresh-cw" size={16} color={colors.foreground} />
                      )}
                      <Text style={[styles.rowBtnText, { color: colors.foreground }]}>
                        {sync.isPending ? 'Syncing…' : 'Sync now'}
                      </Text>
                    </Pressable>
                  ) : null}

                  {provider.enabled && <View style={[styles.divider, { backgroundColor: colors.border }]} />}

                  <Pressable
                    style={({ pressed }) => [
                      styles.rowBtn,
                      { opacity: pressed || disconnect.isPending ? 0.6 : 1 },
                    ]}
                    onPress={() => onDisconnect(provider)}
                    disabled={disconnect.isPending}
                  >
                    {disconnect.isPending ? (
                      <ActivityIndicator size="small" color={colors.destructive} />
                    ) : (
                      <Feather name="x-circle" size={16} color={colors.destructive} />
                    )}
                    <Text style={[styles.rowBtnText, { color: colors.destructive }]}>
                      Disconnect {provider.label}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {/* Not connected state */}
                  <Text style={[styles.gmailDescription, { color: colors.mutedForeground }]}>
                    {provider.id === 'outlook'
                      ? 'Connect Outlook (Outlook.com, Hotmail, Live or Microsoft 365) to import order emails and PDF receipts automatically. Read-only; you review every import.'
                      : `Connect ${provider.label} to import order emails and PDF receipts automatically. Read-only; you review every import.`}
                  </Text>
                  {polling === provider.id && (
                    <View style={styles.waitingRow}>
                      <ActivityIndicator size="small" color={colors.mutedForeground} />
                      <Text style={[styles.waitingText, { color: colors.mutedForeground }]}>
                        Waiting for connection…
                      </Text>
                    </View>
                  )}
                  <Pressable
                    style={({ pressed }) => [
                      styles.connectBtn,
                      {
                        backgroundColor: pressed ? '#333' : colors.foreground,
                        borderRadius: colors.radius,
                        opacity: connectUrl.isPending || !!polling ? 0.6 : 1,
                      },
                    ]}
                    onPress={() => void onConnect(provider)}
                    disabled={connectUrl.isPending || !!polling}
                  >
                    {connectUrl.isPending && connectUrl.variables === provider.id ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <>
                        <Feather name="mail" size={16} color={colors.primaryForeground} />
                        <Text style={[styles.connectBtnText, { color: colors.primaryForeground }]}>
                          Connect {provider.label}
                        </Text>
                      </>
                    )}
                  </Pressable>
                  {polling === provider.id && (
                    <Pressable onPress={() => { stopPolling(); void refetchStatus(); }}>
                      <Text style={[styles.checkStatusLink, { color: colors.mutedForeground }]}>
                        Tap to check connection status
                      </Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          ))
        )}
      </View>

      {/* Sign out */}
      <View style={styles.section}>
        <Pressable
          style={({ pressed }) => [
            styles.signOutBtn,
            {
              borderColor: colors.border,
              borderRadius: colors.radius,
              backgroundColor: pressed ? colors.muted : 'transparent',
            },
          ]}
          onPress={onSignOut}
        >
          <Feather name="log-out" size={16} color={colors.destructive} />
          <Text style={[styles.signOutText, { color: colors.destructive }]}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 8,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    paddingHorizontal: 2,
  },
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 16,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  accountEmail: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  gmailConnected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gmailEmail: {
    fontSize: 14,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  metaLabel: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  rowBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  gmailDescription: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    padding: 14,
    paddingBottom: 12,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  waitingText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: 14,
    marginTop: 4,
    paddingVertical: 13,
  },
  connectBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  checkStatusLink: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginBottom: 14,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    marginTop: 16,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
});
