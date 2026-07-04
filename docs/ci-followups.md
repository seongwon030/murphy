# CI 후속 과제

`fix/broken-unit-tests`에서 CI에 유닛 테스트 게이트를 추가하며 발견한, 이번 범위 밖의 후속 과제 정리.

> 이번 PR에 포함된 것: 유닛 테스트 job 추가(`test/integration` 제외), dev에 방치돼 있던 유닛 테스트 3개 스위트 복구, 누락된 `eslint-config-prettier` 의존성 보완.

## 1. lint 게이트 도입

현재 CI는 lint를 돌리지 않는다. lint job을 추가하려 했으나 dev 코드베이스에 기존 lint 에러가 **312개 / 103개 파일** 존재해, 지금 게이트로 넣으면 모든 PR이 빨간불이 된다. 먼저 정리가 필요하다.

### 룰별 집계

| 룰 | 건수 | 성격 |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 280 | `any` 타입 사용. 대규모 타입 정리 필요 |
| `react-hooks/exhaustive-deps` | 20 | 의존성 배열 누락 |
| `react-hooks/preserve-manual-memoization` | 9 | React Compiler가 수동 memoization 최적화를 건너뜀 |
| `react-hooks/set-state-in-effect` | 5 | effect 내 동기 setState → 연쇄 렌더 유발 |
| `@typescript-eslint/no-require-imports` | 5 | `require()` 스타일 import (예: `prisma/seed.js`) |
| `react-hooks/refs` | 3 | ref 사용 규칙 위반 |
| `react/display-name` | 1 | |
| `react-hooks/rules-of-hooks` | 1 | 훅 호출 규칙 위반 |
| `@typescript-eslint/triple-slash-reference` | 1 | |
| `@typescript-eslint/no-empty-object-type` | 1 | |

### 권장 순서

1. **react-hooks 계열 우선 검토** (약 38건) — `set-state-in-effect`, `preserve-manual-memoization`, `rules-of-hooks`는 실제 렌더 버그·성능 문제 소지가 있어 타입 정리보다 먼저 봐야 한다.
2. **`no-explicit-any` 280건 정리** — 파일/도메인 단위로 나눠 점진 진행. 한 번에 한 PR로는 리스크가 크다.
3. 위 두 단계가 끝난 뒤 lint job을 CI 게이트로 승격. (워크플로우 예시는 이 브랜치 히스토리에서 제거된 lint job 참고)

## 2. 통합 테스트 CI

`test/integration/*`는 실제 DB에 연결(`prisma.$queryRaw`, `$disconnect`)되어 이번 유닛 게이트에서 제외했다. CI에 넣으려면:

- GitHub Actions `services`로 MySQL 컨테이너 기동 (Redis도 필요 시)
- `DATABASE_URL` 등 환경변수 주입
- `prisma migrate deploy`로 스키마 적용 후 통합 테스트 실행

## 3. E2E (Playwright) CI

가장 무겁다. 빌드 + MySQL + Redis + 로그인 셋업(`e2e/global-setup.ts`)이 모두 필요하다. 통합 테스트 CI가 안정화된 뒤 별도 워크플로우로 분리하는 것을 권장.
