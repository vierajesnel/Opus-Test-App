import { useMemo } from 'react';

import { CHAPTERS } from '../content/chapters';
import { levelById, nextLevelAfter } from '../content/levels';
import { Play } from '../game/Play';
import { useNav } from '../nav/Navigator';
import { appStore, markLessonSeen, markOnboarded, reportCompletion } from '../state/app';
import { levelUnlocked } from '../state/progress';
import { EmptyState } from './EmptyState';

export function LevelScreen({ id }: { id: string }) {
  const nav = useNav();
  const level = levelById(id);
  // Read once on entry: the intro shouldn't change mid-sky.
  const intro = useMemo(() => {
    if (!level) return null;
    const save = appStore.get().save;
    const chapter = CHAPTERS[level.chapter];
    if (level.index === 0 && !save.flags.lessons.includes(level.chapter)) {
      return level.chapter === 0 ? chapter.lesson : `${chapter.intro} ${chapter.lesson}`;
    }
    return null;
  }, [level]);
  const firstEver = useMemo(() => !appStore.get().save.flags.onboarded && id === '1-1', [id]);

  if (!level) {
    return <EmptyState title="This sky has drifted off" body="It isn’t on any chart I keep." onBack={nav.back} />;
  }

  const next = nextLevelAfter(id);
  const goNext = () => {
    const save = appStore.get().save;
    if (next && levelUnlocked(save, next.chapter, next.index)) nav.replace({ name: 'level', id: next.id });
    else nav.replace({ name: 'voyage', chapter: level.chapter });
  };

  return (
    <Play
      key={id}
      level={level}
      title={`Sky ${id}`}
      intro={intro}
      hue={CHAPTERS[level.chapter].hue}
      showGhost={firstEver}
      onFirstLaunch={() => {
        if (intro) markLessonSeen(level.chapter);
      }}
      onComplete={(flings) => {
        const r = reportCompletion(id, flings);
        markOnboarded();
        return { improved: r.improved };
      }}
      primaryLabel={next ? 'Next sky' : 'Back to the Voyage'}
      onPrimary={goNext}
      leaveLabel="Leave sky"
      onLeave={nav.back}
    />
  );
}
