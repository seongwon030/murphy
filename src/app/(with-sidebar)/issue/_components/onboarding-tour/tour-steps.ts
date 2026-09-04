import { ISSUE_STATUS } from '@/constants/issue';

export interface TourStep {
  id: string;
  title: string;
  description: string;
  /** 스포트라이트를 씌울 요소. 찾지 못하면 말풍선만 화면 중앙에 표시한다. */
  findAnchor: () => HTMLElement | null;
}

const bySelector = (selector: string) => () => document.querySelector<HTMLElement>(selector);

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'overview',
    title: '결론까지 5단계',
    description:
      '아이디어를 모아 결론으로 좁혀가는 5단계입니다. 지금 어디쯤인지는 여기서 확인할 수 있어요.',
    findAnchor: bySelector('[data-tour-id="progress-bar"]'),
  },
  {
    id: 'brainstorming',
    title: '1. 브레인스토밍',
    description:
      '배경을 더블클릭해 아이디어를 적습니다. 고르는 건 나중 일이고, 지금은 많이 꺼내는 게 목적이에요.',
    findAnchor: bySelector('[data-testid="issue-canvas"]'),
  },
  {
    id: 'categorize',
    title: '2. 카테고리화',
    description:
      'AI가 비슷한 아이디어를 묶어줍니다. 흩어져 있던 아이디어에서 논점이 몇 개인지 드러나요.',
    findAnchor: bySelector(`[data-tour-step="${ISSUE_STATUS.CATEGORIZE}"]`),
  },
  {
    id: 'vote',
    title: '3. 투표',
    description:
      '팀원이 찬반을 남깁니다. 의견이 갈리는 아이디어를 찾아 그쪽에 논의를 집중하기 위한 단계예요.',
    findAnchor: bySelector(`[data-tour-step="${ISSUE_STATUS.VOTE}"]`),
  },
  {
    id: 'select',
    title: '4. 채택, 그리고 종료',
    description:
      '투표 결과를 근거로 최종 아이디어를 고르고 이슈를 닫습니다. 종료하면 논의 요약을 볼 수 있어요.',
    findAnchor: bySelector(`[data-tour-step="${ISSUE_STATUS.SELECT}"]`),
  },
  {
    id: 'next-step',
    title: '단계 넘기기',
    description:
      '다음 단계로 넘기는 건 방장만 할 수 있습니다. 한 번 넘기면 이전 단계로 돌아올 수 없으니 팀원과 맞춰보고 누르세요.',
    findAnchor: bySelector('[data-tour-id="next-step-button"]'),
  },
];
