type ColorTextFn = (text: string) => string;

/**
 * 判断当前环境是否允许输出 ANSI 颜色：
 * 通过检查 NO_COLOR 环境变量是否设置来决定（社区通用约定）。
 *
 * @returns 若未设置 NO_COLOR 环境变量则返回 `true`
 */
export const isColorAllowed = () => !process.env.NO_COLOR;
/**
 * 高阶函数：返回一个"条件着色"的文本包装函数。
 * 当颜色被禁用（NO_COLOR 已设置）时原样返回文本，否则套上对应的 ANSI 转义序列。
 *
 * @param colorFn 执行实际着色的函数
 * @returns 一个对文本按需着色的函数
 */
const colorIfAllowed = (colorFn: ColorTextFn) => (text: string) =>
  isColorAllowed() ? colorFn(text) : text;

/**
 * 常用终端颜色/样式工具集（基于 ANSI 转义序列）。
 * Nest 的 Logger 等组件用它为控制台输出着色；每项都遵循 NO_COLOR 约定，
 * 颜色被禁用时返回未着色的原始文本。
 */
export const clc = {
  bold: colorIfAllowed((text: string) => `\x1B[1m${text}\x1B[0m`),
  green: colorIfAllowed((text: string) => `\x1B[32m${text}\x1B[39m`),
  yellow: colorIfAllowed((text: string) => `\x1B[33m${text}\x1B[39m`),
  red: colorIfAllowed((text: string) => `\x1B[31m${text}\x1B[39m`),
  magentaBright: colorIfAllowed((text: string) => `\x1B[95m${text}\x1B[39m`),
  cyanBright: colorIfAllowed((text: string) => `\x1B[96m${text}\x1B[39m`),
};
/**
 * 将文本着色为黄色（256 色模式）的工具函数，同样遵循 NO_COLOR 禁色约定。
 */
export const yellow = colorIfAllowed(
  (text: string) => `\x1B[38;5;3m${text}\x1B[39m`,
);
