'use client';

import { MouseEventHandler } from 'react';
import Image from 'next/image';
import * as S from './header-button.styles';

interface HeaderButtonProps {
  text?: string;
  imageSrc?: string;
  imageSize?: number;
  alt?: string;
  color?: S.SolidColor;
  variant?: S.Variant;
  onClick?: (e?: React.MouseEvent) => void;
  onMouseEnter?: MouseEventHandler<HTMLButtonElement>;
  onMouseLeave?: MouseEventHandler<HTMLButtonElement>;
  dataTourId?: string;
}

const HeaderButton = ({
  text,
  imageSrc,
  imageSize = 14,
  alt = '',
  color = 'white',
  variant = 'solid',
  onClick,
  onMouseEnter,
  onMouseLeave,
  dataTourId,
}: HeaderButtonProps) => {
  return (
    <S.ButtonContainer
      variant={variant}
      color={color}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-tour-id={dataTourId}
    >
      {imageSrc && (
        <Image
          src={imageSrc}
          alt={alt}
          width={imageSize}
          height={imageSize}
        />
      )}
      {text && <span>{text}</span>}
    </S.ButtonContainer>
  );
};

export default HeaderButton;
