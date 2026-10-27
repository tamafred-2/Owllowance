import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

export const canPickImages = true;

// Lets the user crop a photo from their gallery, then keeps a copy in the app's own storage
// (the picker's copy lives in a cache that the system may clear). Returns the copy's file URI.
export async function pickGoalImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.7 });
  if (result.canceled || !result.assets.length) return null;
  const folder = new Directory(Paths.document, 'goal-images');
  if (!folder.exists) folder.create({ intermediates: true });
  const extension = /\.(jpe?g|png|webp|heic)$/i.exec(result.assets[0].uri)?.[0] ?? '.jpg';
  const copy = new File(folder, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${extension}`);
  new File(result.assets[0].uri).copy(copy);
  return copy.uri;
}

// Best effort: a missing file is already gone.
export function removeGoalImage(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch { /* Nothing to clean up. */ }
}
