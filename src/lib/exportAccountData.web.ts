/** Download locally, including browsers without the Web Share API. */
export async function exportAccountData(json: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = 'bloome-data.json';
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to start reading the download before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
