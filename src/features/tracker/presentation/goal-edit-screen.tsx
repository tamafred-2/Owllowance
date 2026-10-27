import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { DateField } from '../../../components/date-field';
import { AppText, Button, Chip, Feedback, FormField, Surface } from '../../../design-system/primitives';
import { AppIcon, type IconName } from '../../../design-system/icon';
import { categoryColors, useTheme } from '../../../design-system/theme';
import type { Goal } from '../../../domain/ledger';
import { addDays, eventTime } from '../../../domain/date';
import { ValidationError } from '../../../domain/money';
import { categoryColorTokens } from '../../../domain/category';
import { canPickImages, pickGoalImage, removeGoalImage } from '../../../platform/images';
import { goalIcons } from './goals-section';
import { useTracker } from './tracker-context';

function GoalEditor({ goal }: { goal?: Goal }) {
  const { service, refresh, error: storageError } = useTracker();
  const { colors, isDark } = useTheme();
  const today = eventTime().localDate;
  const [name, setName] = useState(goal?.name ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [target, setTarget] = useState(goal ? (goal.targetMinor / 100).toFixed(2) : '');
  const [hasDate, setHasDate] = useState(Boolean(goal?.targetDate));
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? addDays(today, 90));
  const [iconKey, setIconKey] = useState(goal?.iconKey ?? 'savings');
  const [colorToken, setColorToken] = useState(goal?.colorToken ?? 'teal');
  const [imageUri, setImageUri] = useState(goal?.imageUri ?? null);
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  // A photo picked on this page but not saved yet; its copy is removed if the page is left without saving.
  const unsaved = useRef<string | null>(null);

  function leave(saved?: string, id = goal?.id) {
    if (id) router.replace({ pathname: '/goal', params: saved ? { id, saved } : { id } });
    else router.replace({ pathname: '/plan', params: { tab: 'goals' } });
  }
  function cancel() {
    if (busy) return;
    removeGoalImage(unsaved.current); unsaved.current = null;
    leave();
  }
  const cancelRef = useRef(cancel);
  useEffect(() => { cancelRef.current = cancel; });
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { cancelRef.current(); return true; });
    return () => subscription.remove();
  }, []);

  async function choosePhoto() {
    setError(null);
    try {
      const uri = await pickGoalImage();
      if (!uri) return;
      removeGoalImage(unsaved.current);
      unsaved.current = uri; setImageUri(uri);
    } catch { setError('Could not open your photos. Try again.'); }
  }
  function removePhoto() {
    if (unsaved.current === imageUri) { removeGoalImage(unsaved.current); unsaved.current = null; }
    setImageUri(null);
  }
  async function save() {
    if (!service || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const command = service.prepareGoal({ id: goal?.id, name, description, imageUri, target, targetDate: hasDate ? targetDate : null, iconKey, colorToken });
      await service.repository.saveGoal(command);
      // The replaced photo is no longer referenced.
      if (goal?.imageUri && goal.imageUri !== imageUri) removeGoalImage(goal.imageUri);
      unsaved.current = null;
      await refresh();
      leave('goal', command.id);
    } catch (failure) { setError(failure instanceof ValidationError ? failure.message : 'Could not save this goal. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const showPhoto = imageUri && imageUri !== brokenUri;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Button label={goal ? 'Back to goal' : 'Back to Plan'} icon="back" iconOnly variant="quiet" disabled={busy} onPress={cancel} />
          <AppText accessibilityRole="header" size={24} weight="600">{goal ? 'Edit goal' : 'New goal'}</AppText>
        </View>
        <Surface style={{ gap: 18 }}>
          {showPhoto ? <View style={{ gap: 10 }}>
            <Image testID="goal-photo" source={{ uri: imageUri }} accessibilityIgnoresInvertColors onError={() => setBrokenUri(imageUri)}
              style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: colors.muted }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {canPickImages ? <View style={{ flex: 1 }}><Button label="Change photo" icon="photo" variant="secondary" disabled={busy} onPress={() => { void choosePhoto(); }} /></View> : null}
              <View style={{ flex: 1 }}><Button label="Remove photo" icon="delete" variant="quiet" disabled={busy} onPress={removePhoto} /></View>
            </View>
          </View> : canPickImages ? <Pressable accessibilityRole="button" accessibilityLabel="Add a cover photo" disabled={busy} onPress={() => { void choosePhoto(); }}
            style={({ pressed }) => ({ height: 132, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: pressed ? colors.muted : colors.background,
              alignItems: 'center', justifyContent: 'center', gap: 8 })}>
            <AppIcon name="photo" size={26} color={colors.accent} />
            <AppText size={14} weight="500">Add a cover photo</AppText>
            <AppText size={12} tone="secondary">Optional. It stays on this phone.</AppText>
          </Pressable> : null}
          <FormField label="Goal name" placeholder="New phone, Emergency fund…" value={name} onChangeText={setName} maxLength={60} editable={!busy} />
          <FormField label="Description (optional)" placeholder="What it's for, the model you want, where to buy…" value={description} onChangeText={setDescription}
            maxLength={500} multiline editable={!busy} style={{ minHeight: 88, textAlignVertical: 'top' }} />
          <FormField label="Target (PHP)" placeholder="0.00" value={target} onChangeText={setTarget} keyboardType="decimal-pad" editable={!busy} />
          <View style={{ gap: 10 }}>
            <AppText size={14} weight="500">Deadline</AppText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="No deadline" selected={!hasDate} disabled={busy} onPress={() => setHasDate(false)} />
              <Chip label="By a date" selected={hasDate} disabled={busy} onPress={() => setHasDate(true)} />
            </View>
            {hasDate ? <DateField label="Target date" value={targetDate} onChange={setTargetDate} disabled={busy} /> : null}
          </View>
          <View style={{ gap: 10 }}>
            <AppText size={14} weight="500">Icon</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {goalIcons.map(key => <Pressable key={key} accessibilityRole="radio" accessibilityLabel={`Icon ${key}`} accessibilityState={{ checked: iconKey === key }} disabled={busy} onPress={() => setIconKey(key)}
                style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: iconKey === key ? colors.accent : colors.border, backgroundColor: iconKey === key ? colors.muted : colors.surface }}>
                <AppIcon name={key as IconName} size={20} color={iconKey === key ? colors.accent : colors.textSecondary} />
              </Pressable>)}
            </View>
          </View>
          <View style={{ gap: 10 }}>
            <AppText size={14} weight="500">Color</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {categoryColorTokens.map(token => {
                const swatch = categoryColors(token, isDark);
                return <Pressable key={token} accessibilityRole="radio" accessibilityLabel={`Color ${token}`} accessibilityState={{ checked: colorToken === token }} disabled={busy} onPress={() => setColorToken(token)}
                  style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: swatch.background, borderWidth: 2, borderColor: colorToken === token ? colors.accent : 'transparent' }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: swatch.foreground }} />
                </Pressable>;
              })}
            </View>
          </View>
          {error ? <Feedback error>{error}</Feedback> : null}
          <Button label="Save goal" icon="check" busy={busy} disabled={Boolean(storageError)} onPress={() => { void save(); }} />
          <Button label="Cancel" variant="quiet" disabled={busy} onPress={cancel} />
        </Surface>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

// New goal, or edit an existing one with ?id=.
export function GoalEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { overview } = useTracker();
  if (!overview) return null;
  const goal = id ? overview.goals.find(item => item.id === id) : undefined;
  if (id && !goal) return <View style={{ padding: 24, gap: 16 }}><AppText>This goal is no longer available.</AppText><Button label="Open Plan" onPress={() => router.replace({ pathname: '/plan', params: { tab: 'goals' } })} /></View>;
  return <GoalEditor key={goal?.id ?? 'new'} goal={goal} />;
}
