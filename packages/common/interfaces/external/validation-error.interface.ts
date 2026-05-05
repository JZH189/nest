/**
 * 验证错误描述。
 * @see https://github.com/typestack/class-validator
 *
 * class-validator@0.13.0
 *
 * @publicApi
 */
export interface ValidationError {
  /**
   * 被验证的对象。
   *
   * 可选 - 可通过 ValidatorOptions.validationError.target 选项配置
   */
  target?: Record<string, any>;
  /**
   * 未通过验证的对象属性。
   */
  property: string;
  /**
   * 未通过验证的值。
   *
   * 可选 - 可通过 ValidatorOptions.validationError.value 选项配置
   */
  value?: any;
  /**
   * 带有错误消息的验证失败约束。
   */
  constraints?: {
    [type: string]: string;
  };
  /**
   * 包含该属性的所有嵌套验证错误。
   */
  children?: ValidationError[];
  /**
   * 用于响应映射的传递到验证结果的临时数据集合。
   */
  contexts?: {
    [type: string]: any;
  };
}
