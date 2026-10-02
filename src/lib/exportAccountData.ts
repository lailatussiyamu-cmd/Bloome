import { Share } from 'react-native';

export async function exportAccountData(json: string): Promise<void> {
  await Share.share({ title: 'Data Bloome-ku', message: json });
}
