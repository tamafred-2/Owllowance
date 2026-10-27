import { View } from 'react-native';
import { AppText, Button, Feedback, FormField, Surface } from '../../../design-system/primitives';
import { AppIcon } from '../../../design-system/icon';
import { useWalletSetup } from './use-entry-forms';

export function WalletSetup() {
  const form = useWalletSetup();
  return <View style={{ width: '100%', maxWidth: 580, alignSelf: 'center', gap: 24, paddingVertical: 24 }}>
    <AppIcon name="wallet" size={32} />
    <View style={{ gap: 8 }}><AppText size={28} weight="600">Start with one wallet.</AppText>
      <AppText tone="secondary">Give your everyday money a home. You can record your first expense in a moment.</AppText></View>
    <Surface style={{ gap: 24 }}>
      <FormField label="Wallet name" value={form.name} onChangeText={form.setName} maxLength={60} editable={!form.busy} autoComplete="off" />
      <FormField label="Opening balance (PHP)" value={form.amount} onChangeText={form.setAmount} keyboardType="decimal-pad" editable={!form.busy}
        hint="Enter what is in this wallet now. An opening balance is not income." />
      {form.error ? <Feedback error>{form.error}</Feedback> : null}
      <Button label="Create wallet" busy={form.busy} onPress={() => { void form.submit(); }} />
      <Button label="Skip — start with Cash at ₱0.00" variant="quiet" disabled={form.busy} onPress={() => { void form.submit(true); }} />
    </Surface>
  </View>;
}
