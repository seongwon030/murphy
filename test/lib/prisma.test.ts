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
