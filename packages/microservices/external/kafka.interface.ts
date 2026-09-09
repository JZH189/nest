/**
 * Do NOT add NestJS logic to this interface.  It is meant to ONLY represent the types for the kafkajs package.
 *
 * @see https://github.com/tulios/kafkajs/blob/master/types/index.d.ts
 *
 * @publicApi
 *
 */

/// <reference types="node" />
import * as net from 'net';
import * as tls from 'tls';

type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };
type XOR<T, U> = T | U extends object
  ? (Without<T, U> & U) | (Without<U, T> & T)
  : T | U;

/**
 * kafkajs 客户端类：Nest 微服务的 ServerKafka/ClientKafka 通过它创建
 * Kafka 实例，进而派生 producer（生产者）、consumer（消费者）与 admin
 * （管理端）。
 */
export declare class Kafka {
  constructor(config: KafkaConfig);
  producer(config?: ProducerConfig): Producer;
  consumer(config: ConsumerConfig): Consumer;
  admin(config?: AdminConfig): Admin;
  logger(): Logger;
}

/**
 * 返回 broker 地址列表（或其 Promise）的函数，用于服务发现场景。
 */
export type BrokersFunction = () => string[] | Promise<string[]>;

type SaslAuthenticationRequest = {
  encode: () => Buffer | Promise<Buffer>;
};
type SaslAuthenticationResponse<ParseResult> = {
  decode: (rawResponse: Buffer) => Buffer | Promise<Buffer>;
  parse: (data: Buffer) => ParseResult;
};

type Authenticator = {
  authenticate: () => Promise<void>;
};

export type SaslAuthenticateArgs<ParseResult> = {
  request: SaslAuthenticationRequest;
  response?: SaslAuthenticationResponse<ParseResult>;
};

type AuthenticationProviderArgs = {
  host: string;
  port: number;
  logger: Logger;
  saslAuthenticate: <ParseResult>(
    args: SaslAuthenticateArgs<ParseResult>,
  ) => Promise<ParseResult | void>;
};

type Mechanism = {
  mechanism: string;
  authenticationProvider: (args: AuthenticationProviderArgs) => Authenticator;
};

/**
 * Kafka 客户端根配置（KafkaOptions.client 的类型）：
 * - brokers：broker 地址列表或地址解析函数（必填）；
 * - clientId：客户端标识（Nest 会自动追加后缀避免冲突）；
 * - ssl/sasl：TLS 与 SASL 认证配置；
 * - connectionTimeout/authenticationTimeout/requestTimeout：各类超时（毫秒）；
 * - retry：请求失败重试策略；logLevel/logCreator：日志级别与自定义日志器。
 */
export interface KafkaConfig {
  brokers: string[] | BrokersFunction;
  ssl?: tls.ConnectionOptions | boolean;
  sasl?: SASLOptions | Mechanism;
  clientId?: string;
  connectionTimeout?: number;
  authenticationTimeout?: number;
  reauthenticationThreshold?: number;
  requestTimeout?: number;
  enforceRequestTimeout?: boolean;
  retry?: RetryOptions;
  socketFactory?: ISocketFactory;
  logLevel?: logLevel;
  logCreator?: logCreator;
}

/**
 * 自定义 socket 工厂参数：目标主机/端口、TLS 选项与连接成功回调。
 */
export interface ISocketFactoryArgs {
  host: string;
  port: number;
  ssl: tls.ConnectionOptions;
  onConnect: () => void;
}

/**
 * 自定义 socket 工厂类型：用于完全接管 Kafka 的底层连接创建（如代理场景）。
 */
export type ISocketFactory = (args: ISocketFactoryArgs) => net.Socket;

export interface OauthbearerProviderResponse {
  value: string;
}

/**
 * SASL 支持的认证机制集合：plain、scram-sha-256/512、aws（MSK IAM）、
 * oauthbearer（OAuth 2.0 Bearer Token）。
 */
type SASLMechanismOptionsMap = {
  plain: { username: string; password: string };
  'scram-sha-256': { username: string; password: string };
  'scram-sha-512': { username: string; password: string };
  aws: {
    authorizationIdentity: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  oauthbearer: {
    oauthBearerProvider: () => Promise<OauthbearerProviderResponse>;
  };
};

/** SASL 认证机制名称字面量联合类型。 */
export type SASLMechanism = keyof SASLMechanismOptionsMap;
type SASLMechanismOptions<T> = T extends SASLMechanism
  ? { mechanism: T } & SASLMechanismOptionsMap[T]
  : never;
/** 按机制名关联对应凭据的 SASL 配置类型（用于 KafkaConfig.sasl）。 */
export type SASLOptions = SASLMechanismOptions<SASLMechanism>;

/**
 * 生产者配置（KafkaOptions.producer 的类型）：
 * - createPartitioner：自定义分区器；
 * - retry：发送失败重试策略；
 * - idempotent：幂等生产者（防止重复写入）；
 * - transactionalId/transactionTimeout：事务生产者配置；
 * - allowAutoTopicCreation：生产消息时是否允许自动创建 topic。
 */
export interface ProducerConfig {
  createPartitioner?: ICustomPartitioner;
  retry?: RetryOptions;
  metadataMaxAge?: number;
  allowAutoTopicCreation?: boolean;
  idempotent?: boolean;
  transactionalId?: string;
  transactionTimeout?: number;
  maxInFlightRequests?: number;
}

/**
 * 单条 Kafka 消息：key（分区键，决定消息进入哪个分区）、value（消息体）、
 * partition（指定分区）、headers（消息头，Nest 用它传递 correlationId、
 * replyTopic 与错误信息）、timestamp（时间戳）。
 */
export interface Message {
  key?: Buffer | string | null;
  value: Buffer | string | null;
  partition?: number;
  headers?: IHeaders;
  timestamp?: string;
}

/**
 * 自定义分区器的入参：目标 topic、分区元数据与待发送消息。
 */
export interface PartitionerArgs {
  topic: string;
  partitionMetadata: PartitionMetadata[];
  message: Message;
}

/** 自定义分区器类型：返回消息应写入的分区号。 */
export type ICustomPartitioner = () => (args: PartitionerArgs) => number;
export type DefaultPartitioner = ICustomPartitioner;
export type LegacyPartitioner = ICustomPartitioner;

export let Partitioners: {
  DefaultPartitioner: DefaultPartitioner;
  LegacyPartitioner: LegacyPartitioner;
  /**
   * @deprecated Use DefaultPartitioner instead
   *
   * The JavaCompatiblePartitioner was renamed DefaultPartitioner
   * and made to be the default in 2.0.0.
   */
  JavaCompatiblePartitioner: DefaultPartitioner;
};

/**
 * 单个分区的元数据：分区号、错误码、leader 与副本（replicas/isr）所在 broker。
 */
export type PartitionMetadata = {
  partitionErrorCode: number;
  partitionId: number;
  leader: number;
  replicas: number[];
  isr: number[];
  offlineReplicas?: number[];
};

/**
 * Kafka 消息头集合：键到 Buffer/字符串（或其数组）的映射。
 * Nest 微服务通过它传递 correlationId、replyTopic、错误标记等元信息。
 */
export interface IHeaders {
  [key: string]: Buffer | string | (Buffer | string)[] | undefined;
}

/**
 * 消费者配置（KafkaOptions.consumer 的类型）：
 * - groupId：消费者组 ID（Nest 会自动追加后缀避免与客户端冲突）；
 * - sessionTimeout/heartbeatInterval/rebalanceTimeout：组会话与再均衡参数；
 * - minBytes/maxBytes/maxWaitTimeInMs：拉取批量与等待参数；
 * - retry：消费失败重试策略（restartOnFailure 决定崩溃后是否重启消费）；
 * - readUncommitted：是否读取未提交（事务）消息。
 */
export interface ConsumerConfig {
  groupId: string;
  partitionAssigners?: PartitionAssigner[];
  metadataMaxAge?: number;
  sessionTimeout?: number;
  rebalanceTimeout?: number;
  heartbeatInterval?: number;
  maxBytesPerPartition?: number;
  minBytes?: number;
  maxBytes?: number;
  maxWaitTimeInMs?: number;
  retry?: RetryOptions & {
    restartOnFailure?: (err: Error) => Promise<boolean>;
  };
  allowAutoTopicCreation?: boolean;
  maxInFlightRequests?: number;
  readUncommitted?: boolean;
  rackId?: string;
}

/**
 * 分区分配器工厂类型：根据集群信息、消费者组与日志器生成分配策略。
 */
export type PartitionAssigner = (config: {
  cluster: Cluster;
  groupId: string;
  logger: Logger;
}) => Assigner;

export interface CoordinatorMetadata {
  errorCode: number;
  coordinator: {
    nodeId: number;
    host: string;
    port: number;
  };
}

export type Cluster = {
  getNodeIds(): number[];
  metadata(): Promise<BrokerMetadata>;
  removeBroker(options: { host: string; port: number }): void;
  addMultipleTargetTopics(topics: string[]): Promise<void>;
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  refreshMetadata(): Promise<void>;
  refreshMetadataIfNecessary(): Promise<void>;
  addTargetTopic(topic: string): Promise<void>;
  findBroker(node: { nodeId: string }): Promise<Broker>;
  findControllerBroker(): Promise<Broker>;
  findTopicPartitionMetadata(topic: string): PartitionMetadata[];
  findLeaderForPartitions(
    topic: string,
    partitions: number[],
  ): { [leader: string]: number[] };
  findGroupCoordinator(group: { groupId: string }): Promise<Broker>;
  findGroupCoordinatorMetadata(group: {
    groupId: string;
  }): Promise<CoordinatorMetadata>;
  defaultOffset(config: { fromBeginning: boolean }): number;
  fetchTopicsOffset(
    topics: Array<
      {
        topic: string;
        partitions: Array<{ partition: number }>;
      } & XOR<{ fromBeginning: boolean }, { fromTimestamp: number }>
    >,
  ): Promise<TopicOffsets[]>;
};

export type Assignment = { [topic: string]: number[] };

export type GroupMember = { memberId: string; memberMetadata: Buffer };

export type GroupMemberAssignment = {
  memberId: string;
  memberAssignment: Buffer;
};

export type GroupState = { name: string; metadata: Buffer };

export type Assigner = {
  name: string;
  version: number;
  assign(group: {
    members: GroupMember[];
    topics: string[];
  }): Promise<GroupMemberAssignment[]>;
  protocol(subscription: { topics: string[] }): GroupState;
};

/**
 * 请求重试策略：maxRetryTime（总重试时长上限）、initialRetryTime/factor/multiplier
 * （退避算法参数）、retries（最大重试次数）等。
 */
export interface RetryOptions {
  maxRetryTime?: number;
  initialRetryTime?: number;
  factor?: number;
  multiplier?: number;
  retries?: number;
  restartOnFailure?: (e: Error) => Promise<boolean>;
}

/** Kafka 管理端（Admin）配置：目前仅支持 retry 重试策略。 */
export interface AdminConfig {
  retry?: RetryOptions;
}

/** 创建 topic 时的配置：分区数、副本因子、副本分配与配置项。 */
export interface ITopicConfig {
  topic: string;
  numPartitions?: number;
  replicationFactor?: number;
  replicaAssignment?: object[];
  configEntries?: IResourceConfigEntry[];
}

export interface ITopicPartitionConfig {
  topic: string;
  count: number;
  assignments?: Array<Array<number>>;
}

export interface ITopicMetadata {
  name: string;
  partitions: PartitionMetadata[];
}

/** ACL 资源类型枚举（Admin 管理访问控制列表时使用）。 */
export enum AclResourceTypes {
  UNKNOWN = 0,
  ANY = 1,
  TOPIC = 2,
  GROUP = 3,
  CLUSTER = 4,
  TRANSACTIONAL_ID = 5,
  DELEGATION_TOKEN = 6,
}

/** 配置资源类型枚举（topic/broker 等可配置对象）。 */
export enum ConfigResourceTypes {
  UNKNOWN = 0,
  TOPIC = 2,
  BROKER = 4,
  BROKER_LOGGER = 8,
}

/** 配置来源枚举（默认配置/动态 broker 配置/静态 broker 配置等）。 */
export enum ConfigSource {
  UNKNOWN = 0,
  TOPIC_CONFIG = 1,
  DYNAMIC_BROKER_CONFIG = 2,
  DYNAMIC_DEFAULT_BROKER_CONFIG = 3,
  STATIC_BROKER_CONFIG = 4,
  DEFAULT_CONFIG = 5,
  DYNAMIC_BROKER_LOGGER_CONFIG = 6,
}

/** ACL 权限类型枚举（DENY/ALLOW）。 */
export enum AclPermissionTypes {
  UNKNOWN = 0,
  ANY = 1,
  DENY = 2,
  ALLOW = 3,
}

/** ACL 操作类型枚举（READ/WRITE/CREATE/DELETE 等）。 */
export enum AclOperationTypes {
  UNKNOWN = 0,
  ANY = 1,
  ALL = 2,
  READ = 3,
  WRITE = 4,
  CREATE = 5,
  DELETE = 6,
  ALTER = 7,
  DESCRIBE = 8,
  CLUSTER_ACTION = 9,
  DESCRIBE_CONFIGS = 10,
  ALTER_CONFIGS = 11,
  IDEMPOTENT_WRITE = 12,
}

/** ACL 资源模式类型枚举（LITERAL 字面量/PREFIXED 前缀匹配等）。 */
export enum ResourcePatternTypes {
  UNKNOWN = 0,
  ANY = 1,
  MATCH = 2,
  LITERAL = 3,
  PREFIXED = 4,
}

export interface ResourceConfigQuery {
  type: ConfigResourceTypes;
  name: string;
  configNames?: string[];
}

export interface ConfigEntries {
  configName: string;
  configValue: string;
  isDefault: boolean;
  configSource: ConfigSource;
  isSensitive: boolean;
  readOnly: boolean;
  configSynonyms: ConfigSynonyms[];
}

export interface ConfigSynonyms {
  configName: string;
  configValue: string;
  configSource: ConfigSource;
}

export interface DescribeConfigResponse {
  resources: {
    configEntries: ConfigEntries[];
    errorCode: number;
    errorMessage: string;
    resourceName: string;
    resourceType: ConfigResourceTypes;
  }[];
  throttleTime: number;
}

export interface IResourceConfigEntry {
  name: string;
  value: string;
}

export interface IResourceConfig {
  type: ConfigResourceTypes;
  name: string;
  configEntries: IResourceConfigEntry[];
}

type ValueOf<T> = T[keyof T];

export type AdminEvents = {
  CONNECT: 'admin.connect';
  DISCONNECT: 'admin.disconnect';
  REQUEST: 'admin.network.request';
  REQUEST_TIMEOUT: 'admin.network.request_timeout';
  REQUEST_QUEUE_SIZE: 'admin.network.request_queue_size';
};

export interface InstrumentationEvent<T> {
  id: string;
  type: string;
  timestamp: number;
  payload: T;
}

export type RemoveInstrumentationEventListener<T> = () => void;

export type ConnectEvent = InstrumentationEvent<null>;
export type DisconnectEvent = InstrumentationEvent<null>;
export type RequestEvent = InstrumentationEvent<{
  apiKey: number;
  apiName: string;
  apiVersion: number;
  broker: string;
  clientId: string;
  correlationId: number;
  createdAt: number;
  duration: number;
  pendingDuration: number;
  sentAt: number;
  size: number;
}>;
export type RequestTimeoutEvent = InstrumentationEvent<{
  apiKey: number;
  apiName: string;
  apiVersion: number;
  broker: string;
  clientId: string;
  correlationId: number;
  createdAt: number;
  pendingDuration: number;
  sentAt: number;
}>;
export type RequestQueueSizeEvent = InstrumentationEvent<{
  broker: string;
  clientId: string;
  queueSize: number;
}>;

export type SeekEntry = PartitionOffset;

export type FetchOffsetsPartition = PartitionOffset & {
  metadata: string | null;
};
export interface Acl {
  principal: string;
  host: string;
  operation: AclOperationTypes;
  permissionType: AclPermissionTypes;
}

export interface AclResource {
  resourceType: AclResourceTypes;
  resourceName: string;
  resourcePatternType: ResourcePatternTypes;
}

export type AclEntry = Acl & AclResource;

export type DescribeAclResource = AclResource & {
  acls: Acl[];
};

export interface DescribeAclResponse {
  throttleTime: number;
  errorCode: number;
  errorMessage?: string;
  resources: DescribeAclResource[];
}

export interface AclFilter {
  resourceType: AclResourceTypes;
  resourceName?: string;
  resourcePatternType: ResourcePatternTypes;
  principal?: string;
  host?: string;
  operation: AclOperationTypes;
  permissionType: AclPermissionTypes;
}

export interface MatchingAcl {
  errorCode: number;
  errorMessage?: string;
  resourceType: AclResourceTypes;
  resourceName: string;
  resourcePatternType: ResourcePatternTypes;
  principal: string;
  host: string;
  operation: AclOperationTypes;
  permissionType: AclPermissionTypes;
}

export interface DeleteAclFilterResponses {
  errorCode: number;
  errorMessage?: string;
  matchingAcls: MatchingAcl[];
}

export interface DeleteAclResponse {
  throttleTime: number;
  filterResponses: DeleteAclFilterResponses[];
}

/**
 * Kafka 管理端实例类型：提供 topic/分区/偏移量/消费者组/ACL 等运维操作
 * （createTopics、fetchOffsets、describeConfigs 等）。
 */
export type Admin = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listTopics(): Promise<string[]>;
  createTopics(options: {
    validateOnly?: boolean;
    waitForLeaders?: boolean;
    timeout?: number;
    topics: ITopicConfig[];
  }): Promise<boolean>;
  deleteTopics(options: { topics: string[]; timeout?: number }): Promise<void>;
  createPartitions(options: {
    validateOnly?: boolean;
    timeout?: number;
    topicPartitions: ITopicPartitionConfig[];
  }): Promise<boolean>;
  fetchTopicMetadata(options?: {
    topics: string[];
  }): Promise<{ topics: Array<ITopicMetadata> }>;
  fetchOffsets(options: {
    groupId: string;
    topics?: string[];
    resolveOffsets?: boolean;
  }): Promise<Array<{ topic: string; partitions: FetchOffsetsPartition[] }>>;
  fetchTopicOffsets(
    topic: string,
  ): Promise<Array<SeekEntry & { high: string; low: string }>>;
  fetchTopicOffsetsByTimestamp(
    topic: string,
    timestamp?: number,
  ): Promise<Array<SeekEntry>>;
  describeCluster(): Promise<{
    brokers: Array<{ nodeId: number; host: string; port: number }>;
    controller: number | null;
    clusterId: string;
  }>;
  setOffsets(options: {
    groupId: string;
    topic: string;
    partitions: SeekEntry[];
  }): Promise<void>;
  resetOffsets(options: {
    groupId: string;
    topic: string;
    earliest: boolean;
  }): Promise<void>;
  describeConfigs(configs: {
    resources: ResourceConfigQuery[];
    includeSynonyms: boolean;
  }): Promise<DescribeConfigResponse>;
  alterConfigs(configs: {
    validateOnly: boolean;
    resources: IResourceConfig[];
  }): Promise<any>;
  listGroups(): Promise<{ groups: GroupOverview[] }>;
  deleteGroups(groupIds: string[]): Promise<DeleteGroupsResult[]>;
  describeGroups(groupIds: string[]): Promise<GroupDescriptions>;
  describeAcls(options: AclFilter): Promise<DescribeAclResponse>;
  deleteAcls(options: { filters: AclFilter[] }): Promise<DeleteAclResponse>;
  createAcls(options: { acl: AclEntry[] }): Promise<boolean>;
  deleteTopicRecords(options: {
    topic: string;
    partitions: SeekEntry[];
  }): Promise<void>;
  logger(): Logger;
  on(
    eventName: AdminEvents['CONNECT'],
    listener: (event: ConnectEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: AdminEvents['DISCONNECT'],
    listener: (event: DisconnectEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: AdminEvents['REQUEST'],
    listener: (event: RequestEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: AdminEvents['REQUEST_QUEUE_SIZE'],
    listener: (event: RequestQueueSizeEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: AdminEvents['REQUEST_TIMEOUT'],
    listener: (event: RequestTimeoutEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ValueOf<AdminEvents>,
    listener: (event: InstrumentationEvent<any>) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  readonly events: AdminEvents;
};

/** 内置分区分配器集合（roundRobin 轮询分配）。 */
export let PartitionAssigners: { roundRobin: PartitionAssigner };

/** 通用编解码器接口：encode 序列化、decode 反序列化。 */
export interface ISerializer<T> {
  encode(value: T): Buffer;
  decode(buffer: Buffer): T | null;
}

/**
 * 消费者组成员元数据：协议版本、订阅的 topic 列表与自定义数据。
 */
export type MemberMetadata = {
  version: number;
  topics: string[];
  userData: Buffer;
};

/**
 * 消费者组成员分配结果：协议版本、topic 分区分配表与自定义数据。
 */
export type MemberAssignment = {
  version: number;
  assignment: Assignment;
  userData: Buffer;
};

/** 消费者组协议（成员元数据/分配结果的序列化器集合）。 */
export let AssignerProtocol: {
  MemberMetadata: ISerializer<MemberMetadata>;
  MemberAssignment: ISerializer<MemberAssignment>;
};

/** kafkajs 日志级别枚举（NOTHING/ERROR/WARN/INFO/DEBUG）。 */
export enum logLevel {
  NOTHING = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 4,
  DEBUG = 5,
}

/** 单条日志条目：命名空间、级别、标签与内容。 */
export interface LogEntry {
  namespace: string;
  level: logLevel;
  label: string;
  log: LoggerEntryContent;
}

/** 日志内容：时间戳与消息文本。 */
export interface LoggerEntryContent {
  readonly timestamp: string;
  readonly message: string;
  [key: string]: any;
}

/** 自定义日志器工厂类型：根据日志级别返回实际写日志的函数（Nest 的 KafkaLogger 即基于它）。 */
export type logCreator = (logLevel: logLevel) => (entry: LogEntry) => void;

/** kafkajs 日志器接口（info/error/warn/debug 及命名空间/级别控制）。 */
export type Logger = {
  info: (message: string, extra?: object) => void;
  error: (message: string, extra?: object) => void;
  warn: (message: string, extra?: object) => void;
  debug: (message: string, extra?: object) => void;

  namespace: (namespace: string, logLevel?: logLevel) => Logger;
  setLogLevel: (logLevel: logLevel) => void;
};

/** broker 节点与 topic 分区的元数据查询结果。 */
export interface BrokerMetadata {
  brokers: Array<{ nodeId: number; host: string; port: number; rack?: string }>;
  topicMetadata: Array<{
    topicErrorCode: number;
    topic: string;
    partitionMetadata: PartitionMetadata[];
  }>;
}

/** broker 支持的 API 版本表：apiKey 到最小/最大版本的映射。 */
export interface ApiVersions {
  [apiKey: number]: {
    minVersion: number;
    maxVersion: number;
  };
}

/** Kafka broker 节点类型：提供元数据查询、拉取（fetch）与生产（produce）等底层请求。 */
export type Broker = {
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  apiVersions(): Promise<ApiVersions>;
  metadata(topics: string[]): Promise<BrokerMetadata>;
  describeGroups: (options: { groupIds: string[] }) => Promise<any>;
  offsetCommit(request: {
    groupId: string;
    groupGenerationId: number;
    memberId: string;
    retentionTime?: number;
    topics: TopicOffsets[];
  }): Promise<any>;
  offsetFetch(request: { groupId: string; topics: TopicOffsets[] }): Promise<{
    responses: TopicOffsets[];
  }>;
  fetch(request: {
    replicaId?: number;
    isolationLevel?: number;
    maxWaitTime?: number;
    minBytes?: number;
    maxBytes?: number;
    topics: Array<{
      topic: string;
      partitions: Array<{
        partition: number;
        fetchOffset: string;
        maxBytes: number;
      }>;
    }>;
    rackId?: string;
  }): Promise<any>;
  produce(request: {
    topicData: Array<{
      topic: string;
      partitions: Array<{
        partition: number;
        firstSequence?: number;
        messages: Message[];
      }>;
    }>;
    transactionalId?: string;
    producerId?: number;
    producerEpoch?: number;
    acks?: number;
    timeout?: number;
    compression?: CompressionTypes;
  }): Promise<any>;
};

interface MessageSetEntry {
  key: Buffer | null;
  value: Buffer | null;
  timestamp: string;
  attributes: number;
  offset: string;
  size: number;
  headers?: never;
}

interface RecordBatchEntry {
  key: Buffer | null;
  value: Buffer | null;
  timestamp: string;
  attributes: number;
  offset: string;
  headers: IHeaders;
  size?: never;
}

/**
 * 从 broker 读取到的单条 Kafka 消息（含 offset、时间戳、headers 等），
 * 对应旧消息格式（MessageSetEntry）与新版批量格式（RecordBatchEntry）两种形态。
 */
export type KafkaMessage = MessageSetEntry | RecordBatchEntry;

/**
 * 生产者发送记录：目标 topic 与消息列表，以及可选的确认级别（acks）、
 * 超时与压缩算法。
 */
export interface ProducerRecord {
  topic: string;
  messages: Message[];
  acks?: number;
  timeout?: number;
  compression?: CompressionTypes;
}

/**
 * 消息写入 broker 后的确认元数据：topic、分区、offset、时间戳等
 * （ServerKafka 回发响应时用它确认写入结果）。
 */
export type RecordMetadata = {
  topicName: string;
  partition: number;
  errorCode: number;
  offset?: string;
  timestamp?: string;
  baseOffset?: string;
  logAppendTime?: string;
  logStartOffset?: string;
};

/** 批量发送中的单个 topic 条目：目标 topic 与消息列表。 */
export interface TopicMessages {
  topic: string;
  messages: Message[];
}

/** 生产者批量发送请求（sendBatch 的入参）。 */
export interface ProducerBatch {
  acks?: number;
  timeout?: number;
  compression?: CompressionTypes;
  topicMessages?: TopicMessages[];
}

/** 单个分区的偏移量信息。 */
export interface PartitionOffset {
  partition: number;
  offset: string;
}

/** 单个 topic 各分区的偏移量信息。 */
export interface TopicOffsets {
  topic: string;
  partitions: PartitionOffset[];
}

/** 按 topic 组织的偏移量集合。 */
export interface Offsets {
  topics: TopicOffsets[];
}

/** 消息发送者的公共能力：单条发送（send）与批量发送（sendBatch）。 */
type Sender = {
  send(record: ProducerRecord): Promise<RecordMetadata[]>;
  sendBatch(batch: ProducerBatch): Promise<RecordMetadata[]>;
};

/** 生产者事件名集合（连接/断开/请求/超时/队列大小）。 */
export type ProducerEvents = {
  CONNECT: 'producer.connect';
  DISCONNECT: 'producer.disconnect';
  REQUEST: 'producer.network.request';
  REQUEST_TIMEOUT: 'producer.network.request_timeout';
  REQUEST_QUEUE_SIZE: 'producer.network.request_queue_size';
};

/**
 * Kafka 生产者类型：向 broker 发送消息（Nest 服务端用它向 replyTopic
 * 回发 RPC 响应）。支持事务（transaction()）与事件监听（on()）。
 */
export type Producer = Sender & {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isIdempotent(): boolean;
  readonly events: ProducerEvents;
  on(
    eventName: ProducerEvents['CONNECT'],
    listener: (event: ConnectEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ProducerEvents['DISCONNECT'],
    listener: (event: DisconnectEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ProducerEvents['REQUEST'],
    listener: (event: RequestEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ProducerEvents['REQUEST_QUEUE_SIZE'],
    listener: (event: RequestQueueSizeEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ProducerEvents['REQUEST_TIMEOUT'],
    listener: (event: RequestTimeoutEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ValueOf<ProducerEvents>,
    listener: (event: InstrumentationEvent<any>) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  transaction(): Promise<Transaction>;
  logger(): Logger;
};

/** Kafka 事务句柄：发送消息与偏移量、提交或中止事务。 */
export type Transaction = Sender & {
  sendOffsets(offsets: Offsets & { consumerGroupId: string }): Promise<void>;
  commit(): Promise<void>;
  abort(): Promise<void>;
  isActive(): boolean;
};

export type ConsumerGroup = {
  groupId: string;
  generationId: number;
  memberId: string;
  coordinator: Broker;
};

export type MemberDescription = {
  clientHost: string;
  clientId: string;
  memberId: string;
  memberAssignment: Buffer;
  memberMetadata: Buffer;
};

// See https://github.com/apache/kafka/blob/2.4.0/clients/src/main/java/org/apache/kafka/common/ConsumerGroupState.java#L25
export type ConsumerGroupState =
  | 'Unknown'
  | 'PreparingRebalance'
  | 'CompletingRebalance'
  | 'Stable'
  | 'Dead'
  | 'Empty';

export type GroupDescription = {
  groupId: string;
  members: MemberDescription[];
  protocol: string;
  protocolType: string;
  state: ConsumerGroupState;
};

export type GroupDescriptions = {
  groups: GroupDescription[];
};

export type TopicPartitions = { topic: string; partitions: number[] };

export type TopicPartition = {
  topic: string;
  partition: number;
};
export type TopicPartitionOffset = TopicPartition & {
  offset: string;
};
export type TopicPartitionOffsetAndMetadata = TopicPartitionOffset & {
  metadata?: string | null;
};

/** 一次拉取到的消息批次：topic/分区、高水位偏移量与消息列表。 */
export type Batch = {
  topic: string;
  partition: number;
  highWatermark: string;
  messages: KafkaMessage[];
  isEmpty(): boolean;
  firstOffset(): string | null;
  lastOffset(): string;
  offsetLag(): string;
  offsetLagLow(): string;
};

export type GroupOverview = {
  groupId: string;
  protocolType: string;
};

export type DeleteGroupsResult = {
  groupId: string;
  errorCode?: number;
  error?: KafkaJSProtocolError;
};

export type ConsumerEvents = {
  HEARTBEAT: 'consumer.heartbeat';
  COMMIT_OFFSETS: 'consumer.commit_offsets';
  GROUP_JOIN: 'consumer.group_join';
  FETCH_START: 'consumer.fetch_start';
  FETCH: 'consumer.fetch';
  START_BATCH_PROCESS: 'consumer.start_batch_process';
  END_BATCH_PROCESS: 'consumer.end_batch_process';
  CONNECT: 'consumer.connect';
  DISCONNECT: 'consumer.disconnect';
  STOP: 'consumer.stop';
  CRASH: 'consumer.crash';
  REBALANCING: 'consumer.rebalancing';
  RECEIVED_UNSUBSCRIBED_TOPICS: 'consumer.received_unsubscribed_topics';
  REQUEST: 'consumer.network.request';
  REQUEST_TIMEOUT: 'consumer.network.request_timeout';
  REQUEST_QUEUE_SIZE: 'consumer.network.request_queue_size';
};
export type ConsumerHeartbeatEvent = InstrumentationEvent<{
  groupId: string;
  memberId: string;
  groupGenerationId: number;
}>;
export type ConsumerCommitOffsetsEvent = InstrumentationEvent<{
  groupId: string;
  memberId: string;
  groupGenerationId: number;
  topics: TopicOffsets[];
}>;
export interface IMemberAssignment {
  [key: string]: number[];
}
export type ConsumerGroupJoinEvent = InstrumentationEvent<{
  duration: number;
  groupId: string;
  isLeader: boolean;
  leaderId: string;
  groupProtocol: string;
  memberId: string;
  memberAssignment: IMemberAssignment;
}>;
export type ConsumerFetchStartEvent = InstrumentationEvent<{ nodeId: number }>;
export type ConsumerFetchEvent = InstrumentationEvent<{
  numberOfBatches: number;
  duration: number;
  nodeId: number;
}>;
interface IBatchProcessEvent {
  topic: string;
  partition: number;
  highWatermark: string;
  offsetLag: string;
  offsetLagLow: string;
  batchSize: number;
  firstOffset: string;
  lastOffset: string;
}
export type ConsumerStartBatchProcessEvent =
  InstrumentationEvent<IBatchProcessEvent>;
export type ConsumerEndBatchProcessEvent = InstrumentationEvent<
  IBatchProcessEvent & { duration: number }
>;
export type ConsumerCrashEvent = InstrumentationEvent<{
  error: Error;
  groupId: string;
  restart: boolean;
}>;
export type ConsumerRebalancingEvent = InstrumentationEvent<{
  groupId: string;
  memberId: string;
}>;
export type ConsumerReceivedUnsubscribedTopicsEvent = InstrumentationEvent<{
  groupId: string;
  generationId: number;
  memberId: string;
  assignedTopics: string[];
  topicsSubscribed: string[];
  topicsNotSubscribed: string[];
}>;

export interface OffsetsByTopicPartition {
  topics: TopicOffsets[];
}

/**
 * eachMessage 消费回调的负载：topic、分区、消息体，以及 heartbeat()
 * （保持组会话）与 pause()（暂停分区消费）控制函数。
 * Nest 的 ServerKafka.handleMessage 即接收该负载。
 */
export interface EachMessagePayload {
  topic: string;
  partition: number;
  message: KafkaMessage;
  heartbeat(): Promise<void>;
  pause(): () => void;
}

/**
 * eachBatch 消费回调的负载：整批消息及偏移量确认、心跳、暂停等控制函数，
 * 适合高吞吐的批量处理场景。
 */
export interface EachBatchPayload {
  batch: Batch;
  resolveOffset(offset: string): void;
  heartbeat(): Promise<void>;
  pause(): () => void;
  commitOffsetsIfNecessary(offsets?: Offsets): Promise<void>;
  uncommittedOffsets(): OffsetsByTopicPartition;
  isRunning(): boolean;
  isStale(): boolean;
}

/**
 * Type alias to keep compatibility with @types/kafkajs
 * @see https://github.com/DefinitelyTyped/DefinitelyTyped/blob/712ad9d59ccca6a3cc92f347fea0d1c7b02f5eeb/types/kafkajs/index.d.ts#L321-L325
 */
export type ConsumerEachMessagePayload = EachMessagePayload;

/**
 * Type alias to keep compatibility with @types/kafkajs
 * @see https://github.com/DefinitelyTyped/DefinitelyTyped/blob/712ad9d59ccca6a3cc92f347fea0d1c7b02f5eeb/types/kafkajs/index.d.ts#L327-L336
 */
export type ConsumerEachBatchPayload = EachBatchPayload;

export type EachBatchHandler = (payload: EachBatchPayload) => Promise<void>;
export type EachMessageHandler = (payload: EachMessagePayload) => Promise<void>;

/** 消费循环运行配置（Consumer.run 的入参）：自动提交策略与 eachMessage/eachBatch 处理器。 */
export type ConsumerRunConfig = {
  autoCommit?: boolean;
  autoCommitInterval?: number | null;
  autoCommitThreshold?: number | null;
  eachBatchAutoResolve?: boolean;
  partitionsConsumedConcurrently?: number;
  eachBatch?: EachBatchHandler;
  eachMessage?: EachMessageHandler;
};

/** topic 订阅配置（Consumer.subscribe 的入参）：topic 列表与是否从头消费。 */
export type ConsumerSubscribeTopics = {
  topics: (string | RegExp)[];
  fromBeginning?: boolean;
};

/**
 * Kafka 消费者类型：订阅 topic（subscribe）、启动消费循环（run，
 * 通过 eachMessage/eachBatch 回调处理消息）、提交偏移量（commitOffsets）
 * 等，并暴露组会话/再均衡/心跳等事件。Nest 服务端把每个 pattern
 * 当作 topic 订阅，由 eachMessage 驱动消息分发。
 */
export type Consumer = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(subscription: ConsumerSubscribeTopics): Promise<void>;
  stop(): Promise<void>;
  run(config?: ConsumerRunConfig): Promise<void>;
  commitOffsets(
    topicPartitions: Array<TopicPartitionOffsetAndMetadata>,
  ): Promise<void>;
  seek(topicPartitionOffset: TopicPartitionOffset): void;
  describeGroup(): Promise<GroupDescription>;
  pause(topics: Array<{ topic: string; partitions?: number[] }>): void;
  paused(): TopicPartitions[];
  resume(topics: Array<{ topic: string; partitions?: number[] }>): void;
  on(
    eventName: ConsumerEvents['HEARTBEAT'],
    listener: (event: ConsumerHeartbeatEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['COMMIT_OFFSETS'],
    listener: (event: ConsumerCommitOffsetsEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['GROUP_JOIN'],
    listener: (event: ConsumerGroupJoinEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['FETCH_START'],
    listener: (event: ConsumerFetchStartEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['FETCH'],
    listener: (event: ConsumerFetchEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['START_BATCH_PROCESS'],
    listener: (event: ConsumerStartBatchProcessEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['END_BATCH_PROCESS'],
    listener: (event: ConsumerEndBatchProcessEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['CONNECT'],
    listener: (event: ConnectEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['DISCONNECT'],
    listener: (event: DisconnectEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['STOP'],
    listener: (event: InstrumentationEvent<null>) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['CRASH'],
    listener: (event: ConsumerCrashEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['REBALANCING'],
    listener: (event: ConsumerRebalancingEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['RECEIVED_UNSUBSCRIBED_TOPICS'],
    listener: (event: ConsumerReceivedUnsubscribedTopicsEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['REQUEST'],
    listener: (event: RequestEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['REQUEST_TIMEOUT'],
    listener: (event: RequestTimeoutEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ConsumerEvents['REQUEST_QUEUE_SIZE'],
    listener: (event: RequestQueueSizeEvent) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  on(
    eventName: ValueOf<ConsumerEvents>,
    listener: (event: InstrumentationEvent<any>) => void,
  ): RemoveInstrumentationEventListener<typeof eventName>;
  logger(): Logger;
  readonly events: ConsumerEvents;
};

/** 压缩算法类型枚举（None/GZIP/Snappy/LZ4/ZSTD）。 */
export enum CompressionTypes {
  None = 0,
  GZIP = 1,
  Snappy = 2,
  LZ4 = 3,
  ZSTD = 4,
}

export let CompressionCodecs: {
  [CompressionTypes.GZIP]: () => any;
  [CompressionTypes.Snappy]: () => any;
  [CompressionTypes.LZ4]: () => any;
  [CompressionTypes.ZSTD]: () => any;
};

/**
 * kafkajs 错误基类：携带 retriable（是否可重试）标记。
 * Nest 的 KafkaRetriableException 语义即来源于此——可重试错误会触发
 * 消息重新投递。
 */
export declare class KafkaJSError extends Error {
  readonly message: Error['message'];
  readonly name: string;
  readonly retriable: boolean;
  readonly helpUrl?: string;
  readonly cause?: Error;

  constructor(e: Error | string, metadata?: KafkaJSErrorMetadata);
}

/** 不可重试的 kafkajs 错误（抛出后不会自动重试）。 */
export declare class KafkaJSNonRetriableError extends KafkaJSError {
  constructor(e: Error | string);
}

/** Kafka 协议层错误（携带 broker 协议错误码 code 与类型 type）。 */
export declare class KafkaJSProtocolError extends KafkaJSError {
  readonly code: number;
  readonly type: string;
  constructor(e: Error | string);
}

/** 偏移量越界错误（请求的 offset 已被清理或尚未生成）。 */
export declare class KafkaJSOffsetOutOfRange extends KafkaJSProtocolError {
  readonly topic: string;
  readonly partition: number;
  constructor(e: Error | string, metadata?: KafkaJSOffsetOutOfRangeMetadata);
}

/** 重试次数超限错误（携带 retryCount/retryTime 信息）。 */
export declare class KafkaJSNumberOfRetriesExceeded extends KafkaJSNonRetriableError {
  readonly stack: string;
  readonly retryCount: number;
  readonly retryTime: number;
  constructor(
    e: Error | string,
    metadata?: KafkaJSNumberOfRetriesExceededMetadata,
  );
}

/** broker 连接错误（携带 broker 地址信息）。 */
export declare class KafkaJSConnectionError extends KafkaJSError {
  readonly broker: string;
  constructor(e: Error | string, metadata?: KafkaJSConnectionErrorMetadata);
}

/** 请求超时错误（携带 broker 与请求时间线信息）。 */
export declare class KafkaJSRequestTimeoutError extends KafkaJSError {
  readonly broker: string;
  readonly correlationId: number;
  readonly createdAt: number;
  readonly sentAt: number;
  readonly pendingDuration: number;
  constructor(e: Error | string, metadata?: KafkaJSRequestTimeoutErrorMetadata);
}

export declare class KafkaJSMetadataNotLoaded extends KafkaJSError {
  constructor();
}

export declare class KafkaJSTopicMetadataNotLoaded extends KafkaJSMetadataNotLoaded {
  readonly topic: string;
  constructor(
    e: Error | string,
    metadata?: KafkaJSTopicMetadataNotLoadedMetadata,
  );
}

export declare class KafkaJSStaleTopicMetadataAssignment extends KafkaJSError {
  readonly topic: string;
  readonly unknownPartitions: number;
  constructor(
    e: Error | string,
    metadata?: KafkaJSStaleTopicMetadataAssignmentMetadata,
  );
}

export declare class KafkaJSServerDoesNotSupportApiKey extends KafkaJSNonRetriableError {
  readonly apiKey: number;
  readonly apiName: string;
  constructor(
    e: Error | string,
    metadata?: KafkaJSServerDoesNotSupportApiKeyMetadata,
  );
}

export declare class KafkaJSBrokerNotFound extends KafkaJSError {
  constructor();
}

export declare class KafkaJSPartialMessageError extends KafkaJSError {
  constructor();
}

export declare class KafkaJSSASLAuthenticationError extends KafkaJSError {
  constructor();
}

export declare class KafkaJSGroupCoordinatorNotFound extends KafkaJSError {
  constructor();
}

export declare class KafkaJSNotImplemented extends KafkaJSError {
  constructor();
}

export declare class KafkaJSTimeout extends KafkaJSError {
  constructor();
}

export declare class KafkaJSLockTimeout extends KafkaJSError {
  constructor();
}

export declare class KafkaJSUnsupportedMagicByteInMessageSet extends KafkaJSError {
  constructor();
}

export declare class KafkaJSDeleteGroupsError extends KafkaJSError {
  readonly groups: DeleteGroupsResult[];
  constructor(e: Error | string, groups?: KafkaJSDeleteGroupsErrorGroups[]);
}

export declare class KafkaJSDeleteTopicRecordsError extends KafkaJSError {
  constructor(metadata: KafkaJSDeleteTopicRecordsErrorTopic);
}

/** 删除消费者组失败的错误结果（按组携带错误码）。 */
export interface KafkaJSDeleteGroupsErrorGroups {
  groupId: string;
  errorCode: number;
  error: KafkaJSError;
}

/** 删除记录失败时按 topic/分区细分的错误元数据。 */
export interface KafkaJSDeleteTopicRecordsErrorTopic {
  topic: string;
  partitions: KafkaJSDeleteTopicRecordsErrorPartition[];
}

export interface KafkaJSDeleteTopicRecordsErrorPartition {
  partition: number;
  offset: string;
  error: KafkaJSError;
}

/** 各类 kafkajs 错误的通用元数据（是否可重试、topic、分区等）。 */
export interface KafkaJSErrorMetadata {
  retriable?: boolean;
  topic?: string;
  partitionId?: number;
  metadata?: PartitionMetadata;
}

export interface KafkaJSOffsetOutOfRangeMetadata {
  topic: string;
  partition: number;
}

export interface KafkaJSNumberOfRetriesExceededMetadata {
  retryCount: number;
  retryTime: number;
}

export interface KafkaJSConnectionErrorMetadata {
  broker?: string;
  code?: string;
}

export interface KafkaJSRequestTimeoutErrorMetadata {
  broker: string;
  clientId: string;
  correlationId: number;
  createdAt: number;
  sentAt: number;
  pendingDuration: number;
}

export interface KafkaJSTopicMetadataNotLoadedMetadata {
  topic: string;
}

export interface KafkaJSStaleTopicMetadataAssignmentMetadata {
  topic: string;
  unknownPartitions: PartitionMetadata[];
}

export interface KafkaJSServerDoesNotSupportApiKeyMetadata {
  apiKey: number;
  apiName: string;
}
