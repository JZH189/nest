/**
 * 描述用于提供静态资源的选项的接口。
 *
 * @see [在 Express 中提供静态文件](https://expressjs.com/en/starter/static-files.html)
 * @see [模型-视图-控制器](https://docs.nestjs.cn/techniques/mvc)
 *
 * @publicApi
 */
export interface ServeStaticOptions {
  /**
   * 设置遇到"点文件"时的处理方式。点文件是以点（"."）开头的文件或目录。
   * 请注意，此检查是在路径本身上进行的，而不检查路径是否实际存在于磁盘上。
   * 如果指定了 root，则只检查 root 上方的点文件（即当设置为 "deny" 时，root 本身可以位于点文件中）。
   * 默认值为 'ignore'。
   * 'allow' 对点文件没有特殊处理
   * 'deny' 对任何点文件请求发送 403
   * 'ignore' 假装点文件不存在并调用 next()
   */
  dotfiles?: string;

  /**
   * 启用或禁用 etag 生成，默认为 true。
   */
  etag?: boolean;

  /**
   * 设置文件扩展名回退。当设置时，如果找不到文件，将把给定的扩展名添加到文件名并进行搜索。
   * 第一个存在的将被提供。示例：['html', 'htm']。
   * 默认值为 false。
   */
  extensions?: string[];

  /**
   * 让客户端错误作为未处理的请求通过，否则转发客户端错误。
   * 默认值为 false。
   */
  fallthrough?: boolean;

  /**
   * 在 Cache-Control 响应头中启用或禁用 immutable 指令。
   * 如果启用，还应指定 maxAge 选项以启用缓存。immutable 指令将阻止支持的客户端在 maxAge 选项的有效期内发出条件请求来检查文件是否已更改。
   */
  immutable?: boolean;

  /**
   * 默认情况下，此模块将在对目录的请求时发送 "index.html" 文件。
   * 要禁用此功能，请设置为 false，或按首选顺序传递字符串或数组作为新索引。
   */
  index?: boolean | string | string[];

  /**
   * 启用或禁用 Last-Modified 头，默认为 true。使用文件系统的最后修改值。
   */
  lastModified?: boolean;

  /**
   * 提供 http 缓存的最大期限（以毫秒为单位），默认为 0。这也可以是 ms 模块接受的字符串。
   */
  maxAge?: number | string;

  /**
   * 当路径名是目录时重定向到尾随的 "/"。默认为 true。
   */
  redirect?: boolean;

  /**
   * 设置自定义响应头的函数。对头文件的修改需要同步进行。
   * 函数被调用为 `fn(res, path, stat)`，其中参数为：
   * `res` - 响应对象
   * `path` - 正在发送的文件路径
   * `stat` - 正在发送的文件的 stat 对象
   */
  setHeaders?: (res: any, path: string, stat: any) => any;

  /**
   * 创建虚拟路径前缀
   */
  prefix?: string;
}
