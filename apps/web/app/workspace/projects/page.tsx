import { Suspense } from 'react';
import { ProjectsDirectory } from './projects-directory';

export default function ProjectsPage() {
  return <Suspense fallback={null}><ProjectsDirectory /></Suspense>;
}
