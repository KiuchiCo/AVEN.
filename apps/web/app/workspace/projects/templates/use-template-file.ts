'use client';

import { useState } from 'react';
import { parseProjectTemplateFile } from './validate-file';
import type { ProjectTemplateFile } from './types';

export function useTemplateFile() {
  const [file, setFile] = useState<ProjectTemplateFile | null>(null);
  const [error, setError] = useState('');
  async function read(selected: File | undefined) {
    setError(''); setFile(null);
    if (!selected) return;
    try { setFile(parseProjectTemplateFile(await selected.text())); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not read this template file.'); }
  }
  return { file, error, read, clear: () => { setFile(null); setError(''); }, reportError: (message: string) => setError(message) };
}
