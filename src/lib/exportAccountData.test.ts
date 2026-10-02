import { afterEach, expect, it, vi } from 'vitest';
import { exportAccountData } from './exportAccountData.web';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('downloads JSON without Web Share and releases the temporary URL after the download starts', async () => {
  vi.useFakeTimers();
  const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  const appendChild = vi.fn();
  vi.stubGlobal('document', { createElement: () => link, body: { appendChild } });
  vi.stubGlobal('navigator', {});
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  await exportAccountData('{"nickname":"Test"}');
  expect(await (create.mock.calls[0][0] as Blob).text()).toBe('{"nickname":"Test"}');
  expect(link.download).toBe('bloome-data.json');
  expect(link.href).toBe('blob:test');
  expect(appendChild).toHaveBeenCalledWith(link);
  expect(link.click).toHaveBeenCalledOnce();
  expect(link.remove).toHaveBeenCalledOnce();
  expect(revoke).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(revoke).toHaveBeenCalledWith('blob:test');
});
