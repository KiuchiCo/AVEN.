import { Suspense } from 'react';
import { DocumentsBrowser } from './documents-browser';

export default function DocumentsPage() {
  return <Suspense fallback={null}><DocumentsBrowser /></Suspense>;
}
