/**
 * INQUIRER 注入标识：构造参数中以 `@Inject(INQUIRER)` 声明时，
 * 注入器会把"询问者"（当前正在实例化的宿主类）的实例注入进来，
 * 便于工具类 provider 回溯其宿主上下文。
 */
export const INQUIRER = 'INQUIRER';
