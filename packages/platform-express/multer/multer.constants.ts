/**
 * MulterModule 动态模块的唯一标识令牌。
 * registerAsync 时用随机字符串作为值，使相同配置的异步模块彼此不被 NestJS 去重合并。
 */
export const MULTER_MODULE_ID = 'MULTER_MODULE_ID';
