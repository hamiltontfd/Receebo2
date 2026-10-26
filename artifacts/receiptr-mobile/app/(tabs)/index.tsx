import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useListReceipts } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';

interface Receipt {
  id: number;
  merchant?: string | null;
  originalFileName: string;
  total?: number | null;
  currency?: string | null;
  purchaseDate?: string | null;
  category?: string | null;
  status: string;
  isDraft?: boolean;
}

function formatAmount(total: number | null | undefined, currency: string | null | undefined): string {
  if (total == null) return '';
  const sym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
  return `${sym}${total.toFixed(2)}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'completed' ? '#22c55e' : status === 'processing' ? '#f59e0b' : '#9ca3af';
  return (
    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
  );
}

interface ReceiptCardProps {
  item: Receipt;
  onPress: () => void;
}

function ReceiptCard({ item, onPress }: ReceiptCardProps) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.muted : colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
      onPress={onPress}
    >
      {/* Icon */}
      <View style={[styles.receiptIcon, { backgroundColor: colors.muted }]}>
        <Feather name="file-text" size={18} color={colors.mutedForeground} />
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        <Text style={[styles.merchant, { color: colors.foreground }]} numberOfLines={1}>
          {item.merchant ?? item.originalFileName}
        </Text>
        <View style={styles.cardMeta}>
          <StatusDot status={item.status} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {formatDate(item.purchaseDate)}
          </Text>
          {item.category ? (
            <>
              <Text style={{ color: colors.border, fontSize: 12 }}>·</Text>
              <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {item.category}
              </Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Amount */}
      {item.total != null && (
        <Text style={[styles.amount, { color: colors.foreground }]}>
          {formatAmount(item.total, item.currency)}
        </Text>
      )}

      <Feather name="chevron-right" size={16} color={colors.border} />
    </Pressable>
  );
}

function SkeletonCard() {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <View style={[styles.receiptIcon, { backgroundColor: colors.muted }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ height: 14, width: '60%', backgroundColor: colors.muted, borderRadius: 4 }} />
        <View style={{ height: 12, width: '40%', backgroundColor: colors.muted, borderRadius: 4 }} />
      </View>
    </View>
  );
}

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSearchChange = (text: string) => {
    setSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 400);
  };

  const { data: receipts, isLoading, refetch, isRefetching } = useListReceipts({
    q: debouncedSearch || undefined,
  });

  const displayReceipts = (receipts?.items ?? []).filter((r) => !r.isDraft);

  const topPad = isWeb ? 67 : 0;
  const bottomPad = isWeb ? 34 : insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Search bar */}
      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            paddingTop: topPad + 8,
          },
        ]}
      >
        <View
          style={[
            styles.searchInput,
            {
              backgroundColor: colors.muted,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchText, { color: colors.foreground }]}
            placeholder="Search receipts…"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={onSearchChange}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => { setSearch(''); setDebouncedSearch(''); }}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={[styles.listContent, { paddingBottom: bottomPad + 16 }]}>
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 16 }]}
          data={displayReceipts}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ReceiptCard
              item={item}
              onPress={() => router.push(`/receipt/${item.id}`)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          scrollEnabled={!!displayReceipts.length}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.foreground}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="file-text" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {debouncedSearch ? 'No results' : 'No receipts yet'}
              </Text>
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                {debouncedSearch
                  ? `No receipts match "${debouncedSearch}"`
                  : 'Connect your inbox in Settings to start importing receipts automatically.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  listContent: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    padding: 12,
  },
  receiptIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  merchant: {
    fontSize: 15,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  amount: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  empty: {
    alignItems: 'center',
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
