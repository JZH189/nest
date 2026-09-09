import {
  HttpServer,
  HttpStatus,
  Logger,
  RequestMethod,
  MessageEvent,
} from '@nestjs/common';
import { isObject } from '@nestjs/common/utils/shared.utils';
import { IncomingMessage } from 'http';
import { EMPTY, lastValueFrom, Observable, isObservable } from 'rxjs';
import { catchError, concatMap, map } from 'rxjs/operators';
import {
  AdditionalHeaders,
  WritableHeaderStream,
  SseStream,
} from './sse-stream';

/**
 * 自定义响应头描述：@Header(name, value) 装饰器的元数据载体。
 * value 可以是字符串，也可以是惰性求值的函数（每次响应时调用）。
 */
export interface CustomHeader {
  name: string;
  value: string | (() => string);
}

/**
 * 重定向响应配置：@Redirect(url, statusCode) 装饰器的元数据载体。
 */
export interface RedirectResponse {
  url: string;
  statusCode?: number;
}

/**
 * 路由响应控制器：负责把控制器方法的返回值写回 HTTP 响应。
 *
 * 在框架中的角色：由 RouterExecutionContext 持有，对 HTTP 适配器
 * （Express/Fastify）的响应操作做了统一封装，屏蔽不同框架的 API 差异：
 * 写响应体（apply/reply）、重定向、模板渲染、设置状态码与响应头，
 * 以及 SSE（基于 Observable 的服务器发送事件流）的建立与清理。
 */
export class RouterResponseController {
  private readonly logger = new Logger(RouterResponseController.name);

  constructor(private readonly applicationRef: HttpServer) {}

  /**
   * 把控制器方法的返回值写入响应体（委托给适配器的 reply 方法）。
   *
   * @param result - 处理结果（可能为 Observable/Promise）。
   * @param response - 响应对象。
   * @param httpStatusCode - 自定义状态码（可选）。
   */
  public async apply<TInput = any, TResponse = any>(
    result: TInput,
    response: TResponse,
    httpStatusCode?: number,
  ) {
    return this.applicationRef.reply(response, result, httpStatusCode);
  }

  /**
   * 执行重定向（@Redirect）：优先使用返回值中的 url/statusCode，
   * 其次是装饰器声明的值，默认状态码为 302（FOUND）。
   *
   * @param resultOrDeferred - 处理结果（可为 Promise/Observable）。
   * @param response - 响应对象。
   * @param redirectResponse - 重定向配置。
   */
  public async redirect<TInput = any, TResponse = any>(
    resultOrDeferred: TInput,
    response: TResponse,
    redirectResponse: RedirectResponse,
  ) {
    const result = await this.transformToResult(resultOrDeferred);
    const statusCode =
      result && result.statusCode
        ? result.statusCode
        : redirectResponse.statusCode
          ? redirectResponse.statusCode
          : HttpStatus.FOUND;
    const url = result && result.url ? result.url : redirectResponse.url;
    this.applicationRef.redirect(response, statusCode, url);
  }

  /**
   * 服务端模板渲染（@Render）：把返回值作为模板数据交给适配器渲染。
   *
   * @param resultOrDeferred - 模板数据（可为 Promise/Observable）。
   * @param response - 响应对象。
   * @param template - 模板名称。
   */
  public async render<TInput = unknown, TResponse = unknown>(
    resultOrDeferred: TInput,
    response: TResponse,
    template: string,
  ) {
    const result = await this.transformToResult(resultOrDeferred);
    return this.applicationRef.render(response, template, result);
  }

  /**
   * 归一化处理结果：Observable 会被订阅并取最后一个值，其余原样返回。
   *
   * @param resultOrDeferred - 控制器方法或拦截器产出的结果。
   * @returns 展开后的最终结果值。
   */
  public async transformToResult(resultOrDeferred: any) {
    if (isObservable(resultOrDeferred)) {
      return lastValueFrom(resultOrDeferred);
    }
    return resultOrDeferred;
  }

  /**
   * 根据 HTTP 请求方法推断默认状态码：POST -> 201（CREATED），其余 -> 200（OK）。
   *
   * @param requestMethod - HTTP 请求方法。
   * @returns 默认的 HTTP 状态码。
   */
  public getStatusByMethod(requestMethod: RequestMethod): number {
    switch (requestMethod) {
      case RequestMethod.POST:
        return HttpStatus.CREATED;
      default:
        return HttpStatus.OK;
    }
  }

  /**
   * 设置自定义响应头（@Header 装饰器声明的所有响应头）。
   *
   * @param response - 响应对象。
   * @param headers - 响应头列表（值可为字符串或惰性函数）。
   */
  public setHeaders<TResponse = unknown>(
    response: TResponse,
    headers: CustomHeader[],
  ) {
    headers.forEach(({ name, value }) =>
      this.applicationRef.setHeader(
        response,
        name,
        typeof value === 'function' ? value() : value,
      ),
    );
  }

  /** 设置响应状态码（@HttpCode 或按请求方法推断的默认值）。 */
  public setStatus<TResponse = unknown>(
    response: TResponse,
    statusCode: number,
  ) {
    this.applicationRef.status(response, statusCode);
  }

  /**
   * 建立 SSE（Server-Sent Events）连接：订阅控制器方法返回的 Observable，
   * 把每个事件以 SSE 消息格式写入响应流；客户端断开或流完成时清理资源。
   *
   * @param result - Observable 形式的事件流（可为 Promise 包装）。
   * @param response - 可写响应流。
   * @param request - 请求对象（用于监听连接关闭）。
   * @param options - 可选配置：附加响应头与状态码。
   * @returns 在流完成/出错/连接关闭时 resolve（出错时 reject）的 Promise。
   */
  public async sse<
    TInput extends Observable<unknown> = any,
    TResponse extends WritableHeaderStream = any,
    TRequest extends IncomingMessage = any,
  >(
    result: TInput | Promise<TInput>,
    response: TResponse,
    request: TRequest,
    options?: {
      additionalHeaders?: AdditionalHeaders;
      statusCode?: number;
    },
  ) {
    // It's possible that we sent headers already so don't use a stream
    if (response.writableEnded) {
      return;
    }

    const observableResult = await Promise.resolve(result);

    // 1. 校验返回值必须是 Observable，否则抛出引用错误
    this.assertObservable(observableResult);

    // 2. 创建与请求关联的 SSE 流并接入响应（写入事件头与状态码）
    const stream = new SseStream(request);

    const statusCode =
      options?.statusCode ??
      (response as { statusCode?: number }).statusCode ??
      200;

    stream.pipe(response, {
      additionalHeaders: options?.additionalHeaders,
      statusCode,
    });

    // 3. 订阅事件流：归一化消息格式、按背压逐条写入、错误时转为 SSE error 消息
    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const onClose = () => {
        settled = true;
        subscription.unsubscribe();
        if (!stream.writableEnded) {
          stream.end();
        }
        response.end();
        resolve();
      };

      const subscription = observableResult
        .pipe(
          map((message): MessageEvent => {
            if (isObject(message)) {
              return message as MessageEvent;
            }

            return { data: message as object | string };
          }),
          concatMap(
            message =>
              new Promise<void>(resolve =>
                stream.writeMessage(message, () => resolve()),
              ),
          ),
          catchError(err => {
            if (!stream.headersCommitted) {
              throw err;
            }

            const data = err instanceof Error ? err.message : err;
            stream.writeMessage({ type: 'error', data }, writeError => {
              if (writeError) {
                this.logger.error(writeError);
              }
            });

            return EMPTY;
          }),
        )
        .subscribe({
          error: err => {
            settled = true;
            request.removeListener('close', onClose);
            if (!stream.writableEnded) {
              stream.end();
            }
            reject(err);
          },
          complete: () => {
            settled = true;
            request.removeListener('close', onClose);
            if (!stream.writableEnded) {
              stream.end();
            }
            resolve();
          },
        });

      // Commit SSE headers on the next macrotask. Pipe validation errors
      // propagate through microtasks (which complete before macrotasks),
      // so if the lifecycle errored, `settled` is already true and we
      // skip the write. Otherwise headers are sent immediately rather
      // than waiting for the first Observable emission.
      setTimeout(() => {
        if (!settled) {
          stream.commitHeaders();
        }
      }, 0);

      request.on('close', onClose);
    });
  }

  /** 校验返回值为 Observable；否则抛出说明 SSE 用法的 ReferenceError。 */
  private assertObservable(value: any) {
    if (!isObservable(value)) {
      throw new ReferenceError(
        'You must return an Observable stream to use Server-Sent Events (SSE).',
      );
    }
  }
}
