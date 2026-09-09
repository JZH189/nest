import { ParamData } from '@nestjs/common';

/**
 * 参数元数据映射：键为参数位置索引（数字），值为该位置的参数元数据。
 * 由 @Body/@Query 等参数装饰器通过 ROUTE_ARGS_METADATA 写入。
 */
export type ParamsMetadata = Record<number, ParamMetadata>;

/**
 * 单个参数位置的元数据。
 */
export interface ParamMetadata {
  /** 参数在处理器签名中的位置索引 */
  index: number;
  /** 传给装饰器的数据（如 @Query('id') 的 'id'）；可选 */
  data?: ParamData;
}
