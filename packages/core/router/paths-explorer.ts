import {
  METHOD_METADATA,
  PATH_METADATA,
  VERSION_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common/enums';
import { Controller } from '@nestjs/common/interfaces/controllers/controller.interface';
import { VersionValue } from '@nestjs/common/interfaces/version-options.interface';
import {
  addLeadingSlash,
  isString,
  isUndefined,
} from '@nestjs/common/utils/shared.utils';
import { MetadataScanner } from '../metadata-scanner';
import { RouterProxyCallback } from './router-proxy';

/**
 * 单条路由的定义信息。
 *
 * 在框架中的角色：PathsExplorer 扫描控制器方法后产出的中间结果，
 * 会被 RouterExplorer 进一步包装（绑定执行上下文、异常处理）后注册到 HTTP 适配器。
 */
export interface RouteDefinition {
  /** 路由路径数组（一个方法可通过数组形式声明多条路径），均已规范化为带前导斜杠。 */
  path: string[];
  /** HTTP 请求方法（GET、POST 等），来自 @Get/@Post 等装饰器写入的元数据。 */
  requestMethod: RequestMethod;
  /** 控制器实例上的原始方法引用（路由处理器）。 */
  targetCallback: RouterProxyCallback;
  /** 控制器方法名。 */
  methodName: string;
  /** 方法级版本值（@Version 装饰器写入），未声明时为 undefined。 */
  version?: VersionValue;
}

/**
 * 路径探测器：扫描控制器原型上的方法，提取出所有路由处理器定义。
 *
 * 在框架中的角色：RouterExplorer 对每个控制器调用 scanForPaths，借助 MetadataScanner
 * 遍历方法名，再通过反射读取方法上由 @Get/@Post 等装饰器写入的
 * PATH_METADATA / METHOD_METADATA / VERSION_METADATA 元数据，汇总为 RouteDefinition
 * 列表。这是"装饰器元数据 -> 路由定义"转换的关键一环。
 */
export class PathsExplorer {
  constructor(private readonly metadataScanner: MetadataScanner) {}

  /**
   * 扫描控制器实例（原型链上的）所有方法，收集路由定义。
   *
   * @param instance - 控制器实例。
   * @param prototype - 可选的起始原型（默认取实例的原型）。
   * @returns 该控制器上的全部路由定义；未标注路由装饰器的方法会被跳过。
   */
  public scanForPaths(
    instance: Controller,
    prototype?: object,
  ): RouteDefinition[] {
    const instancePrototype = isUndefined(prototype)
      ? Object.getPrototypeOf(instance)
      : prototype;

    return this.metadataScanner
      .getAllMethodNames(instancePrototype)
      .reduce((acc, method) => {
        const route = this.exploreMethodMetadata(
          instance,
          instancePrototype,
          method,
        );

        if (route) {
          acc.push(route);
        }

        return acc;
      }, [] as RouteDefinition[]);
  }

  /**
   * 探测单个控制器方法的路由元数据。
   *
   * @param instance - 控制器实例（用于取得实例上的方法引用）。
   * @param prototype - 方法所在的原型对象。
   * @param methodName - 方法名。
   * @returns 路由定义；若方法未标注路由装饰器（无 PATH_METADATA）则返回 null。
   */
  public exploreMethodMetadata(
    instance: Controller,
    prototype: object,
    methodName: string,
  ): RouteDefinition | null {
    // 1. 从原型方法上读取 @Get/@Post 等装饰器写入的路径元数据，缺失则说明不是路由处理器
    const instanceCallback = instance[methodName];
    const prototypeCallback = prototype[methodName];
    const routePath = Reflect.getMetadata(PATH_METADATA, prototypeCallback);
    if (isUndefined(routePath)) {
      return null;
    }
    // 2. 读取 HTTP 请求方法与版本元数据
    const requestMethod: RequestMethod = Reflect.getMetadata(
      METHOD_METADATA,
      prototypeCallback,
    );
    const version: VersionValue | undefined = Reflect.getMetadata(
      VERSION_METADATA,
      prototypeCallback,
    );
    // 3. 规范化路径：每条路径统一添加前导斜杠（支持数组形式的多路径声明）
    const path = isString(routePath)
      ? [addLeadingSlash(routePath)]
      : routePath.map((p: string) => addLeadingSlash(p));

    return {
      path,
      requestMethod,
      targetCallback: instanceCallback,
      methodName,
      version,
    };
  }
}
