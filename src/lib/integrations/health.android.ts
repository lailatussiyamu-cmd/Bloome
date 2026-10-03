import Constants, { ExecutionEnvironment } from 'expo-constants';
import { todayRange, validSteps, type StepsSummary } from './types';

export async function readTodaySteps(): Promise<StepsSummary> {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) throw new Error('Gunakan build Bloome Android untuk Health Connect. Expo Go belum mendukungnya.');
  const health = await import('react-native-health-connect');
  if (!await health.initialize()) throw new Error('Health Connect belum tersedia. Periksa pembaruan Health Connect di perangkatmu.');
  const granted = await health.requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
  if (!granted.some(p => p.recordType === 'Steps' && p.accessType === 'read')) throw new Error('Izin baca langkah belum diberikan. Kamu tetap bisa memakai Bloome.');
  const { start, end } = todayRange();
  const data = await health.aggregateRecord({ recordType: 'Steps', timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() } });
  return { steps: validSteps(data.COUNT_TOTAL), source: 'Health Connect', checkedAt: end.toISOString() };
}
