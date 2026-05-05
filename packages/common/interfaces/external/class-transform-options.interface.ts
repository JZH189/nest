/**
 * 转换时传递的选项。
 *
 * @see https://github.com/typestack/class-transformer
 *
 * @publicApi
 */
export interface ClassTransformOptions {
  /**
   * 排除策略。默认使用 exposeAll，这意味着默认情况下会暴露所有被转换的属性。
   */
  strategy?: 'excludeAll' | 'exposeAll';
  /**
   * 只有具有给定组的属性才会被转换。
   */
  groups?: string[];
  /**
   * 只有 "since" > version < "until" 的属性才会被转换。
   */
  version?: number;
  /**
   * 排除具有给定前缀的属性。例如，如果你用 "_" 和 "__" 标记私有属性，
   * 可以将此选项的值设置为 ["_", "__"]，所有私有属性都将被跳过。
   * 这仅适用于 "exposeAll" 策略。
   */
  excludePrefixes?: string[];
  /**
   * 如果设置为 true，则类转换器将忽略所有 @Expose 和 @Exclude 装饰器及其内部内容。
   * 当你想要"克隆"对象但不想应用装饰器效果时，此选项很有用。
   */
  ignoreDecorators?: boolean;
  /**
   * 目标映射允许设置转换对象的类型，而无需使用 @Type 装饰器。
   * 当转换外部类时，或者当你已经拥有对象的类型元数据且不想再次设置时，这很有用。
   */
  targetMaps?: any[];
  /**
   * 如果设置为 true，类转换器将执行循环检查。（默认关闭循环检查）
   * 当你确定你的类型可能有循环依赖时，此选项很有用。
   */
  enableCircularCheck?: boolean;
  /**
   * 如果设置为 true，class-transformer 将尝试基于 TS 反射类型进行转换。
   */
  enableImplicitConversion?: boolean;
  /**
   * 如果设置为 true，class-transformer 将排除不属于原始类的属性，
   * 并暴露所有类属性（如果没有提供其他值，则为 undefined）。
   */
  excludeExtraneousValues?: boolean;
  /**
   * 如果设置为 true，类转换器将使用未提供字段的默认值。
   * 当将普通对象转换为类且具有带默认值的可选字段时，这很有用。
   */
  exposeDefaultValues?: boolean;
  /**
   * 设置为 true 时，值为 `undefined` 的字段将被包含在类到普通对象的转换中。否则，
   * 这些字段将从结果中省略。
   *
   * 默认值: `true`
   */
  exposeUnsetFields?: boolean;
}
