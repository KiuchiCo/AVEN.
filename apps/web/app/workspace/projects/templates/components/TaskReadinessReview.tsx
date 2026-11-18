'use client';

import { useEffect, useState } from 'react';
import type { TemplateTaskReadinessDimension } from '../presets/task-coaching/types';

type Scores = Record<string, number>;

function storageKey(presetId: string, taskIndex: number) {
  return `aven:template-readiness:${presetId}:${taskIndex}`;
}

export function TaskReadinessReview({ presetId, taskIndex, dimensions }: { presetId: string; taskIndex: number; dimensions: TemplateTaskReadinessDimension[] }) {
  const [scores, setScores] = useState<Scores>({});
  const [message, setMessage] = useState('Choose a level for each dimension; scores are a planning aid, not an automatic approval.');
  const key = storageKey(presetId, taskIndex);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) setScores(JSON.parse(stored) as Scores);
    } catch {
      setMessage('Could not load saved ratings from this browser. You can still assess this task.');
    }
  }, [key]);

  function choose(dimension: string, score: number) {
    const next = { ...scores, [dimension]: score };
    setScores(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setMessage('Ratings saved in this browser.');
    } catch {
      setMessage('Could not save these ratings locally.');
    }
  }

  function clear() {
    setScores({});
    try {
      localStorage.removeItem(key);
      setMessage('Ratings cleared.');
    } catch {
      setMessage('Ratings cleared from view, but the saved copy could not be removed.');
    }
  }

  const rated = dimensions.filter(({ dimension }) => scores[dimension] >= 1 && scores[dimension] <= 5);
  const average = rated.length ? (rated.reduce((sum, { dimension }) => sum + scores[dimension], 0) / rated.length).toFixed(1) : '—';

  return (
    <section className="project-template-readiness" aria-label="Task readiness assessment">
      <header><div><h4>Readiness review</h4><p>Compare the plan with evidence before treating this task as ready.</p></div><strong>{average}<small> / 5</small></strong></header>
      <div className="project-template-readiness__dimensions">
        {dimensions.map(({ dimension, levels }) => {
          const selected = levels.find(({ score }) => score === scores[dimension]);
          return (
            <fieldset key={dimension}>
              <legend>{dimension}</legend>
              <div role="group" aria-label={`${dimension} readiness level`} className="project-template-readiness__scale">
                {levels.map(({ score }) => <button key={score} type="button" aria-pressed={scores[dimension] === score} aria-label={`${dimension}: level ${score} of 5`} onClick={() => choose(dimension, score)}>{score}</button>)}
              </div>
              {selected ? <><p><strong>Level {selected.score}.</strong> {selected.guidance}</p><p className="project-template-readiness__action"><strong>Suggested next action:</strong> {selected.nextAction}</p></> : <p>Select a level to see the task-specific review guidance.</p>}
            </fieldset>
          );
        })}
      </div>
      <footer><span role="status" aria-live="polite">{message}</span><button type="button" onClick={clear}>Clear ratings</button></footer>
    </section>
  );
}
