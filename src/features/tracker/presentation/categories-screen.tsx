import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AppModal } from '../../../components/app-modal';
import { AppText, Button, Chip, Feedback, FormField, Surface } from '../../../design-system/primitives';
import { AppIcon, type IconName } from '../../../design-system/icon';
import { categoryColors, useTheme } from '../../../design-system/theme';
import { categoryColorTokens, categoryIconKeys } from '../../../domain/category';
import type { CategoryType, ManagedCategory } from '../../../domain/ledger';
import { ValidationError } from '../../../domain/money';
import { useTracker } from './tracker-context';

function CategoryForm({ category, type, onClose }: { category?: ManagedCategory; type: CategoryType; onClose: (changed: boolean) => void }) {
  const { service, refresh, error: storageError } = useTracker();
  const { colors, isDark } = useTheme();
  const [name, setName] = useState(category?.name ?? '');
  const [iconKey, setIconKey] = useState<string>(category?.iconKey ?? (type === 'income' ? 'income' : 'other'));
  const [colorToken, setColorToken] = useState<string>(category?.colorToken ?? 'accent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function run(work: () => Promise<void>) {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await work(); await refresh(); onClose(true); }
    catch (failure) { setError(failure instanceof ValidationError ? failure.message : 'Could not save this category. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const tint = categoryColors(colorToken, isDark);
  return <AppModal title={category ? 'Edit category' : 'New category'} visible onClose={() => { if (!busy) onClose(false); }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ padding: 12, borderRadius: 14, backgroundColor: tint.background }}><AppIcon name={iconKey as IconName} size={24} color={tint.foreground} /></View>
      <AppText size={16} weight="600" style={{ flex: 1 }}>{name.trim() || 'Category name'}</AppText>
    </View>
    <FormField label="Name" value={name} onChangeText={value => { setName(value); setError(null); }} maxLength={40} editable={!busy} autoFocus={!category} />
    <AppText size={14} weight="500">Icon</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {categoryIconKeys.map(key => <Pressable key={key} accessibilityRole="radio" accessibilityLabel={`Icon ${key}`} accessibilityState={{ checked: iconKey === key }} disabled={busy} onPress={() => setIconKey(key)}
        style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
          borderColor: iconKey === key ? colors.accent : colors.border, backgroundColor: iconKey === key ? colors.muted : colors.surface }}>
        <AppIcon name={key as IconName} size={20} color={iconKey === key ? colors.accent : colors.textSecondary} />
      </Pressable>)}
    </View>
    <AppText size={14} weight="500">Color</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {categoryColorTokens.map(token => {
        const swatch = categoryColors(token, isDark);
        return <Pressable key={token} accessibilityRole="radio" accessibilityLabel={`Color ${token}`} accessibilityState={{ checked: colorToken === token }} disabled={busy} onPress={() => setColorToken(token)}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: swatch.background, borderWidth: 2, borderColor: colorToken === token ? colors.accent : 'transparent' }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: swatch.foreground }} />
        </Pressable>;
      })}
    </View>
    {error ? <Feedback error>{error}</Feedback> : null}
    <Button label="Save category" busy={busy} disabled={Boolean(storageError)}
      onPress={() => { void run(async () => { await service!.repository.saveCategory(service!.prepareCategory({ id: category?.id, type, name, iconKey, colorToken })); }); }} />
    {category ? <Button label={category.archivedAt ? 'Restore category' : 'Archive category'} icon={category.archivedAt ? 'restore' : 'archive'} variant="quiet" disabled={busy || Boolean(storageError)}
      onPress={() => { void run(async () => { await service!.repository.setCategoryArchived(category.id, !category.archivedAt); }); }} /> : null}
    <Button label="Cancel" variant="quiet" disabled={busy} onPress={() => onClose(false)} />
  </AppModal>;
}

export function CategoriesScreen() {
  const { service, overview } = useTracker();
  const { colors, isDark } = useTheme();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [type, setType] = useState<CategoryType>('expense');
  const [items, setItems] = useState<ManagedCategory[]>([]);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<ManagedCategory | 'new' | null>(null);
  const [version, setVersion] = useState(0);
  // Re-read after any data refresh or local edit.
  useEffect(() => {
    if (!service) return;
    let live = true;
    service.repository.categories().then(result => { if (live) { setItems(result); setFailed(false); } }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [service, overview, version]);
  const shown = items.filter(item => item.type === type);
  const row = (item: ManagedCategory) => {
    const tint = categoryColors(item.colorToken, isDark);
    return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} onPress={() => setEditing(item)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : item.archivedAt ? 0.6 : 1 })}>
      <View style={{ padding: 8, borderRadius: 10, backgroundColor: tint.background }}><AppIcon name={item.iconKey as IconName} size={18} color={tint.foreground} /></View>
      <AppText size={15} style={{ flex: 1 }}>{item.name}</AppText>
      {item.archivedAt ? <AppText size={12} tone="secondary">Archived</AppText> : null}
      <AppIcon name="edit" size={16} color={colors.textSecondary} />
    </Pressable>;
  };
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
    <View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 20 }}>
      <View style={{ alignSelf: 'flex-start' }}><Button label="Back to Settings" icon="back" iconOnly variant="quiet" onPress={() => router.replace({ pathname: '/settings', params: from ? { from } : {} })} /></View>
      <AppText accessibilityRole="header" size={28} weight="600">Categories</AppText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Expenses" selected={type === 'expense'} onPress={() => setType('expense')} />
        <Chip label="Income" selected={type === 'income'} onPress={() => setType('income')} />
      </View>
      {failed ? <Feedback error>Could not load categories.</Feedback> : null}
      <Surface style={{ gap: 0, paddingVertical: 8 }}>
        {shown.filter(item => !item.archivedAt).map(row)}
        {shown.some(item => item.archivedAt) ? <AppText size={13} weight="600" tone="secondary" style={{ paddingTop: 16 }}>Archived</AppText> : null}
        {shown.filter(item => item.archivedAt).map(row)}
        <View style={{ paddingTop: 12 }}><Button label="Add category" icon="add" variant="secondary" onPress={() => setEditing('new')} /></View>
      </Surface>
      <AppText size={12} tone="secondary">Archived categories stay on past transactions but can&apos;t be chosen for new ones.</AppText>
    </View>
    {editing ? <CategoryForm category={editing === 'new' ? undefined : editing} type={editing === 'new' ? type : editing.type} onClose={changed => { setEditing(null); if (changed) setVersion(value => value + 1); }} /> : null}
  </ScrollView>;
}
