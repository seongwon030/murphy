import { useCallback, useEffect, useReducer, useState } from 'react';
import { completeOnboarding, hasCompletedOnboarding } from '@/lib/storage/onboarding-storage';
import { TOUR_STEPS } from './tour-steps';

const NOT_STARTED = -1;

/** 앵커가 화면을 이만큼 덮으면 말풍선을 붙일 자리가 없다고 보고 화면 중앙에 띄운다 */
const LARGE_ANCHOR_HEIGHT_RATIO = 0.6;

export function useOnboardingTour(enabled: boolean) {
  const [stepIndex, setStepIndex] = useState(NOT_STARTED);
  const [hasDecided, setHasDecided] = useState(false);
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  // 투어가 활성화되는 첫 렌더에 시작 여부를 결정한다 (아직 본 적 없는 사용자만)
  if (enabled && !hasDecided) {
    setHasDecided(true);
    if (!hasCompletedOnboarding()) setStepIndex(0);
  }

  const isOpen = stepIndex !== NOT_STARTED;
  const step = isOpen ? TOUR_STEPS[stepIndex] : null;
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;

  // 앵커를 찾지 못하면 스포트라이트 없이 말풍선만 화면 중앙에 띄운다
  const anchor = step?.findAnchor() ?? null;
  const anchorRect = anchor?.getBoundingClientRect() ?? null;
  const isAnchorLarge =
    !!anchorRect && anchorRect.height > window.innerHeight * LARGE_ANCHOR_HEIGHT_RATIO;

  const finish = useCallback(() => {
    completeOnboarding();
    setStepIndex(NOT_STARTED);
  }, []);

  const goNext = useCallback(() => {
    if (isLastStep) {
      finish();
      return;
    }

    setStepIndex((current) => current + 1);
  }, [isLastStep, finish]);

  // 창 크기가 바뀌면 앵커 위치를 다시 잰다
  useEffect(() => {
    if (!anchor) return;

    window.addEventListener('resize', rerender);
    return () => window.removeEventListener('resize', rerender);
  }, [anchor]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, finish]);

  return {
    isOpen,
    step,
    stepIndex,
    totalSteps: TOUR_STEPS.length,
    isLastStep,
    anchor,
    anchorRect,
    isAnchorLarge,
    goNext,
    skip: finish,
  };
}
