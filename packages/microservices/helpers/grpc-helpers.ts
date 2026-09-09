import { InvalidGrpcPackageDefinitionMissingPackageDefinitionException } from '../errors/invalid-grpc-package-definition-missing-package-definition.exception';
import { InvalidGrpcPackageDefinitionMutexException } from '../errors/invalid-grpc-package-definition-mutex.exception';
import { GrpcOptions } from '../interfaces';

/**
 * 根据用户配置获取 gRPC 包定义。
 *
 * 支持两种互斥的配置方式：
 * - 直接提供 `protoPath`（proto 文件路径），由 grpc-proto-loader 的
 *   `loadSync` 加载并生成包定义；
 * - 直接提供已构造好的 `packageDefinition`。
 *
 * 两者同时提供或都未提供均视为非法配置并抛出对应异常。
 *
 * @param options - gRPC 客户端/服务端选项，可包含 protoPath、packageDefinition、loader
 * @param grpcProtoLoaderPackage - 已加载的 grpc proto loader 包（@grpc/proto-loader）
 * @returns 解析得到的 gRPC 包定义对象，用于后续创建 gRPC 客户端或注册服务
 * @throws InvalidGrpcPackageDefinitionMutexException - 同时指定 protoPath 与 packageDefinition 时抛出
 * @throws InvalidGrpcPackageDefinitionMissingPackageDefinitionException - 两者均未提供时抛出
 */
export function getGrpcPackageDefinition(
  options: GrpcOptions['options'],
  grpcProtoLoaderPackage: any,
) {
  const file = options['protoPath'];
  const packageDefinition = options['packageDefinition'];

  if (file && packageDefinition) {
    throw new InvalidGrpcPackageDefinitionMutexException();
  }
  if (!file && !packageDefinition) {
    throw new InvalidGrpcPackageDefinitionMissingPackageDefinitionException();
  }

  return (
    packageDefinition ||
    grpcProtoLoaderPackage.loadSync(file, options['loader'])
  );
}
