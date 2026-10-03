import * as Location from 'expo-location';
import { withDeadline } from '../requestTimeout';

/** One foreground fix. No history, tracking, storage, or network upload. */
export async function locateOnce() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Izin lokasi belum diberikan. Kamu tetap bisa berjalan tanpa GPS.');
  if (!await Location.hasServicesEnabledAsync()) throw new Error('Layanan lokasi perangkat sedang mati.');
  return withDeadline(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 30000);
}

