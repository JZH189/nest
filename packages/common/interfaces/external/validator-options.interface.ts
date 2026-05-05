/**
 * 验证期间传递给验证器的选项。
 * @see https://github.com/typestack/class-validator
 *
 * class-validator@0.13.0
 *
 * @publicApi
 */
export interface ValidatorOptions {
  /**
   * 如果设置为 true，则当出现问题时，class-validator 将向控制台打印额外的警告消息。
   */
  enableDebugMessages?: boolean;
  /**
   * 如果设置为 true，则验证器将跳过验证被验证对象中所有未定义的属性。
   */
  skipUndefinedProperties?: boolean;
  /**
   * 如果设置为 true，则验证器将跳过验证被验证对象中所有为 null 的属性。
   */
  skipNullProperties?: boolean;
  /**
   * 如果设置为 true，则验证器将跳过验证被验证对象中所有为 null 或 undefined 的属性。
   */
  skipMissingProperties?: boolean;
  /**
   * 如果设置为 true，验证器将剥离被验证对象中没有任何装饰器的任何属性。
   *
   * 提示：如果没有其他装饰器适合你的属性，请使用 @Allow 装饰器。
   */
  whitelist?: boolean;
  /**
   * 如果设置为 true，验证器将抛出错误而不是剥离非白名单属性。
   */
  forbidNonWhitelisted?: boolean;
  /**
   * 对象验证期间要使用的组。
   */
  groups?: string[];
  /**
   * 设置装饰器 `always` 选项的默认值。可以在装饰器选项中覆盖默认值。
   */
  always?: boolean;
  /**
   * 如果未给出 [groups]{@link ValidatorOptions#groups} 或为空，
   * 则忽略至少有一个组的装饰器。
   */
  strictGroups?: boolean;
  /**
   * 如果设置为 true，验证将不使用默认消息。
   * 如果未明确设置，错误消息将始终为 undefined。
   */
  dismissDefaultMessages?: boolean;
  /**
   * ValidationError 特殊选项。
   */
  validationError?: {
    /**
     * 指示是否应在 ValidationError 中暴露 target。
     */
    target?: boolean;
    /**
     * 指示是否应在 ValidationError 中暴露验证值。
     */
    value?: boolean;
  };
  /**
   * 设置为 true 将导致未知对象的验证失败。
   */
  forbidUnknownValues?: boolean;
  /**
   * 设置为 true 时，遇到第一个错误后验证将停止。
   * 默认启用。
   */
  stopAtFirstError?: boolean;
}
