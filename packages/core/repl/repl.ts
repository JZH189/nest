import { DynamicModule, Logger, Type } from '@nestjs/common';
import { clc } from '@nestjs/common/utils/cli-colors.util';
import { NestFactory } from '../nest-factory';
import { assignToObject } from './assign-to-object.util';
import { REPL_INITIALIZED_MESSAGE } from './constants';
import { ReplContext } from './repl-context';
import { ReplLogger } from './repl-logger';
import { defineDefaultCommandsOnRepl } from './repl-native-commands';

import type { ReplOptions } from 'repl';

/**
 * 启动一个交互式调试 REPL（Read-Eval-Print-Loop）服务。
 *
 * 通过 `nest start --entryFile repl`（入口文件中调用 `repl(AppModule)`）启动。
 * REPL 允许开发者在应用运行期间直接在终端里与依赖注入容器交互，
 * 例如使用 `get()` 获取实例、`resolve()` 解析请求级/瞬态实例、
 * `select()` 选择子模块、`debug()` 打印模块结构等。
 *
 * 处理流程：
 * 1. 以"纯应用上下文"（不含 HTTP 服务器）的方式初始化传入的模块；
 * 2. 构建 ReplContext，扫描容器中所有模块/控制器/提供者并注册到全局作用域；
 * 3. 启动 Node.js 原生 repl 模块，并把 ReplContext 的作用域合并进 repl 环境；
 * 4. 定义 REPL 默认命令（如 .help）；
 * 5. 监听退出事件，确保 REPL 结束时优雅关闭应用（触发 onModuleDestroy 等生命周期钩子）。
 *
 * @param module - 根模块，可以是普通模块类（Type）或动态模块（DynamicModule）。
 * @param replOptions - 透传给 Node.js 原生 `repl.start` 的可选项（如自定义 prompt 等）。
 * @returns 已启动的 Node.js REPLServer 实例。
 */
export async function repl(
  module: Type | DynamicModule,
  replOptions: ReplOptions = {},
) {
  // 1. 创建独立于 HTTP 服务器的应用上下文（abortOnError: false 表示初始化失败时不立即退出进程）
  const app = await NestFactory.createApplicationContext(module, {
    abortOnError: false,
    logger: new ReplLogger(),
  });
  // 2. 执行模块初始化，完成依赖扫描与实例化
  await app.init();

  // 3. 构建 REPL 上下文： introspect 所有模块的 providers/controllers，注册原生函数（get/resolve/...）
  const replContext = new ReplContext(app);
  Logger.log(REPL_INITIALIZED_MESSAGE);

  // 4. 动态加载 Node.js 原生 repl 模块并启动 REPL 服务器
  const _repl = await import('repl');
  const replServer = _repl.start({
    prompt: clc.green('> '),
    ignoreUndefined: true,
    ...replOptions,
  });
  // 5. 把 ReplContext 中的全局作用域（模块/实例/原生函数）合并进 repl 环境，供交互式调用
  assignToObject(replServer.context, replContext.globalScope);

  // 6. 注册 REPL 默认命令（.help 等）
  defineDefaultCommandsOnRepl(replServer);

  // 7. REPL 退出时优雅关闭应用，触发各模块的生命周期销毁钩子
  replServer.on('exit', async () => {
    await app.close();
  });

  return replServer;
}
