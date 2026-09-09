import { InjectionToken } from '@nestjs/common';
import { isFunction } from '@nestjs/common/utils/shared.utils';
import { UnknownElementException } from '../errors/exceptions/unknown-element.exception';
import { NestContainer } from './container';
import { InstanceWrapper } from './instance-wrapper';
import { Module } from './module';

type HostCollection = 'providers' | 'controllers' | 'injectables';

/**
 * 实例链接：一个 token 在某个模块中的登记位置快照
 * （指向 wrapper 与其所在集合，便于反查与加速后续查找）
 */
export interface InstanceLink<T = any> {
  /** 注入 token */
  token: InjectionToken;
  /** 实例包装器引用 */
  wrapperRef: InstanceWrapper<T>;
  /** wrapper 所在的集合（providers/controllers/injectables 之一） */
  collection: Map<any, InstanceWrapper>;
  /** 所属模块 ID */
  moduleId: string;
}

/**
 * 实例链接宿主：把容器中所有模块的 providers/injectables/controllers
 * 拍平成"token -> 链接数组"的索引，供 ModuleRef 的 get/resolve 快速定位实例。
 *
 * 同一 token 可能存在于多个模块（如全局 provider），因此值为数组；
 * 支持按 moduleId 精确查找（strict 模式）或返回全部链接（each 模式）。
 */
export class InstanceLinksHost {
  /** token -> 实例链接数组的索引表 */
  private readonly instanceLinks = new Map<InjectionToken, InstanceLink[]>();

  /**
   * 构造时立即扫描容器建立索引
   *
   * @param container - IoC 容器
   */
  constructor(private readonly container: NestContainer) {
    this.initialize();
  }

  /** 按 token 获取实例链接（重载 1：不传选项） */
  get<T = any>(token: InjectionToken): InstanceLink<T>;
  /** 按 token 获取实例链接（重载 2：支持 moduleId/each 选项） */
  get<T = any>(
    token: InjectionToken,
    options?: { moduleId?: string; each?: boolean },
  ): InstanceLink<T> | Array<InstanceLink<T>>;
  /**
   * 按 token 获取实例链接的实现
   *
   * 处理流程：
   * 1. token 不存在时抛出 UnknownElementException
   * 2. each 为 true 时返回该 token 的全部链接
   * 3. 指定 moduleId 时按模块过滤；否则默认返回最后注册的链接
   *
   * @param token - 注入 token
   * @param options - 查找选项
   * @returns 单个链接或链接数组
   */
  get<T = any>(
    token: InjectionToken,
    options: { moduleId?: string; each?: boolean } = {},
  ): InstanceLink<T> | Array<InstanceLink<T>> {
    const instanceLinksForGivenToken = this.instanceLinks.get(token);

    if (!instanceLinksForGivenToken) {
      throw new UnknownElementException(this.getInstanceNameByToken(token));
    }

    if (options.each) {
      return instanceLinksForGivenToken;
    }

    const instanceLink = options.moduleId
      ? instanceLinksForGivenToken.find(
          item => item.moduleId === options.moduleId,
        )
      : instanceLinksForGivenToken[instanceLinksForGivenToken.length - 1];

    if (!instanceLink) {
      throw new UnknownElementException(this.getInstanceNameByToken(token));
    }
    return instanceLink;
  }

  /** 遍历容器中所有模块，把 providers/injectables/controllers 全部登记为链接 */
  private initialize() {
    const modules = this.container.getModules();
    modules.forEach(moduleRef => {
      const { providers, injectables, controllers } = moduleRef;
      providers.forEach((wrapper, token) =>
        this.addLink(wrapper, token, moduleRef, 'providers'),
      );
      injectables.forEach((wrapper, token) =>
        this.addLink(wrapper, token, moduleRef, 'injectables'),
      );
      controllers.forEach((wrapper, token) =>
        this.addLink(wrapper, token, moduleRef, 'controllers'),
      );
    });
  }

  /** 登记一条实例链接（同一 token 已存在时追加到数组末尾） */
  private addLink(
    wrapper: InstanceWrapper,
    token: InjectionToken,
    moduleRef: Module,
    collectionName: HostCollection,
  ) {
    const instanceLink: InstanceLink = {
      moduleId: moduleRef.id,
      wrapperRef: wrapper,
      collection: moduleRef[collectionName],
      token,
    };
    const existingLinks = this.instanceLinks.get(token);
    if (!existingLinks) {
      this.instanceLinks.set(token, [instanceLink]);
    } else {
      existingLinks.push(instanceLink);
    }
  }

  /** 获取 token 的展示名（用于未知元素的错误信息） */
  private getInstanceNameByToken(token: InjectionToken): string {
    return isFunction(token) ? (token as Function)?.name : (token as string);
  }
}
