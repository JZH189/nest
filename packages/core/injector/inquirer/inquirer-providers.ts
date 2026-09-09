import { Provider, Scope } from '@nestjs/common';
import { INQUIRER } from './inquirer-constants';

const noop = () => {};
/**
 * INQUIRER token 的占位 provider 定义（transient 作用域、空工厂）。
 * 仅用于占位登记：真正注入时注入器会识别 INQUIRER 标识，
 * 直接以父询问者实例替代该占位 provider 的解析结果。
 */
export const inquirerProvider: Provider = {
  provide: INQUIRER,
  scope: Scope.TRANSIENT,
  useFactory: noop,
};
