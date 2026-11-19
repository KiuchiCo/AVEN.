import { parseSegments } from './mention-text';

/** Message text with mentions highlighted, shown with the person's real current name. Nothing is treated as HTML. */
export function MessageBody({ body, names }: { body: string; names: Map<string, string> }) {
  return <>{parseSegments(body).map((segment, index) => 'mention' in segment ? <strong key={index} className="chat-mention">@{names.get(segment.mention.id) ?? segment.mention.name}</strong> : segment.text)}</>;
}
