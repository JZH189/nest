import {
  HttpServer,
  MiddlewareConsumer,
  Type,
} from '@nestjs/common/interfaces';
import {
  MiddlewareConfigProxy,
  MiddlewareConfiguration,
  RouteInfo,
} from '@nestjs/common/interfaces/middleware';
import { stripEndSlash } from '@nestjs/common/utils/shared.utils';
import { iterate } from 'iterare';
import { RouteInfoPathExtractor } from './route-info-path-extractor';
import { RoutesMapper } from './routes-mapper';
import { filterMiddleware } from './utils';

/**
 * 中间件构建器（MiddlewareBuilder）：Module 的 configure() 方法中
 * 传入的开发者 API 对象，实现 MiddlewareConsumer 接口。
 *
 * 在框架中的角色：开发者通过 `apply(...).exclude(...).forRoutes(...)`
 * 的链式调用声明"哪些中间件作用于哪些路由"，本类负责收集这些
 * MiddlewareConfiguration，最终由 MiddlewareModule 读取并注册。
 */
export class MiddlewareBuilder implements MiddlewareConsumer {
  /** 本模块收集到的全部中间件配置集合。 */
  private readonly middlewareCollection = new Set<MiddlewareConfiguration>();

  /**
   * @param routesMapper - 路由映射器，把 controller 类/路由字符串解析为 RouteInfo。
   * @param httpAdapter - 底层 HTTP 适配器（用于路径风格适配）。
   * @param routeInfoPathExtractor - 路径提取器（用于 exclude 的路径展开）。
   */
  constructor(
    private readonly routesMapper: RoutesMapper,
    private readonly httpAdapter: HttpServer,
    private readonly routeInfoPathExtractor: RouteInfoPathExtractor,
  ) {}

  /**
   * 声明要注册的中间件（类引用、函数式中间件或其数组），
   * 返回配置代理以便继续调用 exclude / forRoutes。
   *
   * @param middleware - 中间件类或函数（支持嵌套数组，自动拍平）。
   * @returns 中间件配置代理（MiddlewareConfigProxy）。
   */
  public apply(
    ...middleware: Array<Type<any> | Function | Array<Type<any> | Function>>
  ): MiddlewareConfigProxy {
    return new MiddlewareBuilder.ConfigProxy(
      this,
      middleware.flat(),
      this.routeInfoPathExtractor,
    );
  }

  /**
   * 输出全部已收集的中间件配置，供 MiddlewareModule 消费。
   *
   * @returns 中间件配置数组。
   */
  public build(): MiddlewareConfiguration[] {
    return [...this.middlewareCollection];
  }

  /**
   * 获取底层 HTTP 适配器（供配置代理内部做路径适配）。
   *
   * @returns HTTP 适配器实例。
   */
  public getHttpAdapter(): HttpServer {
    return this.httpAdapter;
  }

  /**
   * 配置代理（ConfigProxy）：apply() 的返回值，支持 exclude() 排除路由、
   * forRoutes() 指定生效路由，并负责过滤无效中间件与去除重叠路由。
   */
  private static readonly ConfigProxy = class implements MiddlewareConfigProxy {
    /** 通过 exclude() 排除的路由列表。 */
    private excludedRoutes: RouteInfo[] = [];

    /**
     * @param builder - 所属的 MiddlewareBuilder。
     * @param middleware - 待配置的中间件列表。
     * @param routeInfoPathExtractor - 路径提取器。
     */
    constructor(
      private readonly builder: MiddlewareBuilder,
      private readonly middleware: Array<Type<any> | Function>,
      private routeInfoPathExtractor: RouteInfoPathExtractor,
    ) {}

    /**
     * 获取被排除的路由列表（供 filterMiddleware 过滤使用）。
     *
     * @returns 被排除的 RouteInfo 数组。
     */
    public getExcludedRoutes(): RouteInfo[] {
      return this.excludedRoutes;
    }

    /**
     * 排除（不应用中间件的）路由，支持字符串与 RouteInfo，
     * 并按全局前缀/版本展开为多个具体路径。
     *
     * @param routes - 要排除的路由（字符串或 RouteInfo）。
     * @returns 配置代理本身（支持链式调用）。
     */
    public exclude(
      ...routes: Array<string | RouteInfo>
    ): MiddlewareConfigProxy {
      this.excludedRoutes = [
        ...this.excludedRoutes,
        ...this.getRoutesFlatList(routes).reduce((excludedRoutes, route) => {
          for (const routePath of this.routeInfoPathExtractor.extractPathFrom(
            route,
          )) {
            excludedRoutes.push({
              ...route,
              path: routePath,
            });
          }

          return excludedRoutes;
        }, [] as RouteInfo[]),
      ];

      return this;
    }

    /**
     * 指定中间件生效的路由，完成配置的最终构建并登记到 builder。
     * 会先将各类路由参数统一解析为 RouteInfo，再去除重叠路由。
     *
     * @param routes - 生效路由（路径字符串、controller 类或 RouteInfo）。
     * @returns MiddlewareBuilder 本身（结束链式调用）。
     */
    public forRoutes(
      ...routes: Array<string | Type<any> | RouteInfo>
    ): MiddlewareConsumer {
      const { middlewareCollection } = this.builder;

      const flattedRoutes = this.getRoutesFlatList(routes);
      const forRoutes = this.removeOverlappedRoutes(flattedRoutes);
      const configuration = {
        middleware: filterMiddleware(
          this.middleware,
          this.excludedRoutes,
          this.builder.getHttpAdapter(),
        ),
        forRoutes,
      };
      middlewareCollection.add(configuration);
      return this.builder;
    }

    /**
     * 将混合的路由参数（字符串/类/RouteInfo）统一解析并拍平为 RouteInfo 列表。
     *
     * @param routes - 混合形式的路由参数。
     * @returns 拍平后的 RouteInfo 数组。
     */
    private getRoutesFlatList(
      routes: Array<string | Type<any> | RouteInfo>,
    ): RouteInfo[] {
      const { routesMapper } = this.builder;

      return iterate(routes)
        .map(route => routesMapper.mapRouteToRouteInfo(route))
        .flatten()
        .toArray();
    }

    /**
     * 去除被参数化路径（如 'cats/:id'）覆盖的重叠路由，
     * 避免同一路由被重复匹配。
     *
     * @param routes - 待去重的 RouteInfo 列表。
     * @returns 去除重叠后的 RouteInfo 列表。
     */
    private removeOverlappedRoutes(routes: RouteInfo[]) {
      const regexMatchParams = /(:[^/]*)/g;
      const wildcard = '([^/]*)';
      const routesWithRegex = routes
        .filter(route => route.path.includes(':'))
        .map(route => ({
          method: route.method,
          path: route.path,
          regex: new RegExp(
            '^(' + route.path.replace(regexMatchParams, wildcard) + ')$',
            'g',
          ),
        }));

      return routes.filter(route => {
        const isOverlapped = (item: { regex: RegExp } & RouteInfo): boolean => {
          if (route.method !== item.method) {
            return false;
          }
          const normalizedRoutePath = stripEndSlash(route.path);
          return (
            normalizedRoutePath !== item.path &&
            item.regex.test(normalizedRoutePath)
          );
        };
        const routeMatch = routesWithRegex.find(isOverlapped);
        return routeMatch === undefined;
      });
    }
  };
}
