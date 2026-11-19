'use client';

import { useParams } from 'next/navigation';
import { BoardEditor } from '../board-editor';

export default function WhiteboardPage() {
  const { whiteboardId } = useParams<{ whiteboardId: string }>();
  return <BoardEditor boardId={whiteboardId} />;
}
