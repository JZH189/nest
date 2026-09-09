import { ContextId } from '../../injector';
import { ParamProperties } from '../context-utils';

/**
 * 附加了目标类型（metatype）的参数属性描述：
 * 在 ParamProperties 基础上补充参数的静态类型，供管道转换/校验使用。
 */
type ParamPropertiesWithMetatype<T = any> = ParamProperties & { metatype?: T };

/**
 * 外部处理器元数据：ExternalContextCreator 为外部传输层处理器
 * （微服务、WS 网关等）编译并缓存的元数据结构。
 */
export interface ExternalHandlerMetadata {
  /** 参数槽位总长度 */
  argsLength: number;
  /** 参数类型元数据数组 */
  paramtypes: any[];
  /** 按模块/上下文延迟解析参数元数据的提取函数 */
  getParamsMetadata: (
    moduleKey: string,
    contextId?: ContextId,
    inquirerId?: string,
  ) => ParamPropertiesWithMetatype[];
}
