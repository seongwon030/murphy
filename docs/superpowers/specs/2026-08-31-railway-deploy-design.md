# Railway 프로덕션 재배포 설계

- 작성일: 2026-08-31
- 대상: murphy (web09-dopamine) — Next.js 16 App Router 풀스택 단일 앱
- 상태: 승인 대기

## 1. 배경

기존 배포처(NCP + nginx + Docker, 도메인 `murphy.co.kr`)가 내려갔다. `murphy.co.kr`은
DNS 조회 시 SERVFAIL — NS 레코드가 없어 도메인 등록/네임서버 설정이 유효하지 않은 상태다.
기존 CD(`.github/workflows/deploy.yml`)는 `main` push 시 Docker Hub에 이미지를 push하는
데서 끝나고, 서버 pull·재기동은 수동이었다.

이 문서는 Railway로 프로덕션 환경 하나를 새로 띄우는 설계를 정의한다.

## 2. 목표와 비목표

**목표**
- Railway에 프로덕션 환경 1개(앱 + MySQL)를 구성하고 서비스를 다시 접속 가능하게 만든다.
- Railway 기본 도메인(`*.up.railway.app`)으로 동작을 검증한다.
- `main` push 시 자동 배포되게 한다.

**비목표 (이번 범위 밖)**
- 커스텀 도메인 연결 — 기본 도메인 검증 후 별도 작업.
- staging/dev 환경 — 프로덕션 안정화 후 environment 복제로 추가.
- 기존 NCP DB 데이터 이관 — 빈 DB에 스키마만 적용한다.
- 미사용 Redis 코드(`src/lib/redis.ts`) 정리 — 아래 4.3 참고.
- CI에 lint/통합테스트/E2E 게이트 추가 (`docs/ci-followups.md` 소관).

## 3. 사전 조사 결과

설계를 좌우한 코드베이스 사실들.

### 3.1 Redis는 사용되지 않는다
`src/lib/redis.ts`가 ioredis 클라이언트를 export 하지만 이를 import 하는 파일이 0개다.
SSE는 `src/lib/sse/sse-manager.ts`의 인메모리 Map으로 동작한다.
→ **Railway에 Redis 서비스를 만들지 않는다.**

### 3.2 런타임 DB 접속은 DATABASE_URL이 아니다
`src/lib/prisma.ts`는 Prisma 7 드라이버 어댑터(`@prisma/adapter-mariadb`)에
`DB_HOST` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME`을 개별 값으로 넘긴다.
`DATABASE_URL`은 `prisma.config.ts`에서 **마이그레이션 시에만** 쓰인다.

현재 어댑터에 `port`가 전달되지 않아 3306으로 고정된다. Railway 공식 가이드는
`${{MySQL.MYSQLPORT}}`를 명시적으로 넘기는 패턴을 쓰고, 내부 네트워크 포트가 항상 3306이라는
보장을 문서에서 찾지 못했다. → 포트를 환경변수로 뚫는다(4.2).

### 3.3 SSE가 인메모리라 단일 인스턴스여야 한다
연결 레지스트리가 프로세스 메모리에 있으므로 레플리카가 2개 이상이면 이벤트가 분산 유실된다.
→ **레플리카 1개로 고정.**

### 3.4 next-auth v4 → NEXTAUTH_URL 필수
`next-auth@4.24.13` 사용. `env.example`에 `NEXTAUTH_URL`이 없다. 도메인 확정 후 설정해야 하며,
OAuth 3사 콜백 URL도 새 도메인으로 재등록해야 한다.

### 3.5 Dockerfile 파일명이 소문자다
git에 `dockerfile`(소문자)로 저장돼 있다. Railway 기본 감지는 `Dockerfile`을 찾으므로
`railway.json`에 경로를 명시해야 한다.

> 부수적으로 확인된 기존 버그: `deploy.yml`이 `file: ./Dockerfile`(대문자)을 참조한다.
> Linux 러너는 대소문자를 구분하므로 이 CD job은 원래 실패했을 것이다. 이번에 대체되므로
> 별도 수정하지 않는다.

### 3.6 origin에 main 브랜치가 없다
origin(`seongwon030/murphy`)은 `boostcampwm2025/web09-dopamine`의 포크이고
브랜치가 `dev` 하나뿐이다(기본 브랜치도 `dev`). `main`은 upstream에만 존재한다.
→ 포크에 `dev`로부터 `main`을 새로 만든다.

## 4. 설계

### 4.1 Railway 구성

Railway 프로젝트 1개, environment는 `production` 하나.

| 서비스 | 내용 |
|---|---|
| `murphy` | 앱. 이 리포의 `dockerfile`로 빌드. 레플리카 1 |
| `MySQL` | Railway 제공 MySQL 8. 프라이빗 네트워크로만 앱과 통신 |

앱 서비스는 GitHub 연동으로 `seongwon030/murphy`의 `main` 브랜치를 watch한다.

### 4.2 코드 변경

세 파일만 건드린다.

**(1) `src/lib/prisma.ts`** — 어댑터에 포트 한 줄 추가
```ts
adapter: new PrismaMariaDb({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,   // 추가
  user: process.env.DB_USERNAME,
  ...
})
```
`DB_PORT`는 이미 `env.example`과 `docker-compose.yml`에 존재하는 변수라 새 개념이 아니다.
값이 없으면 기존 동작(3306)을 유지하므로 로컬 개발에 영향이 없다.

**(2) `src/app/layout.tsx`** — `metadataBase`를 Railway 도메인으로 교체
```ts
metadataBase: new URL('https://<배포 후 확정된 도메인>'),
```

**(3) `railway.json`** — 신규 파일
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

`env.example`에 `NEXTAUTH_URL` / `BASE_URL`을 추가한다 (현재 누락돼 있어 신규 세팅 시 빠뜨리기 쉽다).

### 4.3 건드리지 않는 것
- `src/lib/redis.ts` 및 ioredis 의존성 — 미사용이지만 삭제는 이번 작업 범위 밖. 배포 로그에
  `Redis connection error`가 반복 출력될 수 있으나, 이 모듈을 import 하는 코드가 없으므로
  실제로는 인스턴스화조차 되지 않는다. 로그에 나타난다면 별도 이슈로 다룬다.
- `docker-compose.yml`, `docker/` — 로컬 개발용으로 유지.
- `.github/workflows/ci.yml` — 그대로 둔다.

### 4.4 환경변수

Railway `murphy` 서비스에 설정. DB 5개는 참조 변수라 실제 값을 몰라도 된다.

```
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USERNAME=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
NEXTAUTH_URL=https://<도메인>
BASE_URL=https://<도메인>
NEXTAUTH_SECRET=<openssl rand -base64 32로 생성>
```

아래는 값을 아는 사람만 넣을 수 있으므로 **사용자가 Railway 대시보드 Variables에 직접 입력**한다.
채팅이나 커밋에 노출하지 않는다.

```
CLOVA_API_KEY
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
```

`DATABASE_URL`은 런타임에 필요 없다. 마이그레이션 실행 시에만 로컬에서 쓴다(4.5).

### 4.5 스키마 마이그레이션

앱 런타임 이미지는 Next.js standalone 결과물만 담고 있어 prisma CLI가 없다.
따라서 Railway pre-deploy 훅을 쓰지 않고 **로컬에서 실행**한다.

1. MySQL 서비스의 Public Access를 켜서 TCP 프록시 주소를 얻는다.
2. 그 주소로 `DATABASE_URL`을 구성해 `yarn prisma:migrate:deploy`를 1회 실행한다.
3. 스키마 반영을 확인한 뒤 Public Access는 꺼도 된다(앱은 프라이빗 네트워크로 접속).

이후 스키마 변경 시에도 같은 절차를 따른다.

### 4.6 OAuth 콜백 재등록

도메인 확정 후 각 콘솔에 등록한다. **사용자가 직접 수행.**

| 제공자 | 콜백 URL |
|---|---|
| Google | `https://<도메인>/api/auth/callback/google` |
| GitHub | `https://<도메인>/api/auth/callback/github` |
| Naver | `https://<도메인>/api/auth/callback/naver` |

GitHub OAuth App은 콜백 URL을 하나만 허용한다. 기존 앱의 URL을 교체하거나 새 앱을 만들어야 한다.

### 4.7 배포 브랜치와 CD

- 포크에 `dev`로부터 `main`을 생성하고 push한다.
- Railway가 `main`을 watch → push 시 자동 빌드·배포.
- 릴리스 흐름: 기능 브랜치 → `dev` → `main` 머지가 곧 배포.
- `.github/workflows/deploy.yml`은 Railway와 중복이므로 삭제한다.

## 5. 실행 순서

각 단계는 다음 단계로 넘어가기 전에 검증한다.

| # | 작업 | 검증 |
|---|---|---|
| 1 | `prisma.ts` 포트 배선 + `railway.json` 생성 + `env.example` 보완 | `yarn build` 성공 |
| 2 | `deploy.yml` 삭제 | — |
| 3 | Railway 프로젝트 + MySQL 서비스 생성 | `railway status`에 두 서비스 표시 |
| 4 | 앱 서비스 생성, GitHub `main` 연결 | Railway가 리포를 인식 |
| 5 | 비밀 아닌 env 설정 (CLI) | `railway variables`에 표시 |
| 6 | 사용자가 시크릿 7개 입력 | 위와 동일 |
| 7 | 첫 배포 | 빌드 성공, 컨테이너 기동 |
| 8 | 도메인 발급 → `NEXTAUTH_URL`·`BASE_URL`·`metadataBase` 확정 반영 후 재배포 | — |
| 9 | 마이그레이션 실행 (4.5) | 테이블 생성 확인 |
| 10 | 사용자가 OAuth 콜백 등록 | — |

## 6. 완료 기준

1. `https://<도메인>/` 이 200을 반환하고 랜딩이 렌더된다.
2. Railway 로그에 기동 후 반복되는 에러가 없다.
3. OAuth 로그인(최소 1개 제공자)이 성공하고 세션이 유지된다.
4. 프로젝트 → 토픽 → 이슈 → 아이디어 생성이 DB에 저장된다.
5. 두 브라우저 탭에서 같은 이슈를 열었을 때 한쪽의 아이디어 생성이 다른 쪽에 SSE로 반영된다.

## 7. 위험 요소

| 위험 | 대응 |
|---|---|
| 첫 Docker 빌드가 Railway에서 실패 | 빌드 로그 확인. 로컬 `docker build -f dockerfile .`로 재현 |
| standalone 서버가 `$PORT`/호스트 바인딩을 못 맞춰 헬스체크 실패 | Railway가 주입하는 `PORT`를 `server.js`가 읽는지 로그로 확인. 필요 시 `dockerfile`에 `ENV HOSTNAME=0.0.0.0` 추가 |
| 프라이빗 네트워크 포트가 3306이 아님 | 4.2의 `DB_PORT` 배선으로 이미 대응됨 |
| SSE 연결이 Railway 프록시에서 끊김 | 완료 기준 5로 실측. 문제 시 재연결 주기 조정 검토 |
| 비용 초과 | 서비스 2개 단일 레플리카. Railway 사용량 대시보드로 확인 |
