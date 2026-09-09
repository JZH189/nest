import { InjectionToken } from '@nestjs/common';

/**
 * Mock 工厂类型：接收无法解析的依赖 token（类引用或字符串等），
 * 返回一个 mock 实例（返回 undefined/null 表示放弃兜底并抛出原错误）。
 * 通过 `Test.createTestingModule(...).useMocker(fn)` 配置，
 * 常与自动 mock 库（如 ts-mockito 的 mock + instance）搭配使用。
 */
export type MockFactory = (token?: InjectionToken) => any;
