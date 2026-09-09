import { InjectorDependencyContext } from '../../injector/injector';

/**
 * 序列化图的补充元数据：当应用初始化失败进入"部分图"（partial）状态时，
 * 记录失败原因（未知依赖的上下文、模块 id、节点 id 或原始错误），
 * 便于根据部分图排查问题。
 */
export interface SerializedGraphMetadata {
  /** 失败原因描述。 */
  cause: {
    /** 失败类型：未知依赖或其他未知错误。 */
    type: 'unknown-dependencies' | 'unknown';
    /** 依赖解析上下文（未知依赖时提供）。 */
    context?: InjectorDependencyContext;
    /** 出错模块的 id。 */
    moduleId?: string;
    /** 出错节点的 id。 */
    nodeId?: string;
    /** 原始错误对象（未知错误时提供）。 */
    error?: any;
  };
}
