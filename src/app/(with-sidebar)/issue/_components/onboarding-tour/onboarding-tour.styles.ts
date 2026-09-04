import styled from '@emotion/styled';
import { theme } from '@/styles/theme';

const DIM_COLOR = 'rgba(0, 0, 0, 0.55)';

export const Backdrop = styled.div<{ hasSpotlight: boolean }>`
  position: fixed;
  inset: 0;
  z-index: ${theme.zIndex.tour};
  background-color: ${({ hasSpotlight }) => (hasSpotlight ? 'transparent' : DIM_COLOR)};
`;

export const Spotlight = styled.div`
  position: fixed;
  border-radius: ${theme.radius.small};
  box-shadow: 0 0 0 9999px ${DIM_COLOR};
  pointer-events: none;
  transition: all 0.25s ease;
`;

export const Bubble = styled.div<{ isCentered: boolean }>`
  position: fixed;
  width: 320px;
  padding: 20px;
  border-radius: ${theme.radius.medium};
  background-color: ${theme.colors.white};
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);

  ${({ isCentered }) =>
    isCentered &&
    `
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  `}
`;

export const Counter = styled.span`
  font-size: ${theme.font.size.small};
  color: ${theme.colors.green[600]};
  font-weight: ${theme.font.weight.semibold};
`;

export const Title = styled.h2`
  margin: 8px 0 6px;
  font-size: ${theme.font.size.large};
  font-weight: ${theme.font.weight.bold};
  color: ${theme.colors.gray[900]};
`;

export const Description = styled.p`
  font-size: ${theme.font.size.medium};
  line-height: 1.6;
  color: ${theme.colors.gray[700]};
`;

export const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
`;

export const SkipButton = styled.button`
  font-size: ${theme.font.size.small};
  color: ${theme.colors.gray[500]};
  background: none;
  border: none;
  cursor: pointer;
`;

export const NextButton = styled.button`
  padding: 8px 16px;
  font-size: ${theme.font.size.medium};
  font-weight: ${theme.font.weight.medium};
  color: ${theme.colors.white};
  background-color: ${theme.colors.green[600]};
  border: none;
  border-radius: ${theme.radius.small};
  cursor: pointer;
`;
