/**
 * 이슈 화면 온보딩 투어를 이미 봤는지 로컬스토리지에 저장/조회하는 유틸리티
 */

const STORAGE_KEY = 'issue-onboarding-completed';

/**
 * 온보딩 투어를 이미 봤는지 확인합니다.
 * 서버 환경이나 조회 실패 시에는 투어를 띄우지 않도록 true를 반환합니다.
 */
export function hasCompletedOnboarding(): boolean {
  if (typeof window === 'undefined') return true;

  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch (error) {
    console.error('온보딩 완료 여부 조회 실패:', error);
    return true;
  }
}

/**
 * 온보딩 투어를 봤다고 기록합니다.
 */
export function completeOnboarding(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch (error) {
    console.error('온보딩 완료 저장 실패:', error);
  }
}
