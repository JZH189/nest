import { EnhancerSubtype } from '@nestjs/common/constants';

/**
 * 框架启动/运行过程中向控制台输出的提示信息文案集合。
 */
export const MESSAGES = {
  APPLICATION_START: `Starting Nest application...`,
  APPLICATION_READY: `Nest application successfully started`,
  MICROSERVICE_READY: `Nest microservice successfully started`,
  UNKNOWN_EXCEPTION_MESSAGE: 'Internal server error',
  ERROR_DURING_SHUTDOWN: 'Error happened during shutdown',
  CALL_LISTEN_FIRST:
    'app.listen() needs to be called before calling app.getUrl()',
};

/** 全局拦截器的特殊 provider token：以该 token 注册的 provider 会成为全局拦截器 */
export const APP_INTERCEPTOR = 'APP_INTERCEPTOR';
/** 全局管道的特殊 provider token */
export const APP_PIPE = 'APP_PIPE';
/** 全局守卫的特殊 provider token */
export const APP_GUARD = 'APP_GUARD';
/** 全局异常过滤器的特殊 provider token */
export const APP_FILTER = 'APP_FILTER';
/**
 * 全局增强器 token 到增强器子类型（'guard'/'pipe'/'interceptor'/'filter'）的映射，
 * 供依赖扫描器在注册全局增强器时确定其子类型。
 */
export const ENHANCER_TOKEN_TO_SUBTYPE_MAP: Record<
  | typeof APP_GUARD
  | typeof APP_PIPE
  | typeof APP_FILTER
  | typeof APP_INTERCEPTOR,
  EnhancerSubtype
> = {
  [APP_GUARD]: 'guard',
  [APP_INTERCEPTOR]: 'interceptor',
  [APP_PIPE]: 'pipe',
  [APP_FILTER]: 'filter',
} as const;
