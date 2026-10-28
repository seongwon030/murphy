'use client';

import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';
import { createPortal } from 'react-dom';
import * as S from './onboarding-tour.styles';
import { useOnboardingTour } from './use-onboarding-tour';

const SPOTLIGHT_PADDING = 8;

interface OnboardingTourProps {
  enabled: boolean;
}

const OnboardingTour = ({ enabled }: OnboardingTourProps) => {
  const {
    isOpen,
    step,
    stepIndex,
    totalSteps,
    isLastStep,
    anchor,
    anchorRect,
    isAnchorLarge,
    goNext,
    skip,
  } = useOnboardingTour(enabled);

  const isFloating = !!anchor && !isAnchorLarge;

  // setFloating을 refs에서 구조분해: react-hooks/refs 린트가 refs.setFloating을 오탐으로 잡는다
  const {
    refs: { setFloating },
    floatingStyles,
  } = useFloating({
    placement: 'bottom',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    elements: {
      reference: anchor,
    },
    middleware: [offset(16), flip(), shift({ padding: 16 })],
  });

  if (!isOpen || !step) return null;

  return createPortal(
    <S.Backdrop hasSpotlight={!!anchorRect}>
      {anchorRect && (
        <S.Spotlight
          style={{
            top: anchorRect.top - SPOTLIGHT_PADDING,
            left: anchorRect.left - SPOTLIGHT_PADDING,
            width: anchorRect.width + SPOTLIGHT_PADDING * 2,
            height: anchorRect.height + SPOTLIGHT_PADDING * 2,
          }}
        />
      )}
      <S.Bubble
        ref={setFloating}
        isCentered={!isFloating}
        style={isFloating ? floatingStyles : undefined}
      >
        <S.Counter>
          {stepIndex + 1} / {totalSteps}
        </S.Counter>
        <S.Title>{step.title}</S.Title>
        <S.Description>{step.description}</S.Description>
        <S.Footer>
          <S.SkipButton onClick={skip}>건너뛰기</S.SkipButton>
          <S.NextButton onClick={goNext}>{isLastStep ? '시작하기' : '다음'}</S.NextButton>
        </S.Footer>
      </S.Bubble>
    </S.Backdrop>,
    document.body,
  );
};

export default OnboardingTour;
