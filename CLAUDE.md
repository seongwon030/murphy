# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Murphy(web09-dopamine): 팀의 아이디어 발산(브레인스토밍) → AI 카테고리화 → 투표 → 의사결정을 지원하는 협업 서비스. Next.js 16 App Router 기반 풀스택 단일 앱 (React 19, TypeScript, Emotion, TanStack Query, Zustand, Prisma + MySQL, Redis, SSE 실시간 동기화).

## 자주 쓰는 명령어

```bash
yarn dev                  # 개발 서버 (localhost:3000)
yarn build                # 프로덕션 빌드 (CI에서 검증하는 유일한 체크)
yarn lint                 # ESLint
yarn format               # Prettier (import 정렬 포함)

# 로컬 인프라 (Docker 필요: MySQL + Redis)
yarn docker:up
yarn db:update            # prisma generate + migrate dev (스키마 변경 후 필수)

# 테스트 (Jest, 테스트 파일은 test/ 아래에만 위치)
yarn test                                     # 전체
yarn jest test/services/vote.service.test.ts  # 단일 파일
yarn jest -t "테스트 이름"                      # 이름으로 필터
yarn test:be:cov          # 백엔드(api/lib/utils) 커버리지
yarn test:fe:cov          # 프론트(hooks/components) 커버리지

# E2E (Playwright, dev 서버 자동 구동, e2e/global-setup.ts에서 로그인 상태 생성)
yarn test:e2e
yarn test:e2e:ui
```

- 환경 변수는 `env.example` 참고 (`CLOVA_API_KEY`, OAuth 키, DB/Redis 접속 정보).
- 기본 브랜치는 `dev`. PR은 `dev`로 보낸다.

## 아키텍처

### 도메인 계층 구조

Project → Topic → Issue → Idea 순의 트리 구조. Issue 아래에 Category / Comment / Vote / Report / WordCloud가 붙는다 (`prisma/schema.prisma`). Topic 화면은 Issue들을 노드/연결(IssueNode, IssueConnection)로 시각화한다(@xyflow/react).

### 백엔드 레이어링 (src/app/api → src/lib)

API Route Handler → Service → Repository 3계층:

- `src/app/api/**/route.ts`: 요청 파싱, 인증 확인, 응답 생성만 담당. 응답은 반드시 `createSuccessResponse` / `createErrorResponse`(`src/lib/utils/api-helpers.ts`) 사용. 에러 코드는 `src/constants/error-messages.ts`에 정의.
- `src/lib/services/*.service.ts`: 비즈니스 로직, `prisma.$transaction` 처리, SSE 브로드캐스트.
- `src/lib/repositories/*.repository.ts`: Prisma 접근 전담. 트랜잭션 클라이언트(`tx`)를 인자로 받는 패턴 사용.

### 실시간 동기화 (SSE)

- `src/lib/sse/sse-manager.ts`가 issue/topic 단위로 인메모리 연결을 관리. 변경 API는 `broadcast()`로 이벤트를 쏘고, 클라이언트는 `/api/issues/[issueId]/events` 등으로 구독.
- 이벤트 타입은 `src/constants/sse-events.ts`(`SSE_EVENT_TYPES`)에 정의.
- 클라이언트는 mutation 요청에 `x-sse-connection-id` 헤더(`withSseHeader`)를 실어 보내고, 서버는 해당 연결을 브로드캐스트에서 제외해 자기 자신에게 이벤트가 되돌아오지 않게 한다. 새 mutation API를 만들 때 이 패턴을 따를 것.

### 인증 (2가지 경로)

- 로그인 사용자: NextAuth (Google/GitHub/Naver OAuth, `src/lib/auth.ts`).
- 익명 참여자: Issue 단위 쿠키 기반 게스트 (`src/lib/utils/cookie.ts`). `getAuthenticatedUserId(req, issueId)`(`src/lib/utils/auth-helpers.ts`)가 세션 → 쿠키 순으로 확인.
- `src/proxy.ts`가 `/api/projects*`, `/api/topics*`만 JWT로 보호하고 `x-user-id` 헤더를 주입. Issue 관련 API는 익명 참여를 허용하므로 proxy 대상이 아니다.

### 프론트엔드 데이터 흐름

컴포넌트 → `src/hooks/**`(TanStack Query useQuery/useMutation) → `src/lib/api/*`(fetch 함수) → API Route. 서버 상태는 React Query, 캔버스 등 클라이언트 상태는 Zustand(`src/app/(with-sidebar)/issue/store`).

- 페이지 전용 컴포넌트는 해당 라우트의 `_components/` 폴더에, 공용 컴포넌트는 `src/components/`에 둔다.
- 스타일은 Emotion으로 컴포넌트 옆 `*.styles.ts` 파일에 분리. 테마/전역 스타일은 `src/styles/`.

### AI 카테고리화

`src/app/api/issues/[issueId]/categorize/route.ts`에서 CLOVA API(`CLOVA_API_KEY`) 호출 → 응답을 `src/lib/utils/ai-response-validator.ts`로 검증 → `categorize.service.ts`가 트랜잭션으로 카테고리 재생성(soft delete + 재할당) 후 브로드캐스트.

## 테스트 컨벤션

- 테스트는 소스 옆이 아니라 `test/` 디렉터리에 미러 구조로 작성 (`test/services`, `test/repositories`, `test/hooks`, `test/components`, `test/integration` 등).
- 기본 환경은 node. 컴포넌트/훅 테스트는 파일 상단에 `@jest-environment jsdom` docblock이 필요하다.
- 경로 별칭: `@/*` → `src/*`, `@test/*` → `test/*`.
