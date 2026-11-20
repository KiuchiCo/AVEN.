'use client';

import { useState } from 'react';
import { useT } from '../../../../i18n';
import type { TemplateTaskReadinessDimension } from '../presets/task-coaching/types';
import { useBrowserStorageValue, writeBrowserStorageValue } from '../browser-storage';

type Scores = Record<string, number>;

function storageKey(presetId: string, taskIndex: number) {
  return `aven:template-readiness:${presetId}:${taskIndex}`;
}

export function TaskReadinessReview({ presetId, taskIndex, dimensions }: { presetId: string; taskIndex: number; dimensions: TemplateTaskReadinessDimension[] }) {
  const t = useT();
  const [custom, setCustom] = useState('');
  const message = custom || t('tpl.rd.prompt');
  const key = storageKey(presetId, taskIndex);
  const storedScores = useBrowserStorageValue(key);
  let scores: Scores = {};
  try { if (storedScores) scores = JSON.parse(storedScores) as Scores; } catch { /* Invalid saved data is ignored and can be replaced by a new rating. */ }

  function choose(dimension: string, score: number) {
    const next = { ...scores, [dimension]: score };
    setCustom(writeBrowserStorageValue(key, JSON.stringify(next)) ? t('tpl.rd.saved') : t('tpl.rd.saveFailed'));
  }

  function clear() {
    setCustom(writeBrowserStorageValue(key, null) ? t('tpl.rd.cleared') : t('tpl.rd.clearFailed'));
  }

  const rated = dimensions.filter(({ dimension }) => scores[dimension] >= 1 && scores[dimension] <= 5);
  const average = rated.length ? (rated.reduce((sum, { dimension }) => sum + scores[dimension], 0) / rated.length).toFixed(1) : '—';

  return (
    <section className="project-template-readiness" aria-label={t('tpl.rd.aria')}>
      <header><div><h4>{t('tpl.rd.title')}</h4><p>{t('tpl.rd.intro')}</p></div><strong>{average}<small> / 5</small></strong></header>
      <div className="project-template-readiness__dimensions">
        {dimensions.map(({ dimension, levels }) => {
          const selected = levels.find(({ score }) => score === scores[dimension]);
          return (
            <fieldset key={dimension}>
              <legend>{dimension}</legend>
              <div role="group" aria-label={t('tpl.rd.group', { dimension })} className="project-template-readiness__scale">
                {levels.map(({ score }) => <button key={score} type="button" aria-pressed={scores[dimension] === score} aria-label={t('tpl.rd.levelAria', { dimension, score })} onClick={() => choose(dimension, score)}>{score}</button>)}
              </div>
              {selected ? <><p><strong>{t('tpl.rd.level', { score: selected.score })}</strong> {selected.guidance}</p><p className="project-template-readiness__action"><strong>{t('tpl.rd.next')}</strong> {selected.nextAction}</p></> : <p>{t('tpl.rd.select')}</p>}
            </fieldset>
          );
        })}
      </div>
      <footer><span role="status" aria-live="polite">{message}</span><button type="button" onClick={clear}>{t('tpl.rd.clear')}</button></footer>
    </section>
  );
}
