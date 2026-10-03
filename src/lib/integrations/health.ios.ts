import Constants, { ExecutionEnvironment } from 'expo-constants';
import { todayRange, validSteps, type StepsSummary } from './types';

export async function readTodaySteps(): Promise<StepsSummary> {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) throw new Error('Gunakan build Bloome iOS untuk Apple Health. Expo Go belum mendukungnya.');
  const health = await import('@kingstinct/react-native-healthkit');
  if (!await health.isHealthDataAvailable()) throw new Error('Apple Health belum tersedia di perangkat ini.');
  await health.requestAuthorization({ toRead: ['HKQuantityTypeIdentifierStepCount'] });
  const { start, end } = todayRange();
  const data = await health.queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], { unit: 'count', filter: { date: { startDate: start, endDate: end } } });
  // HealthKit intentionally does not disclose whether read permission was denied.
  return { steps: validSteps(data.sumQuantity?.quantity), source: 'Apple Health', checkedAt: end.toISOString() };
}
