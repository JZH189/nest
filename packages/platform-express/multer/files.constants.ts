/**
 * MulterModule 在 IoC 容器中注册配置选项的 Provider 注入令牌。
 * 各文件上传拦截器通过 @Inject(MULTER_MODULE_OPTIONS) 可选注入全局 multer 配置。
 */
export const MULTER_MODULE_OPTIONS = 'MULTER_MODULE_OPTIONS';
