import { IFile } from './interfaces';

/**
 * 文件校验器的上下文类型：在构建动态错误消息时，
 * 同时暴露被校验的文件对象与校验器的配置项
 *
 * @param TConfig - 校验器配置项的类型
 */
export type FileValidatorContext<TConfig> = {
  /** 请求中正在被校验的文件（可能不存在） */
  file?: IFile;
  /** 当前文件校验器的配置项 */
  config: TConfig;
};
