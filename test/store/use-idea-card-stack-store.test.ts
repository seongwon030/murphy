/**
 * @jest-environment jsdom
 */
// 아이디어 카드 z-index 스택 store 단위 테스트
// issueId별 store 캐싱 + persist 구조라, 테스트마다 고유 issueId를 사용해 오염을 피한다.
import { useIdeaCardStackStore } from '@/app/(with-sidebar)/issue/store/use-idea-card-stack-store';
import { act, renderHook } from '../utils/test-utils';

describe('useIdeaCardStackStore - setInitialCardData', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('현재 목록에 있지만 스택에 없는 신규 ID를 맨 위에 추가한다', () => {
    const { result } = renderHook(() => useIdeaCardStackStore('issue-add'));

    act(() => result.current.setInitialCardData(['a', 'b']));
    expect(result.current.cardStack).toEqual(['a', 'b']);

    // 신규 c는 맨 위(뒤)에 쌓인다
    act(() => result.current.setInitialCardData(['a', 'b', 'c']));
    expect(result.current.cardStack).toEqual(['a', 'b', 'c']);
  });

  it('유효 목록에 없는 유령 ID를 제거한다', () => {
    const { result } = renderHook(() => useIdeaCardStackStore('issue-prune'));

    act(() => result.current.setInitialCardData(['a', 'b', 'c']));

    // b가 삭제되어 권위 목록에서 사라진 상황
    act(() => result.current.setInitialCardData(['a', 'c']));
    expect(result.current.cardStack).toEqual(['a', 'c']);
  });

  it('빈 목록이면 pruning하지 않는다 (초기 로딩 창 가드)', () => {
    const { result } = renderHook(() => useIdeaCardStackStore('issue-empty'));

    act(() => result.current.setInitialCardData(['a', 'b']));

    // 로딩 중 serverIdeas가 []인 순간에도 persist된 스택을 지우지 않는다
    act(() => result.current.setInitialCardData([]));
    expect(result.current.cardStack).toEqual(['a', 'b']);
  });

  it('bringToFront로 만든 순서가 pruning 후에도 보존된다', () => {
    const { result } = renderHook(() => useIdeaCardStackStore('issue-order'));

    act(() => result.current.setInitialCardData(['a', 'b', 'c']));
    act(() => result.current.bringToFront('a'));
    expect(result.current.cardStack).toEqual(['b', 'c', 'a']);

    // c 삭제 → 기존 순서를 유지하며 c만 제거
    act(() => result.current.setInitialCardData(['a', 'b']));
    expect(result.current.cardStack).toEqual(['b', 'a']);
  });
});

describe('useIdeaCardStackStore - getZIndex', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('스택 인덱스+1을 반환하고, 없는 ID는 0을 반환한다', () => {
    const { result } = renderHook(() => useIdeaCardStackStore('issue-zindex'));

    act(() => result.current.setInitialCardData(['a', 'b']));
    expect(result.current.getZIndex('a')).toBe(1);
    expect(result.current.getZIndex('b')).toBe(2);
    expect(result.current.getZIndex('missing')).toBe(0);
  });
});
