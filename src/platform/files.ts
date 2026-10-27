import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Writes to the app cache, then lets the user choose where to keep it via the share sheet.
export async function saveTextFile(name: string, text: string, mimeType: string): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('Saving files is not available on this device.');
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

export async function pickTextFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'application/octet-stream'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets.length) return null;
  return new File(result.assets[0].uri).text();
}
