import { Module } from '@nestjs/common';
import { MetadataScanner } from '../metadata-scanner';
import { DiscoveryService } from './discovery-service';

/**
 * 发现模块：将 MetadataScanner 与 DiscoveryService 注册为
 * 可导入、可导出的 providers。其他模块只需 import 本模块，
 * 即可在自己的类中注入 DiscoveryService 使用运行时发现能力。
 *
 * @publicApi
 */
@Module({
  providers: [MetadataScanner, DiscoveryService],
  exports: [MetadataScanner, DiscoveryService],
})
export class DiscoveryModule {}
