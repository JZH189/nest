import { ParamData } from '@nestjs/common';
import {
  PARAMTYPES_METADATA,
  RESPONSE_PASSTHROUGH_METADATA,
} from '@nestjs/common/constants';
import {
  ContextType,
  Controller,
  PipeTransform,
  Type,
} from '@nestjs/common/interfaces';
import { isFunction } from '@nestjs/common/utils/shared.utils';
import { ExecutionContextHost } from './execution-context-host';

/**
 * 参数属性描述：描述路由处理器的一个参数（@Body/@Param 等装饰器写入的元数据
 * 与运行时提取逻辑的组合），供参数解析器（ParamsTokenFactory / 路由参数工厂）使用。
 */
export interface ParamProperties<T = any, IExtractor extends Function = any> {
  /** 参数在处理器签名中的位置索引 */
  index: number;
  /** 参数类型（装饰器类型或自定义字符串标识） */
  type: T | string;
  /** 传给装饰器的数据（如 @Param('id') 中的 'id'） */
  data: ParamData;
  /** 应用于该参数的管道数组 */
  pipes: PipeTransform[];
  /** 从请求中提取该参数值的函数 */
  extractValue: IExtractor;
}

/**
 * 上下文工具集：封装路由处理器相关的元数据反射与参数解析辅助逻辑。
 *
 * 在框架中的角色：被路由参数工厂（RouterParamsFactory）、
 * 参数提取等模块复用，用于读取参数类型/装饰器元数据、
 * 构造 ExecutionContextHost 等。
 */
export class ContextUtils {
  /**
   * 解析参数类型键：形如 "body:prop" 的键以冒号分隔，取第一段作为类型名。
   * @param key - 参数元数据键（可能带子属性后缀）
   * @returns 参数类型名（如 'body'、'query'）
   */
  public mapParamType(key: string): string {
    const keyPair = key.split(':');
    return keyPair[0];
  }

  /**
   * 反射读取路由处理方法的参数类型元数据（design:paramtypes 及增强信息）。
   * @param instance - 控制器实例
   * @param methodName - 方法名
   * @returns 参数类型数组
   */
  public reflectCallbackParamtypes(
    instance: Controller,
    methodName: string,
  ): any[] {
    return Reflect.getMetadata(PARAMTYPES_METADATA, instance, methodName);
  }

  /**
   * 从控制器类上反射读取指定方法的装饰器元数据。
   * @param instance - 控制器实例
   * @param methodName - 方法名
   * @param metadataKey - 元数据键
   * @returns 读取到的元数据
   */
  public reflectCallbackMetadata<T = any>(
    instance: Controller,
    methodName: string,
    metadataKey: string,
  ): T {
    return Reflect.getMetadata(metadataKey, instance.constructor, methodName);
  }

  /**
   * 反射判断方法是否标记了 @Res({ passthrough: true })（即响应透传模式）。
   * @param instance - 控制器实例
   * @param methodName - 方法名
   * @returns 标记了 passthrough 时返回 true
   */
  public reflectPassthrough(instance: Controller, methodName: string): boolean {
    return Reflect.getMetadata(
      RESPONSE_PASSTHROUGH_METADATA,
      instance.constructor,
      methodName,
    );
  }

  /**
   * 计算处理器参数槽位的总长度（最大参数索引 + 1）。
   * @param keys - 参数元数据键列表
   * @param metadata - 参数元数据映射
   * @returns 参数槽位数量；无元数据时返回 0
   */
  public getArgumentsLength<T>(keys: string[], metadata: T): number {
    return keys.length
      ? Math.max(...keys.map(key => metadata[key].index)) + 1
      : 0;
  }

  /**
   * 创建指定长度的空参数数组（元素均为 undefined），
   * 保证未被装饰器声明的参数位置也占据槽位。
   * @param length - 数组长度
   * @returns 填充 undefined 的数组
   */
  public createNullArray(length: number): any[] {
    const a = new Array(length);
    for (let i = 0; i < length; ++i) a[i] = undefined;
    return a;
  }

  /**
   * 把参数属性与参数类型元数据合并，补上每个参数位置的类型（metatype），
   * 供管道转换与验证时判断目标类型。
   * @param paramsProperties - 参数属性描述数组
   * @param paramtypes - 参数类型元数据数组（按索引对齐）
   * @returns 附加了 metatype 字段的参数属性数组
   */
  public mergeParamsMetatypes(
    paramsProperties: ParamProperties[],
    paramtypes: any[],
  ): (ParamProperties & { metatype?: any })[] {
    if (!paramtypes) {
      return paramsProperties;
    }
    return paramsProperties.map(param => ({
      ...param,
      metatype: paramtypes[param.index],
    }));
  }

  /**
   * 包装自定义参数工厂（@createParam 等注册的工厂函数）：
   * 调用时自动注入装饰器数据与执行上下文。
   * @param factory - 用户提供的自定义工厂函数
   * @param data - 传给装饰器的数据
   * @param contextFactory - 构造 ExecutionContextHost 的工厂
   * @returns 包装后的工厂函数；factory 非函数时返回返回 null 的占位函数
   */
  public getCustomFactory(
    factory: (...args: unknown[]) => void,
    data: unknown,
    contextFactory: (args: unknown[]) => ExecutionContextHost,
  ): (...args: unknown[]) => unknown {
    return isFunction(factory)
      ? (...args: unknown[]) => factory(data, contextFactory(args))
      : () => null;
  }

  /**
   * 创建执行上下文工厂：给定路由参数数组时快速构造 ExecutionContextHost。
   * @param contextType - 上下文类型（'http'、'ws'、'rpc' 等）
   * @param instance - 控制器实例（可选）
   * @param callback - 路由处理方法（可选）
   * @returns 接收参数数组并返回 ExecutionContextHost 的工厂函数
   */
  public getContextFactory<TContext extends string = ContextType>(
    contextType: TContext,
    instance?: object,
    callback?: Function,
  ): (args: unknown[]) => ExecutionContextHost {
    const type = instance && (instance.constructor as Type<unknown>);
    return (args: unknown[]) => {
      const ctx = new ExecutionContextHost(args, type, callback);
      ctx.setType(contextType);
      return ctx;
    };
  }
}
