import { AbstractHttpAdapter } from '../adapters';
import { HttpAdapterHost } from '../helpers/http-adapter-host';

/**
 * 框架内置 provider 的存储器：保存 HTTP 适配器及其宿主对象。
 * 由 NestContainer 持有，是 httpAdapter / HttpAdapterHost
 * 这两个框架级 provider 的真实数据来源。
 */
export class InternalProvidersStorage {
  /** HttpAdapterHost 实例（在构造时即创建，作为单例 provider 注出） */
  private readonly _httpAdapterHost = new HttpAdapterHost();
  /** 当前使用的 HTTP 适配器（Express/Fastify 等） */
  private _httpAdapter: AbstractHttpAdapter;

  /** 获取 HttpAdapterHost 实例 */
  get httpAdapterHost(): HttpAdapterHost {
    return this._httpAdapterHost;
  }

  /** 获取 HTTP 适配器实例 */
  get httpAdapter(): AbstractHttpAdapter {
    return this._httpAdapter;
  }

  /** 设置 HTTP 适配器实例 */
  set httpAdapter(httpAdapter: AbstractHttpAdapter) {
    this._httpAdapter = httpAdapter;
  }
}
