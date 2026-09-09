import {
  CanActivate,
  ExceptionFilter,
  NestInterceptor,
  PipeTransform,
  VersioningOptions,
  WebSocketAdapter,
} from '@nestjs/common';
import { GlobalPrefixOptions } from '@nestjs/common/interfaces';
import { InstanceWrapper } from './injector/instance-wrapper';
import { ExcludeRouteMetadata } from './router/interfaces/exclude-route-metadata.interface';

/**
 * 应用级运行时配置的"中央仓库"：在应用生命周期内保存
 * 全局增强器（guards/pipes/interceptors/filters）、全局路由前缀、
 * URI 版本控制配置以及 WebSocket 适配器等设置。
 *
 * 每个应用（含混合应用中的微服务）持有一个独立实例；
 * 请求作用域的全局增强器以 InstanceWrapper 形式保存，运行时按请求解析。
 */
export class ApplicationConfig {
  /** 全局路由前缀（setGlobalPrefix 设置），如 'api' */
  private globalPrefix = '';
  /** 全局前缀的附加配置（如排除路由） */
  private globalPrefixOptions: GlobalPrefixOptions<ExcludeRouteMetadata> = {};
  /** 全局管道列表（单例实例） */
  private globalPipes: Array<PipeTransform> = [];
  /** 全局异常过滤器列表（单例实例） */
  private globalFilters: Array<ExceptionFilter> = [];
  /** 全局拦截器列表（单例实例） */
  private globalInterceptors: Array<NestInterceptor> = [];
  /** 全局守卫列表（单例实例） */
  private globalGuards: Array<CanActivate> = [];
  /** URI 版本控制配置 */
  private versioningOptions: VersioningOptions;
  /** 全局请求作用域管道（以 InstanceWrapper 保存，按请求解析） */
  private readonly globalRequestPipes: InstanceWrapper<PipeTransform>[] = [];
  /** 全局请求作用域异常过滤器 */
  private readonly globalRequestFilters: InstanceWrapper<ExceptionFilter>[] =
    [];
  /** 全局请求作用域拦截器 */
  private readonly globalRequestInterceptors: InstanceWrapper<NestInterceptor>[] =
    [];
  /** 全局请求作用域守卫 */
  private readonly globalRequestGuards: InstanceWrapper<CanActivate>[] = [];

  /**
   * @param ioAdapter - 可选的 WebSocket 适配器
   */
  constructor(private ioAdapter: WebSocketAdapter | null = null) {}

  /**
   * 设置全局路由前缀。
   *
   * @param prefix - 前缀字符串（不含斜杠），如 'api'
   */
  public setGlobalPrefix(prefix: string) {
    this.globalPrefix = prefix;
  }

  /**
   * 获取全局路由前缀。
   *
   * @returns 当前前缀字符串，未设置时为空字符串
   */
  public getGlobalPrefix() {
    return this.globalPrefix;
  }

  /**
   * 设置全局前缀的附加配置（如 exclude 排除路由列表）。
   *
   * @param options - 前缀配置对象
   */
  public setGlobalPrefixOptions(
    options: GlobalPrefixOptions<ExcludeRouteMetadata>,
  ) {
    this.globalPrefixOptions = options;
  }

  /**
   * 获取全局前缀的附加配置。
   *
   * @returns 前缀配置对象
   */
  public getGlobalPrefixOptions(): GlobalPrefixOptions<ExcludeRouteMetadata> {
    return this.globalPrefixOptions;
  }

  /**
   * 设置 WebSocket 网关适配器。
   *
   * @param ioAdapter - WebSocket 适配器实例
   */
  public setIoAdapter(ioAdapter: WebSocketAdapter) {
    this.ioAdapter = ioAdapter;
  }

  /**
   * 获取 WebSocket 网关适配器。
   *
   * @returns 当前适配器实例（未设置时为 undefined）
   */
  public getIoAdapter(): WebSocketAdapter {
    return this.ioAdapter!;
  }

  /**
   * 添加一个全局管道（运行时动态添加，保留已有列表）。
   *
   * @param pipe - 管道实例
   */
  public addGlobalPipe(pipe: PipeTransform<any>) {
    this.globalPipes.push(pipe);
  }

  /**
   * 批量注册全局管道（覆盖式合并，useGlobalPipes 的底层实现）。
   *
   * @param pipes - 管道实例列表
   */
  public useGlobalPipes(...pipes: PipeTransform<any>[]) {
    this.globalPipes = this.globalPipes.concat(pipes);
  }

  /**
   * 获取全局异常过滤器列表。
   *
   * @returns 过滤器实例数组
   */
  public getGlobalFilters(): ExceptionFilter[] {
    return this.globalFilters;
  }

  /**
   * 添加一个全局异常过滤器。
   *
   * @param filter - 过滤器实例
   */
  public addGlobalFilter(filter: ExceptionFilter) {
    this.globalFilters.push(filter);
  }

  /**
   * 批量注册全局异常过滤器。
   *
   * @param filters - 过滤器实例列表
   */
  public useGlobalFilters(...filters: ExceptionFilter[]) {
    this.globalFilters = this.globalFilters.concat(filters);
  }

  /**
   * 获取全局管道列表。
   *
   * @returns 管道实例数组
   */
  public getGlobalPipes(): PipeTransform<any>[] {
    return this.globalPipes;
  }

  /**
   * 获取全局拦截器列表。
   *
   * @returns 拦截器实例数组
   */
  public getGlobalInterceptors(): NestInterceptor[] {
    return this.globalInterceptors;
  }

  /**
   * 添加一个全局拦截器。
   *
   * @param interceptor - 拦截器实例
   */
  public addGlobalInterceptor(interceptor: NestInterceptor) {
    this.globalInterceptors.push(interceptor);
  }

  /**
   * 批量注册全局拦截器。
   *
   * @param interceptors - 拦截器实例列表
   */
  public useGlobalInterceptors(...interceptors: NestInterceptor[]) {
    this.globalInterceptors = this.globalInterceptors.concat(interceptors);
  }

  /**
   * 获取全局守卫列表。
   *
   * @returns 守卫实例数组
   */
  public getGlobalGuards(): CanActivate[] {
    return this.globalGuards;
  }

  /**
   * 添加一个全局守卫。
   *
   * @param guard - 守卫实例
   */
  public addGlobalGuard(guard: CanActivate) {
    this.globalGuards.push(guard);
  }

  /**
   * 批量注册全局守卫。
   *
   * @param guards - 守卫实例列表
   */
  public useGlobalGuards(...guards: CanActivate[]) {
    this.globalGuards = this.globalGuards.concat(guards);
  }

  /**
   * 添加一个请求作用域的全局拦截器（以 InstanceWrapper 形式保存）。
   *
   * @param wrapper - 拦截器的实例包装器
   */
  public addGlobalRequestInterceptor(
    wrapper: InstanceWrapper<NestInterceptor>,
  ) {
    this.globalRequestInterceptors.push(wrapper);
  }

  /**
   * 获取请求作用域的全局拦截器列表。
   *
   * @returns InstanceWrapper 数组
   */
  public getGlobalRequestInterceptors(): InstanceWrapper<NestInterceptor>[] {
    return this.globalRequestInterceptors;
  }

  /**
   * 添加一个请求作用域的全局管道。
   *
   * @param wrapper - 管道的实例包装器
   */
  public addGlobalRequestPipe(wrapper: InstanceWrapper<PipeTransform>) {
    this.globalRequestPipes.push(wrapper);
  }

  /**
   * 获取请求作用域的全局管道列表。
   *
   * @returns InstanceWrapper 数组
   */
  public getGlobalRequestPipes(): InstanceWrapper<PipeTransform>[] {
    return this.globalRequestPipes;
  }

  /**
   * 添加一个请求作用域的全局异常过滤器。
   *
   * @param wrapper - 过滤器的实例包装器
   */
  public addGlobalRequestFilter(wrapper: InstanceWrapper<ExceptionFilter>) {
    this.globalRequestFilters.push(wrapper);
  }

  /**
   * 获取请求作用域的全局异常过滤器列表。
   *
   * @returns InstanceWrapper 数组
   */
  public getGlobalRequestFilters(): InstanceWrapper<ExceptionFilter>[] {
    return this.globalRequestFilters;
  }

  /**
   * 添加一个请求作用域的全局守卫。
   *
   * @param wrapper - 守卫的实例包装器
   */
  public addGlobalRequestGuard(wrapper: InstanceWrapper<CanActivate>) {
    this.globalRequestGuards.push(wrapper);
  }

  /**
   * 获取请求作用域的全局守卫列表。
   *
   * @returns InstanceWrapper 数组
   */
  public getGlobalRequestGuards(): InstanceWrapper<CanActivate>[] {
    return this.globalRequestGuards;
  }

  /**
   * 启用 URI 版本控制并保存配置
   * （默认版本为数组时会先去重）。
   *
   * @param options - 版本控制配置
   */
  public enableVersioning(options: VersioningOptions): void {
    if (Array.isArray(options.defaultVersion)) {
      // 移除重复的版本
      options.defaultVersion = Array.from(new Set(options.defaultVersion));
    }

    this.versioningOptions = options;
  }

  /**
   * 获取 URI 版本控制配置。
   *
   * @returns 版本控制配置；未启用时为 undefined
   */
  public getVersioning(): VersioningOptions | undefined {
    return this.versioningOptions;
  }
}
