'use client';

import { useState } from 'react';
import { arrow, autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';
import { createPortal } from 'react-dom';
import * as S from './tooltip.styles';
import { useTooltipStore } from './use-tooltip-store';

export default function Tooltip() {
  const { isOpen, targetNode, text } = useTooltipStore();
  // ref 대신 state로 보관: react-hooks/refs 린트가 ref를 함수에 넘기는 걸 오탐으로 잡는다
  const [arrowEl, setArrowEl] = useState<HTMLDivElement | null>(null);

  const {
    refs: { setFloating },
    floatingStyles,
    middlewareData,
    placement,
  } = useFloating({
    placement: 'bottom',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    elements: {
      reference: isOpen ? targetNode : null,
    },
    middleware: [
      offset(10), // 20px 간격
      flip(), // 공간 없으면 위로 뒤집기
      shift(), // 화면 옆으로 안 잘리게 밀기
      arrow({
        element: arrowEl,
      }),
    ],
  });

  const arrowX = middlewareData.arrow?.x;
  const arrowY = middlewareData.arrow?.y;

  const staticSide = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  }[placement.split('-')[0] as 'top' | 'right' | 'bottom' | 'left'];

  if (!isOpen || !targetNode || !targetNode.isConnected) return null;

  return createPortal(
    <S.Container
      ref={setFloating}
      style={floatingStyles}
    >
      {text}
      <S.Arrow
        ref={setArrowEl}
        style={{
          left: arrowX != null ? `${arrowX}px` : '',
          top: arrowY != null ? `${arrowY}px` : '',
          [staticSide]: '-5px',
        }}
      />
    </S.Container>,
    document.body,
  );
}
