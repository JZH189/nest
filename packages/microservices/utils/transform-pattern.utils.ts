import {
  isNumber,
  isObject,
  isString,
} from '@nestjs/common/utils/shared.utils';
import { MsPattern } from '../interfaces';

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_KEYS = 20;
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * 把消息模式（Pattern）安全地转换为路由字符串。
 *
 * 微服务用 pattern 做消息路由，pattern 可以是字符串也可以是对象。
 * 该函数把任意 pattern 规范化为唯一的字符串键（即"路由"），用于
 * 内部映射表（如 handlerMap、订阅主题）：
 * - 字符串/数字原样转为字符串；
 * - 对象按键名字典序排序后序列化为规范化的 JSON 形式（键顺序不影响路由匹配）；
 * - 递归深度与对象键数有上限，防止恶意 pattern 造成 DoS。
 *
 * @param pattern - 客户端定义的消息模式（字符串、数字或对象）
 * @param depth - 当前递归深度
 * @param maxDepth - 最大允许递归深度，超出即截断
 * @param maxKeys - 单个对象允许的最大键数，超出即截断
 * @returns 规范化后的路由字符串
 */
export function transformPatternToRoute(
  pattern: MsPattern,
  depth = 0,
  maxDepth = DEFAULT_MAX_DEPTH,
  maxKeys = DEFAULT_MAX_KEYS,
): string {
  // 1. 字符串/数字模式直接转字符串
  if (isString(pattern) || isNumber(pattern)) {
    return `${pattern}`;
  }

  if (!isObject(pattern)) {
    // For non-string, non-number, non-object values
    // 2. 其他原始类型原样返回
    return pattern;
  }

  // 3. 递归深度超限：返回占位符，防止恶意深嵌套 pattern 导致栈溢出/DoS
  if (depth > maxDepth) {
    return '[MAX_DEPTH_REACHED]';
  }

  const keys = Object.keys(pattern);

  // 4. 键数超限：返回占位符，防止超大对象消耗资源
  if (keys.length > maxKeys) {
    return '[TOO_MANY_KEYS]';
  }

  // 5. 键名排序：保证相同 pattern 对象无论键顺序如何都映射到同一字符串
  const sortedKeys = keys.sort((a, b) => ('' + a).localeCompare(b));

  // 6. 递归序列化每个键值对，键名做转义
  const parts = sortedKeys.map(key => {
    const value = pattern[key];
    let partialRoute = `"${escape(key)}":`;

    // Only quote strings, numbers and objects are handled recursively
    // 7. 字符串值需要加引号并转义；数字/对象递归处理
    if (isString(value)) {
      partialRoute += `"${escape(transformPatternToRoute(value, depth + 1, maxDepth, maxKeys))}"`;
    } else {
      partialRoute += transformPatternToRoute(
        value,
        depth + 1,
        maxDepth,
        maxKeys,
      );
    }

    return partialRoute;
  });

  // 8. 拼接为 `{...}` 形式的最终路由字符串
  return `{${parts.join(',')}}`;
}
