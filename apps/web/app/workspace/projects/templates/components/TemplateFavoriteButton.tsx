'use client';

export function TemplateFavoriteButton({ favorite, onToggle }: { favorite: boolean; onToggle: () => void }) {
  return <button type="button" className="project-template-favorite" aria-pressed={favorite} aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={onToggle}>{favorite ? '★' : '☆'}<span>{favorite ? 'Saved' : 'Favorite'}</span></button>;
}
