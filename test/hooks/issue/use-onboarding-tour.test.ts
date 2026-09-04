/**
 * @jest-environment jsdom
 */
import { TOUR_STEPS } from '@/app/(with-sidebar)/issue/_components/onboarding-tour/tour-steps';
import { useOnboardingTour } from '@/app/(with-sidebar)/issue/_components/onboarding-tour/use-onboarding-tour';
import { act, renderHook } from '../../utils/test-utils';

const STORAGE_KEY = 'issue-onboarding-completed';

describe('useOnboardingTour', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('처음 방문한 사용자에게 첫 스텝부터 투어를 연다', () => {
    const { result } = renderHook(() => useOnboardingTour(true));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.step?.id).toBe(TOUR_STEPS[0].id);
  });

  it('아직 활성화되지 않았으면 투어를 열지 않는다', () => {
    const { result } = renderHook(() => useOnboardingTour(false));

    expect(result.current.isOpen).toBe(false);
  });

  it('이미 투어를 본 사용자에게는 다시 열지 않는다', () => {
    localStorage.setItem(STORAGE_KEY, 'true');

    const { result } = renderHook(() => useOnboardingTour(true));

    expect(result.current.isOpen).toBe(false);
  });

  it('다음을 누르면 다음 스텝으로 이동한다', () => {
    const { result } = renderHook(() => useOnboardingTour(true));

    act(() => result.current.goNext());

    expect(result.current.stepIndex).toBe(1);
    expect(result.current.isOpen).toBe(true);
  });

  it('마지막 스텝에서 다음을 누르면 투어를 닫고 완료로 기록한다', () => {
    const { result } = renderHook(() => useOnboardingTour(true));

    TOUR_STEPS.forEach(() => act(() => result.current.goNext()));

    expect(result.current.isOpen).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('건너뛰면 즉시 닫고 완료로 기록한다', () => {
    const { result } = renderHook(() => useOnboardingTour(true));

    act(() => result.current.skip());

    expect(result.current.isOpen).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('ESC를 누르면 투어를 닫는다', () => {
    const { result } = renderHook(() => useOnboardingTour(true));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(result.current.isOpen).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });
});
