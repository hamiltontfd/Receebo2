import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  useApproveImport,
  useDismissImport,
  usePendingImports,
  type PendingImport,
} from '@/hooks/useGmail';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

function formatAmount(total: number | null, currency: string | null): string {
  if (total == null) return '';
  const sym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
  return `${sym}${total.toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface ImportCardProps {
  item: PendingImport;
  onApprove: (id: number) => void;
  onDismiss: (id: number) => void;
  approving: boolean;
  dismissing: boolean;
}

function ImportCard({ item, onApprove, onDismiss, approving, dismissing }: ImportCardProps) {
  const colors = useColors();
  const isBusy = approving || dismissing;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
          <Feather name="mail" size={16} color={colors.mutedForeground} />
        </View>
        <View style={styles.cardMeta}>
          <Text
            style={[styles.merchantText, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {item.merchant ?? item.originalFileName}
          </Text>
          {item.purchaseDate ? (
            <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
              {formatDate(item.purchaseDate)}
            </Text>
          ) : (
            <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
              {formatDate(item.createdAt)}
            </Text>
          )}
        </View>
        {item.total != null && (
          <Text style={[styles.amountText, { color: colors.foreground }]}>
            {formatAmount(item.total, item.currency)}
          </Text>
        )}
      </View>

      {/* Summary */}
      {item.summary ? (
        <Text
          style={[styles.summary, { color: colors.mutedForeground }]}
          numberOfLines={2}
        >
          {item.summary}
        </Text>
      ) : null}

      {/* Filename */}
      <Text style={[styles.filename, { color: colors.mutedForeground }]} numberOfLines={1}>
        {item.originalFileName}
      </Text>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.dismissBtn,
            {
              borderColor: colors.border,
              borderRadius: colors.radius,
              backgroundColor: pressed ? colors.muted : 'transparent',
              opacity: isBusy ? 0.5 : 1,
            },
          ]}
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onDismiss(item.id);
          }}
          disabled={isBusy}
        >
          {dismissing ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Text style={[styles.dismissText, { color: colors.mutedForeground }]}>Dismiss</Text>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.approveBtn,
            {
              backgroundColor: pressed ? '#333' : colors.foreground,
              borderRadius: colors.radius,
              opacity: isBusy ? 0.5 : 1,
              flex: 1,
            },
          ]}
          onPress={async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onApprove(item.id);
          }}
          disabled={isBusy}
        >
          {approving ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.approveText, { color: colors.primaryForeground }]}>
              Add to library
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function ImportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const { data: imports, isLoading, refetch, isRefetching } = usePendingImports();
  const approveMutation = useApproveImport();
  const dismissMutation = useDismissImport();

  const onApprove = useCallback(
    (id: number) => approveMutation.mutate(id),
    [approveMutation],
  );
  const onDismiss = useCallback(
    (id: number) => dismissMutation.mutate(id),
    [dismissMutation],
  );

  const bottomPadding = isWeb ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: bottomPadding + 16 },
      ]}
      data={imports ?? []}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <ImportCard
          item={item}
          onApprove={onApprove}
          onDismiss={onDismiss}
          approving={approveMutation.isPending && approveMutation.variables === item.id}
          dismissing={dismissMutation.isPending && dismissMutation.variables === item.id}
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      scrollEnabled={!!(imports && imports.length > 0)}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.foreground}
        />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Feather name="inbox" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            No pending imports
          </Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            Receipts imported from your inbox will appear here for review.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
  },
  card: {
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta: {
    flex: 1,
    gap: 2,
  },
  merchantText: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  dateText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  amountText: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  summary: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  filename: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  dismissBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  dismissText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  approveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600' as const,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 8,
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
});
