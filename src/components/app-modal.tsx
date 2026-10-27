import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { AppText, Surface } from '../design-system/primitives';

export function AppModal({ title, visible, onClose, children }: { title: string; visible: boolean; onClose: () => void; children: ReactNode }) {
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 480, alignSelf: 'center' }}>
          <Surface style={{ gap: 16 }}><AppText accessibilityRole="header" size={22} weight="600">{title}</AppText>{children}</Surface>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}
