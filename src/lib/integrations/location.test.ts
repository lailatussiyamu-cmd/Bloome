import { expect, it, vi } from 'vitest';
import { locateOnce } from './location';
const mocks = vi.hoisted(() => ({ permission: vi.fn(), position: vi.fn() }));
vi.mock('expo-location', () => ({ requestForegroundPermissionsAsync: mocks.permission, hasServicesEnabledAsync: async () => true, getCurrentPositionAsync: mocks.position, Accuracy: { Balanced: 3 } }));
it('never reads coordinates when foreground permission is denied', async () => {
  mocks.permission.mockResolvedValue({ granted: false });
  await expect(locateOnce()).rejects.toThrow('Izin lokasi');
  expect(mocks.position).not.toHaveBeenCalled();
});
