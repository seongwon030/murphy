# Railway 프로덕션 배포 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** murphy(web09-dopamine)를 Railway 프로덕션 환경 1개(앱 + MySQL)에 재배포하고, `main` push 시 자동 배포되게 만든다.

**Architecture:** Railway 프로젝트 1개에 앱 서비스와 MySQL 서비스를 두고 프라이빗 네트워크로 연결한다. 앱은 리포의 기존 `dockerfile`(Next.js standalone)로 빌드하며, SSE가 인메모리라 레플리카는 1개로 고정한다. 스키마 마이그레이션은 런타임 이미지에 prisma CLI가 없으므로 로컬에서 MySQL public 프록시를 통해 1회 실행한다.

**Tech Stack:** Next.js 16 (standalone), Prisma 7 + `@prisma/adapter-mariadb`, MySQL 8, next-auth v4, Railway CLI 5.26.0, Docker

**Spec:** `docs/superpowers/specs/2026-08-31-railway-deploy-design.md`

## Global Constraints

- 레플리카는 **1개**로 고정한다. SSE 연결 레지스트리가 `src/lib/sse/sse-manager.ts`의 인메모리 Map이라 2개 이상이면 이벤트가 유실된다.
- **Redis 서비스를 만들지 않는다.** `src/lib/redis.ts`를 import 하는 코드가 0개다.
- 런타임 DB 접속은 `DATABASE_URL`이 아니라 `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` 개별 변수를 쓴다. `DATABASE_URL`은 마이그레이션 전용이며 로컬에서만 쓴다.
- Dockerfile 파일명은 **소문자 `dockerfile`**이다. Railway 빌더 설정에 경로를 명시해야 한다.
- 시크릿(`CLOVA_API_KEY`, OAuth 3사 ID/Secret)은 **커밋·채팅·로그에 절대 노출하지 않는다.** 사용자가 Railway 대시보드에 직접 입력한다.
- 배포 브랜치는 `main`. origin(`seongwon030/murphy`)에 `main`이 없으므로 `dev`에서 새로 만든다.
- 커밋 메시지는 리포 관례를 따른다: `타입 : 한국어 설명` (예: `feat : ...`, `docs : ...`, `chore : ...`).

---

## 파일 구조

| 파일 | 역할 | 변경 |
|---|---|---|
| `src/lib/prisma.ts` | Prisma 클라이언트 + MariaDB 어댑터 생성 | 수정 — 포트 배선 |
| `test/lib/prisma.test.ts` | 위 어댑터 설정 검증 | 신규 |
| `railway.json` | Railway 빌드/배포 설정 | 신규 |
| `env.example` | 환경변수 샘플 | 수정 — 누락 변수 보완 |
| `.github/workflows/deploy.yml` | 구 Docker Hub CD | 삭제 |
| `src/app/layout.tsx` | 루트 메타데이터 | 수정 — `metadataBase` (Task 6에서) |

---

### Task 1: DB 포트를 환경변수로 배선

Railway MySQL의 내부 포트가 3306이라는 보장이 문서에 없다. Railway 공식 가이드는 `${{MySQL.MYSQLPORT}}`를 명시적으로 넘긴다. 현재 어댑터는 `port`를 받지 않아 3306에 고정돼 있다.

**Files:**
- Modify: `src/lib/prisma.ts:12-19`
- Test: `test/lib/prisma.test.ts` (신규)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `src/lib/prisma.ts`가 `process.env.DB_PORT`를 숫자로 읽어 `PrismaMariaDb`의 `port` 옵션에 넘긴다. 미설정 시 `3306`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/lib/prisma.test.ts` 생성:

```ts
// prisma.ts는 import 시점에 어댑터를 생성하므로, 모듈 레지스트리를 격리해
// 환경변수 조합별로 다시 로드하며 생성자 인자를 검사한다.
jest.mock('@prisma/adapter-mariadb', () => ({
  PrismaMariaDb: jest.fn(),
}));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
}));
// prisma.ts가 로컬 .env를 읽어 테스트가 오염되는 것을 막는다.
jest.mock('dotenv/config', () => ({}));

describe('prisma 클라이언트 DB 접속 설정', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // prisma.ts는 test 환경에서 globalThis.prisma에 캐싱하므로 매번 비운다.
    delete (globalThis as { prisma?: unknown }).prisma;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function loadAdapterOptions(): Record<string, unknown> {
    let options: Record<string, unknown> = {};
    jest.isolateModules(() => {
      const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
      require('@/lib/prisma');
      options = (PrismaMariaDb as jest.Mock).mock.calls[0][0];
    });
    return options;
  }

  it('DB_PORT가 설정되면 해당 포트를 어댑터에 전달한다', () => {
    process.env.DB_PORT = '31234';

    expect(loadAdapterOptions()).toMatchObject({ port: 31234 });
  });

  it('DB_PORT가 없으면 3306을 기본값으로 쓴다', () => {
    delete process.env.DB_PORT;

    expect(loadAdapterOptions()).toMatchObject({ port: 3306 });
  });

  it('나머지 접속 정보도 환경변수에서 읽는다', () => {
    process.env.DB_HOST = 'mysql.railway.internal';
    process.env.DB_USERNAME = 'root';
    process.env.DB_PASSWORD = 'secret';
    process.env.DB_NAME = 'railway';

    expect(loadAdapterOptions()).toMatchObject({
      host: 'mysql.railway.internal',
      user: 'root',
      password: 'secret',
      database: 'railway',
    });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
yarn jest test/lib/prisma.test.ts
```

기대: `DB_PORT가 설정되면...` 테스트가 FAIL. 어댑터 인자에 `port` 키가 없어 `toMatchObject`가 어긋난다.
(`DB_PORT가 없으면 3306` 테스트도 FAIL한다 — 현재는 `port` 키 자체가 전달되지 않기 때문이다.)

- [ ] **Step 3: 최소 구현**

`src/lib/prisma.ts`에서 어댑터 생성 부분에 한 줄 추가:

```ts
    adapter: new PrismaMariaDb({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 20,
    }),
```

다른 줄은 건드리지 않는다.

- [ ] **Step 4: 테스트 통과 확인**

```bash
yarn jest test/lib/prisma.test.ts
```

기대: 3개 테스트 모두 PASS.

- [ ] **Step 5: 기존 테스트 회귀 없는지 확인**

```bash
yarn test:unit --ci
```

기대: 기존과 동일하게 통과.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/prisma.ts test/lib/prisma.test.ts
git commit -m "fix : DB_PORT 환경변수를 Prisma 어댑터에 전달"
```

---

### Task 2: Railway 배포 설정 추가 및 구 CD 제거

**Files:**
- Create: `railway.json`
- Modify: `env.example`
- Delete: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: Task 1의 `DB_PORT` 지원
- Produces: `railway.json`이 소문자 `dockerfile`을 빌더에 알려주고 레플리카를 1로 고정한다. Task 4의 Railway 서비스가 이 파일을 읽는다.

- [ ] **Step 1: `railway.json` 생성**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "dockerfile"
  },
  "deploy": {
    "numReplicas": 1,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

- [ ] **Step 2: JSON 유효성 확인**

```bash
node -e "JSON.parse(require('fs').readFileSync('railway.json','utf8')); console.log('ok')"
```

기대: `ok` 출력.

- [ ] **Step 3: `env.example`에 누락 변수 추가**

파일 맨 아래 `NEXTAUTH_SECRET=` 다음에 이어 붙인다:

```
NEXTAUTH_URL=http://localhost:3000

## 배포 주소 (robots.txt / sitemap.xml 생성에 사용)
BASE_URL=http://localhost:3000
```

- [ ] **Step 4: 구 CD 워크플로 삭제**

```bash
git rm .github/workflows/deploy.yml
```

Railway GitHub 연동이 이 역할을 대체한다. `.github/workflows/ci.yml`은 건드리지 않는다.

- [ ] **Step 5: 빌드가 깨지지 않는지 확인**

```bash
yarn build
```

기대: 빌드 성공. `railway.json`과 `env.example`은 빌드에 영향이 없고, Task 1 변경만 검증하는 셈이다.

- [ ] **Step 6: 커밋**

```bash
git add railway.json env.example
git commit -m "chore : Railway 배포 설정 추가 및 Docker Hub CD 제거"
```

---

### Task 3: dev 머지 후 main 브랜치 생성

**Files:** 없음 (git 작업)

**Interfaces:**
- Consumes: Task 1, 2의 커밋
- Produces: origin에 `main` 브랜치. Task 4의 Railway 서비스가 이 브랜치를 watch한다.

- [ ] **Step 1: 브랜치 push 후 PR 생성**

```bash
git push -u origin railway-redeploy
gh pr create --base dev --title "Railway 프로덕션 재배포 설정" \
  --body "Railway 배포를 위한 설정 추가. 설계: docs/superpowers/specs/2026-08-31-railway-deploy-design.md

- DB_PORT를 Prisma 어댑터에 전달 (Railway MySQL 내부 포트 대응)
- railway.json 추가 (소문자 dockerfile 경로 명시, 레플리카 1 고정)
- env.example에 NEXTAUTH_URL / BASE_URL 보완
- Docker Hub CD 워크플로 제거 (Railway 연동으로 대체)"
```

- [ ] **Step 2: CI 통과 확인**

```bash
gh pr checks --watch
```

기대: `unit-test`, `build-check` 모두 통과.

- [ ] **⏸ Step 3: 사용자 확인 후 머지 — HUMAN GATE**

사용자가 PR을 리뷰하고 머지한다. 머지 방식은 리포 관례를 따른다.

- [ ] **Step 4: main 브랜치 생성 및 push**

```bash
git fetch origin
git branch main origin/dev
git push origin main
```

- [ ] **Step 5: 확인**

```bash
git ls-remote --heads origin main
```

기대: `refs/heads/main` 한 줄 출력.

---

### Task 4: Railway 프로젝트와 서비스 생성

**Files:** 없음 (Railway 인프라)

**Interfaces:**
- Consumes: Task 3의 `main` 브랜치, Task 2의 `railway.json`
- Produces: Railway 프로젝트 1개, MySQL 서비스 1개, 앱 서비스 `murphy` 1개. Task 5가 이 서비스들에 변수를 건다.

- [ ] **Step 1: 로그인 상태 확인**

```bash
railway whoami
```

기대: `Logged in as seongwon seo (seongwon0903@gmail.com)`

- [ ] **Step 2: 프로젝트 생성**

```bash
railway init --name murphy --json
```

현재 디렉터리가 이 프로젝트의 기본 환경에 링크된다.

- [ ] **Step 3: MySQL 서비스 추가**

```bash
railway add --database mysql
```

- [ ] **Step 4: MySQL 서비스의 실제 이름 확인**

```bash
railway status --json
```

Task 5의 참조 변수(`${{<이름>.MYSQLHOST}}`)에 들어갈 정확한 서비스명을 여기서 확인한다. 보통 `MySQL`이지만 다를 수 있으므로 **추측하지 말고 출력값을 그대로 쓴다.**

- [ ] **⏸ Step 5: GitHub 연동 확인 — HUMAN GATE**

Railway GitHub App이 `seongwon030/murphy` 리포에 접근 권한이 있어야 다음 단계가 동작한다. 없으면 Railway 대시보드 → 프로젝트 → New Service → GitHub Repo에서 권한을 부여한다.

- [ ] **Step 6: 앱 서비스 생성 및 main 브랜치 연결**

```bash
railway add --service murphy --repo seongwon030/murphy --branch main
```

이 시점에 첫 빌드가 트리거된다. **DB 변수가 아직 없어 기동에 실패할 수 있으며 정상이다** — Task 5에서 변수를 채우고 재배포한다.

- [ ] **Step 7: 서비스 2개가 생성됐는지 확인**

```bash
railway status
```

기대: MySQL 서비스와 `murphy` 서비스가 모두 표시된다.

---

### Task 5: 환경변수 설정

**Files:** 없음 (Railway 변수)

**Interfaces:**
- Consumes: Task 4의 서비스들, Task 4 Step 4에서 확인한 MySQL 서비스명
- Produces: 앱 서비스에 DB 접속 변수 5개와 `NEXTAUTH_SECRET`이 설정된 상태. Task 6이 도메인 의존 변수를 추가한다.

- [ ] **Step 1: DB 참조 변수 설정**

아래에서 `MySQL`은 Task 4 Step 4에서 확인한 실제 서비스명으로 바꾼다. `${{ }}`가 셸에서 전개되지 않도록 **작은따옴표**를 쓴다.

```bash
railway variable set --service murphy --skip-deploys \
  'DB_HOST=${{MySQL.MYSQLHOST}}' \
  'DB_PORT=${{MySQL.MYSQLPORT}}' \
  'DB_USERNAME=${{MySQL.MYSQLUSER}}' \
  'DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}' \
  'DB_NAME=${{MySQL.MYSQLDATABASE}}'
```

`railway variable set`이 여러 쌍을 한 번에 받지 않으면 한 개씩 나눠 실행한다.

- [ ] **Step 2: NEXTAUTH_SECRET 생성 및 설정**

값이 셸 히스토리에 남지 않도록 stdin으로 넣는다.

```bash
openssl rand -base64 32 | railway variable set --service murphy --skip-deploys --stdin NEXTAUTH_SECRET
```

`--stdin` 플래그가 동작하지 않으면 레거시 형식을 쓴다:

```bash
openssl rand -base64 32 | railway variables --service murphy --skip-deploys --set-from-stdin NEXTAUTH_SECRET
```

- [ ] **Step 3: 설정 확인 (값은 출력하지 않는다)**

```bash
railway variable list --service murphy --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(Object.keys(JSON.parse(s)).sort().join('\n')))"
```

기대: `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`, `DB_USERNAME`, `NEXTAUTH_SECRET` 키가 보인다. **`-k`/`--kv` 옵션은 원시 값을 출력하므로 쓰지 않는다.**

- [ ] **⏸ Step 4: 사용자가 시크릿 7개 입력 — HUMAN GATE**

사용자가 Railway 대시보드 → `murphy` 서비스 → Variables에서 직접 입력한다. 값을 채팅에 붙여넣지 않는다.

```
CLOVA_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
NAVER_CLIENT_ID
NAVER_CLIENT_SECRET
```

- [ ] **Step 5: 7개가 모두 들어왔는지 키만 확인**

Step 3과 같은 명령을 다시 실행해 위 7개 키가 목록에 있는지 본다. 없으면 사용자에게 알리고 대기한다.

---

### Task 6: 도메인 발급과 도메인 의존 값 반영

**Files:**
- Modify: `src/app/layout.tsx:13`

**Interfaces:**
- Consumes: Task 4의 앱 서비스, Task 5의 변수
- Produces: 공개 도메인과 그에 맞춘 `NEXTAUTH_URL` / `BASE_URL` / `metadataBase`. Task 8의 OAuth 콜백이 이 도메인을 쓴다.

- [ ] **Step 1: Railway 도메인 발급**

```bash
railway domain --service murphy
```

포트를 물으면 `3000`을 지정한다 (`dockerfile`의 `EXPOSE 3000`).
출력된 `*.up.railway.app` 주소를 이후 단계에서 `<도메인>`으로 쓴다.

- [ ] **Step 2: 도메인 의존 변수 설정**

```bash
railway variable set --service murphy --skip-deploys \
  'NEXTAUTH_URL=https://<도메인>' \
  'BASE_URL=https://<도메인>'
```

- [ ] **Step 3: `metadataBase` 수정**

`src/app/layout.tsx:13`:

```ts
  metadataBase: new URL('https://<도메인>'),
```

- [ ] **Step 4: 빌드 확인**

```bash
yarn build
```

기대: 성공.

- [ ] **Step 5: 커밋 후 dev → main 반영**

```bash
git add src/app/layout.tsx
git commit -m "chore : metadataBase를 배포 도메인으로 변경"
git push origin HEAD
```

PR을 `dev`로 올려 머지한 뒤, `main`을 갱신한다:

```bash
git fetch origin
git push origin origin/dev:main
```

- [ ] **Step 6: 배포 확인**

```bash
railway logs --service murphy --lines 100
```

기대: 빌드 성공 후 Next.js 기동 로그. 컨테이너가 계속 재시작하면 Task 6 트러블슈팅(아래)을 본다.

**트러블슈팅 — 헬스체크 실패 시:** standalone `server.js`가 Railway가 주입한 `PORT`를 읽는지, `0.0.0.0`에 바인딩하는지 로그로 확인한다. `localhost`에만 바인딩하면 `dockerfile`의 `ENV PORT 3000` 아래에 `ENV HOSTNAME=0.0.0.0`을 추가하고 다시 배포한다.

---

### Task 7: 스키마 마이그레이션

**Files:** 없음 (DB 작업)

**Interfaces:**
- Consumes: Task 4의 MySQL 서비스
- Produces: 빈 DB에 `prisma/migrations`의 전체 스키마가 적용된 상태. Task 9의 데이터 저장 검증이 여기에 의존한다.

- [ ] **⏸ Step 1: MySQL Public Access 활성화 — HUMAN GATE**

Railway 대시보드 → MySQL 서비스 → Settings → Networking → Public Networking 활성화. TCP 프록시 주소가 생성된다.

- [ ] **Step 2: 로컬에서 마이그레이션 실행**

`MYSQL_PUBLIC_URL`을 `DATABASE_URL`로 넘겨 실행한다. 값이 셸 히스토리에 남지 않도록 `railway run`으로 주입한다.

```bash
railway run --service MySQL -- \
  sh -c 'DATABASE_URL="$MYSQL_PUBLIC_URL" yarn prisma migrate deploy'
```

`MYSQL_PUBLIC_URL` 변수명이 다르면 `railway variable list --service MySQL --json`으로 키 이름을 확인한다.

기대: `All migrations have been successfully applied.` 또는 적용된 마이그레이션 목록.

- [ ] **Step 3: 적용 상태 확인**

```bash
railway run --service MySQL -- \
  sh -c 'DATABASE_URL="$MYSQL_PUBLIC_URL" yarn prisma migrate status'
```

기대: `Database schema is up to date!` 그리고 미적용(pending) 마이그레이션이 0건.
`Following migrations have not yet been applied`가 나오면 Step 2가 실패한 것이므로 그 출력을 먼저 해결한다.

- [ ] **Step 4: 앱 재배포**

```bash
railway redeploy --service murphy --yes
```

- [ ] **⏸ Step 5: Public Access 비활성화 — HUMAN GATE (선택)**

앱은 프라이빗 네트워크로 접속하므로 꺼도 된다. 이후 마이그레이션 때 다시 켜야 한다는 점을 감안해 사용자가 결정한다.

---

### Task 8: OAuth 콜백 재등록

**Files:** 없음 (외부 콘솔 작업)

**Interfaces:**
- Consumes: Task 6의 도메인
- Produces: 3사 OAuth 앱이 새 도메인의 콜백을 허용하는 상태. Task 9의 로그인 검증이 여기에 의존한다.

- [ ] **⏸ Step 1: 사용자가 3사 콘솔에 콜백 등록 — HUMAN GATE**

| 제공자 | 콜백 URL | 콘솔 |
|---|---|---|
| Google | `https://<도메인>/api/auth/callback/google` | Google Cloud Console → API 및 서비스 → 사용자 인증 정보 |
| GitHub | `https://<도메인>/api/auth/callback/github` | GitHub → Settings → Developer settings → OAuth Apps |
| Naver | `https://<도메인>/api/auth/callback/naver` | 네이버 개발자센터 → 애플리케이션 → API 설정 |

GitHub OAuth App은 콜백 URL을 **1개만** 허용한다. 기존 URL을 교체하거나 새 앱을 만들어야 하며, 새 앱을 만들면 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`을 Task 5 Step 4 방식으로 다시 넣어야 한다.

---

### Task 9: 완료 기준 검증

**Files:** 없음 (검증)

**Interfaces:**
- Consumes: Task 1~8 전부
- Produces: 스펙 §6의 완료 기준 5개에 대한 증거

- [ ] **Step 1: 루트 응답 확인**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" -L https://<도메인>/
```

기대: `200`

- [ ] **Step 2: 기동 로그에 반복 에러가 없는지 확인**

```bash
railway logs --service murphy --lines 200
```

기대: 기동 후 반복되는 스택 트레이스나 재시작 루프가 없다.

- [ ] **⏸ Step 3: OAuth 로그인 검증 — HUMAN GATE**

브라우저에서 `https://<도메인>/` 접속 → 제공자 1개로 로그인 → 로그인 상태가 유지되는지 확인.

실패 시 확인 순서: `NEXTAUTH_URL`이 실제 도메인과 정확히 일치하는가(끝 슬래시 없음) → 콜백 URL 오타 → `NEXTAUTH_SECRET` 설정 여부.

- [ ] **⏸ Step 4: 데이터 저장 검증 — HUMAN GATE**

프로젝트 → 토픽 → 이슈 → 아이디어를 순서대로 생성하고, 새로고침 후에도 남아 있는지 확인한다.

- [ ] **⏸ Step 5: SSE 실시간 동기화 검증 — HUMAN GATE**

브라우저 탭 2개에서 같은 이슈를 연다. 한쪽에서 아이디어를 생성했을 때 다른 쪽에 **새로고침 없이** 나타나는지 확인한다.

실패 시: Railway 프록시가 스트리밍 응답을 끊는지 네트워크 탭에서 `/api/issues/[issueId]/events` 연결 상태를 확인한다.

- [ ] **Step 6: 결과 정리**

완료 기준 5개의 통과 여부와, 미해결 항목이 있으면 원인을 사용자에게 보고한다.

---

## 사용자가 직접 해야 하는 것 (HUMAN GATE 요약)

| Task | 내용 |
|---|---|
| 3 | PR 리뷰 및 dev 머지 |
| 4 | Railway GitHub App에 리포 접근 권한 부여 |
| 5 | 시크릿 7개를 Railway 대시보드에 입력 |
| 7 | MySQL Public Access on/off |
| 8 | OAuth 3사 콜백 URL 등록 |
| 9 | 로그인 / 데이터 저장 / SSE 브라우저 검증 |
