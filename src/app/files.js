// Browser file access for the shells. Call pickText straight from a user gesture (a menu pick): browsers open the
// file dialog only then. Resolves to { name, text }, or null when the dialog is cancelled.
export function pickText(accept) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('cancel', () => resolve(null));
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(text => resolve({ name: file.name, text }), reject);
    });
    input.click();
  });
}

// Lets the user choose where a file goes (folder and name), in browsers with a save dialog; elsewhere the file becomes
// a download to the browser's download folder. Call it straight from a user gesture: the dialog opens only then.
// The content can come later (a backup is read from the amp after the place is chosen).
// Resolves to { write(text) }, or null when the dialog is cancelled.
export async function choose(name) {
  if (typeof window.showSaveFilePicker !== 'function') return { write: async text => download(name, text) };
  let handle;
  try {
    handle = await window.showSaveFilePicker({ suggestedName: name });
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
  return {
    async write(text) {
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
    }
  };
}

export function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
