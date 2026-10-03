import { beforeEach, expect, it, vi } from 'vitest';
import { readTodaySteps as android } from './health.android';
import { readTodaySteps as ios } from './health.ios';
const mock = vi.hoisted(() => ({ permission: vi.fn(), aggregate: vi.fn(), authorize: vi.fn(), statistics: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { executionEnvironment: 'standalone' }, ExecutionEnvironment: { StoreClient: 'storeClient' } }));
vi.mock('react-native-health-connect', () => ({ initialize: async () => true, requestPermission: mock.permission, aggregateRecord: mock.aggregate }));
vi.mock('@kingstinct/react-native-healthkit', () => ({ isHealthDataAvailable: async () => true, requestAuthorization: mock.authorize, queryStatisticsForQuantity: mock.statistics }));
beforeEach(() => { vi.clearAllMocks(); });
it('does not read Android steps when permission is denied', async () => {
  mock.permission.mockResolvedValue([]);
  await expect(android()).rejects.toThrow('Izin baca langkah');
  expect(mock.aggregate).not.toHaveBeenCalled();
});
it('requests only read steps and uses the provider aggregate', async () => {
  mock.permission.mockResolvedValue([{ recordType: 'Steps', accessType: 'read' }]);
  mock.aggregate.mockResolvedValue({ COUNT_TOTAL: 200 });
  expect((await android()).steps).toBe(200);
  expect(mock.permission).toHaveBeenCalledWith([{ recordType: 'Steps', accessType: 'read' }]);
  expect(mock.aggregate.mock.calls[0][0].recordType).toBe('Steps');
});
it('does not claim iOS permission granted when HealthKit returns no readable data', async () => {
  mock.authorize.mockResolvedValue(true);
  mock.statistics.mockResolvedValue({});
  expect((await ios()).steps).toBeNull();
  expect(mock.authorize).toHaveBeenCalledWith({ toRead: ['HKQuantityTypeIdentifierStepCount'] });
});
